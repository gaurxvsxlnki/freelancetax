/**
 * stripe-income-connect — two modes:
 *   POST {}                 → { url }  (OAuth authorize URL to redirect to)
 *   POST { code, state }    → exchange the code, store the account, import
 *                             the first batch of charges.
 *
 * The OAuth redirect_uri is {APP_URL}/imports, so after Stripe redirects the
 * browser back, the Imports page calls this function again with `code`.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { json, preflight, readJson, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { sealToken } from '../_shared/plaid.ts';
import {
  ingestCharges,
  oauthAuthorizeUrl,
  oauthExchange,
  signState,
  stripeIncomeConfigured,
  verifyState,
} from '../_shared/stripe-income.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const configError = stripeIncomeConfigured();
    if (configError) return json({ error: configError }, 501);
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Income connections are a Pro feature. Upgrade to Pro to link income platforms.' }, 403);
    }

    const body = await readJson<{ code?: string; state?: string }>(req);
    const code = typeof body.code === 'string' && body.code ? body.code : null;
    const state = typeof body.state === 'string' ? body.state : '';

    // Mode 1: start the OAuth handshake.
    if (!code) {
      const appUrl = Deno.env.get('APP_URL');
      if (!appUrl) {
        return json({ error: 'Income connections are not fully configured: APP_URL is missing on the server.' }, 501);
      }
      return json({ url: oauthAuthorizeUrl(await signState(user.id)) });
    }

    // Mode 2: OAuth returned with a code — finish linking. The state must be a
    // valid, unexpired signature for THIS user (CSRF protection).
    if (!(await verifyState(state, user.id))) {
      return json({ error: 'This connection request is not valid or has expired. Please start again.' }, 403);
    }
    const { stripeUserId, accessToken } = await oauthExchange(code);
    const sealed = await sealToken(accessToken);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: credError } = await admin.from('integration_credentials').upsert(
      {
        user_id: user.id,
        provider: 'stripe',
        provider_item_id: stripeUserId,
        token_cipher: sealed,
      },
      { onConflict: 'user_id,provider,provider_item_id' }
    );
    if (credError) {
      return json({ error: 'We could not store the connection securely. Please try again.' }, 502);
    }

    const { data: account, error: accountError } = await admin
      .from('linked_accounts')
      .upsert(
        {
          user_id: user.id,
          provider: 'stripe',
          kind: 'income',
          external_account_id: stripeUserId,
          provider_item_id: stripeUserId,
          institution_name: 'Stripe',
          account_name: 'Stripe payments',
          status: 'active',
          last_error: null,
        },
        { onConflict: 'user_id,provider,kind,external_account_id' }
      )
      .select('id')
      .single();
    if (accountError || !account?.id) {
      return json({ error: 'We could not record the connected account. Please try again.' }, 502);
    }

    let imported = 0;
    let syncError: string | null = null;
    try {
      imported = await ingestCharges(admin, {
        userId: user.id,
        accountId: String(account.id),
        accessToken,
      });
    } catch (err) {
      syncError = err instanceof Error ? err.message : 'The connection was saved but the first sync failed.';
    }
    await admin
      .from('linked_accounts')
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: syncError,
        status: syncError ? 'error' : 'active',
      })
      .eq('id', String(account.id));

    return json({
      linked: true,
      imported,
      message: syncError ? syncError : `Stripe connected — ${imported} payments imported for review.`,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not connect to Stripe. Please try again.' },
      500
    );
  }
});
