import type {
  CategoryOverride,
  ExpenseEntry,
  ImportedTransaction,
  IncomeEntry,
  LinkedAccount,
  Profile,
  Receipt,
  SessionUser,
  SignInResult,
  Subscription,
  TaxEstimateRow,
  TaxPayment,
  UsageInfo,
  UserPrefs,
} from '../lib/types';

/** Payloads for creating rows. user_id is always derived from the session. */
export type NewIncome = Omit<IncomeEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type NewExpense = Omit<ExpenseEntry, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'receipt_id'> & {
  /** Optional link to the receipt this expense came from. */
  receipt_id?: string | null;
};
export type NewTaxPayment = Omit<TaxPayment, 'id' | 'user_id' | 'created_at'>;
export type NewTaxEstimate = Omit<TaxEstimateRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

/**
 * The data layer. Two implementations:
 *  - SupabaseBackend  (production: auth, Postgres + RLS, Storage, edge fn)
 *  - LocalBackend     (demo: same interface, persisted in the browser)
 */
export interface FinanceBackend {
  readonly mode: 'supabase' | 'local';
  readonly isDemo: boolean;

  // --- auth -------------------------------------------------------------
  onAuthStateChange(cb: (user: SessionUser | null) => void): () => void;
  getSessionUser(): Promise<SessionUser | null>;
  signUp(email: string, password: string): Promise<SignInResult>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;

  // --- profile & prefs ---------------------------------------------------
  getProfile(): Promise<Profile | null>;
  saveProfile(patch: Partial<Profile>): Promise<Profile>;
  getPrefs(): Promise<UserPrefs | null>;
  savePrefs(patch: Partial<UserPrefs>): Promise<UserPrefs>;

  // --- income -------------------------------------------------------------
  listIncome(): Promise<IncomeEntry[]>;
  createIncome(input: NewIncome): Promise<IncomeEntry>;
  updateIncome(id: string, patch: Partial<IncomeEntry>): Promise<IncomeEntry>;
  deleteIncome(id: string): Promise<void>;

  // --- expenses -------------------------------------------------------------
  listExpenses(): Promise<ExpenseEntry[]>;
  createExpense(input: NewExpense): Promise<ExpenseEntry>;
  updateExpense(id: string, patch: Partial<ExpenseEntry>): Promise<ExpenseEntry>;
  deleteExpense(id: string): Promise<void>;

  // --- receipts -------------------------------------------------------------
  listReceipts(): Promise<Receipt[]>;
  uploadReceipt(file: File): Promise<Receipt>;
  /** Replace the file on an existing receipt (row + expense links preserved). */
  replaceReceipt(id: string, file: File): Promise<Receipt>;
  updateReceipt(id: string, patch: Partial<Receipt>): Promise<Receipt>;
  deleteReceipt(id: string): Promise<void>;
  /** URL (or data URL in demo mode) to view/download the file. */
  getReceiptFileUrl(receipt: Receipt): Promise<string | null>;

  // --- tax payments / set-asides -------------------------------------------
  listTaxPayments(): Promise<TaxPayment[]>;
  createTaxPayment(input: NewTaxPayment): Promise<TaxPayment>;
  deleteTaxPayment(id: string): Promise<void>;

  // --- tax estimate snapshots ------------------------------------------------
  listTaxEstimates(): Promise<TaxEstimateRow[]>;
  saveTaxEstimate(input: NewTaxEstimate): Promise<TaxEstimateRow>;

  // --- subscription & usage ----------------------------------------------------
  /** Current subscription record (null = Free plan). */
  getSubscription(): Promise<Subscription | null>;
  /** Monthly usage counters for the current calendar month. */
  getUsage(): Promise<UsageInfo>;

  // --- integrations (Phase 3) ----------------------------------------------------
  listLinkedAccounts(): Promise<LinkedAccount[]>;
  listTransactions(): Promise<ImportedTransaction[]>;
  /** Remove an imported transaction without creating records. */
  deleteTransaction(id: string): Promise<void>;
  /**
   * Review an imported item. `business`/`income` create the matching expense/
   * income row (dedupe-protected by transaction_id) and mark it reviewed;
   * `personal`/`ignore` mark it ignored without creating records.
   */
  reviewTransaction(input: {
    transactionId: string;
    action: 'business' | 'income' | 'personal' | 'ignore';
    category?: string;
  }): Promise<ImportedTransaction>;
  listCategoryOverrides(): Promise<CategoryOverride[]>;
  /** Remember the user's categorization for a merchant. */
  saveCategoryOverride(override: CategoryOverride): Promise<CategoryOverride>;
}