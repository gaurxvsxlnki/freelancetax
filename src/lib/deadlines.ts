/**
 * Estimated quarterly payment deadlines for a US tax year.
 * Statutory dates are the 15th of Apr/Jun/Sep and Jan 15 of the following
 * year; we don't model weekend/holiday shifts (these are estimates only).
 */

export interface QuarterlyDeadline {
  quarterKey: string; // "2026-Q1"
  quarterLabel: string; // "Q1"
  dueDate: string; // YYYY-MM-DD
  taxYear: number;
}

export function quarterlyDeadlines(taxYear: number): QuarterlyDeadline[] {
  return [
    { quarterKey: `${taxYear}-Q1`, quarterLabel: 'Q1', dueDate: `${taxYear}-04-15`, taxYear },
    { quarterKey: `${taxYear}-Q2`, quarterLabel: 'Q2', dueDate: `${taxYear}-06-15`, taxYear },
    { quarterKey: `${taxYear}-Q3`, quarterLabel: 'Q3', dueDate: `${taxYear}-09-15`, taxYear },
    { quarterKey: `${taxYear}-Q4`, quarterLabel: 'Q4', dueDate: `${taxYear + 1}-01-15`, taxYear },
  ];
}

export function quarterKeyForDate(isoDate: string, taxYear: number): string | null {
  const [y, m] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m) return null;
  if (y === taxYear && m <= 4) return `${taxYear}-Q1`;
  if (y === taxYear && m <= 6) return `${taxYear}-Q2`;
  if (y === taxYear && m <= 9) return `${taxYear}-Q3`;
  if (y === taxYear + 1 && m === 1) return `${taxYear}-Q4`;
  return null;
}

/** Days from today until the given date (negative = past). */
export function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86_400_000);
}

export interface DeadlineStatus extends QuarterlyDeadline {
  paid: number;
  daysLeft: number;
  isPaid: boolean;
}

export function deadlineStatuses(
  taxYear: number,
  payments: { quarter_key: string | null; amount: number }[],
): DeadlineStatus[] {
  return quarterlyDeadlines(taxYear).map((d) => {
    const paid = payments
      .filter((p) => p.quarter_key === d.quarterKey)
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      ...d,
      paid,
      daysLeft: daysUntil(d.dueDate),
      isPaid: paid > 0,
    };
  });
}