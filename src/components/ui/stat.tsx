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
    neutral: 'bg-white/[0.06] text-ink-500 ring-white/[0.07]',
    green: 'bg-emerald-600/12 text-emerald-600 ring-emerald-600/20',
    amber: 'bg-amber-500/12 text-amber-500 ring-amber-500/20',
    red: 'bg-red-500/12 text-red-500 ring-red-500/20',
    brand: 'bg-brand-700/15 text-brand-800 ring-brand-700/25',
  };
  return (
    <div
      className={cn(
        'group rounded-2xl border border-white/[0.07] bg-surface p-5',
        'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.045),0_1px_2px_0_rgb(0_0_0/0.6)]',
        'transition-colors duration-200 ease-ios hover:border-white/[0.12]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-500">{label}</p>
          <p className="tabular mt-2 truncate text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink-900">
            {value}
          </p>
          {sub && <p className="mt-1.5 text-[12px] text-ink-400">{sub}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-neu ring-1 ring-inset [&>svg]:h-5 [&>svg]:w-5',
              iconTones[tone]
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
