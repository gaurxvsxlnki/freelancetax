import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBackend } from '../backend';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../lib/useAsync';
import { receiptEntitlement } from '../lib/subscription';
import { ACCEPTED_RECEIPT_TYPES, EXPENSE_CATEGORIES } from '../lib/constants';
import { formatDate, formatDateLong, moneyCents, parseAmount, todayISO } from '../lib/format';
import type { ExpenseEntry, Receipt, ReceiptStatus } from '../lib/types';
import { PageHeader } from '../components/layout/AppShell';
import { Button, Card, EmptyState, Skeleton, Badge, Alert } from '../components/ui/primitives';
import { Field, Input, Select, Toggle } from '../components/ui/forms';
import { ConfirmDialog, Modal } from '../components/ui/overlays';
import { UpgradePromptModal } from '../components/billing';
import { formatNumber } from '../lib/format';
import { IconDownload, IconEye, IconFile, IconLink, IconReceipt, IconSearch, IconTrash, IconUpload } from '../components/icons';

const STATUS_META: Record<Receipt['processing_status'], { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }> = {
  uploading: { label: 'Uploading…', tone: 'blue' },
  processing: { label: 'Processing…', tone: 'blue' },
  needs_review: { label: 'Review needed', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
};

function ReceiptThumb({ receipt, onClick }: { receipt: Receipt; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = receipt.file_type.startsWith('image/');

  useEffect(() => {
    let cancelled = false;
    void getBackend()
      .getReceiptFileUrl(receipt)
      .then((u) => {
        if (!cancelled) setUrl(u);
      });
    return () => {
      cancelled = true;
    };
  }, [receipt]);

  if (isImage && url) {
    return (
      <button onClick={onClick} className="block h-36 w-full overflow-hidden rounded-t-xl bg-ink-50" aria-label={`View ${receipt.file_name}`}>
        <img src={url} alt={receipt.file_name} className="h-full w-full object-cover" />
      </button>
    );
  }
  return (
    <button onClick={onClick} className="flex h-36 w-full items-center justify-center rounded-t-xl bg-ink-50 text-ink-300" aria-label={`View ${receipt.file_name}`}>
      <IconFile className="h-12 w-12" />
    </button>
  );
}

export function ReceiptsPage() {
  const toast = useToast();
  const backend = getBackend();
  const { prefs } = useAuth();
  const { subscription, usage, refresh: refreshUsage } = useSubscription();
  const { data, loading, error, reload } = useAsync(async () => {
    const [receipts, expenses] = await Promise.all([backend.listReceipts(), backend.listExpenses()]);
    return { receipts, expenses };
  });
  const receipts = data?.receipts;
  const expenses = data?.expenses ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReceiptStatus>('all');
  const [catFilter, setCatFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [reviewing, setReviewing] = useState<Receipt | null>(null);
  const [deleting, setDeleting] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const entitlement = receiptEntitlement(usage, subscription);

  /** Ask the OS for a file, but only when the plan allows another scan. */
  const requestUpload = () => {
    if (!entitlement.allowed) {
      setUpgradeOpen(true);
      return;
    }
    fileInputRef.current?.click();
  };


  // Review form state
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState('Software');
  const [businessUse, setBusinessUse] = useState('100');
  const [isBusiness, setIsBusiness] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const openReview = (r: Receipt) => {
    setReviewing(r);
    setMerchant(r.merchant ?? '');
    setAmount(r.amount != null ? String(r.amount) : '');
    setDate(r.receipt_date ?? todayISO());
    setCategory('Software');
    setBusinessUse('100');
    setIsBusiness(true);
    setFormError(null);
  };

  const handleFile = useCallback(
    async (file: File) => {
      if (!entitlement.allowed) {
        setUpgradeOpen(true);
        return;
      }
      const lower = file.name.toLowerCase();
      const ok = ACCEPTED_RECEIPT_TYPES.some((t) => lower.endsWith(t));
      if (!ok) {
        toast.error('Unsupported file', 'Please upload a JPG, PNG, WebP, or PDF file.');
        return;
      }
      setUploading(true);
      try {
        const receipt = await backend.uploadReceipt(file);
        toast.info('Receipt uploaded', receipt.processing_status === 'needs_review'
          ? 'No details were extracted automatically — review it to add the expense.'
          : 'Receipt processed successfully.');
        await reload();
        await refreshUsage();
      } catch (err) {
        toast.error('Upload failed', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setUploading(false);
      }
    },
    [backend, entitlement.allowed, refreshUsage, reload, toast]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await backend.deleteReceipt(deleting.id);
      toast.success('Receipt deleted');
      if (viewing?.id === deleting.id) setViewing(null);
      await reload();
      await refreshUsage();
    } catch (err) {
      toast.error('Could not delete this receipt', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const submitReview = async (createExpense: boolean) => {
    if (!reviewing) return;
    setFormError(null);
    const value = amount ? parseAmount(amount) : null;
    if (value === null || value <= 0) {
      setFormError('Please enter a valid amount greater than zero.');
      return;
    }
    if (!merchant.trim()) {
      setFormError('Please enter the merchant name.');
      return;
    }
    const usePct = Math.round(Number(businessUse));
    if (!Number.isFinite(usePct) || usePct < 0 || usePct > 100) {
      setFormError('Business use percentage must be between 0 and 100.');
      return;
    }

    setBusy(true);
    try {
      const patch = {
        merchant: merchant.trim(),
        amount: value,
        receipt_date: date,
        processing_status: 'completed' as const,
        review_note: null,
      };
      if (createExpense) {
        await backend.createExpense({
          amount: value,
          merchant: merchant.trim(),
          expense_date: date,
          category,
          business_use_percentage: usePct,
          is_business_expense: isBusiness,
          notes: `From receipt ${reviewing.file_name}`,
          receipt_id: reviewing.id,
        });
      }
      await backend.updateReceipt(reviewing.id, patch);
      toast.success(createExpense ? 'Expense created from receipt' : 'Receipt details saved');
      setReviewing(null);
      setViewing(null);
      await reload();
      await refreshUsage();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save this receipt.');
    } finally {
      setBusy(false);
    }
  };

  const needsReviewCount = (receipts ?? []).filter((r) => r.processing_status === 'needs_review').length;

  // A receipt's category is the category of its linked expense (if any).
  const catByReceipt = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of expenses) {
      if (e.receipt_id && !map.has(e.receipt_id)) map.set(e.receipt_id, e.category);
    }
    return map;
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (receipts ?? []).filter((r) => {
      if (statusFilter !== 'all' && r.processing_status !== statusFilter) return false;
      const cat = catByReceipt.get(r.id) ?? null;
      if (catFilter === 'none' && cat !== null) return false;
      if (catFilter && catFilter !== 'none' && cat !== catFilter) return false;
      const d = r.receipt_date ?? r.created_at ?? '';
      if (dateFrom && d && d < dateFrom) return false;
      if (dateTo && d && d > dateTo) return false;
      if (!q) return true;
      return (r.merchant || r.file_name).toLowerCase().includes(q);
    });
  }, [catByReceipt, catFilter, dateFrom, dateTo, query, receipts, statusFilter]);

  const year = prefs?.tax_year ?? new Date().getFullYear();
  const yearStats = useMemo(() => {
    const list = (receipts ?? []).filter((r) => {
      const d = r.receipt_date ?? r.created_at ?? '';
      return d.slice(0, 4) === String(year);
    });
    return { count: list.length, total: list.reduce((s, r) => s + (r.amount ?? 0), 0) };
  }, [receipts, year]);

  const unattached = useMemo(
    () =>
      expenses
        .filter((e) => !e.receipt_id)
        .sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1))
        .slice(0, 100),
    [expenses]
  );

  const onAttach = async (expenseId: string) => {
    if (!viewing) return;
    setBusy(true);
    try {
      await backend.updateExpense(expenseId, { receipt_id: viewing.id });
      toast.success('Receipt attached to expense', 'The file now stays linked to this expense.');
      setViewing(null);
      await reload();
    } catch (err) {
      toast.error('Could not attach this receipt', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  /** Swap the file on an existing receipt — same row, same expense links. */
  const onReplaceFile = async (file: File) => {
    if (!replaceId) return;
    setBusy(true);
    try {
      await backend.replaceReceipt(replaceId, file);
      toast.success('Receipt replaced', 'The new file is saved and this receipt record was kept.');
      setViewing(null);
      setReplaceId(null);
      await reload();
    } catch (err) {
      toast.error('Could not replace this receipt', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
      setReplaceId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Receipts"
        description="Upload receipts, review extracted details, and turn them into expenses."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!entitlement.unlimited && entitlement.limit !== null && (
              <Badge tone={entitlement.allowed ? 'neutral' : 'amber'}>
                {formatNumber(entitlement.used)}/{formatNumber(entitlement.limit)} scans this month
              </Badge>
            )}
            <Button icon={<IconUpload />} loading={uploading} onClick={requestUpload}>
              {uploading ? 'Uploading…' : 'Upload receipt'}
            </Button>
          </div>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {/* File replacement: swaps the file on an existing receipt record. */}
      <input
        ref={replaceInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onReplaceFile(file);
          e.target.value = '';
        }}
      />

      {error && (
        <Alert variant="danger" title="Couldn't load your receipts" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-white hover:border-brand-400 hover:bg-ink-50'
        }`}
        onClick={requestUpload}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestUpload(); } }}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <IconUpload className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-ink-900">
          {uploading ? 'Uploading…' : 'Drop a receipt here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-ink-500">JPG, PNG, WebP, or PDF · stored securely per user</p>
      </div>

      <Card
        title="Your receipts"
        subtitle={needsReviewCount > 0 ? `${needsReviewCount} receipt${needsReviewCount > 1 ? 's' : ''} need${needsReviewCount > 1 ? '' : 's'} review` : 'All receipts accounted for'}
        padded={false}
      >
        {loading && !receipts ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : !receipts || receipts.length === 0 ? (
          <EmptyState
            icon={<IconReceipt />}
            title="No receipts yet"
            description="Upload a receipt to keep a secure copy and start building your expense records."
            action={
              <Button icon={<IconUpload />} onClick={requestUpload}>
                Upload your first receipt
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-5 py-3">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by merchant or file name"
                  aria-label="Search receipts"
                  className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | ReceiptStatus)}
                options={[
                  { value: 'all', label: 'All statuses' },
                  ...(Object.keys(STATUS_META) as ReceiptStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label })),
                ]}
                className="h-9 w-44 text-xs"
              />
              <p className="ml-auto text-xs text-ink-500">
                <span className="font-medium text-ink-900">{yearStats.count}</span> {yearStats.count === 1 ? 'receipt' : 'receipts'} in {year} ·{' '}
                <span className="tabular font-medium text-ink-700">{moneyCents(yearStats.total)}</span> tracked
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/40 px-5 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-400">Filters</span>
              <Select
                aria-label="Filter by category"
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                options={[
                  { value: '', label: 'All categories' },
                  ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })),
                  { value: 'none', label: 'Uncategorized (no linked expense)' },
                ]}
                className="h-9 w-52 text-xs"
              />
              <label className="flex items-center gap-1.5 text-xs text-ink-500">
                <span>From</span>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40 text-xs" aria-label="Receipt date from" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-500">
                <span>To</span>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40 text-xs" aria-label="Receipt date to" />
              </label>
              {(catFilter || dateFrom || dateTo) && (
                <Button size="sm" variant="ghost" onClick={() => { setCatFilter(''); setDateFrom(''); setDateTo(''); }}>
                  Clear filters
                </Button>
              )}
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<IconSearch />}
                title="No matching receipts"
                description="Try a different search term or status filter."
              />
            ) : (
              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((r) => {
              const meta = STATUS_META[r.processing_status];
              return (
                <div key={r.id} className="flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-card">
                  <ReceiptThumb receipt={r} onClick={() => setViewing(r)} />
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900" title={r.file_name}>
                          {r.merchant || r.file_name}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {r.receipt_date ? formatDate(r.receipt_date) : formatDate(r.created_at ?? '')}
                        </p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="tabular text-sm font-semibold text-ink-900">
                        {r.amount != null ? moneyCents(r.amount) : '—'}
                      </span>
                      <div className="flex gap-1">
                        {r.processing_status !== 'completed' && (
                          <Button size="sm" variant="subtle" onClick={() => openReview(r)}>
                            Review
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => setViewing(r)}>
                          View
                        </Button>
                        <button
                          onClick={() => setDeleting(r)}
                          className="rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${r.file_name}`}
                          title="Delete"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
                })}
              </div>
            )}
          </>
        )}
      </Card>

      {/* View modal */}
      <ViewReceiptModal
        receipt={viewing}
        onClose={() => setViewing(null)}
        onReview={() => { if (viewing) { setViewing(null); openReview(viewing); } }}
        onDelete={() => { if (viewing) setDeleting(viewing); }}
        onReplace={() => {
          if (viewing) {
            setReplaceId(viewing.id);
            replaceInputRef.current?.click();
          }
        }}
        linkedExpense={viewing ? (expenses.find((e) => e.receipt_id === viewing.id) ?? null) : null}
        attachOptions={viewing ? unattached : []}
        attachBusy={busy}
        onAttach={onAttach}
      />

      {/* Review modal */}
      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Review receipt"
        description={reviewing?.file_name}
        size="md"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setReviewing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => void submitReview(false)} disabled={busy}>
              Save receipt only
            </Button>
            <Button onClick={() => void submitReview(true)} loading={busy}>
              Save as expense
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {reviewing?.review_note && (
            <Alert variant="info" title="About this receipt">
              {reviewing.review_note}
            </Alert>
          )}
          {formError && (
            <Alert variant="danger" title="Check the details">
              {formError}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Merchant" required>
              <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Adobe" />
            </Field>
            <Field label="Amount" required>
              <Input prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" required>
              <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Category" required>
              <Select options={EXPENSE_CATEGORIES} value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business use" hint="% of this expense used for business">
              <Input type="number" min={0} max={100} step={5} value={businessUse} onChange={(e) => setBusinessUse(e.target.value)} />
            </Field>
            <div className="flex items-end pb-1">
              <Toggle checked={isBusiness} onChange={setIsBusiness} label="Business expense" description={isBusiness ? 'Included in deductions' : 'Marked as personal'} />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this receipt?"
        message="The receipt file and its record will be permanently removed. This can't be undone."
        loading={busy}
        onConfirm={onDelete}
      />

      <UpgradePromptModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="You've reached your free receipt-scan limit"
        description={
          <>You've used {formatNumber(entitlement.used)} of {formatNumber(entitlement.limit ?? 0)} free receipt scans this month. Upgrade to Pro for unlimited receipt processing.</>
        }
      />
    </div>
  );
}

