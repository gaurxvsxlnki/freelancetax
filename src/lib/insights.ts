import type { DeductionInsight, ExpenseEntry } from './types';
import { INSIGHT_DISCLAIMER } from './constants';

/**
 * Deduction insight engine.
 *
 * Phase 1 ships a transparent, deterministic engine that classifies every
 * expense from the user's own data (category, business-use percentage,
 * merchant keywords). It NEVER claims an expense is definitely deductible.
 *
 * When a Supabase Edge Function with an AI provider is deployed, the
 * server-side hook (supabase/functions/process-receipt) can enhance or
 * replace this client classification with model output — the insight shape
 * stays the same.
 */

export const DISCLAIMER = INSIGHT_DISCLAIMER;

interface CategorySignal {
  classification: 'business' | 'review';
  confidence: 'High' | 'Medium' | 'Low';
  explanation: string;
}

const CATEGORY_SIGNALS: Record<string, CategorySignal> = {
  Software: {
    classification: 'business',
    confidence: 'High',
    explanation:
      'Software subscriptions are commonly used for professional work. Based on the information provided, this may qualify as a business expense — confirm it was used for your business.',
  },
  Advertising: {
    classification: 'business',
    confidence: 'High',
    explanation:
      'Advertising and marketing costs are often tied directly to promoting your business and may qualify as a deduction.',
  },
  'Professional services': {
    classification: 'business',
    confidence: 'Medium',
    explanation:
      'Fees for professional services (accounting, legal, consulting) are typically related to running a business and may be deductible.',
  },
  Education: {
    classification: 'business',
    confidence: 'Medium',
    explanation:
      'Education expenses can qualify when they maintain or improve skills required for your work. Review whether it is directly related to your business.',
  },
  Equipment: {
    classification: 'review',
    confidence: 'Low',
    explanation:
      'Equipment purchases can be business-related, but may also have personal use. Review how this item was used.',
  },
  Office: {
    classification: 'review',
    confidence: 'Medium',
    explanation:
      'Office supplies and expenses often qualify, but the amount may depend on how the item is used. Review whether it was for your business.',
  },
  Internet: {
    classification: 'review',
    confidence: 'Medium',
    explanation:
      'Internet service is a shared expense for most people. Your business-use percentage determines the portion that may qualify.',
  },
  Phone: {
    classification: 'review',
    confidence: 'Medium',
    explanation:
      'Phone service is often partly personal. Your business-use percentage determines the portion that may qualify.',
  },
  Transportation: {
    classification: 'review',
    confidence: 'Low',
    explanation:
      'Transportation costs can qualify when related to business travel or deliveries. Review the trip purpose.',
  },
  Travel: {
    classification: 'review',
    confidence: 'Low',
    explanation:
      'Travel expenses may qualify when the primary purpose is business. Personal portions are not deductible.',
  },
  Other: {
    classification: 'review',
    confidence: 'Low',
    explanation:
      'This expense was not assigned a category. Assigning a category helps assess whether it may be business-related.',
  },
};

/** Curated merchant keywords → signal. Conservative, never absolute. */
const MERCHANT_SIGNALS: { match: RegExp; classification: 'business' | 'personal' | 'review'; explanation: string; confidence: 'High' | 'Medium' | 'Low' }[] = [
  {
    match: /adobe|figma|notion|slack|zoom|github|aws|digital ?ocean|vercel|google (workspace|cloud)|microsoft 365|quickbooks|canva|tailwind|cloudflare|dropbox|mailchimp|shopify|square/i,
    classification: 'business',
    confidence: 'High',
    explanation:
      'Based on the merchant name, this looks like software or a service commonly used for professional work. Confirm it was used for your business.',
  },
  {
    match: /netflix|hulu|spotify|disney\+|hbo|peacock|paramount|kindle unlimited|audible/i,
    classification: 'personal',
    confidence: 'High',
    explanation:
      'Based on the merchant name, this appears to be a personal entertainment subscription. It likely does not qualify as a business deduction.',
  },
  {
    match: /starbucks|whole foods|trader joe|restaurant|diner|cafe|grubhub|doordash|ubereats|instacart/i,
    classification: 'review',
    confidence: 'Low',
    explanation:
      'Food and coffee purchases are usually personal, though some meal costs can relate to business travel. Review the purpose of this expense.',
  },
  {
    match: /uber|lyft|gas station|shell|chevron|exxon|parking|toll/i,
    classification: 'review',
    confidence: 'Low',
    explanation:
      'Transportation costs may qualify when related to business. Review the trip purpose before including it.',
  },
];

export function classifyExpense(expense: ExpenseEntry): DeductionInsight {
  const businessAmount = round2(expense.amount * (expense.business_use_percentage / 100));

  // Explicitly marked personal.
  if (!expense.is_business_expense) {
    return {
      classification: 'personal',
      confidence: 'Medium',
      explanation:
        'You marked this expense as personal, so it is not included in business deductions. You can change this if it actually relates to your business.',
      business_amount: 0,
    };
  }

  // Partial business use → needs review with a clear number.
  if (expense.business_use_percentage < 100) {
    const pct = expense.business_use_percentage;
    return {
      classification: 'review',
      confidence: 'Medium',
      explanation:
        `You indicated this expense is used ${pct}% for business. The business-use amount is $${businessAmount.toFixed(2)}. Review your business-use percentage before including it in your tax records.`,
      business_amount: businessAmount,
    };
  }

  // Merchant keyword signal takes precedence over category when strong.
  for (const sig of MERCHANT_SIGNALS) {
    if (sig.match.test(expense.merchant)) {
      return {
        classification: sig.classification,
        confidence: sig.confidence,
        explanation: sig.explanation,
        business_amount: sig.classification === 'personal' ? 0 : businessAmount,
      };
    }
  }

  const categorySignal = CATEGORY_SIGNALS[expense.category] ?? CATEGORY_SIGNALS.Other;
  return {
    classification: categorySignal.classification,
    confidence: categorySignal.confidence,
    explanation: categorySignal.explanation,
    // Category signals never classify as personal — only business or review.
    business_amount: businessAmount,
  };
}

export function businessExpenseTotal(expenses: ExpenseEntry[]): number {
  return round2(
    expenses.reduce((sum, e) => {
      if (!e.is_business_expense) return sum;
      return sum + e.amount * (e.business_use_percentage / 100);
    }, 0),
  );
}

export function personalExpenseTotal(expenses: ExpenseEntry[]): number {
  return round2(
    expenses.reduce((sum, e) => {
      if (e.is_business_expense) return sum;
      return sum + e.amount;
    }, 0),
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}