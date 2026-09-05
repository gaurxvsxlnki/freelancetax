/**
 * plaid-sync — pull the newest transactions for a linked bank account.
 *
 * Body: { accountId }  (uuid of the linked_accounts row)
 * Response: { imported }
 *
 * Uses Plaid's cursor-based transactions/sync; the cursor is stored on the
 * linked_accounts row so repeated syncs only add what's new.
 */

import { json, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { adminClient, openToken, plaidConfig, plaidSyncAccount } from '../_shared/plaid.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  try {
    const cfg = plaidConfig();
    if (cfg.error) return json({ error: cfg.error }, 501);
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Bank connections are a Pro feature. Upgrade to Pro to keep syncing.' }, 403);
    }

    let accountId = '';
    try {
      const body = (await req.json()) as { accountId?: string };
      accountId = String(body.accountId ?? '');
    } catch {
      accountId = '';
    }
    if (!accountId) return json({ error: 'Please choose a bank account to sync.' }, 400);

    const admin = adminClient();
    const { data: account, error: acctErr } = await admin
      .from('linked_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (acctErr || !account) {
      return json({ error: 'This bank account is no longer connected.' }, 404);
    }

    const { data: cred } = await admin
      .from('integration_credentials')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'plaid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cred?.token_cipher) {
      return json({ error: 'This connection is missing its credentials — please reconnect the bank.' }, 409);
    }

    let accessToken: string;
    try {
      accessToken = await openToken(String(cred.token_cipher));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Could not read the connection credentials.' }, 500);
    }

    try {
      const outcome = await plaidSyncAccount({
        accessToken,
        externalAccountId: String(account.external_account_id ?? ''),
        cursor: String(account.sync_cursor ?? ''),
        userId: user.id,
        linkedAccountId: String(account.id),
      });
      await admin
        .from('linked_accounts')
        .update({
          last_synced_at: new Date().toISOString(),
          sync_cursor: outcome.nextCursor,
          status: 'active',
          last_error: null,
        })
        .eq('id', String(account.id));
      return json({ imported: outcome.imported });
    } catch (syncErr) {
      const message = syncErr instanceof Error ? syncErr.message : 'The sync failed. Please try again.';
      const needsReauth = message.includes('re-authenticated') || message.includes('reconnect');
      await admin
        .from('linked_accounts')
        .update({ status: needsReauth ? 'expired' : 'error', last_error: message })
        .eq('id', String(account.id));
      return json({ error: message }, 502);
    }
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not sync this bank account. Please try again.' },
      500
    );
  }
});