function ViewReceiptModal({
  receipt,
  onClose,
  onReview,
  onDelete,
  onReplace,
  linkedExpense,
  attachOptions,
  attachBusy,
  onAttach,
}: {
  receipt: Receipt | null;
  onClose: () => void;
  onReview: () => void;
  onDelete: () => void;
  onReplace?: () => void;
  linkedExpense: ExpenseEntry | null;
  attachOptions: ExpenseEntry[];
  attachBusy: boolean;
  onAttach: (expenseId: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [attachId, setAttachId] = useState('');

  useEffect(() => {
    setAttachId('');
  }, [receipt?.id]);

  useEffect(() => {
    setUrl(null);
    if (!receipt) return;
    let cancelled = false;
    void getBackend()
      .getReceiptFileUrl(receipt)
      .then((u) => {
        if (!cancelled) setUrl(u);
      });
    return () => {
      cancelled = true;
    };
  }, [receipt]);

  const meta = receipt ? STATUS_META[receipt.processing_status] : null;
  const isImage = receipt?.file_type.startsWith('image/') ?? false;

  return (
    <Modal
      open={Boolean(receipt)}
      onClose={onClose}
      title={receipt?.merchant || receipt?.file_name || 'Receipt'}
      description={receipt ? `${receipt.file_name} · ${formatDateLong(receipt.created_at ?? '')}` : undefined}
      size="lg"
      footer={
        receipt ? (
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              {url && !isImage && (
                <Button variant="secondary" icon={<IconDownload />} onClick={() => window.open(url, '_blank')}>
                  Open file
                </Button>
              )}
              {onReplace && (
                <Button variant="secondary" icon={<IconUpload />} onClick={onReplace}>
                  Replace file
                </Button>
              )}
              <Button variant="danger" icon={<IconTrash />} onClick={onDelete}>
                Delete
              </Button>
            </div>
            {receipt.processing_status !== 'completed' && (
              <Button icon={<IconEye />} onClick={onReview}>
                Review details
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          {isImage && url ? (
            <img src={url} alt={receipt?.file_name} className="max-h-80 w-full rounded-lg border border-ink-200 object-contain" />
          ) : url ? (
            <div className="flex h-64 items-center justify-center rounded-lg border border-ink-200 bg-ink-50">
              <a href={url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-sm text-brand-700 hover:underline">
                <IconFile className="h-10 w-10 text-ink-400" />
                Open PDF in a new tab
              </a>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-ink-200 bg-ink-50 text-sm text-ink-400">
              File preview unavailable
            </div>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Status</span>
            {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
          </div>
          {receipt?.review_note && (
            <Alert variant="info" title="Note">
              {receipt.review_note}
            </Alert>
          )}
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Merchant</dt>
              <dd className="font-medium text-ink-900">{receipt?.merchant || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Amount</dt>
              <dd className="tabular font-medium text-ink-900">{receipt?.amount != null ? moneyCents(receipt.amount) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Date</dt>
              <dd className="font-medium text-ink-900">{receipt?.receipt_date ? formatDate(receipt.receipt_date) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Size</dt>
              <dd className="font-medium text-ink-900">{receipt ? `${(receipt.file_size / 1024).toFixed(0)} KB` : '—'}</dd>
            </div>
          </dl>
          {receipt?.extracted_text && (
            <div>
              <p className="mb-1 font-medium text-ink-700">Extracted text</p>
              <p className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
                {receipt.extracted_text}
              </p>
            </div>
          )}
        </div>
      </div>

      {receipt && (
        <div className="mt-2 rounded-xl border border-ink-200 p-4">
          <div className="mb-2 flex items-center gap-2">
            <IconLink className="h-4 w-4 text-ink-400" />
            <p className="text-sm font-medium text-ink-900">Receipt organization</p>
          </div>
          {linkedExpense ? (
            <p className="text-sm leading-relaxed text-ink-600">
              This receipt is attached to{' '}
              <strong className="text-ink-900">{linkedExpense.merchant}</strong> · {linkedExpense.category} ·{' '}
              {formatDate(linkedExpense.expense_date)} ·{' '}
              <span className="tabular font-medium text-ink-900">{moneyCents(linkedExpense.amount)}</span>
            </p>
          ) : attachOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Attach to expense"
                value={attachId}
                onChange={(e) => setAttachId(e.target.value)}
                options={attachOptions.map((e) => ({
                  value: e.id,
                  label: `${e.merchant} · ${formatDate(e.expense_date)} · ${moneyCents(e.amount)}`,
                }))}
                placeholder="Choose an expense…"
                className="min-w-0 flex-1 text-xs sm:w-72 sm:flex-none"
              />
              <Button
                size="sm"
                loading={attachBusy}
                disabled={!attachId || attachBusy}
                onClick={() => {
                  if (attachId) onAttach(attachId);
                }}
              >
                Attach receipt
              </Button>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-ink-500">
              Add an expense first — once it exists you can attach this receipt to it from here.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}