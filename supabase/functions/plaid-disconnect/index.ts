/**
 * plaid-disconnect — remove a connected bank account.
 *
 * Body: { accountId }  (uuid of the linked_accounts row)
 *
 * Revokes access at Plaid (item/remove), deletes the stored credentials and
 * the linked_account row. Pending imported transactions for the account are
 * removed too; anything the user already reviewed stays in their records.
 */

import { json, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { adminClient, openToken, plaidApi, plaidConfig } from '../_shared/plaid.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  try {
    const cfg = plaidConfig();
    if (cfg.error) return json({ error: cfg.error }, 501);
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Bank connections are a Pro feature. Upgrade to Pro to manage connections.' }, 403);
    }

    let accountId = '';
    try {
      const body = (await req.json()) as { accountId?: string };
      accountId = String(body.accountId ?? '');
    } catch {
      accountId = '';
    }
    if (!accountId) return json({ error: 'Please choose a bank account to disconnect.' }, 400);

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

    // Revoke at the provider when we still hold credentials.
    const { data: cred } = await admin
      .from('integration_credentials')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'plaid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cred?.token_cipher) {
      try {
        const accessToken = await openToken(String(cred.token_cipher));
        await plaidApi('item/remove', { access_token: accessToken });
      } catch {
        // Already-expired credentials: local cleanup is still correct.
      }
    }

    // Drop any pending imports, then the account + credentials.
    await admin.from('transactions').delete().eq('user_id', user.id).eq('account_id', String(account.id));
    await admin.from('linked_accounts').delete().eq('user_id', user.id).eq('id', String(account.id));
    if (cred?.id) {
      await admin.from('integration_credentials').delete().eq('user_id', user.id).eq('id', String(cred.id));
    }
    return json({ ok: true });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not disconnect this bank account. Please try again.' },
      500
    );
  }
});
