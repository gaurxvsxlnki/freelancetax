/**
 * stripe-checkout — create a Pro subscription checkout session.
 *
 * Env:
 *   STRIPE_SECRET_KEY        (required to be active)
 *   STRIPE_PRICE_MONTHLY     (price id for $9.99/month)
 *   STRIPE_PRICE_YEARLY      (price id for $79/year)
 *   APP_URL                  (origin for success/cancel redirects, e.g. https://app.example.com)
 *
 * Request body: { interval: "month" | "year" }
 * Response:     { url }  (redirect the browser to this hosted checkout page)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { isConfigured, json, requireUser, stripeApi } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  try {
    if (!isConfigured()) {
      return json(
        { error: 'Payments are not configured yet. The server needs STRIPE_SECRET_KEY and price ids before checkout can start.' },
        501
      );
    }

    const user = await requireUser(req);
    const { interval } = (await req.json()) as { interval?: string };
    if (interval !== 'month' && interval !== 'year') {
      return json({ error: 'Please choose monthly or yearly billing.' }, 400);
    }

    const priceId = Deno.env.get(interval === 'year' ? 'STRIPE_PRICE_YEARLY' : 'STRIPE_PRICE_MONTHLY');
    const appUrl = Deno.env.get('APP_URL');
    if (!priceId) {
      return json(
        { error: `Billing is not fully configured: STRIPE_PRICE_${interval === 'year' ? 'YEARLY' : 'MONTHLY'} is missing on the server.` },
        501
      );
    }
    if (!appUrl) {
      return json({ error: 'Billing is not fully configured: APP_URL is missing on the server.' }, 501);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Reuse the Stripe customer we already know about, if any.
    const { data: existing } = await admin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('user_id', user.id)
      .not('provider_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const knownCustomerId = existing?.provider_customer_id ? String(existing.provider_customer_id) : null;

    let customerId = knownCustomerId;
    if (!customerId) {
      const params = new URLSearchParams();
      params.set('email', user.email);
      params.set('metadata[user_id]', user.id);
      const customerRes = await stripeApi('/customers', { body: params });
      if (customerRes.status !== 200 || !customerRes.data?.id) {
        return json({ error: 'We could not create your billing profile. Please try again.' }, 502);
      }
      customerId = String(customerRes.data.id);
    }

    const sessionParams = new URLSearchParams();
    sessionParams.set('mode', 'subscription');
    sessionParams.set('customer', customerId);
    sessionParams.set('client_reference_id', user.id);
    sessionParams.set('metadata[user_id]', user.id);
    sessionParams.set('line_items[0][price]', priceId);
    sessionParams.set('line_items[0][quantity]', '1');
    sessionParams.set('success_url', `${appUrl}/billing?checkout=success`);
    sessionParams.set('cancel_url', `${appUrl}/pricing`);
    sessionParams.set('allow_promotion_codes', 'true');

    const sessionRes = await stripeApi('/checkout/sessions', { body: sessionParams });
    if (sessionRes.status !== 200 || !sessionRes.data?.url) {
      return json({ error: 'Stripe could not start the checkout session. Please try again.' }, 502);
    }

    return json({ url: String(sessionRes.data.url) });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not start checkout. Please try again.' },
      500
    );
  }
});
