/**
 * Shared helpers for the Stripe billing edge functions. Everything here runs
 * server-side only — secrets (service role, Stripe keys) never leave the
 * function runtime.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_API = 'https://api.stripe.com/v1';

export interface AppUser {
  id: string;
  email: string;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

export function isConfigured(): boolean {
  return Boolean(Deno.env.get('STRIPE_SECRET_KEY'));
}

/** Verify the caller's access token and return their id + email. */
export async function requireUser(req: Request): Promise<AppUser> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('You need to be signed in to do that.');
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new Error('Your session is no longer valid. Sign in again and retry.');
  }
  return { id: data.user.id, email: data.user.email ?? '' };
}

/**
 * Server-side Pro authorization. UI gating alone must never decide who can
 * invoke a Pro-only integration endpoint — verify the subscription directly.
 */
export async function userHasProAccess(userId: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return false;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await admin
    .from('subscriptions')
    .select('status, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .eq('plan', 'pro')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  const status = String(data.status ?? '');
  if (status === 'active' || status === 'trialing' || status === 'past_due') return true;
  // Cancelled-but-still-paid keeps Pro access until the end of the period.
  if (status === 'cancelled' && data.cancel_at_period_end === true && data.current_period_end != null) {
    return new Date(String(data.current_period_end)).getTime() > Date.now();
  }
  return false;
}

/** Raw Stripe API call with form-encoded body and basic auth. */
export async function stripeApi(
  path: string,
  init: { method?: string; body?: URLSearchParams | string; contentType?: string } = {}
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const method = init.method ?? (init.body ? 'POST' : 'GET');
  const contentType = init.contentType ?? 'application/x-www-form-urlencoded';
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': contentType,
    },
    body: init.body as BodyInit | undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

export function stripeError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Stripe v1 scheme) without external deps.
// ---------------------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): Promise<{ timestamp: string; signature: string } | null> {
  if (!signatureHeader || !secret) return null;
  const parts = new Map<string, string>();
  for (const pair of signatureHeader.split(',')) {
    const [k, ...rest] = pair.trim().split('=');
    if (k) parts.set(k, rest.join('='));
  }
  const timestamp = parts.get('t') ?? '';
  const signature = parts.get('v1') ?? '';
  if (!timestamp || !signature) return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (!timingSafeEqual(expected, signature)) return null;

  // Reject webhooks older than ~5 minutes (Stripe recommends tolerance).
  const ageMs = Date.now() - Number(timestamp) * 1000;
  if (Number.isNaN(ageMs) || ageMs > 5 * 60 * 1000) return null;
  return { timestamp, signature };
}
