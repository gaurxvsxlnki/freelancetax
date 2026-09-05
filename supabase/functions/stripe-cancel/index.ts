/**
 * stripe-cancel — cancel (or reactivate) the user's Pro subscription.
 *
 * Cancellation uses Stripe's `cancel_at_period_end` so Pro access continues
 * until the end of the already-paid period. Reactivation clears the flag.
 *
 * Env: STRIPE_SECRET_KEY
 * Request body: { action: "cancel" | "reactivate" }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { isConfigured, json, requireUser, stripeApi } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  try {
    if (!isConfigured()) {
      return json({ error: 'Payments are not configured on the server yet.' }, 501);
    }
    const user = await requireUser(req);
    const { action } = (await req.json()) as { action?: string };
    if (action !== 'cancel' && action !== 'reactivate') {
      return json({ error: 'Unknown action.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = await admin
      .from('subscriptions')
      .select('provider_subscription_id')
      .eq('user_id', user.id)
      .eq('plan', 'pro')
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const subId = data?.provider_subscription_id ? String(data.provider_subscription_id) : null;
    if (!subId) {
      return json({ error: 'No active Pro subscription found for this account.' }, 404);
    }

    const body = new URLSearchParams();
    body.set('cancel_at_period_end', action === 'cancel' ? 'true' : 'false');
    const res = await stripeApi(`/subscriptions/${subId}`, { body });
    if (res.status !== 200 || !res.data) {
      return json({ error: 'Stripe could not update your subscription. Please try again.' }, 502);
    }

    const d = res.data;
    return json({
      cancelAtPeriodEnd: Boolean(d.cancel_at_period_end),
      currentPeriodEnd: d.current_period_end != null ? new Date(Number(d.current_period_end) * 1000).toISOString() : null,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not update your subscription. Please try again.' },
      500
    );
  }
});
