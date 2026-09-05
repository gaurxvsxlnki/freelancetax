import { cn } from '../lib/cn';
import { formatNumber } from '../lib/format';

/* Dark-theme chart tokens. Grid lines are barely-there; colour is reserved for
 * the data itself so charts read calmly against the black canvas. */
const GRID = 'rgba(255,255,255,0.055)';
const ZERO_LINE = 'rgba(255,255,255,0.16)';
const AXIS_TEXT = '#75757E';
const ACCENT = '#7076FF';
const POSITIVE = '#34D399';
const NEGATIVE = '#E5484D';

export interface ChartDatum {
  label: string;
  value: number;
}

/** Vertical bar chart rendered as pure SVG (monthly income, etc.). */
export function BarChart({
  data,
  height = 180,
  valueFormatter = formatNumber,
  className,
}: {
  data: ChartDatum[];
  height?: number;
  valueFormatter?: (n: number) => string;
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barGap = 8;
  const barWidth = 26;
  const chartWidth = data.length * (barWidth + barGap);
  const labelHeight = 18;

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div style={{ minWidth: Math.max(chartWidth, 320) }}>
        <svg width="100%" height={height + labelHeight} viewBox={`0 0 ${Math.max(chartWidth, 320)} ${height + labelHeight}`} role="img" aria-label="Bar chart">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2={Math.max(chartWidth, 320)}
              y1={height * (1 - f) + 4}
              y2={height * (1 - f) + 4}
              stroke={GRID}
              strokeWidth="1"
            />
          ))}
          {data.map((d, i) => {
            const barH = Math.max(2, (d.value / max) * height);
            const x = i * (barWidth + barGap) + barGap / 2;
            const y = height - barH + 4;
            return (
              <g key={d.label}>
                <title>{`${d.label}: ${valueFormatter(d.value)}`}</title>
                <rect x={x} y={y} width={barWidth} height={barH} rx="6" fill={ACCENT} opacity={d.value === 0 ? 0.12 : 0.92} />
                <text
                  x={x + barWidth / 2}
                  y={height + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill={AXIS_TEXT}
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Bar chart that supports negative values (monthly net income, etc.). A zero
 *  baseline is drawn mid-chart only when negatives actually exist. */
export function SignedBarChart({
  data,
  height = 180,
  valueFormatter = formatNumber,
  className,
}: {
  data: ChartDatum[];
  height?: number;
  valueFormatter?: (n: number) => string;
  className?: string;
}) {
  const values = data.map((d) => d.value);
  const hasNeg = values.some((v) => v < 0);
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const barGap = 8;
  const barWidth = 26;
  const chartWidth = data.length * (barWidth + barGap);
  const labelHeight = 18;
  const zeroY = hasNeg ? height / 2 : height;
  const scale = ((hasNeg ? height / 2 : height) - 4) / maxAbs;

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div style={{ minWidth: Math.max(chartWidth, 320) }}>
        <svg width="100%" height={height + labelHeight} viewBox={`0 0 ${Math.max(chartWidth, 320)} ${height + labelHeight}`} role="img" aria-label="Signed bar chart">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1="0" x2={Math.max(chartWidth, 320)} y1={height * (1 - f) + 4} y2={height * (1 - f) + 4} stroke={GRID} strokeWidth="1" />
          ))}
          {hasNeg && <line x1="0" x2={Math.max(chartWidth, 320)} y1={zeroY + 4} y2={zeroY + 4} stroke={ZERO_LINE} strokeWidth="1" />}
          {data.map((d, i) => {
            const barH = Math.max(2, Math.abs(d.value) * scale);
            const x = i * (barWidth + barGap) + barGap / 2;
            const positive = d.value >= 0;
            const y = positive ? zeroY - barH + 4 : zeroY + 4;
            return (
              <g key={d.label}>
                <title>{`${d.label}: ${valueFormatter(d.value)}`}</title>
                <rect x={x} y={y} width={barWidth} height={barH} rx="6" fill={positive ? POSITIVE : NEGATIVE} opacity={d.value === 0 ? 0.12 : 0.92} />
                <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* Muted-but-legible categorical palette for dark surfaces. */
const CATEGORY_COLORS = [
  '#7076FF',
  '#34D399',
  '#F5A524',
  '#E5484D',
  '#A78BFA',
  '#38BDF8',
  '#A3E635',
  '#F472B6',
  '#94949E',
  '#FB923C',
  '#5EEAD4',
];

export function categoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

/** Horizontal category breakdown with proportional bars. */
export function CategoryBreakdown({
  items,
  valueFormatter = formatNumber,
  emptyMessage = 'No data yet',
}: {
  items: { label: string; value: number }[];
  valueFormatter?: (n: number) => string;
  emptyMessage?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-500">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-ink-700">{item.label}</span>
            <span className="tabular shrink-0 text-ink-500">{valueFormatter(item.value)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full transition-all duration-500 ease-ios"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                backgroundColor: categoryColor(i),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}