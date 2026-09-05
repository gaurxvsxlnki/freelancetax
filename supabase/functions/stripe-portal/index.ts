/**
 * stripe-portal — open Stripe's hosted billing portal (payment method updates,
 * invoices, plan management handled by Stripe, never stored by us).
 *
 * Env: STRIPE_SECRET_KEY, APP_URL
 * Response: { url }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { isConfigured, json, preflight, requireUser, stripeApi } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    if (!isConfigured()) {
      return json({ error: 'Payments are not configured on the server yet.' }, 501);
    }
    const appUrl = Deno.env.get('APP_URL');
    if (!appUrl) {
      return json({ error: 'Billing is not fully configured: APP_URL is missing on the server.' }, 501);
    }

    const user = await requireUser(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = await admin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('user_id', user.id)
      .not('provider_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const customerId = data?.provider_customer_id ? String(data.provider_customer_id) : null;
    if (!customerId) {
      return json({ error: 'No billing profile found for this account.' }, 404);
    }

    const params = new URLSearchParams();
    params.set('customer', customerId);
    params.set('return_url', `${appUrl}/billing`);
    const portalRes = await stripeApi('/billing_portal/sessions', { body: params });
    if (portalRes.status !== 200 || !portalRes.data?.url) {
      return json({ error: 'Stripe could not open the billing portal. Please try again.' }, 502);
    }
    return json({ url: String(portalRes.data.url) });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not open the billing portal. Please try again.' },
      500
    );
  }
});
