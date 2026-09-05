/**
 * stripe-income-disconnect — revoke access to a connected Stripe account.
 *
 * Body: { accountId }  (uuid of the linked_accounts row)
 *
 * Deauthorizes at Stripe (OAuth deauthorize), removes the stored credential
 * and linked_account, and drops pending imported transactions. Anything the
 * user already reviewed stays in their records.
 */

import { json, preflight, readJson, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { adminClient, openToken } from '../_shared/plaid.ts';
import { oauthDeauthorize } from '../_shared/stripe-income.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Income connections are a Pro feature. Upgrade to Pro to manage connections.' }, 403);
    }

    const { accountId: rawAccountId } = await readJson<{ accountId?: string }>(req);
    const accountId = String(rawAccountId ?? '');
    if (!accountId) return json({ error: 'Please choose an income account to disconnect.' }, 400);

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

    const stripeUserId = String(account.external_account_id ?? '');
    if (stripeUserId) {
      try {
        await oauthDeauthorize(stripeUserId);
      } catch {
        // Revocation already failed upstream — local cleanup still applies.
      }
    }

    await admin.from('transactions').delete().eq('user_id', user.id).eq('account_id', String(account.id));
    await admin.from('linked_accounts').delete().eq('user_id', user.id).eq('id', String(account.id));
    await admin
      .from('integration_credentials')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .eq('provider_item_id', stripeUserId);
    return json({ ok: true });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not disconnect this Stripe account. Please try again.' },
      500
    );
  }
});
