export const APP_NAME = 'FreelanceTax';

export const FREELANCER_TYPES = [
  'Freelancer',
  'Creator',
  'Consultant',
  'Designer',
  'Developer',
  'Photographer',
  'Writer',
  'Driver/Gig worker',
  'Other',
] as const;

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
  'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
  'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
] as const;

export const INCOME_RANGES = [
  'Under $25,000',
  '$25,000 – $50,000',
  '$50,000 – $100,000',
  '$100,000 – $200,000',
  'Over $200,000',
] as const;

export const INCOME_CATEGORIES = [
  'Freelance',
  'Consulting',
  'Content',
  'Gig work',
  'Other',
] as const;

export const EXPENSE_CATEGORIES = [
  'Software',
  'Equipment',
  'Advertising',
  'Office',
  'Internet',
  'Phone',
  'Transportation',
  'Travel',
  'Professional services',
  'Education',
  'Food & dining',
  'Other',
] as const;

export const IMPORT_PROVIDERS = ['plaid', 'stripe', 'paypal', 'other'] as const;
export const IMPORT_KINDS = ['bank', 'income'] as const;

export const ACCEPTED_RECEIPT_TYPES = [
  '.jpg', '.jpeg', '.png', '.webp', '.pdf',
] as const;

/** MIME types the storage bucket accepts (mirrors the Supabase migration). */
export const ACCEPTED_RECEIPT_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
] as const;

/** Server-side ceiling, enforced by the storage bucket too. */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB

export const MAX_RECEIPT_BYTES_LOCAL = 2_500_000; // localStorage demo guard

export interface ReceiptFileCheck {
  ok: boolean;
  error?: string;
}

/**
 * Single source of truth for receipt file validation, shared by the upload UI
 * and both backends. Extension AND declared MIME type must both be acceptable
 * so a renamed executable cannot slip through on extension alone.
 */
export function validateReceiptFile(
  file: { name: string; size: number; type: string },
  maxBytes: number = MAX_RECEIPT_BYTES
): ReceiptFileCheck {
  const lower = file.name.toLowerCase();
  const extOk = ACCEPTED_RECEIPT_TYPES.some((t) => lower.endsWith(t));
  if (!extOk) {
    return { ok: false, error: 'Please upload a JPG, PNG, WebP, or PDF file.' };
  }
  // Browsers sometimes report an empty type; fall back to the extension check.
  if (file.type && !ACCEPTED_RECEIPT_MIME.includes(file.type as (typeof ACCEPTED_RECEIPT_MIME)[number])) {
    return { ok: false, error: 'Please upload a JPG, PNG, WebP, or PDF file.' };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'This file appears to be empty. Please choose another file.' };
  }
  if (file.size > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return { ok: false, error: `This file is too large (max ${mb} MB). Please choose a smaller file.` };
  }
  return { ok: true };
}

// --- Free plan limits --------------------------------------------------------
export const FREE_EXPENSES_PER_MONTH = 20;
export const FREE_RECEIPT_SCANS_PER_MONTH = 5;

/**
 * Advertised Pro pricing. This is DISPLAY ONLY — Stripe is the source of truth
 * for what is actually charged, driven by STRIPE_PRICE_MONTHLY /
 * STRIPE_PRICE_YEARLY on the server. Keep these in sync with your Stripe
 * Prices or the marketing copy will lie about the amount.
 */
export const PLAN_FEATURES = {
  pro_monthly_price: 5,
  pro_yearly_price: 40,
} as const;

/** "$5" / "$40" — trims a trailing .00 so whole dollars read cleanly. */
export function formatPlanPrice(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

export const PRO_MONTHLY_LABEL = formatPlanPrice(PLAN_FEATURES.pro_monthly_price);
export const PRO_YEARLY_LABEL = formatPlanPrice(PLAN_FEATURES.pro_yearly_price);

/** Effective monthly cost when paying yearly, e.g. "$3.33". */
export const PRO_YEARLY_PER_MONTH_LABEL = `$${(PLAN_FEATURES.pro_yearly_price / 12).toFixed(2)}`;

/** Absolute saving from annual billing, e.g. "$20". */
export const PRO_YEARLY_SAVING_LABEL = formatPlanPrice(
  Math.round((PLAN_FEATURES.pro_monthly_price * 12 - PLAN_FEATURES.pro_yearly_price) * 100) / 100
);

/** Percentage saved by paying yearly, e.g. 33. */
export const PRO_YEARLY_SAVING_PCT = Math.round(
  (1 - PLAN_FEATURES.pro_yearly_price / (PLAN_FEATURES.pro_monthly_price * 12)) * 100
);

/** Wording rules for AI/insights — never guarantee deductibility. */
export const INSIGHT_DISCLAIMER =
  'These insights are estimates for organizational purposes and are not tax advice. Consider consulting a qualified tax professional for your situation.';

export const TAX_DISCLAIMER =
  'Estimates are informational only and may not reflect your actual tax liability. Tax rules vary by individual circumstances. Consult a qualified tax professional for personalized advice.';