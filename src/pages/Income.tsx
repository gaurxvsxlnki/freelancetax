import { useMemo, useState } from 'react';
import { getBackend } from '../backend';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../lib/useAsync';
import { INCOME_CATEGORIES } from '../lib/constants';
import {
  formatDate,
  formatMonth,
  money,
  monthKey,
  monthLabel,
  pluralize,
} from '../lib/format';
import type { IncomeEntry } from '../lib/types';
import { PageHeader } from '../components/layout/AppShell';
import { Button, Card, EmptyState, Skeleton, Badge, Alert } from '../components/ui/primitives';
import { StatCard } from '../components/ui/stat';
import { Input, Select } from '../components/ui/forms';
import { ConfirmDialog } from '../components/ui/overlays';
import { BarChart } from '../components/charts';
import { IncomeFormModal } from '../components/income-form';
import { IconDollar, IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons';

export function IncomePage() {
  const { prefs } = useAuth();
  const toast = useToast();
  const backend = getBackend();
  const { data: entries, loading, error, reload } = useAsync(() => backend.listIncome());

  const defaultYear = prefs?.tax_year ?? new Date().getFullYear();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState(String(defaultYear));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeEntry | null>(null);
  const [deleting, setDeleting] = useState<IncomeEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const yearNum = Number(year) || defaultYear;
  const now = new Date();
  const currentMonthKey = monthKey(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const currentMonthLabel = formatMonth(`${currentMonthKey}-01`);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (e.income_date.slice(0, 4) !== String(yearNum)) return false;
      if (category && e.category !== category) return false;
      if (q && !`${e.source} ${e.notes ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, category, yearNum]);

  const yearTotal = useMemo(
    () => filtered.reduce((sum, e) => sum + e.amount, 0),
    [filtered]
  );
  const monthTotal = useMemo(
    () =>
      (entries ?? []).reduce((sum, e) => {
        if (monthKey(e.income_date) === currentMonthKey) return sum + e.amount;
        return sum;
      }, 0),
    [entries, currentMonthKey]
  );

  const monthly = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => 0);
    for (const e of entries ?? []) {
      if (e.income_date.slice(0, 4) !== String(yearNum)) continue;
      const m = Number(e.income_date.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) buckets[m] += e.amount;
    }
    return buckets.map((value, i) => ({ label: monthLabel(i), value }));
  }, [entries, yearNum]);

  const activeMonths = monthly.filter((m) => m.value > 0).length;

  const years = useMemo(() => {
    const set = new Set<number>([yearNum]);
    for (const e of entries ?? []) set.add(Number(e.income_date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [entries, yearNum]);

  const onDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await backend.deleteIncome(deleting.id);
      toast.success('Income entry deleted');
      await reload();
    } catch (err) {
      toast.error('Could not delete this entry', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Income"
        description="Track every payment you receive for your work."
        actions={
          <Button icon={<IconPlus />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            Add income
          </Button>
        }
      />

      {error && (
        <Alert variant="danger" title="Couldn't load your income" className="mb-4">
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
          <StatCard label={`Total income ${yearNum}`} value={money(yearTotal)} icon={<IconDollar />} tone="brand" sub={`${filtered.length} ${pluralize(filtered.length, 'entry', 'entries')}`} />
          <StatCard label="This month" value={money(monthTotal)} icon={<IconDollar />} sub={currentMonthLabel} />
          <StatCard label="Monthly average" value={money(activeMonths ? yearTotal / activeMonths : 0)} icon={<IconDollar />} sub={`across active months in ${yearNum}`} />
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Card title={`Income by month · ${yearNum}`} padded={false}>
          <div className="p-5">
            {entries && entries.length > 0 ? (
              <BarChart data={monthly} />
            ) : (
              <EmptyState
                icon={<IconDollar />}
                title="No income yet"
                description="Add your first payment to see a monthly breakdown."
              />
            )}
          </div>
        </Card>

        <Card
          title="Income history"
          subtitle={`${filtered.length} ${pluralize(filtered.length, 'entry', 'entries')} in ${yearNum}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  placeholder="Search source or notes"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-48 pl-9"
                  aria-label="Search income"
                />
              </div>
              <Select
                options={INCOME_CATEGORIES}
                placeholder="All categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-40"
                aria-label="Filter by category"
              >
              </Select>
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
              icon={<IconDollar />}
              title={entries && entries.length > 0 ? 'No entries match your filters' : 'No income yet'}
              description={
                entries && entries.length > 0
                  ? 'Try clearing your search or filters.'
                  : 'Add a payment you received to start tracking your income.'
              }
              action={
                entries && entries.length === 0 ? (
                  <Button icon={<IconPlus />} onClick={() => { setEditing(null); setFormOpen(true); }}>
                    Add income
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden w-full text-left text-sm sm:table">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[12px] font-medium text-ink-400">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Source</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.05]">
                      <td className="whitespace-nowrap px-5 py-3 text-ink-500">{formatDate(e.income_date)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-900">{e.source}</span>
                          {e.transaction_id && <Badge tone="blue">Imported</Badge>}
                        </div>
                        {e.notes && <div className="max-w-xs truncate text-xs text-ink-500">{e.notes}</div>}
                      </td>
                      <td className="px-5 py-3"><Badge>{e.category}</Badge></td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-right font-semibold text-emerald-700">{money(e.amount)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => { setEditing(e); setFormOpen(true); }}
                            className="rounded-full p-1.5 text-ink-400 hover:bg-white/[0.08] hover:text-ink-700"
                            aria-label={`Edit ${e.source}`}
                            title="Edit"
                          >
                            <IconEdit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleting(e)}
                            className="rounded-full p-1.5 text-ink-400 hover:bg-red-500/15 hover:text-red-600"
                            aria-label={`Delete ${e.source}`}
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

              {/* Mobile cards */}
              <ul className="divide-y divide-white/[0.06] sm:hidden">
                {filtered.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-ink-900">{e.source}</span>
                        {e.transaction_id && <Badge tone="blue">Imported</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {formatDate(e.income_date)} · {e.category}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="tabular mr-1 font-semibold text-emerald-700">{money(e.amount)}</span>
                      <button
                        onClick={() => { setEditing(e); setFormOpen(true); }}
                        className="rounded-full p-1.5 text-ink-400 hover:bg-white/[0.08]"
                        aria-label={`Edit ${e.source}`}
                      >
                        <IconEdit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(e)}
                        className="rounded-full p-1.5 text-ink-400 hover:bg-red-500/15 hover:text-red-600"
                        aria-label={`Delete ${e.source}`}
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

      <IncomeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        entry={editing}
        onSaved={async (saved) => {
          setFormOpen(false);
          toast.success(editing ? 'Income updated' : 'Income added', saved.source);
          await reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this income entry?"
        message={
          <>
            This will permanently remove <strong>{deleting?.source}</strong> for{' '}
            {deleting ? money(deleting.amount) : ''}. This can't be undone.
          </>
        }
        loading={busy}
        onConfirm={onDelete}
      />
    </div>
  );
}