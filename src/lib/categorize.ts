import type { CategoryOverride, TxnClassification, TxnKind } from './types';

/**
 * Deterministic categorization for imported transactions.
 *
 * Used at import time (server-side in Supabase mode via the sync functions,
 * and by the review UI everywhere). User corrections are stored as category
 * overrides and take precedence over these rules so future imports improve.
 *
 * This engine never claims deductibility — it only suggests a category and a
 * conservative business/personal/review label.
 */

export interface CategoryGuess {
  category: string;
  classification: TxnClassification;
  confidence: 'High' | 'Medium' | 'Low';
  /** Human-readable reason for the suggestion. */
  reason: string;
}

interface MerchantRule {
  match: RegExp;
  category: string;
  classification: TxnClassification;
  confidence: 'High' | 'Medium' | 'Low';
  reason: string;
}

const MERCHANT_RULES: MerchantRule[] = [
  // Software & subscriptions
  {
    match: /adobe|figma|notion|slack|zoom|github|gitlab|aws|digital ?ocean|vercel|google (workspace|cloud|apps)|microsoft 365|quickbooks|canva|cloudflare|dropbox|mailchimp|shopify|webflow|wix|wordpress|godaddy|namecheap|tailwind|linear|superhuman|arc (browser)|descript|final cut|backblaze|1password|lastpass|balsamiq|sketch|procreate|netlify/i,
    category: 'Software',
    classification: 'business',
    confidence: 'High',
    reason: 'This merchant sells software or a digital service commonly used for professional work. Confirm it was used for your business.',
  },
  {
    match: /^google|meta|facebook ads|instagram ads|linkedin ads|tiktok ads|taboola|outbrain|adwords/i,
    category: 'Advertising',
    classification: 'business',
    confidence: 'High',
    reason: 'Advertising spend is typically tied to promoting your business.',
  },
  {
    match: /starbucks|coffee|cafe|restaurant|diner|grubhub|doordash|ubereats|instacart|chipotle|mcdonald|subway|panera|whole foods|trader joe|safeway|kroger|aldi|costco|walmart|target|7-eleven/i,
    category: 'Food & dining',
    classification: 'personal',
    confidence: 'Medium',
    reason: 'Food and grocery purchases are usually personal, though some meals may relate to business travel.',
  },
  {
    match: /netflix|hulu|spotify|disney\+|hbo|max|peacock|paramount|kindle unlimited|audible|youtube premium|playstation|nintendo|steam|xbox/i,
    category: 'Other',
    classification: 'personal',
    confidence: 'High',
    reason: 'Entertainment subscriptions appear to be for personal use.',
  },
  {
    match: /uber|lyft|gas station|shell|chevron|exxon|bp |arco|circle k|parking|toll|amtrak|airline|delta|united|southwest|american airlines|jetblue|lyft ride/i,
    category: 'Transportation',
    classification: 'review',
    confidence: 'Low',
    reason: 'Transportation costs may qualify when related to business. Review the trip purpose.',
  },
  {
    match: /hilton|marriott|airbnb|vrbo|booking\.com|hotel|expedia/i,
    category: 'Travel',
    classification: 'review',
    confidence: 'Low',
    reason: 'Travel may qualify when the primary purpose is business. Personal portions are not deductible.',
  },
  {
    match: /at&t|verizon|t-mobile|sprint/i,
    category: 'Phone',
    classification: 'review',
    confidence: 'Medium',
    reason: 'Phone service is often partly personal. Your business-use percentage determines the portion that may qualify.',
  },
  {
    match: /comcast|xfinity|spectrum|cox|frontier|centurylink|att internet/i,
    category: 'Internet',
    classification: 'review',
    confidence: 'Medium',
    reason: 'Internet service is a shared expense for most people. Your business-use percentage determines the portion that may qualify.',
  },
  {
    match: /amazon|best buy|apple store|staples|office depot|dell|lenovo|hp store/i,
    category: 'Equipment',
    classification: 'review',
    confidence: 'Low',
    reason: 'Retail purchases can be business equipment or personal items. Review what was purchased.',
  },
  {
    match: /ups|courier|fedex|usps|shipping|post office/i,
    category: 'Office',
    classification: 'business',
    confidence: 'Medium',
    reason: 'Shipping costs are commonly related to fulfilling client work.',
  },
  {
    match: /irs|state tax|franchise tax|treasury|dept of/i,
    category: 'Professional services',
    classification: 'review',
    confidence: 'Medium',
    reason: 'Tax payments are not business deductions — review before categorizing.',
  },
  {
    match: /coursera|udemy|skillshare|masterclass|khan|brilliant|college|university|textbook/i,
    category: 'Education',
    classification: 'review',
    confidence: 'Low',
    reason: 'Education can qualify when it maintains or improves skills required for your work.',
  },
  {
    match: /legalzoom|rocket lawyer|attorney|accountant|bookkeeper|cpa|turbotax|hr block/i,
    category: 'Professional services',
    classification: 'business',
    confidence: 'High',
    reason: 'Professional fees for accounting, legal, or consulting are typically business-related.',
  },
];

const GENERIC_OTHER: CategoryGuess = {
  category: 'Other',
  classification: 'review',
  confidence: 'Low',
  reason: 'This merchant wasn\u2019t recognized. Assigning a category helps assess whether it may be business-related.',
};

export function merchantKey(merchant: string): string {
  return merchant
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function guessForMerchant(merchant: string, kind: TxnKind): CategoryGuess {
  if (kind === 'income') {
    return {
      category: 'Freelance',
      classification: 'business',
      confidence: 'Medium',
      reason: 'Income from a connected platform. Confirm the source before including it.',
    };
  }
  for (const rule of MERCHANT_RULES) {
    if (rule.match.test(merchant)) {
      return { category: rule.category, classification: rule.classification, confidence: rule.confidence, reason: rule.reason };
    }
  }
  return { ...GENERIC_OTHER };
}

/** Apply the user's stored corrections on top of the engine guess. */
export function applyOverrides(
  guess: CategoryGuess,
  merchant: string,
  overrides: CategoryOverride[]
): CategoryGuess {
  const key = merchantKey(merchant);
  const found = overrides.find((o) => o.merchant_key === key);
  if (!found) return guess;
  return {
    category: found.category,
    classification: found.classification,
    confidence: 'High',
    reason: `Based on how you categorized ${merchant.trim() || 'this merchant'} before.`,
  };
}

export const CLASSIFICATION_LABEL: Record<TxnClassification, string> = {
  business: 'Potentially business-related',
  personal: 'Probably personal',
  review: 'Needs review',
};
