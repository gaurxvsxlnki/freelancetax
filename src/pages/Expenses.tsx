import { useMemo, useState } from 'react';
import { getBackend } from '../backend';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../lib/useAsync';
import { expenseEntitlement } from '../lib/subscription';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { businessExpenseTotal, personalExpenseTotal } from '../lib/insights';
import {
  formatDate,
  formatNumber,
  money,
  monthLabel,
  pluralize,
} from '../lib/format';
import type { ExpenseEntry } from '../lib/types';
import { PageHeader } from '../components/layout/AppShell';
import { Button, Card, EmptyState, Skeleton, Badge, Alert } from '../components/ui/primitives';
import { StatCard } from '../components/ui/stat';
import { Input, Select } from '../components/ui/forms';
import { ConfirmDialog } from '../components/ui/overlays';
import { BarChart } from '../components/charts';
import { ExpenseFormModal } from '../components/expense-form';
import { UpgradePromptModal } from '../components/billing';
import { IconEdit, IconFile, IconPlus, IconSearch, IconTrash } from '../components/icons';

export function ExpensesPage() {
  const { prefs } = useAuth();
  const { subscription, usage, refresh: refreshUsage } = useSubscription();
  const toast = useToast();
  const backend = getBackend();
  const { data: entries, loading, error, reload } = useAsync(() => backend.listExpenses());

  const defaultYear = prefs?.tax_year ?? new Date().getFullYear();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState(String(defaultYear));
  const [businessFilter, setBusinessFilter] = useState('all'); // all | business | personal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry | null>(null);
  const [deleting, setDeleting] = useState<ExpenseEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const entitlement = expenseEntitlement(usage, subscription);

  const openAddForm = () => {
    if (!entitlement.allowed) {
      setUpgradeOpen(true);
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };

  const yearNum = Number(year) || defaultYear;

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (e.expense_date.slice(0, 4) !== String(yearNum)) return false;
      if (category && e.category !== category) return false;
      if (businessFilter === 'business' && !e.is_business_expense) return false;
      if (businessFilter === 'personal' && e.is_business_expense) return false;
      if (q && !`${e.merchant} ${e.notes ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, category, yearNum, businessFilter]);

  const yearTotal = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);
  const businessTotal = useMemo(() => businessExpenseTotal(filtered), [filtered]);
  const personalTotal = useMemo(() => personalExpenseTotal(filtered), [filtered]);

  const monthly = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => 0);
    for (const e of entries ?? []) {
      if (e.expense_date.slice(0, 4) !== String(yearNum)) continue;
      const m = Number(e.expense_date.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) buckets[m] += e.amount;
    }
    return buckets.map((value, i) => ({ label: monthLabel(i), value }));
  }, [entries, yearNum]);

  const years = useMemo(() => {
    const set = new Set<number>([yearNum]);
    for (const e of entries ?? []) set.add(Number(e.expense_date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [entries, yearNum]);

  const onDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await backend.deleteExpense(deleting.id);
      toast.success('Expense deleted');
      await reload();
      await refreshUsage();
    } catch (err) {
      toast.error('Could not delete this expense', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Log business and personal expenses in seconds."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!entitlement.unlimited && entitlement.limit !== null && (
              <Badge tone={entitlement.allowed ? 'neutral' : 'amber'}>
                {formatNumber(entitlement.used)}/{formatNumber(entitlement.limit)} this month
              </Badge>
            )}
            <Button icon={<IconPlus />} onClick={openAddForm}>
              Add expense
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="danger" title="Couldn't load your expenses" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && !entries ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={`Total expenses ${yearNum}`} value={money(yearTotal)} icon={<IconFile />} tone="brand" sub={`${filtered.length} ${pluralize(filtered.length, 'entry', 'entries')}`} />
          <StatCard label="Business expenses" value={money(businessTotal)} icon={<IconFile />} tone="green" sub="after business-use %" />
          <StatCard label="Personal expenses" value={money(personalTotal)} icon={<IconFile />} tone="neutral" sub="not included in deductions" />
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Card title={`Monthly expenses · ${yearNum}`} padded={false}>
          <div className="p-5">
            {entries && entries.length > 0 ? (
              <BarChart data={monthly} />
            ) : (
              <EmptyState
                icon={<IconFile />}
                title="No expenses yet"
                description="Add your first expense to see the monthly breakdown."
              />
            )}
          </div>
        </Card>

        <Card
          title="Expense history"
          subtitle={`${filtered.length} ${pluralize(filtered.length, 'entry', 'entries')} in ${yearNum}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  placeholder="Search merchant"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-44 pl-9"
                  aria-label="Search expenses"
                />
              </div>
              <Select
                options={EXPENSE_CATEGORIES}
                placeholder="All categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-40"
                aria-label="Filter by category"
              />
              <Select
                options={[
                  { value: 'all', label: 'All expenses' },
                  { value: 'business', label: 'Business' },
                  { value: 'personal', label: 'Personal' },
                ]}
                value={businessFilter}
                onChange={(e) => setBusinessFilter(e.target.value)}
                className="h-9 w-36"
                aria-label="Filter by business or personal"
              />
              <Select
                options={years.map(String)}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-9 w-28"
                aria-label="Filter by year"
              />
            </div>
          }
        >
          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<IconFile />}
              title={entries && entries.length > 0 ? 'No expenses match your filters' : 'No expenses yet'}
              description={
                entries && entries.length > 0
                  ? 'Try clearing your search or filters.'
                  : 'Start tracking your business expenses to see potential deductions.'
              }
              action={
                entries && entries.length === 0 ? (
                  <Button icon={<IconPlus />} onClick={openAddForm}>
                    Add expense
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <table className="hidden w-full text-left text-sm sm:table">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Merchant</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Business use</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-ink-50 last:border-0 hover:bg-white/[0.05]/60">
                      <td className="whitespace-nowrap px-5 py-3 text-ink-500">{formatDate(e.expense_date)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-900">{e.merchant}</span>
                          {e.transaction_id && <Badge tone="blue">Imported</Badge>}
                        </div>
                        {e.notes && <div className="max-w-xs truncate text-xs text-ink-500">{e.notes}</div>}
                      </td>
                      <td className="px-5 py-3"><Badge>{e.category}</Badge></td>
                      <td className="px-5 py-3 text-ink-500">{e.business_use_percentage}%</td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right font-semibold text-ink-900">
                        {money(e.amount)}
                        {!e.is_business_expense && (
                          <Badge tone="neutral" className="ml-2">Personal</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => { setEditing(e); setFormOpen(true); }}
                            className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.08] hover:text-ink-700"
                            aria-label={`Edit ${e.merchant}`}
                            title="Edit"
                          >
                            <IconEdit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleting(e)}
                            className="rounded-md p-1.5 text-ink-400 hover:bg-red-500/15 hover:text-red-600"
                            aria-label={`Delete ${e.merchant}`}
                            title="Delete"
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="divide-y divide-ink-100 sm:hidden">
                {filtered.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink-900">{e.merchant}</span>
                        {e.transaction_id && <Badge tone="blue">Imported</Badge>}
                        {!e.is_business_expense && <Badge tone="neutral">Personal</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {formatDate(e.expense_date)} · {e.category} · {e.business_use_percentage}% business
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="tabular mr-1 font-semibold text-ink-900">{money(e.amount)}</span>
                      <button
                        onClick={() => { setEditing(e); setFormOpen(true); }}
                        className="rounded-md p-1.5 text-ink-400 hover:bg-white/[0.08]"
                        aria-label={`Edit ${e.merchant}`}
                      >
                        <IconEdit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(e)}
                        className="rounded-md p-1.5 text-ink-400 hover:bg-red-500/15 hover:text-red-600"
                        aria-label={`Delete ${e.merchant}`}
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <ExpenseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        entry={editing}
        onSaved={async (saved) => {
          setFormOpen(false);
          toast.success(editing ? 'Expense updated' : 'Expense added', saved.merchant);
          await reload();
          await refreshUsage();
        }}
      />

      <UpgradePromptModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="You've reached your free expense limit"
        description={
          <>You've used {formatNumber(entitlement.used)} of {formatNumber(entitlement.limit ?? 0)} free expenses this month. Upgrade to Pro for unlimited expense tracking.</>
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this expense?"
        message={
          <>
            This will permanently remove <strong>{deleting?.merchant}</strong> for{' '}
            {deleting ? money(deleting.amount) : ''}. This can't be undone.
          </>
        }
        loading={busy}
        onConfirm={onDelete}
      />
    </div>
  );
}