import { supabase } from './supabase';

/**
 * Client wrapper for the server-side integration functions (Plaid bank sync,
 * Stripe income). Tokens and provider credentials never touch the browser —
 * the server returns only link tokens, URLs, and sync results. When a provider
 * isn't configured the functions answer with a clear configuration error.
 */

export interface IntegrationResult {
  ok: boolean;
  url?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export const INTEGRATION_DEMO_ERROR =
  'Connections require a Supabase project with provider credentials (Plaid and/or Stripe). In demo mode data stays in your browser, so external accounts can\u2019t be linked.';

async function invoke(name: string, body: unknown): Promise<IntegrationResult> {
  if (!supabase) {
    return { ok: false, error: INTEGRATION_DEMO_ERROR };
  }
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      return { ok: false, error: error.message || 'Could not reach the connection service. Please try again.' };
    }
    const res = data as { url?: string; error?: string } & Record<string, unknown>;
    if (res?.error) return { ok: false, error: res.error };
    return { ok: true, url: res?.url, data: res };
  } catch {
    return { ok: false, error: 'Could not reach the connection service. Please try again.' };
  }
}

/** Bank connections (Plaid). */
export function getPlaidLinkToken(): Promise<IntegrationResult> {
  return invoke('plaid-link', {});
}

export function syncBankAccount(accountId: string): Promise<IntegrationResult> {
  return invoke('plaid-sync', { accountId });
}

export function disconnectBankAccount(accountId: string): Promise<IntegrationResult> {
  return invoke('plaid-disconnect', { accountId });
}

/** Exchange the Plaid public token for a linked account + first sync. */
export interface PlaidExchangePayload {
  publicToken: string;
  accountId: string;
  institutionName?: string;
  accountName?: string;
  accountMask?: string;
}

export function exchangePlaid(payload: PlaidExchangePayload): Promise<IntegrationResult> {
  return invoke('plaid-exchange', payload);
}

/** Income platform connections (Stripe Connect OAuth). */
export function connectStripeIncome(): Promise<IntegrationResult> {
  return invoke('stripe-income-connect', {});
}

/** Finish Stripe OAuth after the provider redirects back to /imports?code=… */
export function finishStripeIncome(code: string, state: string): Promise<IntegrationResult> {
  return invoke('stripe-income-connect', { code, state });
}

export function syncIncomeAccount(accountId: string): Promise<IntegrationResult> {
  return invoke('stripe-income-sync', { accountId });
}

export function disconnectIncomeAccount(accountId: string): Promise<IntegrationResult> {
  return invoke('stripe-income-disconnect', { accountId });
}

// ---------------------------------------------------------------------------
// Browser Plaid Link handshake (v3). The link_token comes from plaid-link;
// this opens the provider's hosted popup and hands the public token to
// plaid-exchange. The Plaid JS SDK is loaded from their CDN only when a Pro
// user actually clicks “Connect bank”, so demo/local sessions never load it.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    Plaid?: {
      create: (opts: Record<string, unknown>) => { open: () => void; destroy: () => void };
    };
  }
}

interface PlaidAccountMeta {
  id: string;
  name: string;
  mask?: string;
}

interface PlaidMetadata {
  accounts?: PlaidAccountMeta[];
  institution?: { name?: string };
}

let plaidScriptPromise: Promise<void> | null = null;

function loadPlaidScript(): Promise<void> {
  if (plaidScriptPromise) return plaidScriptPromise;
  plaidScriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Bank linking needs a browser window.'));
      return;
    }
    if (document.getElementById('plaid-link-sdk')) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.id = 'plaid-link-sdk';
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      plaidScriptPromise = null;
      reject(new Error('Could not load the secure bank-connection screen. Please try again.'));
    };
    document.head.appendChild(s);
  });
  return plaidScriptPromise;
}

/**
 * Open Plaid Link for a token and run `onSuccess` once the user finishes
 * authorizing. Resolves with the result of onSuccess (the plaid-exchange
 * outcome), or a friendly error when the flow is cancelled or fails.
 */
export function openPlaidLink(
  token: string,
  onSuccess: (payload: PlaidExchangePayload) => Promise<IntegrationResult>
): Promise<IntegrationResult> {
  return loadPlaidScript().then(
    () =>
      new Promise<IntegrationResult>((resolve) => {
        const create = window.Plaid?.create;
        if (!create) {
          resolve({ ok: false, error: 'The bank-connection screen did not load. Please try again.' });
          return;
        }
        let settled = false;
        const handler = create({
          token,
          onSuccess: (publicToken: string, metadata: PlaidMetadata) => {
            if (settled) return;
            settled = true;
            const acc = metadata?.accounts?.[0];
            void onSuccess({
              publicToken,
              accountId: acc?.id ?? '',
              institutionName: metadata?.institution?.name ?? 'Bank',
              accountName: acc?.name ?? 'Checking',
              accountMask: acc?.mask ?? '',
            }).then(resolve);
            try {
              handler.destroy();
            } catch {
              /* already closed */
            }
          },
          onExit: () => {
            if (!settled) {
              settled = true;
              resolve({ ok: false, error: 'The bank-connection window was closed before linking finished.' });
            }
          },
        });
        handler.open();
      }),
    (err: unknown) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : 'Could not start the bank connection. Please try again.',
    })
  );
}
