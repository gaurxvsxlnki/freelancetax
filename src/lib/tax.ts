/**
 * Simplified federal tax estimate engine for US single filers.
 *
 * IMPORTANT: These are informational estimates, not filing guidance.
 * - Self-employment tax: 15.3% on 92.35% of net earnings.
 * - Deduction for one-half of SE tax: subtracted before income tax (Sch. 1).
 * - QBI deduction: approximated at 20% of net business income.
 * - Federal income tax: single-filer brackets after the standard deduction.
 *
 * Simplifications (documented so nobody mistakes this for a filing engine):
 * the Social Security wage base cap and the Additional Medicare surtax are not
 * modelled, QBI is not phase-limited, and only single filers with no other
 * income, credits, or state tax are represented.
 *
 * Rules are versioned per tax year so new years can be added without
 * touching the UI. Unknown years fall back to the latest published rules
 * (2026) and are labeled as such.
 */

export interface TaxBracket {
  upTo: number; // top of bracket (Infinity for the last)
  rate: number;
}

export interface TaxYearRules {
  year: number;
  standardDeduction: number;
  brackets: TaxBracket[];
  selfEmploymentRate: number;
  selfEmploymentNetFactor: number; // 92.35%
  qbiRate: number; // 20%
  label: string;
}

const RULES_2025: TaxYearRules = {
  year: 2025,
  standardDeduction: 15000,
  brackets: [
    { upTo: 11925, rate: 0.10 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  selfEmploymentRate: 0.153,
  selfEmploymentNetFactor: 0.9235,
  qbiRate: 0.2,
  label: '2025 federal rules (single filer)',
};

const RULES_2026: TaxYearRules = {
  year: 2026,
  standardDeduction: 15450,
  brackets: [
    { upTo: 11925, rate: 0.10 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  selfEmploymentRate: 0.153,
  selfEmploymentNetFactor: 0.9235,
  qbiRate: 0.2,
  label: '2026 federal rules (single filer)',
};

const RULES_BY_YEAR: Record<number, TaxYearRules> = {
  2025: RULES_2025,
  2026: RULES_2026,
};

export function getTaxRules(year: number): TaxYearRules {
  return RULES_BY_YEAR[year] ?? { ...RULES_2026, label: `Based on the latest available rules (${RULES_2026.year})` };
}

export interface TaxEstimateInput {
  year: number;
  totalIncome: number;
  businessExpenses: number;
}

export interface TaxEstimateResult {
  year: number;
  rules: TaxYearRules;
  netEarnings: number;
  /** Deductible half of self-employment tax (reduces taxable income). */
  seTaxDeduction: number;
  qbiDeduction: number;
  taxableIncome: number;
  selfEmploymentTax: number;
  incomeTax: number;
  estimatedTax: number;
  recommendedMonthly: number;
  recommendedQuarterly: number;
  recommendedAnnual: number;
  quarterlySplit: number;
}

function bracketTax(brackets: TaxBracket[], taxable: number): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (taxable <= prev) break;
    const inBracket = Math.min(taxable, b.upTo) - prev;
    if (inBracket > 0) tax += inBracket * b.rate;
    prev = b.upTo;
  }
  return tax;
}

export function estimateTax(input: TaxEstimateInput): TaxEstimateResult {
  const rules = getTaxRules(input.year);
  const netEarnings = Math.max(0, input.totalIncome - input.businessExpenses);

  // SE tax on 92.35% of net earnings.
  const seBase = Math.max(0, netEarnings * rules.selfEmploymentNetFactor);
  const selfEmploymentTax = seBase * rules.selfEmploymentRate;

  // Half of the SE tax is an above-the-line deduction (Schedule 1). Omitting
  // it materially overstates the income tax owed.
  const seTaxDeduction = selfEmploymentTax / 2;

  // QBI approximated at 20% of net business income after the SE-tax deduction
  // (simplified single filer; no phase-out modelled).
  const qbiBase = Math.max(0, netEarnings - seTaxDeduction);
  const qbiDeduction = qbiBase * rules.qbiRate;

  // Federal income tax on (net − ½SE − QBI − standard deduction), floored at 0.
  const taxableIncome = Math.max(
    0,
    netEarnings - seTaxDeduction - qbiDeduction - rules.standardDeduction
  );
  const incomeTax = bracketTax(rules.brackets, taxableIncome);

  const estimatedTax = selfEmploymentTax + incomeTax;

  // Set-aside guidance: assume ~4 quarterly estimated payments.
  const quarterlySplit = 4;
  const recommendedAnnual = estimatedTax;
  const recommendedQuarterly = estimatedTax / quarterlySplit;
  const recommendedMonthly = estimatedTax / 12;

  return {
    year: input.year,
    rules,
    netEarnings: round2(netEarnings),
    seTaxDeduction: round2(seTaxDeduction),
    qbiDeduction: round2(qbiDeduction),
    taxableIncome: round2(taxableIncome),
    selfEmploymentTax: round2(selfEmploymentTax),
    incomeTax: round2(incomeTax),
    estimatedTax: round2(estimatedTax),
    recommendedMonthly: round2(recommendedMonthly),
    recommendedQuarterly: round2(recommendedQuarterly),
    recommendedAnnual: round2(recommendedAnnual),
    quarterlySplit,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** All tax years we have rules for, plus the current year and next. */
export function supportedTaxYears(): number[] {
  const thisYear = new Date().getFullYear();
  const years = new Set<number>([thisYear, thisYear + 1, ...Object.keys(RULES_BY_YEAR).map(Number)]);
  return [...years].sort((a, b) => a - b);
}