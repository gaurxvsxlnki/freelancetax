/**
 * Local demo backend.
 *
 * Used automatically when Supabase env vars are absent so the full product
 * can be exercised end-to-end in this workspace. All data persists in the
 * browser (localStorage) per user. When VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY are set, SupabaseBackend takes over instead.
 *
 * This is a real persistence layer, not fake data — every flow behaves
 * exactly as it will against Supabase, minus server-side OCR/AI (which is
 * reported honestly as "needs review").
 */
import { newId } from '../lib/id';
import { todayISO, toISO } from '../lib/format';
import {
  FREE_EXPENSES_PER_MONTH,
  FREE_RECEIPT_SCANS_PER_MONTH,
  MAX_RECEIPT_BYTES_LOCAL,
  validateReceiptFile,
} from '../lib/constants';
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
import type {
  FinanceBackend,
  NewExpense,
  NewIncome,
  NewTaxEstimate,
  NewTaxPayment,
} from './types';

interface LocalUserRecord {
  id: string;
  email: string;
  pwHash: string;
  createdAt: string;
}

const USERS_KEY = 'flt:users:v1';
const SESSION_KEY = 'flt:session:v1';
const FILE_PREFIX = 'flt:file:';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error(
      'Your browser storage is full. Delete an old receipt or expense and try again.'
    );
  }
}

function readUsers(): LocalUserRecord[] {
  return readJson<LocalUserRecord[]>(USERS_KEY, []);
}

function writeUsers(users: LocalUserRecord[]): void {
  writeJson(USERS_KEY, users);
}

function readSession(): LocalUserRecord | null {
  const session = readJson<{ userId: string } | null>(SESSION_KEY, null);
  if (!session) return null;
  const user = readUsers().find((u) => u.id === session.userId);
  return user ?? null;
}

function writeSession(userId: string | null): void {
  if (userId) writeJson(SESSION_KEY, { userId });
  else localStorage.removeItem(SESSION_KEY);
}

function tableKey(userId: string, table: string): string {
  return `flt:db:${userId}:${table}`;
}

function readTable<T>(userId: string, table: string): T[] {
  return readJson<T[]>(tableKey(userId, table), []);
}

function writeTable<T>(userId: string, table: string, rows: T[]): void {
  writeJson(tableKey(userId, table), rows);
}

async function sha256(text: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Non-secure context fallback (demo only — never used in production).
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `fb-${h.toString(16)}`;
  }
}

function requireLocalUser(): LocalUserRecord {
  const user = readSession();
  if (!user) throw new Error('You need to be signed in to do that.');
  return user;
}

function fileKey(userId: string, receiptId: string): string {
  return `${FILE_PREFIX}${userId}:${receiptId}`;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read this file.'));
    reader.readAsDataURL(file);
  });
}

const sortDesc = <T>(rows: T[], key: keyof T): T[] =>
  [...rows].sort((a, b) => String(b[key] ?? '').localeCompare(String(a[key] ?? '')));

export class LocalBackend implements FinanceBackend {
  readonly mode = 'local' as const;
  readonly isDemo = true;

  private listeners = new Set<(user: SessionUser | null) => void>();

  private emit(user: SessionUser | null): void {
    for (const cb of this.listeners) cb(user);
  }

