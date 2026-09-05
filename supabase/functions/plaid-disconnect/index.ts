/**
 * plaid-disconnect — remove a connected bank account.
 *
 * Body: { accountId }  (uuid of the linked_accounts row)
 *
 * Revokes access at Plaid (item/remove), deletes the stored credentials and
 * the linked_account row. Pending imported transactions for the account are
 * removed too; anything the user already reviewed stays in their records.
 */

import { json, preflight, readJson, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { adminClient, openToken, plaidApi, plaidConfig } from '../_shared/plaid.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const cfg = plaidConfig();
    if (cfg.error) return json({ error: cfg.error }, 501);
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Bank connections are a Pro feature. Upgrade to Pro to manage connections.' }, 403);
    }

    const { accountId: rawAccountId } = await readJson<{ accountId?: string }>(req);
    const accountId = String(rawAccountId ?? '');
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

    // Revoke at the provider when we still hold credentials for THIS item.
    const itemId = account.provider_item_id ? String(account.provider_item_id) : '';
    let cred: { id?: string; token_cipher?: string } | null = null;
    if (itemId) {
      const { data } = await admin
        .from('integration_credentials')
        .select('id, token_cipher')
        .eq('user_id', user.id)
        .eq('provider', 'plaid')
        .eq('provider_item_id', itemId)
        .maybeSingle();
      cred = data;
    } else {
      const { data } = await admin
        .from('integration_credentials')
        .select('id, token_cipher')
        .eq('user_id', user.id)
        .eq('provider', 'plaid')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      cred = data;
    }
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
    // Only drop the stored token when no other linked account still uses this
    // Plaid item (one item can back several accounts).
    if (cred?.id) {
      const { count } = await admin
        .from('linked_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('provider', 'plaid')
        .eq('provider_item_id', itemId);
      if (!itemId || (count ?? 0) === 0) {
        await admin.from('integration_credentials').delete().eq('user_id', user.id).eq('id', String(cred.id));
      }
    }
    return json({ ok: true });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not disconnect this bank account. Please try again.' },
      500
    );
  }
});
