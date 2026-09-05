import { useEffect, useMemo, useState } from 'react';
import { getBackend } from '../backend';
import type { FinanceBackend } from '../backend/types';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../lib/useAsync';
import { businessExpenseTotal } from '../lib/insights';
import { estimateTax, supportedTaxYears } from '../lib/tax';
import { TAX_DISCLAIMER } from '../lib/constants';
import { formatNumber, money, monthLabel } from '../lib/format';
import { PageHeader } from '../components/layout/AppShell';
import { Alert, Card, Skeleton, Button } from '../components/ui/primitives';
import { StatCard } from '../components/ui/stat';
import { Select } from '../components/ui/forms';
import { BarChart } from '../components/charts';
import { IconCalculator, IconDollar, IconFile, IconSparkles } from '../components/icons';

interface YearData {
  income: Awaited<ReturnType<FinanceBackend['listIncome']>>;
  expenses: Awaited<ReturnType<FinanceBackend['listExpenses']>>;
}

export function TaxEstimatePage() {
  const { prefs } = useAuth();
  const backend = getBackend();
  const { data, loading, error } = useAsync<YearData>(async () => {
    const [income, expenses] = await Promise.all([backend.listIncome(), backend.listExpenses()]);
    return { income, expenses };
  });

  const availableYears = useMemo(() => {
    const set = new Set<number>(supportedTaxYears());
    for (const e of data?.income ?? []) set.add(Number(e.income_date.slice(0, 4)));
    for (const e of data?.expenses ?? []) set.add(Number(e.expense_date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [data]);

  const [year, setYear] = useState(String(prefs?.tax_year ?? new Date().getFullYear()));
  useEffect(() => {
    if (prefs?.tax_year) setYear(String(prefs.tax_year));
  }, [prefs?.tax_year]);

  const yearNum = Number(year) || new Date().getFullYear();

  const calc = useMemo(() => {
    const income = (data?.income ?? []).filter((e) => e.income_date.slice(0, 4) === String(yearNum));
    const expenses = (data?.expenses ?? []).filter((e) => e.expense_date.slice(0, 4) === String(yearNum));
    const totalIncome = income.reduce((s, e) => s + e.amount, 0);
    const businessExpenses = businessExpenseTotal(expenses);
    const estimate = estimateTax({ year: yearNum, totalIncome, businessExpenses });

    const monthlyIncome = Array.from({ length: 12 }, (_, i) => ({
      label: monthLabel(i),
      value: income.filter((e) => Number(e.income_date.slice(5, 7)) - 1 === i).reduce((s, e) => s + e.amount, 0),
    }));

    return { totalIncome, businessExpenses, estimate, monthlyIncome };
  }, [data, yearNum]);

  // Persist a snapshot of this estimate (fire-and-forget; never blocks the UI).
  useEffect(() => {
    if (!data) return;
    void backend
      .saveTaxEstimate({
        tax_year: yearNum,
        total_income: calc.totalIncome,
        total_expenses: calc.businessExpenses,
        estimated_tax: calc.estimate.estimatedTax,
        recommended_set_aside: calc.estimate.recommendedMonthly,
        calculation_metadata: {
          rules: calc.estimate.rules.label,
          net_earnings: calc.estimate.netEarnings,
          se_tax_deduction: calc.estimate.seTaxDeduction,
          qbi_deduction: calc.estimate.qbiDeduction,
          taxable_income: calc.estimate.taxableIncome,
          self_employment_tax: calc.estimate.selfEmploymentTax,
          income_tax: calc.estimate.incomeTax,
          quarterly_split: calc.estimate.quarterlySplit,
        },
      })
      .catch(() => {
        // Estimate display still works if the snapshot can't be saved.
      });
  }, [backend, calc, data, yearNum]);

  const est = calc.estimate;

  return (
    <div>
      <PageHeader
        title="Tax estimate"
        description="An estimated look at what you might owe, based on the income and expenses you've recorded."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500">Tax year</span>
            <Select
              options={availableYears.map(String)}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="h-9 w-28"
              aria-label="Select tax year"
            />
          </div>
        }
      />

      <Alert variant="info" title="Important" className="mb-6">
        {TAX_DISCLAIMER}
      </Alert>

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
          <Skeleton className="h-72" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={`Total income · ${yearNum}`} value={money(calc.totalIncome)} icon={<IconDollar />} tone="green" />
            <StatCard label={`Business expenses · ${yearNum}`} value={money(calc.businessExpenses)} icon={<IconFile />} tone="brand" sub="after business-use %" />
            <StatCard label="Estimated taxable income" value={money(est.taxableIncome)} icon={<IconCalculator />} sub="after deductions" />
          </div>

          <Card className="mt-6" padded={false}>
            <div className="grid gap-px overflow-hidden rounded-xl bg-ink-100 sm:grid-cols-2 lg:grid-cols-4">
              <EstimateTile label="Estimated tax" value={money(est.estimatedTax)} sub={`${est.rules.label}`} highlight />
              <EstimateTile label="Monthly set-aside" value={money(est.recommendedMonthly)} sub="save this each month" />
              <EstimateTile label="Quarterly set-aside" value={money(est.recommendedQuarterly)} sub="per estimated payment" />
              <EstimateTile label="Annual set-aside" value={money(est.recommendedAnnual)} sub="full-year target" />
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title={`Income by month · ${yearNum}`} padded={false}>
              <div className="p-5">
                {calc.totalIncome > 0 ? (
                  <BarChart data={calc.monthlyIncome} />
                ) : (
                  <p className="py-6 text-center text-sm text-ink-500">
                    Add income for {yearNum} to see the monthly breakdown.
                  </p>
                )}
              </div>
            </Card>

            <Card title="How this estimate is calculated" subtitle={est.rules.label}>
              <dl className="space-y-2.5 text-sm">
                <CalcRow label="Self-employment tax" value={money(est.selfEmploymentTax)} detail={`${Math.round(est.rules.selfEmploymentRate * 100)}% × 92.35% of net earnings`} />
                <CalcRow label="Deduction for ½ self-employment tax" value={`−${money(est.seTaxDeduction)}`} detail="reduces taxable income" />
                <CalcRow label="QBI deduction (estimated)" value={`−${money(est.qbiDeduction)}`} detail="20% of net business income" />
                <CalcRow label="Standard deduction" value={`−${money(est.rules.standardDeduction)}`} detail={`${est.year} single filer`} />
                <CalcRow label="Federal income tax" value={money(est.incomeTax)} detail={`on ${money(est.taxableIncome)} taxable income`} />
                <div className="flex justify-between gap-4 border-t border-ink-100 pt-2.5">
                  <dt className="font-medium text-ink-900">Estimated total</dt>
                  <dd className="tabular font-semibold text-ink-900">{money(est.estimatedTax)}</dd>
                </div>
              </dl>
              <p className="mt-4 rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-500 ring-1 ring-inset ring-ink-100">
                Simplified single-filer federal estimate only. State taxes, filing status, credits,
                the Social Security wage base cap, and other individual factors are not included.
                This is not a tax return.
              </p>
            </Card>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="secondary" icon={<IconSparkles />} onClick={() => window.print()}>
              Print this estimate
            </Button>
            <p className="text-xs text-ink-400">
              Using {formatNumber(calc.totalIncome)} in income and {formatNumber(calc.businessExpenses)} in
              business expenses for {yearNum}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function EstimateTile({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={highlight ? 'bg-brand-700 p-5 text-white' : 'bg-white p-5'}>
      <p className={highlight ? 'text-sm text-brand-200' : 'text-sm text-ink-500'}>{label}</p>
      <p className={`tabular mt-1.5 text-2xl font-semibold tracking-tight ${highlight ? 'text-white' : 'text-ink-900'}`}>
        {value}
      </p>
      <p className={highlight ? 'mt-1 text-xs text-brand-200' : 'mt-1 text-xs text-ink-500'}>{sub}</p>
    </div>
  );
}

function CalcRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-700">
        {label}
        <span className="block text-xs text-ink-400">{detail}</span>
      </dt>
      <dd className="tabular font-medium text-ink-900">{value}</dd>
    </div>
  );
}