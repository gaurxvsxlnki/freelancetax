/**
 * Shared helpers for the Plaid integration edge functions. Runs server-side
 * only — Plaid client/secret keys and per-user access tokens never leave the
 * function runtime. Access tokens are stored AES-GCM-encrypted using a key
 * derived from INTEGRATION_ENC_KEY (never plaintext, never user-readable:
 * integration_credentials has no RLS policies).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: string;
  error: string | null;
}

export function plaidConfig(): PlaidConfig {
  const clientId = Deno.env.get('PLAID_CLIENT_ID') ?? '';
  const secret = Deno.env.get('PLAID_SECRET') ?? '';
  const env = Deno.env.get('PLAID_ENV') ?? '';
  if (!clientId || !secret || !env) {
    return {
      clientId: '',
      secret: '',
      env: '',
      error:
        'Bank connections are not configured yet. The server needs PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV before accounts can be linked.',
    };
  }
  return { clientId, secret, env, error: null };
}

export async function plaidApi(
  path: string,
  extra: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const cfg = plaidConfig();
  const body = JSON.stringify({ client_id: cfg.clientId, secret: cfg.secret, ...extra });
  const res = await fetch(`https://${cfg.env}.plaid.com/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
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

/** Human-friendly message for common Plaid error codes. */
export function plaidError(data: Record<string, unknown> | null, fallback: string): string {
  const code = data && typeof data.error_code === 'string' ? data.error_code : null;
  if (code === 'ITEM_LOGIN_REQUIRED') {
    return 'This bank connection needs to be re-authenticated. Please reconnect the account.';
  }
  if (code === 'INVALID_ACCESS_TOKEN' || code === 'ITEM_NOT_FOUND') {
    return 'This bank connection is no longer valid. Please reconnect the account.';
  }
  const message = data && typeof data.error_message === 'string' ? data.error_message : null;
  return message || fallback;
}

// --- token encryption at rest ------------------------------------------------

async function encKey(): Promise<CryptoKey | null> {
  const raw = Deno.env.get('INTEGRATION_ENC_KEY') ?? '';
  if (!raw) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt a provider access token. Requires INTEGRATION_ENC_KEY. */
export async function sealToken(plain: string): Promise<string> {
  const key = await encKey();
  if (!key) {
    throw new Error(
      'Bank connections are not fully configured yet: the server needs INTEGRATION_ENC_KEY to store provider credentials securely.'
    );
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return `v1.${toB64(iv)}.${toB64(new Uint8Array(cipher))}`;
}

/** Decrypt a token previously created with sealToken. */
export async function openToken(cipher: string): Promise<string> {
  const key = await encKey();
  if (!key) throw new Error('INTEGRATION_ENC_KEY is missing on the server.');
  const parts = cipher.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Stored credential is unreadable.');
  const iv = fromB64(parts[1]);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    fromB64(parts[2]).buffer
  );
  return new TextDecoder().decode(plain);
}

// --- database ------------------------------------------------------------------

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// --- sync core (shared by plaid-exchange and plaid-sync) ------------------------

export interface SyncOutcome {
  imported: number;
  nextCursor: string;
}

/**
 * Pull new transactions for one linked Plaid item and insert them (dedupe via
 * the partial unique index on (account_id, external_id)). Removed items are
 * dropped only while they are still pending — anything the user already
 * reviewed stays (their expense/income rows remain linked).
 */
export async function plaidSyncAccount(opts: {
  accessToken: string;
  externalAccountId: string;
  cursor: string;
  userId: string;
  linkedAccountId: string;
}): Promise<SyncOutcome> {
  const admin = adminClient();
  let cursor = opts.cursor || '';
  let imported = 0;
  let hasMore = true;
  let guard = 0;
  while (hasMore && guard < 6) {
    guard += 1;
    const res = await plaidApi('transactions/sync', {
      access_token: opts.accessToken,
      ...(cursor ? { cursor } : {}),
      count: 100,
    });
    if (res.status !== 200 || !res.data) {
      throw new Error(plaidError(res.data, 'The bank sync failed. Please try again.'));
    }
    const added = Array.isArray(res.data.added) ? (res.data.added as Record<string, unknown>[]) : [];
    const removed = Array.isArray(res.data.removed) ? (res.data.removed as Record<string, unknown>[]) : [];

    const rows = added
      .filter((t) => String(t.account_id ?? '') === opts.externalAccountId)
      .map((t) => {
        const amount = Math.abs(Number(t.amount ?? 0));
        const merchant = String(t.merchant_name || t.name || 'Bank purchase').slice(0, 120);
        const externalId = String(t.transaction_id ?? '');
        const date = String(t.date ?? '');
        return {
          user_id: opts.userId,
          account_id: opts.linkedAccountId,
          external_id: externalId,
          amount: Number.isFinite(amount) ? amount : 0,
          currency: String(t.iso_currency_code || t.unofficial_currency_code || 'USD'),
          merchant,
          txn_date: date,
          kind: Number(t.amount ?? 0) < 0 ? 'income' : 'expense',
          status: 'pending',
        };
      })
      .filter((r) => r.external_id && r.txn_date && r.amount > 0);

    if (rows.length > 0) {
      const { error } = await admin.from('transactions').upsert(rows, {
        onConflict: 'account_id,external_id',
        ignoreDuplicates: true,
      });
      if (error) throw new Error('Could not save the imported transactions. Please try again.');
      imported += rows.length;
    }

    const removedIds = removed.map((r) => String(r.transaction_id ?? '')).filter(Boolean);
    if (removedIds.length > 0) {
      // Only clean up items the user hasn't reviewed yet.
      const { data: existing } = await admin
        .from('transactions')
        .select('id, status')
        .eq('account_id', opts.linkedAccountId)
        .in('external_id', removedIds);
      const deletable = (existing ?? []).filter((r) => r.status === 'pending').map((r) => r.id);
      if (deletable.length > 0) {
        await admin.from('transactions').delete().in('id', deletable);
      }
    }

    cursor = String(res.data.next_cursor ?? cursor);
    hasMore = Boolean(res.data.has_more);
  }
  return { imported, nextCursor: cursor };
}

/** Confirm whether a connected item needs re-authentication (ITEM_LOGIN_REQUIRED). */
export function requiresReauth(data: Record<string, unknown> | null): boolean {
  return Boolean(data && data.error_code === 'ITEM_LOGIN_REQUIRED');
}
