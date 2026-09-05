import { supabase, receiptProcessorUrl } from '../lib/supabase';
import { newId } from '../lib/id';
import {
  FREE_EXPENSES_PER_MONTH,
  FREE_RECEIPT_SCANS_PER_MONTH,
  MAX_RECEIPT_BYTES,
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
import { friendlyAuthError, limitError } from './errors';

const toNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const toNumOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

/** Postgres unique-violation code: used to keep review actions idempotent. */
const isUniqueViolation = (err: { code?: string } | null | undefined): boolean => err?.code === '23505';

async function requireUser(): Promise<SessionUser> {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(friendlyAuthError(error));
  const user = data.session?.user;
  if (!user) throw new Error('You need to be signed in to do that.');
  return { id: user.id, email: user.email ?? '' };
}

const toIncome = (row: Record<string, unknown>): IncomeEntry => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  amount: toNum(row.amount),
  source: String(row.source ?? ''),
  income_date: String(row.income_date ?? ''),
  category: String(row.category ?? 'Freelance'),
  notes: row.notes == null ? null : String(row.notes),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

const toExpense = (row: Record<string, unknown>): ExpenseEntry => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  amount: toNum(row.amount),
  merchant: String(row.merchant ?? ''),
  expense_date: String(row.expense_date ?? ''),
  category: String(row.category ?? 'Other'),
  business_use_percentage: Math.round(toNum(row.business_use_percentage)),
  is_business_expense: Boolean(row.is_business_expense),
  notes: row.notes == null ? null : String(row.notes),
  receipt_id: row.receipt_id == null ? null : String(row.receipt_id),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

const toReceipt = (row: Record<string, unknown>): Receipt => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  file_path: row.file_path == null ? null : String(row.file_path),
  file_name: String(row.file_name ?? ''),
  file_type: String(row.file_type ?? ''),
  file_size: toNum(row.file_size),
  merchant: String(row.merchant ?? ''),
  amount: toNumOrNull(row.amount),
  receipt_date: row.receipt_date ? String(row.receipt_date) : null,
  extracted_text: row.extracted_text == null ? null : String(row.extracted_text),
  processing_status: (row.processing_status as Receipt['processing_status']) ?? 'needs_review',
  review_note: row.review_note == null ? null : String(row.review_note),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

const toLinkedAccount = (row: Record<string, unknown>): LinkedAccount => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  provider: (row.provider as LinkedAccount['provider']) ?? 'other',
  kind: (row.kind as LinkedAccount['kind']) ?? 'bank',
  external_account_id: row.external_account_id == null ? null : String(row.external_account_id),
  institution_name: String(row.institution_name ?? ''),
  account_name: String(row.account_name ?? ''),
  account_mask: String(row.account_mask ?? ''),
  status: (row.status as LinkedAccount['status']) ?? 'pending',
  last_synced_at: row.last_synced_at ? String(row.last_synced_at) : null,
  last_error: row.last_error == null ? null : String(row.last_error),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

const toTransaction = (row: Record<string, unknown>): ImportedTransaction => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  account_id: row.account_id == null ? null : String(row.account_id),
  external_id: String(row.external_id ?? ''),
  amount: toNum(row.amount),
  currency: String(row.currency ?? 'USD'),
  merchant: String(row.merchant ?? ''),
  txn_date: String(row.txn_date ?? ''),
  kind: (row.kind as ImportedTransaction['kind']) ?? 'expense',
  suggested_category: row.suggested_category == null ? null : String(row.suggested_category),
  suggested_classification: (row.suggested_classification as ImportedTransaction['suggested_classification']) ?? null,
  category: row.category == null ? null : String(row.category),
  classification: (row.classification as ImportedTransaction['classification']) ?? null,
  status: (row.status as ImportedTransaction['status']) ?? 'pending',
  notes: row.notes == null ? null : String(row.notes),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

const toOverride = (row: Record<string, unknown>): CategoryOverride => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  merchant_key: String(row.merchant_key ?? ''),
  category: String(row.category ?? ''),
  classification: (row.classification as CategoryOverride['classification']) ?? 'review',
  times_applied: Math.round(toNum(row.times_applied)) || 1,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

const toSubscription = (row: Record<string, unknown>): Subscription => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  provider: String(row.provider ?? 'stripe'),
  provider_customer_id: row.provider_customer_id == null ? null : String(row.provider_customer_id),
  provider_subscription_id: row.provider_subscription_id == null ? null : String(row.provider_subscription_id),
  plan: (row.plan as Subscription['plan']) ?? 'free',
  billing_interval: row.billing_interval == null ? null : (row.billing_interval as Subscription['billing_interval']),
  status: (row.status as Subscription['status']) ?? 'incomplete',
  current_period_start: row.current_period_start ? String(row.current_period_start) : null,
  current_period_end: row.current_period_end ? String(row.current_period_end) : null,
  cancel_at_period_end: Boolean(row.cancel_at_period_end),
  created_at: row.created_at ? String(row.created_at) : undefined,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

const toTaxEstimate = (row: Record<string, unknown>): TaxEstimateRow => {
  let metadata: Record<string, unknown> | null = null;
  if (row.calculation_metadata != null) {
    try {
      metadata = JSON.parse(String(row.calculation_metadata)) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: String(row.id),
    user_id: String(row.user_id ?? ''),
    tax_year: Math.round(toNum(row.tax_year)),
    total_income: toNum(row.total_income),
    total_expenses: toNum(row.total_expenses),
    estimated_tax: toNum(row.estimated_tax),
    recommended_set_aside: toNum(row.recommended_set_aside),
    calculation_metadata: metadata,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
};

const toPayment = (row: Record<string, unknown>): TaxPayment => ({
  id: String(row.id),
  user_id: String(row.user_id ?? ''),
  amount: toNum(row.amount),
  payment_date: String(row.payment_date ?? ''),
  kind: (row.kind as TaxPayment['kind']) ?? 'set_aside',
  tax_year: Math.round(toNum(row.tax_year)),
  quarter_key: row.quarter_key == null ? null : String(row.quarter_key),
  notes: row.notes == null ? null : String(row.notes),
  created_at: row.created_at ? String(row.created_at) : undefined,
});

export class SupabaseBackend implements FinanceBackend {
  readonly mode = 'supabase' as const;
  readonly isDemo = false;

  onAuthStateChange(cb: (user: SessionUser | null) => void): () => void {
    const client = requireClient();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      cb(user ? { id: user.id, email: user.email ?? '' } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async getSessionUser(): Promise<SessionUser | null> {
    const client = requireClient();
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    return user ? { id: user.id, email: user.email ?? '' } : null;
  }

  async signUp(email: string, password: string): Promise<SignInResult> {
    const client = requireClient();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw new Error(friendlyAuthError(error));
    const user = data.user ?? data.session?.user;
    if (data.session) {
      return { user: { id: user!.id, email: user!.email ?? '' }, needsEmailConfirmation: false };
    }
    // Email confirmation enabled: account created, waiting on verification.
    return { user: null, needsEmailConfirmation: true };
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const client = requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error));
    const user = data.user;
    return { user: { id: user.id, email: user.email ?? '' }, needsEmailConfirmation: false };
  }

  async signOut(): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw new Error('Could not sign you out. Please try again.');
  }

  async resetPassword(email: string): Promise<void> {
    const client = requireClient();
    const redirect = `${window.location.origin}/reset-password`;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    if (error) throw new Error(friendlyAuthError(error));
  }

  async updatePassword(newPassword: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw new Error(friendlyAuthError(error));
  }

  async getProfile(): Promise<Profile | null> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error('Could not load your profile. Please try again.');
    return data as Profile | null;
  }

  async saveProfile(patch: Partial<Profile>): Promise<Profile> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('profiles')
      .upsert({ ...patch, user_id: user.id }, { onConflict: 'user_id' })
      .select('*')
      .single();
    if (error) throw new Error('Could not save your profile. Please try again.');
    return data as Profile;
  }

  async getPrefs(): Promise<UserPrefs | null> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('user_prefs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error('Could not load your preferences. Please try again.');
    return data as UserPrefs | null;
  }

  async savePrefs(patch: Partial<UserPrefs>): Promise<UserPrefs> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('user_prefs')
      .upsert({ ...patch, user_id: user.id }, { onConflict: 'user_id' })
      .select('*')
      .single();
    if (error) throw new Error('Could not save your preferences. Please try again.');
    return data as UserPrefs;
  }

  // --- income ---------------------------------------------------------------

  async listIncome(): Promise<IncomeEntry[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('income')
      .select('*')
      .eq('user_id', user.id)
      .order('income_date', { ascending: false });
    if (error) throw new Error('Could not load your income. Please try again.');
    return (data ?? []).map((r) => toIncome(r as Record<string, unknown>));
  }

  async createIncome(input: NewIncome): Promise<IncomeEntry> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('income')
      .insert({ ...input, user_id: user.id })
      .select('*')
      .single();
    if (error) throw new Error('Could not add this income entry. Please try again.');
    return toIncome(data as Record<string, unknown>);
  }

  async updateIncome(id: string, patch: Partial<IncomeEntry>): Promise<IncomeEntry> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('income')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw new Error('Could not update this entry. Please try again.');
    return toIncome(data as Record<string, unknown>);
  }

  async deleteIncome(id: string): Promise<void> {
    const client = requireClient();
    const user = await requireUser();
    const { error } = await client.from('income').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new Error('Could not delete this entry. Please try again.');
  }

  // --- expenses ---------------------------------------------------------------

  async listExpenses(): Promise<ExpenseEntry[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false });
    if (error) throw new Error('Could not load your expenses. Please try again.');
    return (data ?? []).map((r) => toExpense(r as Record<string, unknown>));
  }

  async createExpense(input: NewExpense): Promise<ExpenseEntry> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('expenses')
      .insert({ ...input, user_id: user.id })
      .select('*')
      .single();
    if (error) {
      const friendly = limitError(error);
      if (friendly) throw new Error(friendly);
      throw new Error('Could not add this expense. Please try again.');
    }
    return toExpense(data as Record<string, unknown>);
  }

  async updateExpense(id: string, patch: Partial<ExpenseEntry>): Promise<ExpenseEntry> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('expenses')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw new Error('Could not update this expense. Please try again.');
    return toExpense(data as Record<string, unknown>);
  }

  async deleteExpense(id: string): Promise<void> {
    const client = requireClient();
    const user = await requireUser();
    const { error } = await client.from('expenses').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new Error('Could not delete this expense. Please try again.');
  }

  // --- receipts ------------------------------------------------------------------

  async listReceipts(): Promise<Receipt[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error('Could not load your receipts. Please try again.');
    return (data ?? []).map((r) => toReceipt(r as Record<string, unknown>));
  }

  async uploadReceipt(file: File): Promise<Receipt> {
    const client = requireClient();
    const user = await requireUser();
    // Validate before creating any row so a rejected file leaves no orphan.
    const check = validateReceiptFile(file, MAX_RECEIPT_BYTES);
    if (!check.ok) throw new Error(check.error);
    const receiptId = newId();
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const filePath = `${user.id}/${receiptId}${ext}`;

    // 1. database row while the file uploads
    const { data: row, error: rowError } = await client
      .from('receipts')
      .insert({
        id: receiptId,
        user_id: user.id,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type || ext.replace('.', ''),
        file_size: file.size,
        processing_status: 'uploading',
      })
      .select('*')
      .single();
    if (rowError) {
      const friendly = limitError(rowError);
      if (friendly) throw new Error(friendly);
      throw new Error('Could not start the upload. Please try again.');
    }

    // 2. upload the file into the private per-user storage folder
    const { error: upError } = await client.storage
      .from('receipts')
      .upload(filePath, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (upError) {
      await client.from('receipts').delete().eq('id', receiptId).eq('user_id', user.id);
      const message = String(upError.message ?? '');
      if (/size/i.test(message)) {
        throw new Error('This file is too large to upload. Please try a smaller file.');
      }
      throw new Error('The upload failed. Please try again.');
    }

    // 3. process (OCR/AI) via the server-side edge function when configured
    let receipt = toReceipt(row as Record<string, unknown>);
    receipt = await this.processReceipt(receipt);
    return receipt;
  }

  /**
   * Replace the file on an existing receipt. The row keeps its id and any
   * expense links (receipt_id references); only the stored file and the
   * extracted fields are refreshed, and the file is reprocessed.
   */
  async replaceReceipt(id: string, file: File): Promise<Receipt> {
    const client = requireClient();
    const user = await requireUser();
    const { data: existing } = await client
      .from('receipts')
      .select('id, file_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!existing) throw new Error('This receipt no longer exists.');
    const check = validateReceiptFile(file, MAX_RECEIPT_BYTES);
    if (!check.ok) throw new Error(check.error);

    const oldPath = existing.file_path ? String(existing.file_path) : '';
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const reusePath = Boolean(oldPath && (!ext || oldPath.toLowerCase().endsWith(ext.toLowerCase())));
    const filePath = reusePath ? oldPath : `${user.id}/${id}${ext}`;

    const { error: upError } = await client.storage.from('receipts').upload(filePath, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (upError) {
      const message = String(upError.message ?? '');
      if (/size/i.test(message)) {
        throw new Error('This file is too large to upload. Please try a smaller file.');
      }
      throw new Error('The file could not be replaced. Please try again.');
    }
    if (!reusePath && oldPath) {
      await client.storage.from('receipts').remove([oldPath]);
    }

    const { data: row, error: rowError } = await client
      .from('receipts')
      .update({
        file_path: filePath,
        file_name: file.name,
        file_type: file.type || ext.replace('.', ''),
        file_size: file.size,
        merchant: '',
        amount: null,
        receipt_date: null,
        extracted_text: null,
        processing_status: 'uploading',
        review_note: null,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (rowError) throw new Error('Could not update this receipt. Please try again.');

    let receipt = toReceipt(row as Record<string, unknown>);
    receipt = await this.processReceipt(receipt);
    return receipt;
  }

  /**
   * Attempt server-side receipt processing.
   *
   * Transport: an explicit VITE_RECEIPT_PROCESSOR_URL when set, otherwise the
   * project's own `process-receipt` edge function (so a standard Supabase
   * deploy works with no extra configuration). Either way the request is
   * authenticated with the caller's access token and the function re-checks
   * ownership. Any failure degrades honestly to "needs review" — we never
   * claim a receipt was processed when it wasn't.
   */
  private async processReceipt(receipt: Receipt): Promise<Receipt> {
    const client = requireClient();
    const NEEDS_REVIEW_NOTE =
      'Automatic receipt scanning isn\u2019t configured for this project yet, so no details were extracted. Review the file and enter the details manually.';
    const UNAVAILABLE_NOTE =
      'The receipt scanner is not responding right now. You can review and enter the details manually.';

    interface ProcessorResult {
      configured?: boolean;
      status?: string;
      merchant?: string;
      amount?: number | null;
      date?: string | null;
      text?: string | null;
      error?: string;
    }

    let result: ProcessorResult | null = null;
    try {
      if (receiptProcessorUrl) {
        const { data: session } = await client.auth.getSession();
        const token = session.session?.access_token;
        // Never hang the upload UI on an unresponsive processor.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        try {
          const res = await fetch(receiptProcessorUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ receiptId: receipt.id }),
            signal: controller.signal,
          });
          if (!res.ok) {
            return this.updateReceipt(receipt.id, {
              processing_status: 'needs_review',
              review_note: UNAVAILABLE_NOTE,
            });
          }
          result = (await res.json()) as ProcessorResult;
        } finally {
          clearTimeout(timer);
        }
      } else {
        const { data, error } = await client.functions.invoke('process-receipt', {
          body: { receiptId: receipt.id },
        });
        if (error) {
          // Most commonly the function simply isn't deployed yet.
          return this.updateReceipt(receipt.id, {
            processing_status: 'needs_review',
            review_note: NEEDS_REVIEW_NOTE,
          });
        }
        result = data as ProcessorResult;
      }
    } catch {
      return this.updateReceipt(receipt.id, {
        processing_status: 'needs_review',
        review_note: UNAVAILABLE_NOTE,
      });
    }

    if (!result || !result.configured || result.status !== 'completed') {
      return this.updateReceipt(receipt.id, {
        processing_status: 'needs_review',
        review_note: result?.error || NEEDS_REVIEW_NOTE,
      });
    }

    return this.updateReceipt(receipt.id, {
      processing_status: 'completed',
      merchant: result.merchant ?? '',
      amount: toNumOrNull(result.amount),
      receipt_date: result.date ?? null,
      extracted_text: result.text ?? null,
      review_note: null,
    });
  }

  async updateReceipt(id: string, patch: Partial<Receipt>): Promise<Receipt> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('receipts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw new Error('Could not update this receipt. Please try again.');
    return toReceipt(data as Record<string, unknown>);
  }

  async deleteReceipt(id: string): Promise<void> {
    const client = requireClient();
    const user = await requireUser();
    const { data: existing } = await client
      .from('receipts')
      .select('file_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing?.file_path) {
      await client.storage.from('receipts').remove([existing.file_path]);
    }
    const { error } = await client.from('receipts').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new Error('Could not delete this receipt. Please try again.');
  }

  async getReceiptFileUrl(receipt: Receipt): Promise<string | null> {
    const client = requireClient();
    if (!receipt.file_path) return null;
    const { data, error } = await client.storage
      .from('receipts')
      .createSignedUrl(receipt.file_path, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  }

  // --- tax payments ------------------------------------------------------------------

  async listTaxPayments(): Promise<TaxPayment[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('tax_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('payment_date', { ascending: false });
    if (error) throw new Error('Could not load your tax payments. Please try again.');
    return (data ?? []).map((r) => toPayment(r as Record<string, unknown>));
  }

  async createTaxPayment(input: NewTaxPayment): Promise<TaxPayment> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('tax_payments')
      .insert({ ...input, user_id: user.id })
      .select('*')
      .single();
    if (error) throw new Error('Could not record this payment. Please try again.');
    return toPayment(data as Record<string, unknown>);
  }

  async deleteTaxPayment(id: string): Promise<void> {
    const client = requireClient();
    const user = await requireUser();
    const { error } = await client.from('tax_payments').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new Error('Could not delete this payment. Please try again.');
  }

  // --- tax estimate snapshots --------------------------------------------------

  async listTaxEstimates(): Promise<TaxEstimateRow[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('tax_estimates')
      .select('*')
      .eq('user_id', user.id)
      .order('tax_year', { ascending: false });
    if (error) throw new Error('Could not load your tax estimates. Please try again.');
    return (data ?? []).map((r) => toTaxEstimate(r as Record<string, unknown>));
  }

  async saveTaxEstimate(input: NewTaxEstimate): Promise<TaxEstimateRow> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('tax_estimates')
      .upsert(
        {
          ...input,
          user_id: user.id,
          calculation_metadata: JSON.stringify(input.calculation_metadata ?? {}),
        },
        { onConflict: 'user_id,tax_year' }
      )
      .select('*')
      .single();
    if (error) throw new Error('Could not save your tax estimate. Please try again.');
    return toTaxEstimate(data as Record<string, unknown>);
  }

  // --- subscription & usage -------------------------------------------------------

  async getSubscription(): Promise<Subscription | null> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('Could not load your plan. Please try again.');
    return data ? toSubscription(data as Record<string, unknown>) : null;
  }

  async getUsage(): Promise<UsageInfo> {
    const client = requireClient();
    const user = await requireUser();
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const sub = await this.getSubscription();
    const isPro = Boolean(
      sub && sub.plan === 'pro' && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due')
    );

    const countExpenses = client
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart);
    const countReceipts = client
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart);
    const [expRes, recRes] = await Promise.all([countExpenses, countReceipts]);

    return {
      period,
      expensesUsed: expRes.count ?? 0,
      expensesLimit: isPro ? null : FREE_EXPENSES_PER_MONTH,
      receiptScansUsed: recRes.count ?? 0,
      receiptScansLimit: isPro ? null : FREE_RECEIPT_SCANS_PER_MONTH,
    };
  }

  // --- integrations (Phase 3) -----------------------------------------------------

  async listLinkedAccounts(): Promise<LinkedAccount[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('linked_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error('Could not load your connections. Please try again.');
    return (data ?? []).map((r) => toLinkedAccount(r as Record<string, unknown>));
  }

  async listTransactions(): Promise<ImportedTransaction[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('txn_date', { ascending: false })
      .limit(2000);
    if (error) throw new Error('Could not load imported transactions. Please try again.');
    return (data ?? []).map((r) => toTransaction(r as Record<string, unknown>));
  }

  async deleteTransaction(id: string): Promise<void> {
    const client = requireClient();
    const user = await requireUser();
    const { error } = await client.from('transactions').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new Error('Could not delete this transaction. Please try again.');
  }

  async reviewTransaction(input: {
    transactionId: string;
    action: 'business' | 'income' | 'personal' | 'ignore';
    category?: string;
  }): Promise<ImportedTransaction> {
    const client = requireClient();
    const user = await requireUser();
    const { data: tx } = await client
      .from('transactions')
      .select('*')
      .eq('id', input.transactionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!tx) throw new Error('This transaction no longer exists.');
    const t = toTransaction(tx as Record<string, unknown>);

    if (input.action === 'business' || input.action === 'income') {
      const category = input.category ?? t.suggested_category ?? (t.kind === 'income' ? 'Freelance' : 'Other');
      if (input.action === 'business' && t.kind !== 'expense') {
        throw new Error('Only expense transactions can be confirmed as business expenses.');
      }
      if (input.action === 'income' && t.kind !== 'income') {
        throw new Error('Only income transactions can be added to income.');
      }
      // Create the real record, tolerating an already-existing link (idempotent).
      if (input.action === 'business') {
        const { error: insErr } = await client.from('expenses').insert({
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
        });
        if (insErr && !isUniqueViolation(insErr)) {
          throw new Error('Could not add this expense. Please try again.');
        }
      } else {
        const { error: insErr } = await client.from('income').insert({
          user_id: user.id,
          amount: t.amount,
          source: t.merchant || 'Connected platform',
          income_date: t.txn_date,
          category: 'Freelance',
          notes: `Imported from a connected account · ${t.merchant}`,
          transaction_id: t.id,
        });
        if (insErr && !isUniqueViolation(insErr)) {
          throw new Error('Could not add this income. Please try again.');
        }
      }
      return this.updateTransactionRow(client, user.id, t.id, {
        status: 'reviewed',
        category,
        classification: 'business',
      });
    }

    return this.updateTransactionRow(client, user.id, t.id, {
      status: 'ignored',
      classification: 'personal',
      category: t.category ?? t.suggested_category ?? 'Other',
    });
  }

  private async updateTransactionRow(
    client: NonNullable<typeof supabase>,
    userId: string,
    id: string,
    patch: Record<string, unknown>
  ): Promise<ImportedTransaction> {
    // RLS already scopes this, but filtering explicitly keeps the guarantee
    // local to the query (defense in depth).
    const { data, error } = await client
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw new Error('Could not update this transaction. Please try again.');
    return toTransaction(data as Record<string, unknown>);
  }

  async listCategoryOverrides(): Promise<CategoryOverride[]> {
    const client = requireClient();
    const user = await requireUser();
    const { data, error } = await client
      .from('category_overrides')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw new Error('Could not load your categorization rules. Please try again.');
    return (data ?? []).map((r) => toOverride(r as Record<string, unknown>));
  }

  async saveCategoryOverride(override: CategoryOverride): Promise<CategoryOverride> {
    const client = requireClient();
    const user = await requireUser();
    const { data: existing } = await client
      .from('category_overrides')
      .select('times_applied')
      .eq('user_id', user.id)
      .eq('merchant_key', override.merchant_key)
      .maybeSingle();
    const timesApplied = (existing?.times_applied ?? 0) + 1;
    const { data, error } = await client
      .from('category_overrides')
      .upsert(
        {
          user_id: user.id,
          merchant_key: override.merchant_key,
          category: override.category,
          classification: override.classification,
          times_applied: timesApplied,
        },
        { onConflict: 'user_id,merchant_key' }
      )
      .select('*')
      .single();
    if (error) throw new Error('Could not save your categorization. Please try again.');
    return toOverride(data as Record<string, unknown>);
  }
}