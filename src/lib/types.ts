/**
 * Domain types. Field names mirror the Supabase Postgres columns so rows can
 * be passed straight through; the local demo backend persists the same shape.
 */

export interface Profile {
  id?: string;
  user_id: string;
  full_name: string;
  freelancer_type: string;
  state: string;
  annual_income_range: string;
  works_from_home: boolean;
  business_use_percentage: number;
  onboarding_completed: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserPrefs {
  id?: string;
  user_id: string;
  tax_year: number;
  currency: 'USD';
  email_reminders: boolean;
  alerts_missing_receipts?: boolean;
  alerts_uncategorized?: boolean;
  alerts_reserve?: boolean;
  alerts_deadlines?: boolean;
  alerts_unusual_spending?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface IncomeEntry {
  id: string;
  user_id?: string;
  amount: number;
  source: string;
  income_date: string; // YYYY-MM-DD
  category: string;
  notes: string | null;
  /** Set when this row was created from an imported transaction. */
  transaction_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseEntry {
  id: string;
  user_id?: string;
  amount: number;
  merchant: string;
  expense_date: string; // YYYY-MM-DD
  category: string;
  business_use_percentage: number; // 0..100
  is_business_expense: boolean;
  notes: string | null;
  receipt_id: string | null;
  /** Set when this row was created from an imported transaction. */
  transaction_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ReceiptStatus =
  | 'uploading'
  | 'processing'
  | 'needs_review'
  | 'completed'
  | 'failed';

export interface Receipt {
  id: string;
  user_id?: string;
  file_path: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  merchant: string;
  amount: number | null;
  receipt_date: string | null; // YYYY-MM-DD
  extracted_text: string | null;
  processing_status: ReceiptStatus;
  review_note: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SubscriptionPlan = 'free' | 'pro';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'incomplete';

export type BillingInterval = 'month' | 'year';

/** Mirrors the `subscriptions` table. Absence of a row means Free. */
export interface Subscription {
  id?: string;
  user_id?: string;
  provider: string; // 'stripe' | 'demo'
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  plan: SubscriptionPlan;
  billing_interval: BillingInterval | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at?: string;
  updated_at?: string;
}

// --- Phase 3: integrations -------------------------------------------------

export type ImportProvider = 'plaid' | 'stripe' | 'paypal' | 'other';
export type AccountKind = 'bank' | 'income';
export type AccountStatus = 'active' | 'expired' | 'disconnected' | 'error' | 'pending';

/** User-visible metadata for a connected account. Tokens never live here. */
export interface LinkedAccount {
  id: string;
  user_id?: string;
  provider: ImportProvider;
  kind: AccountKind;
  external_account_id: string | null;
  institution_name: string;
  account_name: string;
  account_mask: string;
  status: AccountStatus;
  last_synced_at: string | null;
  last_error: string | null;
  created_at?: string;
  updated_at?: string;
}

export type TxnKind = 'expense' | 'income';
export type TxnStatus = 'pending' | 'reviewed' | 'ignored';
export type TxnClassification = 'business' | 'personal' | 'review';

/** Raw imported transaction awaiting review. */
export interface ImportedTransaction {
  id: string;
  user_id?: string;
  account_id: string | null;
  external_id: string;
  amount: number;
  currency: string;
  merchant: string;
  txn_date: string; // YYYY-MM-DD
  kind: TxnKind;
  suggested_category: string | null;
  suggested_classification: TxnClassification | null;
  category: string | null;
  classification: TxnClassification | null;
  status: TxnStatus;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

/** User correction that future categorization should remember. */
export interface CategoryOverride {
  id?: string;
  user_id?: string;
  merchant_key: string;
  category: string;
  classification: TxnClassification;
  times_applied?: number;
  updated_at?: string;
}

/** Monthly usage counters for the Free plan limits (limits null = unlimited). */
export interface UsageInfo {
  /** Calendar period these counters cover, e.g. "2026-09". */
  period: string;
  expensesUsed: number;
  expensesLimit: number | null;
  receiptScansUsed: number;
  receiptScansLimit: number | null;
}

/** Persisted tax estimate snapshot for a user + tax year. */
export interface TaxEstimateRow {
  id?: string;
  user_id?: string;
  tax_year: number;
  total_income: number;
  total_expenses: number;
  estimated_tax: number;
  recommended_set_aside: number;
  calculation_metadata: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export type PaymentKind = 'set_aside' | 'estimated_payment';

export interface TaxPayment {
  id: string;
  user_id?: string;
  amount: number;
  payment_date: string; // YYYY-MM-DD
  kind: PaymentKind;
  tax_year: number;
  quarter_key: string | null; // e.g. "2026-Q1"
  notes: string | null;
  created_at?: string;
}

export type InsightClassification = 'business' | 'personal' | 'review';

export type InsightConfidence = 'High' | 'Medium' | 'Low';

export interface DeductionInsight {
  classification: InsightClassification;
  confidence: InsightConfidence;
  explanation: string;
  /** Amount that would count toward business deductions (amount × use %) */
  business_amount: number;
}

export interface SessionUser {
  id: string;
  email: string;
}

export interface AuthErrorLike {
  message: string;
}

export interface SignInResult {
  user: SessionUser | null;
  /** Set when signup succeeded but the provider requires email confirmation */
  needsEmailConfirmation: boolean;
}