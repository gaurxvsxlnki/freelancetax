import { useMemo, useState } from 'react';
import { getBackend } from '../backend';
import type { FinanceBackend } from '../backend/types';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../lib/useAsync';
import { UpgradePromptModal } from '../components/billing';
import { IconSparkles } from '../components/icons';
import { businessExpenseTotal, classifyExpense, personalExpenseTotal } from '../lib/insights';
import { estimateTax } from '../lib/tax';
import { downloadCsv } from '../lib/csv';
import { formatDate, money, moneyCents, monthLabel, pluralize } from '../lib/format';
import { PageHeader } from '../components/layout/AppShell';
import { Alert, Badge, Button, Card, Skeleton } from '../components/ui/primitives';
import { StatCard } from '../components/ui/stat';
import { Select } from '../components/ui/forms';
import { CategoryBreakdown } from '../components/charts';
import { IconDownload, IconPrinter } from '../components/icons';

interface ReportData {
  income: Awaited<ReturnType<FinanceBackend['listIncome']>>;
  expenses: Awaited<ReturnType<FinanceBackend['listExpenses']>>;
  payments: Awaited<ReturnType<FinanceBackend['listTaxPayments']>>;
  estimates: Awaited<ReturnType<FinanceBackend['listTaxEstimates']>>;
}

