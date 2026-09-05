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

export const MAX_RECEIPT_BYTES_LOCAL = 2_500_000; // localStorage demo guard

// --- Free plan limits --------------------------------------------------------
export const FREE_EXPENSES_PER_MONTH = 20;
export const FREE_RECEIPT_SCANS_PER_MONTH = 5;

export const PLAN_FEATURES = {
  pro_monthly_price: 9.99,
  pro_yearly_price: 79,
} as const;

/** When true, real payment credentials are required to upgrade (no fake flows). */
export function canProcessPayments(backendMode: string): boolean {
  return backendMode === 'supabase';
}

/** Wording rules for AI/insights — never guarantee deductibility. */
export const INSIGHT_DISCLAIMER =
  'These insights are estimates for organizational purposes and are not tax advice. Consider consulting a qualified tax professional for your situation.';

export const TAX_DISCLAIMER =
  'Estimates are informational only and may not reflect your actual tax liability. Tax rules vary by individual circumstances. Consult a qualified tax professional for personalized advice.';