import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBackend } from '../backend';
import { useAsync } from '../lib/useAsync';
import { classifyExpense, DISCLAIMER } from '../lib/insights';
import { formatDate, money, moneyCents, pluralize } from '../lib/format';
import type { ExpenseEntry, InsightClassification } from '../lib/types';
import { PageHeader } from '../components/layout/AppShell';
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '../components/ui/primitives';
import { IconChevronRight, IconPlus, IconSparkles } from '../components/icons';
import { cn } from '../lib/cn';

const CLASSIFICATION_META: Record<
  InsightClassification,
  { label: string; tone: 'green' | 'amber' | 'neutral'; description: string; icon?: 'check' | 'review' | 'personal' }
> = {
  business: {
    label: 'Potentially business-related',
    tone: 'green',
    description: 'Based on the information provided, this may qualify as a business deduction.',
  },
  review: {
    label: 'Needs review',
    tone: 'amber',
    description: 'Review the details before including this in your tax records.',
  },
  personal: {
    label: 'Probably personal',
    tone: 'neutral',
    description: 'This appears to be a personal expense and is not counted toward deductions.',
  },
};

type Filter = 'all' | InsightClassification;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All expenses' },
  { value: 'business', label: 'Potentially business' },
  { value: 'review', label: 'Needs review' },
  { value: 'personal', label: 'Probably personal' },
];

export function DeductionsPage() {
  const backend = getBackend();
  const { data: expenses, loading, error } = useAsync(() => backend.listExpenses());
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () => (expenses ?? []).map((expense) => ({ expense, insight: classifyExpense(expense) })),
    [expenses]
  );

  const totals = useMemo(() => {
    let potential = 0;
    let business = 0;
    let review = 0;
    let personal = 0;
    for (const { insight } of rows) {
      if (insight.classification === 'business') business += 1;
      else if (insight.classification === 'review') review += 1;
      else personal += 1;
      if (insight.classification !== 'personal') potential += insight.business_amount;
    }
    return { potential, business, review, personal, total: rows.length };
  }, [rows]);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.insight.classification === filter)),
    [rows, filter]
  );

  return (
    <div>
      <PageHeader
        title="Deduction insights"
        description="Every expense gets an assessment of whether it may qualify as a business deduction."
      />

      <Alert variant="info" title="About these insights" className="mb-6">
        {DISCLAIMER}
      </Alert>

      {error && (
        <Alert variant="danger" title="Couldn't load your expenses" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && !expenses ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <SummaryTile label="Potential deductions" value={money(totals.potential)} sub={`${totals.total} ${pluralize(totals.total, 'expense')} assessed`} accent />
            <SummaryTile label="Potentially business" value={String(totals.business)} sub="may qualify" />
            <SummaryTile label="Needs review" value={String(totals.review)} sub="check the details" />
            <SummaryTile label="Probably personal" value={String(totals.personal)} sub="not counted" />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  filter === f.value
                    ? 'bg-brand-700 text-white'
                    : 'bg-surface text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-white/[0.05]'
                )}
              >
                {f.label}
                <span className={cn('ml-1.5 tabular', filter === f.value ? 'text-brand-200' : 'text-ink-400')}>
                  {f.value === 'all' ? totals.total : f.value === 'business' ? totals.business : f.value === 'review' ? totals.review : totals.personal}
                </span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={<IconSparkles />}
                title={expenses && expenses.length > 0 ? 'Nothing in this group' : 'No expenses yet'}
                description={
                  expenses && expenses.length > 0
                    ? 'Try another filter.'
                    : 'Add expenses and we\'ll assess each one for potential business deductions.'
                }
                action={
                  expenses && expenses.length === 0 ? (
                    <Link to="/expenses">
                      <Button icon={<IconPlus />}>Add expense</Button>
                    </Link>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {filtered.map(({ expense }) => (
                <InsightCard key={expense.id} expense={expense} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-5 shadow-card', accent ? 'border-brand-700/30 bg-brand-700/10' : 'border-white/[0.07] bg-surface')}>
      <p className="text-sm font-medium text-ink-500">{label}</p>
      <p className={cn('tabular mt-1.5 text-2xl font-semibold tracking-tight', accent ? 'text-brand-800' : 'text-ink-900')}>{value}</p>
      <p className="mt-1 text-xs text-ink-500">{sub}</p>
    </div>
  );
}

function InsightCard({ expense }: { expense: ExpenseEntry }) {
  const insight = classifyExpense(expense);
  const meta = CLASSIFICATION_META[insight.classification];
  const partialUse = expense.business_use_percentage < 100 && expense.business_use_percentage > 0;

  return (
    <li className="rounded-xl border border-ink-200 bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink-900">{expense.merchant}</h3>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Badge tone="neutral">Confidence: {insight.confidence}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {formatDate(expense.expense_date)} · {expense.category} · {expense.business_use_percentage}% business use
          </p>
        </div>
        <div className="text-right">
          <div className="tabular text-lg font-semibold text-ink-900">{money(expense.amount)}</div>
          {partialUse && (
            <div className="tabular text-xs text-ink-500">
              business portion: {moneyCents(insight.business_amount)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-ink-50 p-3.5 ring-1 ring-inset ring-ink-100">
        <p className="text-sm leading-relaxed text-ink-700">{insight.explanation}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">
          {meta.description} This assessment is an estimate and is not tax advice.
        </p>
        <Link
          to="/expenses"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          Edit expense
          <IconChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </li>
  );
}