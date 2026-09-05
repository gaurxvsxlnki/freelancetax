import { FREE_EXPENSES_PER_MONTH, FREE_RECEIPT_SCANS_PER_MONTH } from '../lib/constants';

/**
 * Detect a database-enforced Free-plan limit rejection and turn it into
 * friendly upgrade copy. Returns null when the error is unrelated.
 */
export function limitError(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/free_expense_limit/i.test(raw) || /limit of (\d+ )?20 expenses/.test(raw)) {
    return `You've reached your Free plan limit of ${FREE_EXPENSES_PER_MONTH} expenses this month. Upgrade to Pro for unlimited expense tracking.`;
  }
  if (/free_receipt_limit/i.test(raw) || /limit of (\d+ )?5 receipt/.test(raw)) {
    return `You've reached your Free plan limit of ${FREE_RECEIPT_SCANS_PER_MONTH} receipt scans this month. Upgrade to Pro for unlimited receipt processing.`;
  }
  return null;
}

/** Map a thrown value to a user-friendly message. */
export function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Map common Supabase auth error messages to plain-English copy.
 * Returns null when the message should be passed through unchanged.
 */
export function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const msg = raw.toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'The email or password is incorrect. Please try again.';
  }
  if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already exists')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email address before logging in. Check your inbox for the confirmation link.';
  }
  if (msg.includes('password should be at least')) {
    return 'Your password must be at least 6 characters long.';
  }
  if (msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return 'We couldn\u2019t reach the server. Check your connection and try again.';
  }
  if (msg.includes('no user found') || msg.includes('user not found')) {
    return 'No account was found for that email address.';
  }
  if (msg.includes('captcha')) {
    return 'We couldn\u2019t verify you are human. Please try again.';
  }
  return raw ? raw : 'Something went wrong. Please try again.';
}