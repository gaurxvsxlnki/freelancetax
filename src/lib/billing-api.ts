import { supabase } from './supabase';

/**
 * Client-side wrapper for the server-side Stripe functions. No secret keys or
 * payment details ever live in the browser — the server creates checkout and
 * portal sessions and returns only URLs. When Stripe isn't configured, the
 * functions answer with a clear configuration error which we pass through.
 */

export interface BillingResult {
  ok: boolean;
  url?: string;
  error?: string;
  /** Extra structured info (e.g. current period end after cancelling). */
  data?: Record<string, unknown>;
}

const DEMO_ERROR =
  'Payments are not available in demo mode. Connect your Supabase project with Stripe credentials to enable subscriptions.';

async function invoke(name: string, body: unknown): Promise<BillingResult> {
  if (!supabase) {
    return { ok: false, error: DEMO_ERROR };
  }
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      return { ok: false, error: error.message || 'Could not reach the billing service. Please try again.' };
    }
    const res = data as { url?: string; error?: string; ok?: boolean } & Record<string, unknown>;
    if (res?.error) {
      return { ok: false, error: res.error };
    }
    return { ok: true, url: res?.url, data: res };
  } catch {
    return { ok: false, error: 'Could not reach the billing service. Please try again.' };
  }
}

export type BillingInterval = 'month' | 'year';

export function startCheckout(interval: BillingInterval): Promise<BillingResult> {
  return invoke('stripe-checkout', { interval });
}

export function openBillingPortal(): Promise<BillingResult> {
  return invoke('stripe-portal', {});
}

export function changeSubscription(action: 'cancel' | 'reactivate'): Promise<BillingResult> {
  return invoke('stripe-cancel', { action });
}
