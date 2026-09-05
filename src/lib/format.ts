const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat('en-US');

/** $1,234 (rounded dollars, tabular) */
export function money(n: number): string {
  return usd.format(roundMoney(n));
}

/** $1,234.56 with cents — used for line items like business-use amounts */
export function moneyCents(n: number): string {
  return usdCents.format(roundMoney(n));
}

export function formatNumber(n: number): string {
  return num.format(Math.round(n));
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatPercent(n: number): string {
  return `${Math.round(n)}%`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-04-15' -> 'Apr 15, 2026' */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** '2026-04-15' -> 'April 15, 2026' */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatMonth(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthLabel(monthIndex0: number): string {
  return MONTHS[monthIndex0] ?? '';
}

export function monthLongLabel(monthIndex0: number): string {
  return MONTHS_LONG[monthIndex0] ?? '';
}

export function parseIsoDate(iso: string): Date | null {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function todayISO(): string {
  const now = new Date();
  return toISO(now);
}

export function toISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** '2026-04-15' -> '2026-04' */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Parse user-entered amount like "1,250.50" or "$40" into a number. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return roundMoney(value);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}