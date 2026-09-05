import { businessExpenseTotal, classifyExpense } from './insights';
import { estimateTax } from './tax';
import { annualCost, recurringExpenses, totalsForYear } from './analytics';
import { formatDate, money, monthKey, pluralize } from './format';
import { INSIGHT_DISCLAIMER, TAX_DISCLAIMER } from './constants';
import type { ExpenseEntry, IncomeEntry, TaxPayment } from './types';

/**
 * FreelanceTax AI Copilot (Phase 3).
 *
 * A deterministic assistant that answers questions ONLY from the caller's own
 * stored data. Every number is computed live from the supplied records — it
 * never invents income, expenses, or projections, and it never claims
 * deductibility or guarantees tax outcomes. Tax-related answers carry the
 * standard disclaimer.
 */

export interface CopilotContext {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  receiptsCount: number;
  receiptsNeedingReview: number;
  payments: TaxPayment[];
  currentYear: number;
}

export interface CopilotAnswer {
  text: string;
  lines?: { label: string; value: string }[];
  disclaimer?: boolean;
  /** A couple of things the user can ask next. */
  followUps: string[];
}

export const SUGGESTED_QUESTIONS = [
  'How much did I spend on software this year?',
  'What was my highest expense category this year?',
  'How much did I earn last month?',
  'How much have my expenses increased compared with last year?',
  'Which expenses need review?',
  'How much have I set aside for estimated taxes?',
  'Compare my income this year with last year.',
  'Are there recurring expenses?',
] as const;

const TAX_DISCLAIMER_TEXT = TAX_DISCLAIMER;
const INSIGHT_DISCLAIMER_TEXT = INSIGHT_DISCLAIMER;

