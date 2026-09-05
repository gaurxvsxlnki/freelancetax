/**
 * Shared helpers for Stripe income import (Stripe Connect OAuth, read-only).
 *
 * Flow: stripe-income-connect returns a hosted OAuth authorize URL (or, when
 * invoked with `code`, exchanges it). The access token we receive is the
 * user's own restricted read-only key scoped to their Stripe account; it is
 * stored encrypted in integration_credentials (no user RLS) and used only to
 * read recent charges. Disconnect calls /oauth/deauthorize to revoke.
 *
 * Env:  STRIPE_CLIENT_ID, STRIPE_SECRET_KEY, APP_URL
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export function stripeIncomeConfigured(): string | null {
  if (!Deno.env.get('STRIPE_CLIENT_ID')) {
    return 'Income connections are not configured yet. The server needs STRIPE_CLIENT_ID before Stripe accounts can be linked.';
  }
  if (!Deno.env.get('STRIPE_SECRET_KEY')) {
    return 'Income connections are not configured yet. The server needs STRIPE_SECRET_KEY.';
  }
  return null;
}

// --- OAuth state -------------------------------------------------------------
// The `state` parameter must be unguessable and bound to the user, otherwise an
// attacker who knows a user id could craft a callback. We sign
// `<userId>.<expiry>` with HMAC-SHA256 keyed on a server secret.

function stateKeyMaterial(): string {
  return (
    Deno.env.get('INTEGRATION_ENC_KEY') ??
    Deno.env.get('STRIPE_SECRET_KEY') ??
    ''
  );
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(stateKeyMaterial()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Build a signed state token valid for 15 minutes. */
export async function signState(userId: string): Promise<string> {
  const expiry = Date.now() + 15 * 60 * 1000;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${await hmacHex(payload)}`;
}

/** Verify a state token belongs to `userId` and has not expired. */
export async function verifyState(state: string, userId: string): Promise<boolean> {
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [stateUser, expiryRaw, signature] = parts;
  if (stateUser !== userId) return false;
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = await hmacHex(`${stateUser}.${expiryRaw}`);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** Hosted OAuth authorize URL the browser is redirected to. */
export function oauthAuthorizeUrl(state: string): string {
  const clientId = Deno.env.get('STRIPE_CLIENT_ID') ?? '';
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'read_only',
    state,
    redirect_uri: `${appUrl}/imports`,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

interface OAuthResult {
  stripeUserId: string;
  accessToken: string;
}

/** Exchange the OAuth code for the user's restricted read-only token. */
export async function oauthExchange(code: string): Promise<OAuthResult> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: Deno.env.get('STRIPE_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('STRIPE_SECRET_KEY') ?? '',
    code,
  });
  const res = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status !== 200 || !data.stripe_user_id || !data.access_token) {
    const msg = typeof data.error_description === 'string' ? data.error_description : null;
    throw new Error(msg || 'Stripe did not approve this connection. Please try again.');
  }
  return { stripeUserId: String(data.stripe_user_id), accessToken: String(data.access_token) };
}

/** Read recent successful charges from the connected Stripe account. */
async function fetchCharges(accessToken: string, limit = 100) {
  const res = await fetch(`https://api.stripe.com/v1/charges?limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status !== 200) {
    const msg =
      typeof data.error === 'object' && data.error && typeof (data.error as Record<string, unknown>).message === 'string'
        ? String((data.error as Record<string, unknown>).message)
        : null;
    throw new Error(msg || 'Stripe could not be reached. Please try again.');
  }
  return Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
}

function isoDate(unixSeconds: unknown): string {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString().slice(0, 10);
  const d = new Date(n * 1000);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/**
 * Insert successful charges as pending income transactions. Duplicates are
 * impossible thanks to the (account_id, external_id) unique index.
 */
export async function ingestCharges(
  admin: SupabaseClient,
  opts: {
    userId: string;
    accountId: string;
    accessToken: string;
  }
): Promise<number> {
  const charges = await fetchCharges(opts.accessToken);
  const rows: Record<string, unknown>[] = [];
  for (const c of charges) {
    const amount = Number(c.amount ?? 0);
    const captured = c.captured === true || c.status === 'succeeded';
    if (amount <= 0 || !captured) continue;
    const id = String(c.id ?? '');
    if (!id) continue;
    const email = typeof c.receipt_email === 'string' && c.receipt_email ? c.receipt_email : '';
    rows.push({
      user_id: opts.userId,
      account_id: opts.accountId,
      external_id: id,
      amount: Math.round(amount) / 100,
      currency: String(c.currency ?? 'usd').toUpperCase(),
      merchant: email ? `Stripe payment · ${email}` : 'Stripe payment',
      txn_date: isoDate(c.created),
      kind: 'income',
      status: 'pending',
      notes: typeof c.description === 'string' && c.description ? c.description.slice(0, 200) : null,
    });
  }
  if (rows.length === 0) return 0;
  const { error } = await admin.from('transactions').upsert(rows, {
    onConflict: 'account_id,external_id',
    ignoreDuplicates: true,
  });
  if (error) throw new Error('Could not save the imported income. Please try again.');
  return rows.length;
}

/** Revoke OAuth access so the app can no longer read the account. */
export async function oauthDeauthorize(stripeUserId: string): Promise<void> {
  const params = new URLSearchParams({
    client_id: Deno.env.get('STRIPE_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('STRIPE_SECRET_KEY') ?? '',
    stripe_user_id: stripeUserId,
  });
  await fetch('https://connect.stripe.com/oauth/deauthorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
}