  onAuthStateChange(cb: (user: SessionUser | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async getSessionUser(): Promise<SessionUser | null> {
    const user = readSession();
    return user ? { id: user.id, email: user.email } : null;
  }

  async signUp(email: string, password: string): Promise<SignInResult> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) throw new Error('Please enter an email and a password.');
    if (password.length < 6) throw new Error('Your password must be at least 6 characters long.');
    const users = readUsers();
    if (users.some((u) => u.email === normalized)) {
      throw new Error('An account with this email already exists. Try logging in instead.');
    }
    const pwHash = await sha256(password);
    const record: LocalUserRecord = {
      id: newId(),
      email: normalized,
      pwHash,
      createdAt: new Date().toISOString(),
    };
    users.push(record);
    writeUsers(users);
    writeSession(record.id);
    // Mirror the Supabase trigger: profile + prefs rows are auto-created.
    writeTable(record.id, 'profiles', [
      {
        id: newId(),
        user_id: record.id,
        full_name: '',
        freelancer_type: 'Freelancer',
        state: '',
        annual_income_range: '',
        works_from_home: false,
        business_use_percentage: 0,
        onboarding_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Profile,
    ]);
    writeTable(record.id, 'user_prefs', [
      {
        id: newId(),
        user_id: record.id,
        tax_year: new Date().getFullYear(),
        currency: 'USD',
        email_reminders: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as UserPrefs,
    ]);
    this.emit({ id: record.id, email: record.email });
    return { user: { id: record.id, email: record.email }, needsEmailConfirmation: false };
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const normalized = email.trim().toLowerCase();
    const user = readUsers().find((u) => u.email === normalized);
    if (!user || user.pwHash !== (await sha256(password))) {
      throw new Error('The email or password is incorrect. Please try again.');
    }
    writeSession(user.id);
    this.emit({ id: user.id, email: user.email });
    return { user: { id: user.id, email: user.email }, needsEmailConfirmation: false };
  }

  async signOut(): Promise<void> {
    writeSession(null);
    this.emit(null);
  }

  async resetPassword(): Promise<void> {
    throw new Error(
      'Password reset emails require a Supabase project. In demo mode, sign up with a new email to try the app.'
    );
  }

  async updatePassword(): Promise<void> {
    throw new Error('Password changes require a Supabase project. This is not available in demo mode.');
  }

  // --- profile & prefs --------------------------------------------------------

  async getProfile(): Promise<Profile | null> {
    const user = requireLocalUser();
    const rows = readTable<Profile>(user.id, 'profiles');
    return rows.find((r) => r.user_id === user.id) ?? null;
  }

  async saveProfile(patch: Partial<Profile>): Promise<Profile> {
    const user = requireLocalUser();
    const rows = readTable<Profile>(user.id, 'profiles');
    const existing = rows.find((r) => r.user_id === user.id);
    const now = new Date().toISOString();
    const saved: Profile = {
      id: existing?.id ?? newId(),
      user_id: user.id,
      full_name: patch.full_name ?? existing?.full_name ?? '',
      freelancer_type: patch.freelancer_type ?? existing?.freelancer_type ?? 'Freelancer',
      state: patch.state ?? existing?.state ?? '',
      annual_income_range: patch.annual_income_range ?? existing?.annual_income_range ?? '',
      works_from_home: patch.works_from_home ?? existing?.works_from_home ?? false,
      business_use_percentage: patch.business_use_percentage ?? existing?.business_use_percentage ?? 0,
      onboarding_completed: patch.onboarding_completed ?? existing?.onboarding_completed ?? false,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    writeTable(
      user.id,
      'profiles',
      existing ? rows.map((r) => (r.user_id === user.id ? saved : r)) : [saved, ...rows]
    );
    return saved;
  }

  async getPrefs(): Promise<UserPrefs | null> {
    const user = requireLocalUser();
    const rows = readTable<UserPrefs>(user.id, 'user_prefs');
    return rows.find((r) => r.user_id === user.id) ?? null;
  }

  async savePrefs(patch: Partial<UserPrefs>): Promise<UserPrefs> {
    const user = requireLocalUser();
    const rows = readTable<UserPrefs>(user.id, 'user_prefs');
    const existing = rows.find((r) => r.user_id === user.id);
    const now = new Date().toISOString();
    const saved: UserPrefs = {
      id: existing?.id ?? newId(),
      user_id: user.id,
      tax_year: patch.tax_year ?? existing?.tax_year ?? new Date().getFullYear(),
      currency: 'USD',
      email_reminders: patch.email_reminders ?? existing?.email_reminders ?? false,
      alerts_missing_receipts: patch.alerts_missing_receipts ?? existing?.alerts_missing_receipts ?? true,
      alerts_uncategorized: patch.alerts_uncategorized ?? existing?.alerts_uncategorized ?? true,
      alerts_reserve: patch.alerts_reserve ?? existing?.alerts_reserve ?? true,
      alerts_deadlines: patch.alerts_deadlines ?? existing?.alerts_deadlines ?? true,
      alerts_unusual_spending: patch.alerts_unusual_spending ?? existing?.alerts_unusual_spending ?? true,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    writeTable(
      user.id,
      'user_prefs',
      existing ? rows.map((r) => (r.user_id === user.id ? saved : r)) : [saved, ...rows]
    );
    return saved;
  }

  // --- income -------------------------------------------------------------------

  async listIncome(): Promise<IncomeEntry[]> {
    const user = requireLocalUser();
    return sortDesc(readTable<IncomeEntry>(user.id, 'income'), 'income_date');
  }

  async createIncome(input: NewIncome): Promise<IncomeEntry> {
    const user = requireLocalUser();
    const now = new Date().toISOString();
    const row: IncomeEntry = { ...input, id: newId(), user_id: user.id, created_at: now, updated_at: now };
    writeTable(user.id, 'income', [row, ...readTable<IncomeEntry>(user.id, 'income')]);
    return row;
  }

  async updateIncome(id: string, patch: Partial<IncomeEntry>): Promise<IncomeEntry> {
    const user = requireLocalUser();
    const rows = readTable<IncomeEntry>(user.id, 'income');
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('This entry no longer exists.');
    const updated: IncomeEntry = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
    rows[idx] = updated;
    writeTable(user.id, 'income', rows);
    return updated;
  }

  async deleteIncome(id: string): Promise<void> {
    const user = requireLocalUser();
    writeTable(user.id, 'income', readTable<IncomeEntry>(user.id, 'income').filter((r) => r.id !== id));
  }

  // --- subscription & usage ---------------------------------------------------------

  /** Demo mode never fabricates a paid plan: without real payments the user is Free. */
  async getSubscription(): Promise<Subscription | null> {
    const user = requireLocalUser();
    const rows = readTable<Subscription>(user.id, 'subscriptions');
    return rows[0] ?? null;
  }

  async getUsage(): Promise<UsageInfo> {
    const user = requireLocalUser();
    const now = new Date();
    const period = toISO(now).slice(0, 7);
    const inMonth = (iso: string | undefined) => (iso ?? '').slice(0, 7) === period;
    const sub = await this.getSubscription();
    const isPro = Boolean(sub && sub.plan === 'pro' && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due'));
    return {
      period,
      expensesUsed: readTable<ExpenseEntry>(user.id, 'expenses').filter((e) => inMonth(e.created_at)).length,
      expensesLimit: isPro ? null : FREE_EXPENSES_PER_MONTH,
      receiptScansUsed: readTable<Receipt>(user.id, 'receipts').filter((r) => inMonth(r.created_at)).length,
      receiptScansLimit: isPro ? null : FREE_RECEIPT_SCANS_PER_MONTH,
    };
  }

  // --- expenses -------------------------------------------------------------------

  async listExpenses(): Promise<ExpenseEntry[]> {
    const user = requireLocalUser();
    return sortDesc(readTable<ExpenseEntry>(user.id, 'expenses'), 'expense_date');
  }

  async createExpense(input: NewExpense): Promise<ExpenseEntry> {
    const user = requireLocalUser();
    // Free-plan limit enforcement lives in the data layer (the same layer that
    // talks to the database in Supabase mode), so the UI cannot bypass it.
    const usage = await this.getUsage();
    if (usage.expensesLimit !== null && usage.expensesUsed >= usage.expensesLimit) {
      throw new Error(
        `You've reached your Free plan limit of ${FREE_EXPENSES_PER_MONTH} expenses this month. Upgrade to Pro for unlimited expense tracking.`
      );
    }
    const now = new Date().toISOString();
    const row: ExpenseEntry = {
      ...input,
      id: newId(),
      user_id: user.id,
      receipt_id: input.receipt_id ?? null,
      created_at: now,
      updated_at: now,
    };
    writeTable(user.id, 'expenses', [row, ...readTable<ExpenseEntry>(user.id, 'expenses')]);
    return row;
  }

  async updateExpense(id: string, patch: Partial<ExpenseEntry>): Promise<ExpenseEntry> {
    const user = requireLocalUser();
    const rows = readTable<ExpenseEntry>(user.id, 'expenses');
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('This expense no longer exists.');
    const updated: ExpenseEntry = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
    rows[idx] = updated;
    writeTable(user.id, 'expenses', rows);
    return updated;
  }

  async deleteExpense(id: string): Promise<void> {
    const user = requireLocalUser();
    writeTable(user.id, 'expenses', readTable<ExpenseEntry>(user.id, 'expenses').filter((r) => r.id !== id));
  }

  // --- receipts ----------------------------------------------------------------------

  async listReceipts(): Promise<Receipt[]> {
    const user = requireLocalUser();
    return sortDesc(readTable<Receipt>(user.id, 'receipts'), 'created_at');
  }

  async uploadReceipt(file: File): Promise<Receipt> {
    const user = requireLocalUser();
    const name = file.name.toLowerCase();
    const isPdf = /\.pdf$/.test(name);
    const check = validateReceiptFile(file, MAX_RECEIPT_BYTES_LOCAL);
    if (!check.ok) throw new Error(check.error);
    const usage = await this.getUsage();
    if (usage.receiptScansLimit !== null && usage.receiptScansUsed >= usage.receiptScansLimit) {
      throw new Error(
        `You've reached your Free plan limit of ${FREE_RECEIPT_SCANS_PER_MONTH} receipt scans this month. Upgrade to Pro for unlimited receipt processing.`
      );
    }

    const dataUrl = await toDataUrl(file);
    const id = newId();
    const now = new Date().toISOString();
    const row: Receipt = {
      id,
      user_id: user.id,
      file_path: null,
      file_name: file.name,
      file_type: file.type || (isPdf ? 'application/pdf' : 'image/png'),
      file_size: file.size,
      merchant: '',
      amount: null,
      receipt_date: null,
      extracted_text: null,
      processing_status: 'processing',
      review_note: null,
      created_at: now,
      updated_at: now,
    };
    writeTable(user.id, 'receipts', [row, ...readTable<Receipt>(user.id, 'receipts')]);
    try {
      localStorage.setItem(fileKey(user.id, id), dataUrl);
    } catch {
      // Persist the row but degrade gracefully if the browser is out of space.
    }

    // Processing: demo mode has no OCR provider — be honest about it.
    const processed = await this.updateReceipt(id, {
      processing_status: 'needs_review',
      review_note:
        'Automatic receipt scanning isn\u2019t configured for this project yet, so no details were extracted. Review the file and enter the details manually.',
    });
    return processed;
  }

  async updateReceipt(id: string, patch: Partial<Receipt>): Promise<Receipt> {
    const user = requireLocalUser();
    const rows = readTable<Receipt>(user.id, 'receipts');
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('This receipt no longer exists.');
    const updated: Receipt = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
    rows[idx] = updated;
    writeTable(user.id, 'receipts', rows);
    return updated;
  }

  /** Replace the file on an existing receipt, keeping the row + links intact. */
  async replaceReceipt(id: string, file: File): Promise<Receipt> {
    const user = requireLocalUser();
    const rows = readTable<Receipt>(user.id, 'receipts');
    const existing = rows.find((r) => r.id === id);
    if (!existing) throw new Error('This receipt no longer exists.');
    const name = file.name.toLowerCase();
    const isPdf = /\.pdf$/.test(name);
    const check = validateReceiptFile(file, MAX_RECEIPT_BYTES_LOCAL);
    if (!check.ok) throw new Error(check.error);
    const dataUrl = await toDataUrl(file);
    localStorage.setItem(fileKey(user.id, id), dataUrl);
    // A replacement is a fresh scan: clear previously extracted details.
    const updated = await this.updateReceipt(id, {
      file_name: file.name,
      file_type: file.type || (isPdf ? 'application/pdf' : 'image/png'),
      file_size: file.size,
      merchant: '',
      amount: null,
      receipt_date: null,
      extracted_text: null,
      processing_status: 'needs_review',
      review_note:
        'This receipt was replaced, so its details were reset. Review the new file and confirm the details.',
    });
    return updated;
  }

  async deleteReceipt(id: string): Promise<void> {
    const user = requireLocalUser();
    writeTable(user.id, 'receipts', readTable<Receipt>(user.id, 'receipts').filter((r) => r.id !== id));
    localStorage.removeItem(fileKey(user.id, id));
  }

  async getReceiptFileUrl(receipt: Receipt): Promise<string | null> {
    const user = requireLocalUser();
    return localStorage.getItem(fileKey(user.id, receipt.id));
  }

  // --- tax payments -------------------------------------------------------------------

  async listTaxPayments(): Promise<TaxPayment[]> {
    const user = requireLocalUser();
    return sortDesc(readTable<TaxPayment>(user.id, 'tax_payments'), 'payment_date');
  }

  async createTaxPayment(input: NewTaxPayment): Promise<TaxPayment> {
    const user = requireLocalUser();
    const row: TaxPayment = {
      ...input,
      id: newId(),
      user_id: user.id,
      payment_date: input.payment_date || todayISO(),
      created_at: new Date().toISOString(),
    };
    writeTable(user.id, 'tax_payments', [row, ...readTable<TaxPayment>(user.id, 'tax_payments')]);
    return row;
  }

  async deleteTaxPayment(id: string): Promise<void> {
    const user = requireLocalUser();
    writeTable(
      user.id,
      'tax_payments',
      readTable<TaxPayment>(user.id, 'tax_payments').filter((r) => r.id !== id)
    );
  }

  // --- tax estimate snapshots ---------------------------------------------------

  async listTaxEstimates(): Promise<TaxEstimateRow[]> {
    const user = requireLocalUser();
    const rows = readTable<TaxEstimateRow>(user.id, 'tax_estimates');
    return [...rows].sort((a, b) => b.tax_year - a.tax_year);
  }

  async saveTaxEstimate(input: NewTaxEstimate): Promise<TaxEstimateRow> {
    const user = requireLocalUser();
    const rows = readTable<TaxEstimateRow>(user.id, 'tax_estimates');
    const existing = rows.find((r) => r.tax_year === input.tax_year);
    const now = new Date().toISOString();
    const saved: TaxEstimateRow = {
      id: existing?.id ?? newId(),
      user_id: user.id,
      tax_year: input.tax_year,
      total_income: input.total_income,
      total_expenses: input.total_expenses,
      estimated_tax: input.estimated_tax,
      recommended_set_aside: input.recommended_set_aside,
      calculation_metadata: input.calculation_metadata ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    writeTable(
      user.id,
      'tax_estimates',
      existing ? rows.map((r) => (r.tax_year === input.tax_year ? saved : r)) : [saved, ...rows]
    );
    return saved;
  }

  // --- integrations (Phase 3) ---------------------------------------------------

  async listLinkedAccounts(): Promise<LinkedAccount[]> {
    const user = requireLocalUser();
    return sortDesc(readTable<LinkedAccount>(user.id, 'linked_accounts'), 'created_at');
  }

  async listTransactions(): Promise<ImportedTransaction[]> {
    const user = requireLocalUser();
    return sortDesc(readTable<ImportedTransaction>(user.id, 'transactions'), 'txn_date');
  }

  async deleteTransaction(id: string): Promise<void> {
    const user = requireLocalUser();
    writeTable(
      user.id,
      'transactions',
      readTable<ImportedTransaction>(user.id, 'transactions').filter((r) => r.id !== id)
    );
  }

  async reviewTransaction(input: {
    transactionId: string;
    action: 'business' | 'income' | 'personal' | 'ignore';
    category?: string;
  }): Promise<ImportedTransaction> {
    const user = requireLocalUser();
    const rows = readTable<ImportedTransaction>(user.id, 'transactions');
    const idx = rows.findIndex((r) => r.id === input.transactionId);
    if (idx < 0) throw new Error('This transaction no longer exists.');
    const t = rows[idx];

    if (input.action === 'business' || input.action === 'income') {
      const category = input.category ?? t.suggested_category ?? (t.kind === 'income' ? 'Freelance' : 'Other');
      const alreadyLinked =
        input.action === 'business'
          ? readTable<ExpenseEntry>(user.id, 'expenses').some((e) => e.transaction_id === t.id)
          : readTable<IncomeEntry>(user.id, 'income').some((e) => e.transaction_id === t.id);
      if (input.action === 'business' && t.kind === 'expense' && !alreadyLinked) {
        const now = new Date().toISOString();
        const expense: ExpenseEntry = {
          id: newId(),
          user_id: user.id,
          amount: t.amount,
          merchant: t.merchant,
          expense_date: t.txn_date,
          category,
          business_use_percentage: 100,
          is_business_expense: true,
          notes: `Imported from a connected account · ${t.merchant}`,
          receipt_id: null,
          transaction_id: t.id,
          created_at: now,
          updated_at: now,
        };
        writeTable(user.id, 'expenses', [expense, ...readTable<ExpenseEntry>(user.id, 'expenses')]);
      } else if (input.action === 'income' && t.kind === 'income' && !alreadyLinked) {
        const now = new Date().toISOString();
        const income: IncomeEntry = {
          id: newId(),
          user_id: user.id,
          amount: t.amount,
          source: t.merchant || 'Connected platform',
          income_date: t.txn_date,
          category: 'Freelance',
          notes: `Imported from a connected account · ${t.merchant}`,
          transaction_id: t.id,
          created_at: now,
          updated_at: now,
        };
        writeTable(user.id, 'income', [income, ...readTable<IncomeEntry>(user.id, 'income')]);
      }
      const updated: ImportedTransaction = {
        ...t,
        status: 'reviewed',
        category,
        classification: 'business',
        updated_at: new Date().toISOString(),
      };
      rows[idx] = updated;
      writeTable(user.id, 'transactions', rows);
      return updated;
    }

    const updated: ImportedTransaction = {
      ...t,
      status: 'ignored',
      classification: 'personal',
      category: t.category ?? t.suggested_category ?? 'Other',
      updated_at: new Date().toISOString(),
    };
    rows[idx] = updated;
    writeTable(user.id, 'transactions', rows);
    return updated;
  }

  async listCategoryOverrides(): Promise<CategoryOverride[]> {
    const user = requireLocalUser();
    return sortDesc(readTable<CategoryOverride>(user.id, 'category_overrides'), 'updated_at');
  }

  async saveCategoryOverride(override: CategoryOverride): Promise<CategoryOverride> {
    const user = requireLocalUser();
    const rows = readTable<CategoryOverride>(user.id, 'category_overrides');
    const existing = rows.find((r) => r.merchant_key === override.merchant_key);
    const now = new Date().toISOString();
    const saved: CategoryOverride = {
      id: existing?.id ?? newId(),
      user_id: user.id,
      merchant_key: override.merchant_key,
      category: override.category,
      classification: override.classification,
      times_applied: (existing?.times_applied ?? 0) + 1,
      updated_at: now,
    };
    writeTable(
      user.id,
      'category_overrides',
      existing ? rows.map((r) => (r.merchant_key === override.merchant_key ? saved : r)) : [saved, ...rows]
    );
    return saved;
  }
}