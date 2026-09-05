/**
 * stripe-income-sync — import the latest successful charges from a connected
 * Stripe account.
 *
 * Body: { accountId }  (uuid of the linked_accounts row)
 * Response: { imported }
 */

import { json, preflight, readJson, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { adminClient, openToken } from '../_shared/plaid.ts';
import { ingestCharges, stripeIncomeConfigured } from '../_shared/stripe-income.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const configError = stripeIncomeConfigured();
    if (configError) return json({ error: configError }, 501);
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Income connections are a Pro feature. Upgrade to Pro to keep syncing.' }, 403);
    }

    const { accountId: rawAccountId } = await readJson<{ accountId?: string }>(req);
    const accountId = String(rawAccountId ?? '');
    if (!accountId) return json({ error: 'Please choose an income account to sync.' }, 400);

    const admin = adminClient();
    const { data: account, error: acctErr } = await admin
      .from('linked_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (acctErr || !account) {
      return json({ error: 'This income connection is no longer linked.' }, 404);
    }

    const { data: cred } = await admin
      .from('integration_credentials')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .eq('provider_item_id', String(account.external_account_id ?? ''))
      .maybeSingle();
    if (!cred?.token_cipher) {
      return json({ error: 'This connection is missing its credentials — please reconnect Stripe.' }, 409);
    }

    let accessToken: string;
    try {
      accessToken = await openToken(String(cred.token_cipher));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Could not read the connection credentials.' }, 500);
    }

    try {
      const imported = await ingestCharges(admin, {
        userId: user.id,
        accountId: String(account.id),
        accessToken,
      });
      await admin
        .from('linked_accounts')
        .update({ last_synced_at: new Date().toISOString(), status: 'active', last_error: null })
        .eq('id', String(account.id));
      return json({ imported });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The sync failed. Please try again.';
      await admin.from('linked_accounts').update({ status: 'error', last_error: message }).eq('id', String(account.id));
      return json({ error: message }, 502);
    }
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not sync this Stripe account. Please try again.' },
      500
    );
  }
});