function money0(n: number): string {
  return money(n);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function countIncomeInYear(rows: IncomeEntry[], year: number): number {
  return rows.filter((r) => r.income_date.slice(0, 4) === String(year)).length;
}

export function answerQuestion(raw: string, ctx: CopilotContext): CopilotAnswer {
  const q = raw.toLowerCase().replace(/[?.!]+$/g, '');
  const cur = ctx.currentYear;
  const prev = cur - 1;
  const genericFollowUps = [...SUGGESTED_QUESTIONS];
  const nothing = {
    hasIncome: ctx.income.length > 0,
    hasExpenses: ctx.expenses.length > 0,
  };

  // ---- highest / biggest expense category ---------------------------------
  if (/(highest|biggest|top) (expense )?categor|largest expense|where.*money go|spend.*most/i.test(q)) {
    const yearExpenses = ctx.expenses.filter((e) => e.expense_date.slice(0, 4) === String(cur));
    const byCategory = new Map<string, number>();
    for (const e of yearExpenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    if (yearExpenses.length === 0 || byCategory.size === 0) {
      return {
        text: `You don't have any expenses recorded for ${cur} yet, so there's no category data to rank. Add expenses and I can tell you where your money is going.`,
        followUps: genericFollowUps,
      };
    }
    const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5).map(([label, value], i) => ({ label: `${i + 1}. ${label}`, value: money0(value) }));
    return {
      text: `Your largest expense category for ${cur} is ${sorted[0][0]} at ${money0(sorted[0][1])}.`,
      lines: top,
      followUps: ['How much did I earn this year?', 'How much did I spend on software this year?'],
    };
  }

  // ---- spend on <category> --------------------------------------------------
  const catMatch = q.match(/(?:spend|spent|spending) (?:on|for)?\s*(.+?)(?:\s+this (year|month)| in |\s+last (year|month))?$/);
  if (/spend|spent/i.test(q) && catMatch) {
    const period = q.includes('last month') ? 'last-month' : q.includes('last year') ? 'last-year' : q.includes('this month') ? 'this-month' : 'year';
    const category = catMatch[1].trim().replace(/\b(?:this|year|month|last|in|on|for)\b/g, '').trim();
    const yearToUse = period === 'last-year' ? prev : cur;
    const items = ctx.expenses.filter((e) => {
      if (e.expense_date.slice(0, 4) !== String(yearToUse)) return false;
      if (period === 'last-month') {
        const d = new Date();
        const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        return monthKey(e.expense_date) === `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}`;
      }
      if (period === 'this-month') return monthKey(e.expense_date) === monthKey(new Date().toISOString());
      return true;
    });
    const matched = items.filter((e) => e.category.toLowerCase().includes(category));
    const total = sum(matched.map((e) => e.amount));
    if (matched.length === 0) {
      return {
        text: `I don't see any expenses categorized as "${category}" in ${period === 'last-year' ? prev : cur}. Try asking about one of your actual categories.`,
        followUps: ['What was my highest expense category this year?', 'How much did I spend in total this year?'],
      };
    }
    const byCat = new Map<string, number>();
    for (const e of matched) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    return {
      text: `You spent ${money0(total)} on "${category}" across ${matched.length} ${pluralize(matched.length, 'entry')} in ${period === 'last-year' ? prev : cur}.`,
      lines: [...byCat.entries()].map(([label, value]) => ({ label, value: money0(value) })),
      disclaimer: true,
      followUps: ['What was my highest expense category this year?', 'Which expenses need review?'],
    };
  }

  // ---- income: total / this month / last month / this year / last year -------
  if (/how much (did i|have i).*(earn|make|income)|income.*(this|last) (month|year)|total income|earnings/i.test(q)) {
    const period = q.includes('last month') ? 'last-month' : q.includes('last year') ? 'last-year' : q.includes('this month') ? 'this-month' : 'year';
    const d = new Date();
    const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    let items = ctx.income;
    let label: string;
    if (period === 'last-month') {
      const key = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}`;
      items = ctx.income.filter((e) => monthKey(e.income_date) === key);
      label = `last month (${monthKey(`${lm.toISOString()}`).slice(0, 7)})`;
    } else if (period === 'this-month') {
      const key = monthKey(d.toISOString());
      items = ctx.income.filter((e) => monthKey(e.income_date) === key);
      label = `this month (${key})`;
    } else if (period === 'last-year') {
      items = ctx.income.filter((e) => e.income_date.slice(0, 4) === String(prev));
      label = String(prev);
    } else {
      items = ctx.income.filter((e) => e.income_date.slice(0, 4) === String(cur));
      label = String(cur);
    }
    const total = sum(items.map((e) => e.amount));
    if (items.length === 0) {
      return {
        text: `I don't have any income recorded for ${period === 'last-month' ? 'last month' : period === 'last-year' ? prev : period === 'this-month' ? 'this month' : cur}, so there's nothing to report.`,
        followUps: ['How much have my expenses increased compared with last year?', 'How much have I set aside for estimated taxes?'],
      };
    }
    return {
      text: `You earned ${money0(total)} in ${label} across ${items.length} ${pluralize(items.length, 'payment', 'payments')}.`,
      followUps: ['What was my highest expense category this year?', 'Compare my income this year with last year.'],
    };
  }

  // ---- income vs last year ---------------------------------------------------
  if (/(compare|difference).*income|income.*(vs|versus|compared).*(last year|prior)|income.*growth|did my income (go up|increase|change)/i.test(q)) {
    const curT = totalsForYear(ctx.income, ctx.expenses, cur);
    const prevT = totalsForYear(ctx.income, ctx.expenses, prev);
    if (curT.totalIncome === 0 && prevT.totalIncome === 0) {
      return { text: `I don't have income recorded for ${prev} or ${cur} to compare yet.`, followUps: genericFollowUps };
    }
    const delta = prevT.totalIncome === 0 ? null : ((curT.totalIncome - prevT.totalIncome) / Math.abs(prevT.totalIncome)) * 100;
    const deltaText = delta === null ? 'no prior-year baseline' : `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(0)}%`;
    return {
      text: `Income for ${cur} is ${money0(curT.totalIncome)} (${prev}: ${money0(prevT.totalIncome)}), which is ${deltaText} year over year.`,
      lines: [
        { label: `${cur} income`, value: money0(curT.totalIncome) },
        { label: `${prev} income`, value: money0(prevT.totalIncome) },
        { label: 'Change', value: delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%` },
      ],
      followUps: ['How much have my expenses increased compared with last year?', 'What was my highest expense category this year?'],
    };
  }

  // ---- expense increase / comparison ------------------------------------------
  if (/(expenses?|spending).*(increased|increase|compare|compared|vs|versus|change|more than)/i.test(q) || /how much have my expenses (grown|risen)/i.test(q)) {
    const curT = totalsForYear(ctx.income, ctx.expenses, cur);
    const prevT = totalsForYear(ctx.income, ctx.expenses, prev);
    const delta = prevT.totalExpenses === 0 ? null : ((curT.totalExpenses - prevT.totalExpenses) / Math.abs(prevT.totalExpenses)) * 100;
    if (curT.totalExpenses === 0 && prevT.totalExpenses === 0) {
      return { text: `I don't have expenses recorded for ${prev} or ${cur} to compare yet.`, followUps: genericFollowUps };
    }
    return {
      text:
        delta === null
          ? `Expenses for ${cur} total ${money0(curT.totalExpenses)}; there's no ${prev} baseline to compare against yet.`
          : `Expenses went ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(0)}% year over year — ${money0(prevT.totalExpenses)} in ${prev} to ${money0(curT.totalExpenses)} in ${cur}.`,
      lines: [
        { label: `${cur} expenses`, value: money0(curT.totalExpenses) },
        { label: `${prev} expenses`, value: money0(prevT.totalExpenses) },
        { label: 'Change', value: delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%` },
      ],
      followUps: ['What was my highest expense category this year?', 'How much did I earn last month?'],
    };
  }

  // ---- net income / profit ----------------------------------------------------
  if (/(net income|profit|how much.*left|income minus)/i.test(q)) {
    const t = totalsForYear(ctx.income, ctx.expenses, cur);
    if (t.totalIncome === 0 && t.totalExpenses === 0) {
      return { text: `No income or expenses are recorded for ${cur}, so I can't compute a net figure.`, followUps: genericFollowUps };
    }
    return {
      text: `For ${cur}: income ${money0(t.totalIncome)} minus business-expense-tracked spending ${money0(t.totalExpenses)} leaves roughly ${money0(t.net)} before taxes and personal spending.`,
      lines: [
        { label: 'Income', value: money0(t.totalIncome) },
        { label: 'Expenses', value: money0(t.totalExpenses) },
        { label: 'Net (pre-tax)', value: money0(t.net) },
      ],
      disclaimer: true,
      followUps: ['How much have I set aside for estimated taxes?', 'Compare my income this year with last year.'],
    };
  }

  // ---- taxes: reserve / set aside ----------------------------------------------
  if (/(set aside|tax reserve|estimated tax|reserve)/i.test(q)) {
    const t = totalsForYear(ctx.income, ctx.expenses, cur);
    const estimate = estimateTax({ year: cur, totalIncome: t.totalIncome, businessExpenses: businessExpenseTotal(ctx.expenses.filter((e) => e.expense_date.slice(0, 4) === String(cur))) });
    const payments = ctx.payments.filter((p) => p.tax_year === cur);
    const reserved = sum(payments.map((p) => p.amount));
    return {
      text: `Your estimated tax for ${cur} is about ${money0(estimate.estimatedTax)} and you've set aside or paid ${money0(reserved)} so far — roughly ${money0(Math.max(0, estimate.estimatedTax - reserved))} short of the estimate. These are informational estimates, not tax advice.`,
      lines: [
        { label: 'Estimated tax', value: money0(estimate.estimatedTax) },
        { label: 'Set aside / paid', value: money0(reserved) },
        { label: 'Estimated gap', value: money0(Math.max(0, estimate.estimatedTax - reserved)) },
      ],
      disclaimer: true,
      followUps: ['Which expenses need review?', 'What was my highest expense category this year?'],
    };
  }

  // ---- expenses needing review --------------------------------------------------
  if (/(expenses?|transactions).*need (a )?review|needs review|review.*(expenses|deductions)/i.test(q)) {
    const review = ctx.expenses.filter((e) => classifyExpense(e).classification === 'review' && e.expense_date.slice(0, 4) === String(cur));
    if (review.length === 0) {
      return { text: `You have no expenses in ${cur} flagged for review. Nice — everything you've entered looks settled.`, followUps: ['What was my highest expense category this year?', 'How much have I set aside for estimated taxes?'] };
    }
    return {
      text: `${review.length} ${pluralize(review.length, 'expense')} in ${cur} need${review.length === 1 ? 's' : ''} review (e.g. partial business use or an uncategorized purchase).`,
      lines: review.slice(0, 5).map((e) => ({ label: `${formatDate(e.expense_date)} · ${e.merchant}`, value: money0(e.amount) })),
      disclaimer: true,
      followUps: ['What was my highest expense category this year?', 'Are there recurring expenses?'],
    };
  }

  // ---- recurring --------------------------------------------------------------
  if (/(recurring|subscription|monthly (cost|charge)|every month|annual cost)/i.test(q)) {
    const recurring = recurringExpenses(ctx.expenses);
    if (recurring.length === 0) {
      return { text: `I don't see any merchants charging on a clear monthly pattern yet. I'll watch for recurring costs as you add more expenses.`, followUps: genericFollowUps };
    }
    return {
      text: `I found ${recurring.length} possible recurring ${pluralize(recurring.length, 'charge', 'charges')}, with an estimated annual cost of ${money0(annualCost(recurring))}.`,
      lines: recurring.slice(0, 8).map((r) => ({ label: `${r.merchant} · ${r.category}`, value: `~${money0(r.monthlyAmount)}/mo` })),
      disclaimer: true,
      followUps: ['How much have my expenses increased compared with last year?', 'Which expenses need review?'],
    };
  }

  // ---- receipts -----------------------------------------------------------------
  if (/receipt/i.test(q)) {
    return {
      text:
        ctx.receiptsCount === 0
          ? `You don't have any receipts stored yet. Upload one from the Receipts page and I can help you track what's covered.`
          : `You have ${ctx.receiptsCount} receipts stored; ${ctx.receiptsNeedingReview} ${pluralize(ctx.receiptsNeedingReview, 'still needs', 'still need')} review.`,
      followUps: ['Which expenses need review?', 'How much have I set aside for estimated taxes?'],
    };
  }

  // ---- summary / everything -------------------------------------------------------
  if (/(summary|overview|how.*doing|snapshot|tell me about)/i.test(q)) {
    const t = totalsForYear(ctx.income, ctx.expenses, cur);
    if (!nothing.hasIncome && !nothing.hasExpenses) {
      return { text: `You don't have any income or expenses recorded yet — add some and I'll summarize your ${cur} finances.`, followUps: genericFollowUps };
    }
    return {
      text: `Here's your ${cur} picture so far: income ${money0(t.totalIncome)} across ${countIncomeInYear(ctx.income, cur)} entries, spending ${money0(t.totalExpenses)}, leaving a pre-tax net of ${money0(t.net)}.`,
      lines: [
        { label: 'Income', value: money0(t.totalIncome) },
        { label: 'Spending', value: money0(t.totalExpenses) },
        { label: 'Pre-tax net', value: money0(t.net) },
      ],
      disclaimer: true,
      followUps: ['What was my highest expense category this year?', 'How much have I set aside for estimated taxes?'],
    };
  }

  // ---- fallback ---------------------------------------------------------------------
  return {
    text: `I can answer questions about your own recorded data — for example: totals or spending by category, monthly and yearly income, year-over-year changes, expenses that need review, recurring charges, receipts, and your tax reserve. I don't have an answer for that exact question, and I won't guess numbers that aren't in your records. ${TAX_DISCLAIMER_TEXT}`,
    followUps: genericFollowUps,
    disclaimer: true,
  };
}

export { INSIGHT_DISCLAIMER_TEXT, TAX_DISCLAIMER_TEXT };
