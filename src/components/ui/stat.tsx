import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'brand';
  className?: string;
}) {
  const iconTones = {
    neutral: 'bg-ink-100 text-ink-600',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    brand: 'bg-brand-100 text-brand-700',
  };
  return (
    <div className={cn('rounded-xl border border-ink-200 bg-white p-5 shadow-card', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p className="tabular mt-1.5 truncate text-2xl font-semibold tracking-tight text-ink-900">
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5', iconTones[tone])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}