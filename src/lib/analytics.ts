import { money, monthLongLabel, monthLabel } from './format';
import { classifyExpense } from './insights';
import type { ExpenseEntry, IncomeEntry } from './types';

// --- monthly series ---------------------------------------------------------

export interface MonthPoint {
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export function monthlySeries(income: IncomeEntry[], expenses: ExpenseEntry[], year: number): MonthPoint[] {
  const points: MonthPoint[] = Array.from({ length: 12 }, (_, i) => ({
    label: monthLabel(i),
    income: 0,
    expenses: 0,
    net: 0,
  }));
  for (const e of income) {
    if (e.income_date.slice(0, 4) !== String(year)) continue;
    const m = Number(e.income_date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) points[m].income += e.amount;
  }
  for (const e of expenses) {
    if (e.expense_date.slice(0, 4) !== String(year)) continue;
    const m = Number(e.expense_date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) points[m].expenses += e.amount;
  }
  for (const p of points) p.net = round2(p.income - p.expenses);
  return points;
}

export function totalsForYear(income: IncomeEntry[], expenses: ExpenseEntry[], year: number) {
  const y = String(year);
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const e of income) if (e.income_date.slice(0, 4) === y) totalIncome += e.amount;
  for (const e of expenses) if (e.expense_date.slice(0, 4) === y) totalExpenses += e.amount;
  return { totalIncome: round2(totalIncome), totalExpenses: round2(totalExpenses), net: round2(totalIncome - totalExpenses) };
}

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null; // no baseline; null means "new"
  return round2(((cur - prev) / Math.abs(prev)) * 100);
}

export interface YearOverYear {
  hasPrevious: boolean;
  incomeCur: number;
  incomePrev: number;
  incomeDeltaPct: number | null;
  expensesCur: number;
  expensesPrev: number;
  expensesDeltaPct: number | null;
  netCur: number;
  netPrev: number;
  netDeltaPct: number | null;
}

export function yearOverYear(income: IncomeEntry[], expenses: ExpenseEntry[], year: number): YearOverYear {
  const cur = totalsForYear(income, expenses, year);
  const prev = totalsForYear(income, expenses, year - 1);
  const hasPrevious = prev.totalIncome > 0 || prev.totalExpenses > 0;
  return {
    hasPrevious,
    incomeCur: cur.totalIncome,
    incomePrev: prev.totalIncome,
    incomeDeltaPct: pctChange(cur.totalIncome, prev.totalIncome),
    expensesCur: cur.totalExpenses,
    expensesPrev: prev.totalExpenses,
    expensesDeltaPct: pctChange(cur.totalExpenses, prev.totalExpenses),
    netCur: cur.net,
    netPrev: prev.net,
    netDeltaPct: pctChange(cur.net, prev.net),
  };
}

export interface BusinessSnapshot {
  bestMonth: string | null;
  topCategory: { label: string; value: number } | null;
  needsReviewCount: number;
  potentialDeductions: number;
}

export function businessSnapshot(income: IncomeEntry[], expenses: ExpenseEntry[], year: number): BusinessSnapshot {
  const series = monthlySeries(income, expenses, year);
  let bestMonth: string | null = null;
  let best = -1;
  for (const p of series) {
    if (p.income > best) {
      best = p.income;
      bestMonth = p.label;
    }
  }
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    if (e.expense_date.slice(0, 4) !== String(year) || !e.is_business_expense) continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount * (e.business_use_percentage / 100));
  }
  let topCategory: { label: string; value: number } | null = null;
  for (const [label, value] of byCategory) {
    if (!topCategory || value > topCategory.value) topCategory = { label, value: round2(value) };
  }
  let needsReviewCount = 0;
  let potentialDeductions = 0;
  for (const e of expenses) {
    if (e.expense_date.slice(0, 4) !== String(year)) continue;
    const insight = classifyExpense(e);
    if (insight.classification !== 'personal') potentialDeductions += insight.business_amount;
    if (insight.classification === 'review') needsReviewCount += 1;
  }
  return { bestMonth, topCategory, needsReviewCount, potentialDeductions: round2(potentialDeductions) };
}

// --- recurring detection ------------------------------------------------------

export interface RecurringItem {
  merchant: string;
  category: string;
  /** Typical per-period amount (median of matched entries). */
  monthlyAmount: number;
  /** Number of distinct months with a matching charge. */
  monthsSeen: number;
  occurrences: number;
}

/**
 * Detect merchant charges that repeat across months with roughly stable
 * amounts (within ±15%). Amount estimate = median of the matches.
 */
export function recurringExpenses(expenses: ExpenseEntry[]): RecurringItem[] {
  const groups = new Map<string, ExpenseEntry[]>();
  for (const e of expenses) {
    if (!e.is_business_expense) continue;
    const key = e.merchant.trim().toLowerCase();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  const out: RecurringItem[] = [];
  for (const list of groups.values()) {
    const months = new Set(list.map((e) => e.expense_date.slice(0, 7)));
    if (months.size < 2 || list.length < 2) continue;
    const amounts = list.map((e) => e.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const consistent = amounts.every((a) => Math.abs(a - median) / Math.max(median, 0.01) <= 0.15);
    if (!consistent) continue;
    const original = list[0].merchant;
    out.push({
      merchant: original,
      category: list[0].category,
      monthlyAmount: round2(median),
      monthsSeen: months.size,
      occurrences: list.length,
    });
  }
  return out.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

export function annualCost(items: RecurringItem[]): number {
  return round2(items.reduce((s, i) => s + i.monthlyAmount * 12, 0));
}

// --- display helpers -----------------------------------------------------------

export function deltaText(deltaPct: number | null, up = 'up', down = 'down'): string {
  if (deltaPct === null) return 'new this year';
  if (deltaPct === 0) return 'unchanged';
  const dir = deltaPct > 0 ? up : down;
  return `${dir} ${Math.abs(deltaPct).toFixed(0)}%`;
}

export { monthLongLabel, money };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