export function ReportsPage() {
  const { prefs, profile } = useAuth();
  const { isPro } = useSubscription();
  const toast = useToast();
  const backend = getBackend();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { data, loading, error } = useAsync<ReportData>(async () => {
    const [income, expenses, payments, estimates] = await Promise.all([
      backend.listIncome(),
      backend.listExpenses(),
      backend.listTaxPayments(),
      backend.listTaxEstimates(),
    ]);
    return { income, expenses, payments, estimates };
  });

  const availableYears = useMemo(() => {
    const set = new Set<number>([prefs?.tax_year ?? new Date().getFullYear()]);
    for (const e of data?.income ?? []) set.add(Number(e.income_date.slice(0, 4)));
    for (const e of data?.expenses ?? []) set.add(Number(e.expense_date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [data, prefs?.tax_year]);

  const [year, setYear] = useState(String(prefs?.tax_year ?? new Date().getFullYear()));
  const yearNum = Number(year) || new Date().getFullYear();

  const report = useMemo(() => {
    const income = (data?.income ?? []).filter((e) => e.income_date.slice(0, 4) === String(yearNum));
    const expenses = (data?.expenses ?? []).filter((e) => e.expense_date.slice(0, 4) === String(yearNum));
    const totalIncome = income.reduce((s, e) => s + e.amount, 0);
    const businessExpenses = businessExpenseTotal(expenses);
    const personalExpenses = personalExpenseTotal(expenses);
    const estimate = estimateTax({ year: yearNum, totalIncome, businessExpenses });

    const byCategory = new Map<string, { total: number; business: number }>();
    for (const e of expenses) {
      const cur = byCategory.get(e.category) ?? { total: 0, business: 0 };
      cur.total += e.amount;
      if (e.is_business_expense) cur.business += e.amount * (e.business_use_percentage / 100);
      byCategory.set(e.category, cur);
    }
    const categories = [...byCategory.entries()]
      .map(([label, v]) => ({ label, total: v.total, business: v.business }))
      .sort((a, b) => b.total - a.total);

    const insights = expenses.map((e) => ({ expense: e, insight: classifyExpense(e) }));
    const potentialCount = insights.filter((x) => x.insight.classification !== 'personal').length;
    const needsReview = insights
      .filter((x) => x.insight.classification === 'review')
      .map((x) => ({ expense: x.expense, explanation: x.insight.explanation }))
      .slice(0, 10);

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const ym = `${yearNum}-${String(i + 1).padStart(2, '0')}`;
      const inc = income.filter((e) => e.income_date.slice(0, 7) === ym).reduce((s, e) => s + e.amount, 0);
      const bus = expenses
        .filter((e) => e.expense_date.slice(0, 7) === ym && e.is_business_expense)
        .reduce((s, e) => s + e.amount * (e.business_use_percentage / 100), 0);
      return { label: monthLabel(i), income: inc, expenses: bus, net: inc - bus };
    });

    const reserveHistory = (data?.payments ?? [])
      .filter((p) => p.tax_year === yearNum)
      .sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1));

    const estimateHistory = (data?.estimates ?? [])
      .filter((e) => e.tax_year === yearNum)
      .sort((a, b) => ((b.updated_at ?? b.created_at ?? '') < (a.updated_at ?? a.created_at ?? '') ? 1 : -1))
      .slice(0, 12);

    return {
      income,
      expenses,
      totalIncome,
      businessExpenses,
      personalExpenses,
      estimate,
      categories,
      potentialCount,
      insights,
      needsReview,
      monthly,
      reserveHistory,
      estimateHistory,
    };
  }, [data, yearNum]);

  /** CSV export is a Pro feature; Free users see the upgrade prompt. */
  const requirePro = (fn: () => void) => () => {
    if (!isPro) {
      setUpgradeOpen(true);
      return;
    }
    fn();
  };

  const exportIncome = requirePro(() => {
    downloadCsv(
      `freelancetax-income-${yearNum}.csv`,
      ['Date', 'Source', 'Category', 'Amount', 'Notes'],
      report.income.map((e) => [e.income_date, e.source, e.category, e.amount.toFixed(2), e.notes ?? ''])
    );
    toast.success('Income report downloaded');
  });

  const exportExpenses = requirePro(() => {
    downloadCsv(
      `freelancetax-expenses-${yearNum}.csv`,
      ['Date', 'Merchant', 'Category', 'Business use %', 'Business/Personal', 'Amount', 'Business amount', 'Notes'],
      report.expenses.map((e) => [
        e.expense_date,
        e.merchant,
        e.category,
        e.business_use_percentage,
        e.is_business_expense ? 'Business' : 'Personal',
        e.amount.toFixed(2),
        (e.is_business_expense ? e.amount * (e.business_use_percentage / 100) : 0).toFixed(2),
        e.notes ?? '',
      ])
    );
    toast.success('Expense report downloaded');
  });

  const exportSummary = requirePro(() => {
    const rows: [string, string][] = [
      ['Report', `FreelanceTax annual summary ${yearNum}`],
      ['Generated', new Date().toISOString()],
      ['Total income', moneyCents(report.totalIncome)],
      ['Total expenses', moneyCents(report.expenses.reduce((s, e) => s + e.amount, 0))],
      ['Business expenses (after use %)', moneyCents(report.businessExpenses)],
      ['Personal expenses', moneyCents(report.personalExpenses)],
      ['Estimated taxable income', moneyCents(report.estimate.taxableIncome)],
      ['Estimated tax', moneyCents(report.estimate.estimatedTax)],
      ['Recommended monthly set-aside', moneyCents(report.estimate.recommendedMonthly)],
      ['Recommended quarterly set-aside', moneyCents(report.estimate.recommendedQuarterly)],
      ['Potential deduction insights', String(report.potentialCount)],
      ['', ''],
      ['Disclaimer', 'Estimates are informational only and are not tax advice. Consult a qualified tax professional.'],
    ];
    downloadCsv(`freelancetax-summary-${yearNum}.csv`, ['Item', 'Value'], rows);
    toast.success('Summary report downloaded');
  });

  const hasData = report.income.length > 0 || report.expenses.length > 0;

  return (
    <div>
      <PageHeader
        title="Reports"
        description={
          isPro
            ? 'A year-at-a-glance summary you can export or print.'
            : 'Your annual summary at a glance. CSV export requires Pro.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-500">Year</span>
              <Select
                options={availableYears.map(String)}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-9 w-28"
                aria-label="Select report year"
              />
            </div>
            {!isPro && (
              <Button variant="secondary" icon={<IconSparkles />} onClick={() => setUpgradeOpen(true)}>
                Unlock CSV export
              </Button>
            )}
            <Button variant="secondary" icon={<IconDownload />} onClick={exportIncome}>
              Income CSV
            </Button>
            <Button variant="secondary" icon={<IconDownload />} onClick={exportExpenses}>
              Expenses CSV
            </Button>
            <Button variant="secondary" icon={<IconDownload />} onClick={exportSummary}>
              Summary CSV
            </Button>
            <Button icon={<IconPrinter />} onClick={() => window.print()}>
              Print report
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="danger" title="Couldn't load your data" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : !hasData ? (
        <Card>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
              <IconDownload className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-ink-900">Nothing to report yet</h3>
            <p className="mt-1.5 max-w-sm text-sm text-ink-500">
              Add income and expenses for {yearNum}, then come back here for your annual summary.
            </p>
          </div>
        </Card>
      ) : (
        <div className="print-area space-y-6">
          {/* Report header (prints nicely) */}
          <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-card print:border-0 print:p-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-ink-900">
                  {yearNum} Annual Summary
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  {profile?.full_name?.trim() || 'Freelancer'} · FreelanceTax report
                </p>
              </div>
              <div className="text-right text-sm text-ink-500">
                <div>Generated {formatDate(new Date().toISOString())}</div>
                <div>{report.income.length} income · {report.expenses.length} expense entries</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 no-print">
            <StatCard label="Total income" value={money(report.totalIncome)} tone="green" />
            <StatCard label="Business expenses" value={money(report.businessExpenses)} tone="brand" />
            <StatCard label="Personal expenses" value={money(report.personalExpenses)} tone="neutral" />
            <StatCard label="Estimated tax" value={money(report.estimate.estimatedTax)} tone="amber" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={`Expenses by category · ${yearNum}`} padded={false}>
              <div className="p-5">
                <CategoryBreakdown
                  items={report.categories.map((c) => ({ label: c.label, value: c.total }))}
                  valueFormatter={money}
                  emptyMessage="No expenses recorded"
                />
              </div>
            </Card>

            <Card title="Tax estimate" subtitle="Informational only — not tax advice.">
              <dl className="space-y-2.5 text-sm">
                <SummaryRow label="Total income" value={money(report.totalIncome)} />
                <SummaryRow label="Business expenses" value={money(report.businessExpenses)} />
                <SummaryRow label="Estimated taxable income" value={money(report.estimate.taxableIncome)} />
                <SummaryRow label="Estimated tax" value={money(report.estimate.estimatedTax)} strong />
                <SummaryRow label="Suggested monthly set-aside" value={money(report.estimate.recommendedMonthly)} />
                <SummaryRow label="Suggested quarterly set-aside" value={money(report.estimate.recommendedQuarterly)} />
              </dl>
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
                Estimates are informational only and may not reflect your actual tax liability. Consult a
                qualified tax professional for personalized advice.
              </p>
            </Card>
          </div>

          <Card
            title={`Income details · ${yearNum}`}
            subtitle={`${report.income.length} ${pluralize(report.income.length, 'entry')}`}
            padded={false}
          >
            {report.income.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">No income recorded for {yearNum}.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Source</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.income.map((e) => (
                    <tr key={e.id} className="border-b border-ink-50 last:border-0">
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-500">{formatDate(e.income_date)}</td>
                      <td className="px-5 py-2.5 font-medium text-ink-900">{e.source}</td>
                      <td className="px-5 py-2.5"><Badge>{e.category}</Badge></td>
                      <td className="tabular whitespace-nowrap px-5 py-2.5 text-right font-semibold text-emerald-700">{money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title={`Expense details · ${yearNum}`}
            subtitle={`${report.expenses.length} ${pluralize(report.expenses.length, 'entry')} · ${report.potentialCount} with potential deduction insight`}
            padded={false}
          >
            {report.expenses.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">No expenses recorded for {yearNum}.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Merchant</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Use %</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 text-right font-medium">Business</th>
                  </tr>
                </thead>
                <tbody>
                  {report.expenses.map((e) => (
                    <tr key={e.id} className="border-b border-ink-50 last:border-0">
                      <td className="whitespace-nowrap px-5 py-2.5 text-ink-500">{formatDate(e.expense_date)}</td>
                      <td className="px-5 py-2.5 font-medium text-ink-900">{e.merchant}</td>
                      <td className="px-5 py-2.5"><Badge>{e.category}</Badge></td>
                      <td className="px-5 py-2.5 text-ink-500">{e.business_use_percentage}%</td>
                      <td className="tabular whitespace-nowrap px-5 py-2.5 text-right font-medium text-ink-900">{money(e.amount)}</td>
                      <td className="tabular whitespace-nowrap px-5 py-2.5 text-right text-ink-500">
                        {e.is_business_expense ? money(e.amount * (e.business_use_percentage / 100)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {isPro && (
            <>
              <Card title={`Monthly breakdown · ${yearNum}`} subtitle="Income, business expenses, and net per month" padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                        <th className="px-5 py-3 font-medium">Month</th>
                        <th className="px-5 py-3 text-right font-medium">Income</th>
                        <th className="px-5 py-3 text-right font-medium">Business expenses</th>
                        <th className="px-5 py-3 text-right font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.monthly.map((m) => (
                        <tr key={m.label} className="border-b border-ink-50 last:border-0">
                          <td className="px-5 py-2.5 font-medium text-ink-900">{m.label}</td>
                          <td className="tabular whitespace-nowrap px-5 py-2.5 text-right text-emerald-700">{money(m.income)}</td>
                          <td className="tabular whitespace-nowrap px-5 py-2.5 text-right text-ink-700">{money(m.expenses)}</td>
                          <td className="tabular whitespace-nowrap px-5 py-2.5 text-right font-medium text-ink-900">{money(m.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title={`Tax reserve history · ${yearNum}`} subtitle="Set-asides and estimated payments you recorded" padded={false}>
                  {report.reserveHistory.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink-500">
                      No set-asides or estimated payments recorded for {yearNum}.
                    </p>
                  ) : (
                    <>
                      <ul className="divide-y divide-ink-100">
                        {report.reserveHistory.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                            <span className="min-w-0 truncate text-ink-700">
                              {formatDate(p.payment_date)}
                              <Badge tone={p.kind === 'estimated_payment' ? 'blue' : 'neutral'} className="ml-2">
                                {p.kind === 'estimated_payment' ? 'Estimated payment' : 'Set-aside'}
                              </Badge>
                            </span>
                            <span className="tabular shrink-0 font-medium text-ink-900">{money(p.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-ink-100 px-5 py-3 text-sm">
                        Total recorded:{' '}
                        <strong className="tabular text-ink-900">{money(report.reserveHistory.reduce((s, p) => s + p.amount, 0))}</strong>
                      </div>
                    </>
                  )}
                </Card>

                <Card title={`Saved tax estimates · ${yearNum}`} subtitle="Snapshots saved from the Tax Estimate page" padded={false}>
                  {report.estimateHistory.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink-500">
                      No estimate snapshots saved for {yearNum} yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {report.estimateHistory.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                          <span className="min-w-0 truncate text-ink-700">{formatDate(e.updated_at ?? e.created_at ?? '')}</span>
                          <span className="tabular shrink-0 font-medium text-ink-900">{money(e.estimated_tax)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <Card
                title={`Items needing review · ${yearNum}`}
                subtitle="Expenses that may be business-related but could use a closer look"
                padded={false}
              >
                {report.needsReview.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-ink-500">
                    No expenses currently need review — nice and tidy.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {report.needsReview.map(({ expense, explanation }) => (
                      <li key={expense.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink-900">{expense.merchant}</span>
                            <Badge>{expense.category}</Badge>
                            <Badge tone="amber">Needs review</Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-ink-500">{explanation}</p>
                        </div>
                        <span className="tabular shrink-0 font-medium text-ink-900">{money(expense.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}

          <p className="pb-4 text-center text-xs text-ink-400">
            FreelanceTax · Reports are for organizational purposes only and are not tax filings or tax advice.
          </p>
        </div>
      )}

      <UpgradePromptModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="CSV export is a Pro feature"
        description={
          <>Upgrade to Pro to download your income, expenses, and annual summary as CSV files — or print this report from your browser any time.</>
        }
      />
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? 'font-medium text-ink-900' : 'text-ink-700'}>{label}</dt>
      <dd className={`tabular ${strong ? 'font-semibold text-ink-900' : 'font-medium text-ink-900'}`}>{value}</dd>
    </div>
  );
}