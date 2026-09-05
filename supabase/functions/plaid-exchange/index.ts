/**
 * plaid-exchange — complete the Plaid handshake and start the first sync.
 *
 * Body: {
 *   publicToken: string   (from Plaid Link onSuccess)
 *   accountId: string     (selected Plaid account id)
 *   institutionName?: string
 *   accountName?: string
 *   accountMask?: string
 * }
 *
 * Exchanges the public token for an access token, stores it encrypted
 * (integration_credentials — no user RLS), creates the linked_account the
 * user sees, then imports the first batch of transactions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { json, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { plaidApi, plaidConfig, plaidError, plaidSyncAccount, sealToken } from '../_shared/plaid.ts';

interface LinkMeta {
  publicToken?: string;
  accountId?: string;
  institutionName?: string;
  accountName?: string;
  accountMask?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  try {
    const cfg = plaidConfig();
    if (cfg.error) return json({ error: cfg.error }, 501);
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Bank connections are a Pro feature. Upgrade to Pro to link bank accounts.' }, 403);
    }

    let body: LinkMeta = {};
    try {
      body = (await req.json()) as LinkMeta;
    } catch {
      body = {};
    }
    if (!body.publicToken || !body.accountId) {
      return json({ error: 'The bank handshake was incomplete. Please try connecting again.' }, 400);
    }

    const exchange = await plaidApi('item/public_token/exchange', {
      public_token: body.publicToken,
    });
    if (exchange.status !== 200 || !exchange.data?.access_token || !exchange.data?.item_id) {
      return json(
        { error: plaidError(exchange.data, 'The bank could not be linked. Please try again.') },
        502
      );
    }
    const accessToken = String(exchange.data.access_token);
    const itemId = String(exchange.data.item_id);
    const sealed = await sealToken(accessToken);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: credError } = await admin.from('integration_credentials').upsert(
      {
        user_id: user.id,
        provider: 'plaid',
        provider_item_id: itemId,
        token_cipher: sealed,
      },
      { onConflict: 'provider,provider_item_id' }
    );
    if (credError) {
      return json({ error: 'We could not store the connection securely. Please try again.' }, 502);
    }

    const { data: account, error: accountError } = await admin
      .from('linked_accounts')
      .upsert(
        {
          user_id: user.id,
          provider: 'plaid',
          kind: 'bank',
          external_account_id: String(body.accountId),
          institution_name: String(body.institutionName ?? 'Bank').slice(0, 80),
          account_name: String(body.accountName ?? 'Checking').slice(0, 80),
          account_mask: String(body.accountMask ?? '').slice(0, 8),
          status: 'active',
          last_error: null,
        },
        { onConflict: 'provider,kind,external_account_id' }
      )
      .select('id')
      .single();
    if (accountError || !account?.id) {
      return json({ error: 'We could not record the connected account. Please try again.' }, 502);
    }

    // Initial sync so transactions appear right away.
    try {
      const outcome = await plaidSyncAccount({
        accessToken,
        externalAccountId: String(body.accountId),
        cursor: '',
        userId: user.id,
        linkedAccountId: String(account.id),
      });
      await admin
        .from('linked_accounts')
        .update({ last_synced_at: new Date().toISOString(), sync_cursor: outcome.nextCursor, last_error: null })
        .eq('id', String(account.id));
      return json({
        imported: outcome.imported,
        message: `Bank linked — ${outcome.imported} transactions imported for review.`,
      });
    } catch (syncErr) {
      const message = syncErr instanceof Error ? syncErr.message : 'The connection was saved but the first sync failed.';
      const needsReauth = message.includes('re-authenticated') || message.includes('reconnect');
      await admin
        .from('linked_accounts')
        .update({ status: needsReauth ? 'expired' : 'active', last_error: message })
        .eq('id', String(account.id));
      return json({ imported: 0, message: 'Bank linked. The first sync will retry from the Imports page.' });
    }
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not link the bank account. Please try again.' },
      500
    );
  }
});
