/**
 * stripe-webhook — receive Stripe events, verify the signature, and sync the
 * `subscriptions` table. Never trusts data sent from the browser; the only
 * input is the verified Stripe event itself.
 *
 * Env: STRIPE_WEBHOOK_SECRET (required). STRIPE_SECRET_KEY is optional — used
 * only to look up the customer when an event lacks our user mapping.
 *
 * Idempotency: rows are upserted on `provider_subscription_id` (unique), so
 * replayed webhooks update the same row instead of duplicating records.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { json, preflight, stripeApi, verifyStripeSignature } from '../_shared/stripe.ts';

const MAP_STATUS: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  incomplete: 'incomplete',
  incomplete_expired: 'expired',
  canceled: 'cancelled',
  unpaid: 'past_due',
  paused: 'past_due',
};

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: { price?: { recurring?: { interval?: string } } }[] };
}

function subInterval(sub: StripeSubscription): 'month' | 'year' | null {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === 'year' ? 'year' : interval === 'month' ? 'month' : null;
}

function unixToIso(sec?: number): string | null {
  if (!sec) return null;
  const d = new Date(sec * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  try {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!secret || !supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Webhook is not configured on the server.' }, 501);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');
    const verified = await verifyStripeSignature(payload, signature, secret);
    if (!verified) {
      return json({ error: 'Invalid webhook signature.' }, 400);
    }

    const event = JSON.parse(payload) as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const type = event.type ?? '';
    const eventId = event.id ?? '';
    const obj = event.data?.object ?? {};

    // Idempotency: Stripe retries deliveries. Claim the event id first; if the
    // insert conflicts we have already applied this event, so acknowledge and
    // do nothing (prevents replayed invoice.* events flipping status).
    if (eventId) {
      const { error: claimError } = await admin
        .from('stripe_webhook_events')
        .insert({ event_id: eventId, event_type: type });
      if (claimError) {
        if (claimError.code === '23505') {
          return json({ received: true, duplicate: true });
        }
        // Ledger unavailable: fail loudly so Stripe retries rather than
        // silently processing without replay protection.
        return json({ error: 'Webhook ledger unavailable.' }, 500);
      }
    }

    if (type === 'checkout.session.completed') {
      const subId = obj.subscription ? String(obj.subscription) : null;
      const metadata = (obj.metadata ?? {}) as Record<string, unknown>;
      if (subId) {
        const userId = String(metadata.user_id ?? obj.client_reference_id ?? '');
        const customerId = obj.customer ? String(obj.customer) : null;
        if (userId) {
          // Never assume 'active' — read the authoritative state from Stripe
          // (a session can complete while the first payment is still pending).
          let status = 'incomplete';
          let interval: 'month' | 'year' | null = null;
          let periodStart: string | null = null;
          let periodEnd: string | null = null;
          let cancelAtPeriodEnd = false;
          if (Deno.env.get('STRIPE_SECRET_KEY')) {
            const fetched = await stripeApi(`/subscriptions/${subId}`);
            if (fetched.status === 200 && fetched.data) {
              const sub = fetched.data as unknown as StripeSubscription;
              status = MAP_STATUS[sub.status] ?? 'incomplete';
              interval = subInterval(sub);
              periodStart = unixToIso(sub.current_period_start);
              periodEnd = unixToIso(sub.current_period_end);
              cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
            }
          }
          await admin.from('subscriptions').upsert(
            {
              user_id: userId,
              provider: 'stripe',
              provider_customer_id: customerId,
              provider_subscription_id: subId,
              plan: 'pro',
              billing_interval: interval,
              status,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              cancel_at_period_end: cancelAtPeriodEnd,
            },
            { onConflict: 'provider_subscription_id' }
          );
        }
      }
      return json({ received: true });
    }

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const sub = obj as unknown as StripeSubscription;
      const userId = await resolveUserId(admin, sub);
      if (!userId) {
        // Unidentifiable event — log nothing sensitive, just acknowledge.
        return json({ received: true, note: 'unattributed' }, 202);
      }
      const status = MAP_STATUS[sub.status] ?? 'incomplete';
      await admin.from('subscriptions').upsert(
        {
          user_id: userId,
          provider: 'stripe',
          provider_customer_id: sub.customer,
          provider_subscription_id: sub.id,
          plan: 'pro',
          billing_interval: subInterval(sub),
          status,
          current_period_start: unixToIso(sub.current_period_start),
          current_period_end: unixToIso(sub.current_period_end),
          cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        },
        { onConflict: 'provider_subscription_id' }
      );
      return json({ received: true });
    }

    if (type === 'customer.subscription.deleted') {
      const sub = obj as unknown as StripeSubscription;
      const { data: rows } = await admin
        .from('subscriptions')
        .select('id')
        .eq('provider_subscription_id', sub.id)
        .limit(1);
      if (rows?.[0]?.id) {
        await admin
          .from('subscriptions')
          .update({ status: 'cancelled', cancel_at_period_end: false, current_period_end: null })
          .eq('id', String(rows[0].id));
      }
      return json({ received: true });
    }

    if (type === 'invoice.payment_succeeded' || type === 'invoice.payment_failed') {
      const subscriptionId = obj.subscription ? String(obj.subscription) : null;
      if (subscriptionId) {
        const nextStatus = type === 'invoice.payment_succeeded' ? 'active' : 'past_due';
        const { data: rows } = await admin
          .from('subscriptions')
          .select('id, status')
          .eq('provider_subscription_id', subscriptionId)
          .limit(1);
        const current = rows?.[0];
        // A late invoice event must never resurrect a cancelled/expired plan;
        // customer.subscription.* is authoritative for terminal states.
        const terminal = current?.status === 'cancelled' || current?.status === 'expired';
        if (current?.id && !terminal) {
          await admin.from('subscriptions').update({ status: nextStatus }).eq('id', String(current.id));
        }
      }
      return json({ received: true });
    }

    return json({ received: true, unhandled: type });
  } catch (err) {
    // Log server-side only; the response must not echo internals to callers.
    console.error('stripe-webhook failed', err);
    return json({ error: 'Webhook processing failed.' }, 500);
  }
});

/** Map a Stripe subscription back to our user id through several channels. */
async function resolveUserId(
  admin: ReturnType<typeof createClient>,
  sub: StripeSubscription
): Promise<string | null> {
  // 1. subscription metadata (set when we create subscriptions with it)
  if (sub.metadata?.user_id) return sub.metadata.user_id;

  // 2. an existing row for this customer
  const { data: byCustomer } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('provider_customer_id', sub.customer)
    .limit(1);
  if (byCustomer?.[0]?.user_id) return String(byCustomer[0].user_id);

  // 3. the customer object carries metadata[user_id] (set at customer creation)
  if (Deno.env.get('STRIPE_SECRET_KEY')) {
    const customerRes = await stripeApi(`/customers/${sub.customer}`);
    const meta = customerRes.data?.metadata as Record<string, string> | undefined;
    if (customerRes.status === 200 && meta?.user_id) return meta.user_id;
  }

  return null;
}
