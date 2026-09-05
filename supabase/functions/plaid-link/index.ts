/**
 * plaid-link — create a Plaid Link token for the signed-in user.
 *
 * Env:  PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
 * Body: {} (user id comes from the session)
 * Response: { link_token }
 *
 * The browser then opens Plaid Link with this token and sends the resulting
 * public_token to plaid-exchange.
 */

import { json, preflight, requireUser, userHasProAccess } from '../_shared/stripe.ts';
import { plaidApi, plaidConfig } from '../_shared/plaid.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const cfg = plaidConfig();
    if (cfg.error) return json({ error: cfg.error }, 501);
    const user = await requireUser(req);
    if (!(await userHasProAccess(user.id))) {
      return json({ error: 'Bank connections are a Pro feature. Upgrade to Pro to link bank accounts.' }, 403);
    }

    const res = await plaidApi('link/token/create', {
      client_name: 'FreelanceTax',
      user: { client_user_id: user.id },
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    if (res.status !== 200 || !res.data?.link_token) {
      return json({ error: 'Plaid could not create a link token. Please try again.' }, 502);
    }
    return json({ link_token: String(res.data.link_token) });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not start the bank connection. Please try again.' },
      500
    );
  }
});
