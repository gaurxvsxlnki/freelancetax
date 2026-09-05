import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getBackend } from '../backend';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../lib/useAsync';
import { businessSnapshot, deltaText, recurringExpenses, yearOverYear } from '../lib/analytics';
import { businessExpenseTotal, classifyExpense } from '../lib/insights';
import { estimateTax } from '../lib/tax';
import { deadlineStatuses } from '../lib/deadlines';
import { formatDate, formatDateLong, money, monthLabel, parseAmount, todayISO } from '../lib/format';
import type { PaymentKind, TaxPayment } from '../lib/types';
import type { FinanceBackend } from '../backend/types';
import { PageHeader } from '../components/layout/AppShell';
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '../components/ui/primitives';
import { StatCard } from '../components/ui/stat';
import { Field, Input, Select, Textarea } from '../components/ui/forms';
import { ConfirmDialog, Modal } from '../components/ui/overlays';
import { BarChart, CategoryBreakdown, SignedBarChart } from '../components/charts';
import { IconBriefcase, IconCalculator, IconCalendar, IconDollar, IconFile, IconPlus, IconSparkles, IconTrash, IconTrendingUp } from '../components/icons';
import { cn } from '../lib/cn';

interface DashboardData {
  income: Awaited<ReturnType<FinanceBackend['listIncome']>>;
  expenses: Awaited<ReturnType<FinanceBackend['listExpenses']>>;
  receipts: Awaited<ReturnType<FinanceBackend['listReceipts']>>;
  payments: Awaited<ReturnType<FinanceBackend['listTaxPayments']>>;
}

const CLASSIFICATION_META = {
  business: { label: 'Potentially business-related', tone: 'green' as const },
  review: { label: 'Needs review', tone: 'amber' as const },
  personal: { label: 'Probably personal', tone: 'neutral' as const },
};

export function DashboardPage() {
  const { profile, prefs } = useAuth();
  const { isPro } = useSubscription();
  const toast = useToast();
  const backend = getBackend();
  const { data, loading, error, reload } = useAsync<DashboardData>(async () => {
    const [income, expenses, receipts, payments] = await Promise.all([
      backend.listIncome(),
      backend.listExpenses(),
      backend.listReceipts(),
      backend.listTaxPayments(),
    ]);
    return { income, expenses, receipts, payments };
  });

  const year = prefs?.tax_year ?? new Date().getFullYear();
  const [payModal, setPayModal] = useState<null | { kind: PaymentKind; quarterKey?: string }>(null);
  const [deletingPayment, setDeletingPayment] = useState<TaxPayment | null>(null);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const yearIncome = (data?.income ?? []).filter((e) => e.income_date.slice(0, 4) === String(year));
    const yearExpenses = (data?.expenses ?? []).filter((e) => e.expense_date.slice(0, 4) === String(year));
    const totalIncome = yearIncome.reduce((s, e) => s + e.amount, 0);
    const businessExpenses = businessExpenseTotal(yearExpenses);
    const estimate = estimateTax({ year, totalIncome, businessExpenses });
    const yearPayments = (data?.payments ?? []).filter((p) => p.tax_year === year);
    const setAside = yearPayments.reduce((s, p) => s + p.amount, 0);
    const gap = Math.max(0, estimate.estimatedTax - setAside);

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      label: monthLabel(i),
      value: yearIncome.filter((e) => Number(e.income_date.slice(5, 7)) - 1 === i).reduce((s, e) => s + e.amount, 0),
    }));

    const categoryMap = new Map<string, number>();
    for (const e of yearExpenses) {
      categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + e.amount);
    }
    const categories = [...categoryMap.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    const deadlineList = deadlineStatuses(
      year,
      yearPayments.map((p) => ({ quarter_key: p.quarter_key, amount: p.amount }))
    );
    const nextDeadline = deadlineList.find((d) => !d.isPaid && d.daysLeft >= 0) ?? null;

    const insights = yearExpenses
      .map((e) => ({ expense: e, insight: classifyExpense(e) }))
      .filter((x) => x.insight.classification !== 'personal')
      .sort((a, b) => (a.insight.classification === 'review' ? -1 : 0) - (b.insight.classification === 'review' ? -1 : 0))
      .slice(0, 5);

    // Recent-income summary used by the reserve analysis below.
    const incomeByMonth = new Map<string, number>();
    for (const e of yearIncome) {
      const k = e.income_date.slice(0, 7);
      incomeByMonth.set(k, (incomeByMonth.get(k) ?? 0) + e.amount);
    }
    const recentIncomeKeys = [...incomeByMonth.keys()].sort().slice(-3);
    const recentIncomeMonths = recentIncomeKeys.length;
    const recentIncomeAvg =
      recentIncomeMonths > 0 ? recentIncomeKeys.reduce((s, k) => s + (incomeByMonth.get(k) ?? 0), 0) / recentIncomeMonths : 0;

    return {
      totalIncome,
      businessExpenses,
      estimate,
      setAside,
      gap,
      monthly,
      categories,
      deadlineList,
      nextDeadline,
      insights,
      yearExpenses,
      yearPayments,
      recentIncomeAvg,
      recentIncomeMonths,
    };
  }, [data, year]);

  const pro = useMemo(() => {
    if (!isPro || !data) return null;
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const yoy = yearOverYear(data.income, data.expenses, year);
    const snapshot = businessSnapshot(data.income, data.expenses, year);
    const recurring = recurringExpenses(data.expenses).filter((r) => r.monthsSeen > 1).slice(0, 5);
    const hasActivity =
      data.income.length > 0 || data.expenses.length > 0 || yoy.hasPrevious;
    if (!hasActivity) return null;

    const ymKey = (yr: number, m: number) => `${yr}-${String(m + 1).padStart(2, '0')}`;
    const businessIn = (yr: number, m: number) =>
      data.expenses
        .filter((e) => e.expense_date.slice(0, 7) === ymKey(yr, m) && e.is_business_expense)
        .reduce((s, e) => s + (e.amount * e.business_use_percentage) / 100, 0);
    const incomeIn = (yr: number, m: number) =>
      data.income.filter((e) => e.income_date.slice(0, 7) === ymKey(yr, m)).reduce((s, e) => s + e.amount, 0);

    // Pro chart series: monthly net + monthly business-expense trend.
    const monthlyNet = Array.from({ length: 12 }, (_, i) => ({
      label: monthLabel(i),
      value: r2(incomeIn(year, i) - businessIn(year, i)),
    }));
    const expenseTrend = Array.from({ length: 12 }, (_, i) => ({
      label: monthLabel(i),
      value: r2(businessIn(year, i)),
    }));

    // Year-over-year business amounts (snapshot + comparisons).
    const businessTotal = (yr: number) =>
      data.expenses
        .filter((e) => e.expense_date.slice(0, 4) === String(yr) && e.is_business_expense)
        .reduce((s, e) => s + (e.amount * e.business_use_percentage) / 100, 0);
    const expensesCur = r2(businessTotal(year));
    const expensesPrev = r2(businessTotal(year - 1));
    const incomeCur = r2(yoy.incomeCur);
    const incomePrev = r2(yoy.incomePrev);
    const netCur = r2(incomeCur - expensesCur);
    const netPrev = r2(incomePrev - expensesPrev);
    const expensesDeltaPct = expensesPrev > 0 ? r2(((expensesCur - expensesPrev) / expensesPrev) * 100) : null;
    const netDeltaPct = netPrev !== 0 ? r2(((netCur - netPrev) / Math.abs(netPrev)) * 100) : null;

    const insights: string[] = [];
    if (snapshot.needsReviewCount > 0) {
      insights.push(
        `${snapshot.needsReviewCount} ${snapshot.needsReviewCount === 1 ? 'expense is' : 'expenses are'} flagged “needs review” — a quick look now keeps your records tax-ready.`
      );
    }
    const uncategorized = data.expenses.filter(
      (e) => e.category === 'Other' && e.is_business_expense
    ).length;
    if (uncategorized > 0) {
      insights.push(
        `${uncategorized} ${uncategorized === 1 ? 'business expense' : 'business expenses'} ${uncategorized === 1 ? 'is' : 'are'} uncategorized — assigning a category improves your deduction picture.`
      );
    }
    const receiptsReview = data.receipts.filter((r) => r.processing_status === 'needs_review').length;
    if (receiptsReview > 0) {
      insights.push(
        `${receiptsReview} scanned ${receiptsReview === 1 ? 'receipt' : 'receipts'} ${receiptsReview === 1 ? 'is' : 'are'} waiting for you to confirm the details.`
      );
    }
    if (recurring.length > 0) {
      const monthly = recurring.reduce((s, r) => s + r.monthlyAmount, 0);
      insights.push(
        `${recurring.length} recurring ${recurring.length === 1 ? 'charge' : 'charges'} detected, roughly ${money(monthly)} per month — review that each is still business-related.`
      );
    }
    if (yoy.incomeDeltaPct !== null && Math.abs(yoy.incomeDeltaPct) >= 5) {
      insights.push(
        `Your revenue is ${deltaText(yoy.incomeDeltaPct)} compared with ${year - 1}.`
      );
    }

    // Spending vs previous quarter (business amounts only, with data in both).
    const nowD = new Date();
    const curQ = Math.floor(nowD.getMonth() / 3);
    const prevQ = (curQ + 3) % 4;
    const prevQYear = prevQ > curQ ? year - 1 : year;
    const quarterLabel = (q: number) => `${monthLabel(q * 3)}–${monthLabel(q * 3 + 2)}`;
    const quarterBiz = (q: number, yr: number) => {
      let total = 0;
      let withData = 0;
      for (let i = 0; i < 3; i++) {
        const t = businessIn(yr, q * 3 + i);
        if (t > 0) withData += 1;
        total += t;
      }
      return { total: r2(total), withData };
    };
    const curQBiz = quarterBiz(curQ, year);
    const prevQBiz = quarterBiz(prevQ, prevQYear);
    if (curQBiz.withData > 0 && prevQBiz.withData > 0 && prevQBiz.total > 0) {
      const delta = r2(((curQBiz.total - prevQBiz.total) / prevQBiz.total) * 100);
      if (Math.abs(delta) >= 15 && Math.abs(curQBiz.total - prevQBiz.total) >= 50) {
        insights.push(
          `${quarterLabel(curQ)} business spending (${money(curQBiz.total)}) is ${deltaText(delta)} vs ${quarterLabel(prevQ)} ${prevQYear} (${money(prevQBiz.total)}).`
        );
      }
    }

    // Income vs the previous six months (only when both windows have data).
    const sixMonthWindow = (from: number, to: number) => {
      const totals = new Map<string, number>();
      for (let o = from; o <= to; o++) {
        const d = new Date(nowD.getFullYear(), nowD.getMonth() - o, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        let total = 0;
        for (const inc of data.income) if (inc.income_date.slice(0, 7) === k) total += inc.amount;
        if (total > 0) totals.set(k, total);
      }
      const active = totals.size;
      const sum = [...totals.values()].reduce((s, v) => s + v, 0);
      return { avg: active > 0 ? r2(sum / active) : 0, active };
    };
    const recent6 = sixMonthWindow(0, 5);
    const prior6 = sixMonthWindow(6, 11);
    if (recent6.active >= 2 && prior6.active >= 2 && prior6.avg > 0) {
      const deltaPct = r2(((recent6.avg - prior6.avg) / prior6.avg) * 100);
      if (Math.abs(deltaPct) >= 10 && Math.abs(recent6.avg - prior6.avg) >= 100) {
        insights.push(
          `Your average monthly income over the last 6 months is ${deltaText(deltaPct)} (about ${money(recent6.avg)}/month) compared with the previous 6 months (${money(prior6.avg)}/month).`
        );
      }
    }

    // Category comparison vs last year (business-use amounts only).
    const catsOf = (yr: number) => {
      const map = new Map<string, number>();
      for (const e of data.expenses) {
        if (e.expense_date.slice(0, 4) !== String(yr) || !e.is_business_expense) continue;
        map.set(e.category, (map.get(e.category) ?? 0) + (e.amount * e.business_use_percentage) / 100);
      }
      return map;
    };
    const curCats = catsOf(year);
    const prevCats = catsOf(year - 1);
    const catCompare = [...new Set([...curCats.keys(), ...prevCats.keys()])]
      .map((label) => ({ label, cur: r2(curCats.get(label) ?? 0), prev: r2(prevCats.get(label) ?? 0) }))
      .filter((c) => c.prev > 0)
      .sort((a, b) => b.cur - a.cur)
      .slice(0, 6);

    return {
      yoy,
      snapshot,
      recurring,
      insights: insights.slice(0, 4),
      monthlyNet,
      expenseTrend,
      catCompare,
      incomeCur,
      expensesCur,
      expensesPrev,
      expensesDeltaPct,
      netCur,
      netDeltaPct,
    };
  }, [isPro, data, year]);

  const alerts = useMemo(() => {
    const list: { tone: 'info' | 'warning' | 'success'; title: string; body: string; to: string }[] = [];
    const receiptsNeedingReview = (data?.receipts ?? []).filter((r) => r.processing_status === 'needs_review').length;
    if (receiptsNeedingReview > 0) {
      list.push({
        tone: 'warning',
        title: `${receiptsNeedingReview} receipt${receiptsNeedingReview > 1 ? 's' : ''} need${receiptsNeedingReview > 1 ? '' : 's'} review`,
        body: 'Review the extracted details and confirm them before they can become expenses.',
        to: '/receipts',
      });
    }
    const missingReceipts = stats.yearExpenses.filter((e) => e.is_business_expense && !e.receipt_id).length;
    if ((prefs?.alerts_missing_receipts ?? true) && missingReceipts > 0) {
      list.push({
        tone: 'info',
        title: `${missingReceipts} business ${missingReceipts === 1 ? 'expense has' : 'expenses have'} no receipt attached`,
        body: 'Keeping receipts with your business expenses makes year-end organization easier.',
        to: '/expenses',
      });
    }
    const uncategorized = stats.yearExpenses.filter((e) => e.category === 'Other').length;
    if ((prefs?.alerts_uncategorized ?? true) && uncategorized > 0) {
      list.push({
        tone: 'info',
        title: `${uncategorized} expense${uncategorized > 1 ? 's are' : ' is'} uncategorized`,
        body: 'Assigning a category helps identify potential deductions.',
        to: '/expenses',
      });
    }
    if ((prefs?.alerts_reserve ?? true) && stats.gap > 0 && (data?.income ?? []).length > 0) {
      list.push({
        tone: 'warning',
        title: 'Tax reserve may be low',
        body: `You've set aside ${money(stats.setAside)} of an estimated ${money(stats.estimate.estimatedTax)} for ${year}.`,
        to: '/tax-estimate',
      });
    }
    if ((prefs?.alerts_deadlines ?? true) && stats.nextDeadline && stats.nextDeadline.daysLeft <= 30) {
      list.push({
        tone: 'info',
        title: `Quarterly deadline approaching · ${formatDateLong(stats.nextDeadline.dueDate)}`,
        body: `Your estimated ${stats.nextDeadline.quarterLabel} payment is around ${money(Math.max(0, stats.estimate.recommendedQuarterly - stats.nextDeadline.paid))}.`,
        to: '/tax-estimate',
      });
    }

    // Unusual spending: this calendar month vs a 3-month trailing baseline.
    const bizByMonth = new Map<string, number>();
    for (const e of data?.expenses ?? []) {
      if (!e.is_business_expense) continue;
      const k = e.expense_date.slice(0, 7);
      bizByMonth.set(k, (bizByMonth.get(k) ?? 0) + (e.amount * e.business_use_percentage) / 100);
    }
    const ymOffset = (offset: number) => {
      const d = new Date();
      const dt = new Date(d.getFullYear(), d.getMonth() - offset, 1);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    };
    const curMonthBiz = bizByMonth.get(ymOffset(0)) ?? 0;
    const baselineMonths = [1, 2, 3].map((o) => bizByMonth.get(ymOffset(o)) ?? 0).filter((v) => v > 0);
    if (
      (prefs?.alerts_unusual_spending ?? true) &&
      curMonthBiz >= 75 &&
      baselineMonths.length >= 2
    ) {
      const baseAvg = baselineMonths.reduce((s, v) => s + v, 0) / baselineMonths.length;
      if (curMonthBiz >= baseAvg * 1.8) {
        list.push({
          tone: 'warning',
          title: 'Unusual spending this month',
          body: `Your business expenses so far this month total ${money(curMonthBiz)}, compared with an average of ${money(baseAvg)} per month recently.`,
          to: '/expenses',
        });
      }
    }
    return list;
  }, [data, prefs, stats, year]);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'there';

  const onDeletePayment = async () => {
    if (!deletingPayment) return;
    setBusy(true);
    try {
      await backend.deleteTaxPayment(deletingPayment.id);
      toast.success('Payment removed');
      await reload();
    } catch (err) {
      toast.error('Could not remove this payment', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
      setDeletingPayment(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Here's how your ${year} freelance finances look right now.`}
        actions={
          <Button icon={<IconPlus />} onClick={() => setPayModal({ kind: 'set_aside' })}>
            Record set-aside
          </Button>
        }
      />

      {error && (
        <Alert variant="danger" title="Couldn't load your dashboard" className="mb-4">
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {alerts.length > 0 && (
            <div className="mb-6 space-y-2.5">
              {alerts.map((a) => (
                <Link key={a.title} to={a.to} className="block no-underline">
                  <Alert variant={a.tone} title={a.title} className="transition-shadow hover:shadow-sm">
                    {a.body}
                  </Alert>
                </Link>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={`Income · ${year}`} value={money(stats.totalIncome)} icon={<IconTrendingUp />} tone="green" sub={`${stats.totalIncome > 0 ? 'from your tracked entries' : 'no income recorded yet'}`} />
            <StatCard label={`Expenses · ${year}`} value={money(stats.businessExpenses)} icon={<IconFile />} tone="brand" sub="business portion only" />
            <StatCard label="Potential deductions" value={money(stats.businessExpenses)} icon={<IconSparkles />} tone="amber" sub="business-use amount across expenses" />
            <StatCard label={`Estimated tax · ${year}`} value={money(stats.estimate.estimatedTax)} icon={<IconCalculator />} tone="neutral" sub="informational estimate" />
          </div>

          {pro && (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <StatCard
                  label={`Revenue · ${year}`}
                  value={money(pro.incomeCur)}
                  icon={<IconTrendingUp />}
                  tone="green"
                  sub={pro.yoy.hasPrevious ? `vs ${year - 1} · ${deltaText(pro.yoy.incomeDeltaPct)}` : 'first year tracked'}
                />
                <StatCard
                  label={`Business expenses · ${year}`}
                  value={money(pro.expensesCur)}
                  icon={<IconFile />}
                  tone="amber"
                  sub={
                    pro.expensesPrev > 0
                      ? `vs ${year - 1} · ${deltaText(pro.expensesDeltaPct)}`
                      : pro.expensesCur > 0
                        ? 'first year tracked'
                        : 'no business expenses yet'
                  }
                />
                <StatCard
                  label={`Net income · ${year}`}
                  value={money(pro.netCur)}
                  icon={<IconDollar />}
                  tone="brand"
                  sub={pro.yoy.hasPrevious ? `vs ${year - 1} · ${deltaText(pro.netDeltaPct)}` : 'income minus business expenses'}
                />
                <StatCard
                  label="Best month"
                  value={pro.snapshot.bestMonth ?? '—'}
                  icon={<IconCalendar />}
                  tone="amber"
                  sub="by revenue"
                />
                <StatCard
                  label="Top business category"
                  value={pro.snapshot.topCategory?.label ?? '—'}
                  icon={<IconBriefcase />}
                  tone="neutral"
                  sub={pro.snapshot.topCategory ? `${money(pro.snapshot.topCategory.value)} business-use` : 'no business expenses yet'}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Recurring business charges" subtitle="Same merchant, similar amount, across months — useful for spotting subscriptions." padded={false}>
                  {pro.recurring.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink-500">
                      No recurring charges detected yet. Charges to the same merchant across two or more
                      months appear here.
                    </p>
                  ) : (
                    <>
                      <ul className="divide-y divide-white/[0.06]">
                        {pro.recurring.map((r) => (
                          <li key={`${r.merchant}-${r.category}`} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium text-ink-900">{r.merchant}</span>
                                <Badge>{r.category}</Badge>
                              </div>
                              <p className="text-xs text-ink-500">
                                seen in {r.monthsSeen} month{r.monthsSeen > 1 ? 's' : ''} · {r.occurrences} charge{r.occurrences > 1 ? 's' : ''}
                              </p>
                            </div>
                            <span className="tabular shrink-0 font-semibold text-ink-900">~{money(r.monthlyAmount)}/mo</span>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-white/[0.06] px-5 py-3">
                        <p className="text-sm text-ink-600">
                          Estimated annual cost:{' '}
                          <strong className="text-ink-900">{money(pro.recurring.reduce((s, r) => s + r.monthlyAmount * 12, 0))}</strong>{' '}
                          across {pro.recurring.length} {pro.recurring.length === 1 ? 'charge' : 'charges'}.
                        </p>
                      </div>
                    </>
                  )}
                </Card>

                <Card title="Smart insights" subtitle="Observations computed from your own records — no guesses." padded={false}>
                  {pro.insights.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink-500">
                      Nothing out of the ordinary right now. Insights appear here as patterns form in
                      your data.
                    </p>
                  ) : (
                    <ul className="divide-y divide-white/[0.06]">
                      {pro.insights.map((text) => (
                        <li key={text} className="flex items-start gap-3 px-5 py-3.5 text-sm leading-relaxed text-ink-700">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                          {text}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title={`Income by month · ${year}`} padded={false}>
              <div className="p-5">
                {(data?.income ?? []).length > 0 ? (
                  <BarChart data={stats.monthly} />
                ) : (
                  <EmptyState
                    icon={<IconDollar />}
                    title="No income yet"
                    description="Add income to see your monthly earnings at a glance."
                    action={
                      <Link to="/income">
                        <Button icon={<IconPlus />}>Add income</Button>
                      </Link>
                    }
                  />
                )}
              </div>
            </Card>

            <Card title={`Expenses by category · ${year}`} padded={false}>
              <div className="p-5">
                {stats.categories.length > 0 ? (
                  <CategoryBreakdown items={stats.categories} valueFormatter={money} emptyMessage="No expenses recorded yet" />
                ) : (
                  <EmptyState
                    icon={<IconFile />}
                    title="No expenses yet"
                    description="Track your business expenses to see potential deductions."
                    action={
                      <Link to="/expenses">
                        <Button icon={<IconPlus />}>Add expense</Button>
                      </Link>
                    }
                  />
                )}
              </div>
            </Card>
          </div>

          {pro && (
            <>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Card title={`Net income by month · ${year}`} subtitle="Income minus business expenses" padded={false}>
                  <div className="p-5">
                    {pro.monthlyNet.some((m) => m.value !== 0) ? (
                      <SignedBarChart data={pro.monthlyNet} valueFormatter={money} />
                    ) : (
                      <p className="py-8 text-center text-sm text-ink-500">
                        Add income or expenses for {year} and your monthly net will appear here.
                      </p>
                    )}
                  </div>
                </Card>
                <Card title={`Business expenses by month · ${year}`} subtitle="Business-use amounts only" padded={false}>
                  <div className="p-5">
                    {pro.expenseTrend.some((m) => m.value > 0) ? (
                      <BarChart data={pro.expenseTrend} valueFormatter={money} />
                    ) : (
                      <p className="py-8 text-center text-sm text-ink-500">
                        Track business expenses for {year} to see your monthly spending trend.
                      </p>
                    )}
                  </div>
                </Card>
              </div>

              {pro.catCompare.length > 0 && (
                <div className="mt-6">
                  <Card
                    title={`Category spending · ${year} vs ${year - 1}`}
                    subtitle="Business-use amounts by category — compared only where prior-year activity exists"
                    padded={false}
                  >
                    <ul className="divide-y divide-white/[0.06]">
                      {pro.catCompare.map((c) => {
                        const pct = c.prev > 0 ? Math.round(((c.cur - c.prev) / c.prev) * 100) : 0;
                        return (
                          <li key={c.label} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-ink-900">{c.label}</span>
                              </div>
                              <p className="mt-0.5 text-xs text-ink-500">
                                {money(c.cur)} this year · {money(c.prev)} in {year - 1}
                              </p>
                            </div>
                            <span
                              className={cn('tabular shrink-0 text-sm font-semibold', pct > 0 ? 'text-red-700' : 'text-emerald-700')}
                            >
                              {pct > 0 ? '+' : ''}
                              {pct}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                </div>
              )}
            </>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card
              title="Potential deductions"
              subtitle="Expenses that may qualify as business deductions, based on the information you provided."
              padded={false}
              actions={
                <Link to="/deductions" className="text-sm font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              }
            >
              {stats.insights.length === 0 ? (
                <EmptyState
                  icon={<IconSparkles />}
                  title="No potential deductions yet"
                  description="Add expenses and we'll flag the ones that may qualify for your business."
                  action={
                    <Link to="/expenses">
                      <Button icon={<IconPlus />}>Add expense</Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {stats.insights.map(({ expense, insight }) => {
                    const meta = CLASSIFICATION_META[insight.classification];
                    return (
                      <li key={expense.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-ink-900">{expense.merchant}</span>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-ink-500">{insight.explanation}</p>
                        </div>
                        <span className="tabular shrink-0 font-semibold text-ink-900">{money(insight.business_amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              <Card title={`Tax reserve · ${year}`} padded={false}>
                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-1 gap-3 xs:grid-cols-3">
                    <ReserveLine label="Estimated tax" value={money(stats.estimate.estimatedTax)} />
                    <ReserveLine label="Set aside" value={money(stats.setAside)} tone={stats.gap === 0 ? 'green' : 'neutral'} />
                    <ReserveLine label={stats.gap > 0 ? 'Potential gap' : 'Covered'} value={money(stats.gap)} tone={stats.gap > 0 ? 'amber' : 'green'} />
                  </div>
                  {stats.gap > 0 && (
                    <p className="text-sm text-ink-500">
                      Setting aside{' '}
                      <strong className="text-ink-900">{money(stats.estimate.recommendedMonthly)}</strong>{' '}
                      per month ({money(stats.estimate.recommendedQuarterly)} per quarter) would cover the
                      estimated total.
                    </p>
                  )}
                  {stats.gap > 0 && stats.recentIncomeMonths >= 2 && (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
                      Based on your recent income (about {money(stats.recentIncomeAvg)} per month across your
                      latest {stats.recentIncomeMonths} months with earnings) and your current estimate, your
                      reserve may be below the amount suggested by your latest estimate.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<IconPlus />} onClick={() => setPayModal({ kind: 'set_aside' })}>
                      Record set-aside
                    </Button>
                    <Button size="sm" variant="secondary" icon={<IconCalendar />} onClick={() => setPayModal({ kind: 'estimated_payment' })}>
                      Record estimated payment
                    </Button>
                  </div>
                  {stats.yearPayments.length > 0 && (
                    <div className="border-t border-white/[0.06] pt-3">
                      <p className="mb-2 text-[12px] font-medium text-ink-500">
                        Recorded this year
                      </p>
                      <ul className="space-y-1.5">
                        {stats.yearPayments.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-ink-700">{formatDate(p.payment_date)}</span>
                                {p.quarter_key && <span className="text-ink-400">· {p.quarter_key}</span>}
                                <Badge tone={p.kind === 'estimated_payment' ? 'blue' : 'neutral'} className="ml-1">
                                  {p.kind === 'estimated_payment' ? 'Payment' : 'Set-aside'}
                                </Badge>
                              </div>
                              {p.notes && <p className="mt-0.5 truncate text-xs text-ink-400">{p.notes}</p>}
                            </div>
                            <span className="flex shrink-0 items-center gap-1">
                              <span className="tabular font-medium text-ink-900">{money(p.amount)}</span>
                              <button
                                onClick={() => setDeletingPayment(p)}
                                className="rounded-full p-1 text-ink-400 hover:bg-red-500/15 hover:text-red-600"
                                aria-label={`Delete payment of ${money(p.amount)}`}
                                title="Delete"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>

              <Card title={`Quarterly deadlines · ${year}`} padded={false}>
                {stats.deadlineList.length === 0 ? (
                  <EmptyState icon={<IconCalendar />} title="No deadlines" description="Nothing scheduled for this tax year." />
                ) : (
                  <ul className="divide-y divide-white/[0.06]">
                    {stats.deadlineList.map((d) => (
                      <li key={d.quarterKey} className={cn('flex items-center justify-between gap-3 px-5 py-3', d.daysLeft >= 0 && !d.isPaid && d.daysLeft <= 30 && 'bg-amber-500/[0.07]')}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink-900">{d.quarterLabel}</span>
                            <Badge tone={d.isPaid ? 'green' : d.daysLeft < 0 ? 'neutral' : d.daysLeft <= 30 ? 'amber' : 'blue'}>
                              {d.isPaid ? `Paid ${money(d.paid)}` : d.daysLeft < 0 ? 'Past due' : d.daysLeft === 0 ? 'Due today' : `In ${d.daysLeft} days`}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {formatDateLong(d.dueDate)}
                            {!d.isPaid && d.daysLeft >= 0 && ` · est. ${money(Math.max(0, stats.estimate.recommendedQuarterly - d.paid))}`}
                          </p>
                        </div>
                        {!d.isPaid && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPayModal({ kind: 'estimated_payment', quarterKey: d.quarterKey })}
                          >
                            Mark paid
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-white/[0.06] px-5 py-3">
                  <p className="text-xs leading-relaxed text-ink-500">
                    Deadline dates are statutory estimates. Marking a payment as paid records it in your
                    books only — no money is moved from the app.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      <RecordPaymentModal
        open={Boolean(payModal)}
        kind={payModal?.kind ?? 'set_aside'}
        quarterKey={payModal?.quarterKey}
        suggested={payModal?.kind === 'estimated_payment' ? stats.estimate.recommendedQuarterly : stats.estimate.recommendedMonthly}
        onClose={() => setPayModal(null)}
        onSaved={async (payment) => {
          setPayModal(null);
          toast.success(payment.kind === 'estimated_payment' ? 'Estimated payment recorded' : 'Set-aside recorded', money(payment.amount));
          await reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingPayment)}
        onClose={() => setDeletingPayment(null)}
        title="Delete this recorded payment?"
        message={
          <>
            This removes the {deletingPayment?.kind === 'estimated_payment' ? 'estimated payment' : 'set-aside'} of{' '}
            {deletingPayment ? money(deletingPayment.amount) : ''} recorded on{' '}
            {deletingPayment ? formatDate(deletingPayment.payment_date) : ''}. This can't be undone.
          </>
        }
        loading={busy}
        onConfirm={onDeletePayment}
      />
    </div>
  );
}

function ReserveLine({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'green' | 'amber' }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.04] p-3 ring-1 ring-inset ring-white/[0.07]">
      <p className="truncate text-[12px] text-ink-500">{label}</p>
      <p className={cn('tabular mt-1 break-words text-[15px] font-semibold leading-tight', tone === 'green' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-500' : 'text-ink-900')}>
        {value}
      </p>
    </div>
  );
}

function RecordPaymentModal({
  open,
  kind,
  quarterKey,
  suggested,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: PaymentKind;
  quarterKey?: string | null;
  suggested: number;
  onClose: () => void;
  onSaved: (payment: TaxPayment) => void | Promise<void>;
}) {
  const { prefs } = useAuth();
  const backend = getBackend();
  const year = prefs?.tax_year ?? new Date().getFullYear();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const quarterOptions = ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => `${year}-${q}`);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = parseAmount(amount);
    if (value === null || value <= 0) {
      setError('Please enter an amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const saved = await backend.createTaxPayment({
        amount: value,
        payment_date: date,
        kind,
        tax_year: year,
        quarter_key: kind === 'estimated_payment' ? quarterKey ?? null : null,
        notes: notes.trim() || null,
      });
      await onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this payment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === 'estimated_payment' ? 'Record estimated payment' : 'Record set-aside'}
      description={
        kind === 'estimated_payment'
          ? `Bookkeeping only — nothing is paid from the app. Suggested: ${money(suggested)}.`
          : `Move money into your tax reserve in your own account, then record it here. Suggested: ${money(suggested)}.`
      }
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={saving}>
            Save
          </Button>
        </div>
      }
    >
      <form id="payment-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="danger" title="Unable to save">
            {error}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required>
            <Input prefix="$" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" hint="Optional — e.g. which account you moved the money to.">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Transferred to my tax savings account"
          />
        </Field>
        {kind === 'estimated_payment' && (
          <Field label="Quarter" required>
            <Select
              options={quarterOptions}
              value={quarterKey ?? quarterOptions[0]}
              onChange={(e) => {
                const q = e.target.value.split('-')[1];
                if (q) {
                  setAmount(String(Math.max(0, suggested)));
                }
              }}
            />
          </Field>
        )}
        <p className="text-xs text-ink-400">
          <IconBriefcase className="mr-1 inline h-3.5 w-3.5" />
          This is a record for your own tracking. Actual tax payments happen outside FreelanceTax.
        </p>
      </form>
    </Modal>
  );
}