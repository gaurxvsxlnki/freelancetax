import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { IconAlert, IconCheck, IconX } from '../icons';

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Filled accent — the single strongest element on any screen.
  primary:
    'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-600 disabled:hover:bg-brand-700',
  // Translucent dark with a hairline border (macOS secondary button).
  secondary:
    'bg-white/[0.06] text-ink-900 ring-1 ring-inset ring-white/10 backdrop-blur-sm hover:bg-white/[0.10] active:bg-white/[0.14] disabled:hover:bg-white/[0.06]',
  ghost: 'text-ink-700 hover:bg-white/[0.06] hover:text-ink-900 active:bg-white/[0.10] disabled:hover:bg-transparent',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-500 active:bg-red-600 disabled:hover:bg-red-600',
  subtle: 'bg-brand-700/15 text-brand-900 hover:bg-brand-700/25 active:bg-brand-700/30',
};

// Pill geometry: fully rounded at every size, generous touch targets.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-4.5 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center justify-center rounded-full font-medium',
        'transition-all duration-150 ease-ios active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Spinner className="h-4 w-4" />
      ) : (
        icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      )}
      {children}
    </button>
  );
}

/* ---------------------------------- Spinner --------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

/* ---------------------------------- Skeleton --------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

export function SkeletonBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  );
}

/* ---------------------------------- Badge --------------------------------- */

type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'purple';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.06] text-ink-600 ring-white/10',
  green: 'bg-emerald-600/12 text-emerald-600 ring-emerald-600/25',
  amber: 'bg-amber-500/12 text-amber-500 ring-amber-500/25',
  red: 'bg-red-500/12 text-red-500 ring-red-500/25',
  blue: 'bg-brand-700/15 text-brand-800 ring-brand-700/30',
  purple: 'bg-violet-800/12 text-violet-800 ring-violet-800/25',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-5 ring-1 ring-inset',
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------- Card --------------------------------- */

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
}

export function Card({ title, subtitle, actions, padded = true, className, children, ...rest }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-white/[0.07] bg-surface shadow-card',
        className
      )}
      {...rest}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

/* ---------------------------------- Alert --------------------------------- */

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const ALERT_STYLES: Record<AlertVariant, { wrap: string; icon: ReactNode }> = {
  info: {
    wrap: 'bg-brand-700/10 text-ink-900 ring-brand-700/25',
    icon: <IconAlert className="h-5 w-5 shrink-0 text-brand-800" />,
  },
  success: {
    wrap: 'bg-emerald-600/10 text-ink-900 ring-emerald-600/25',
    icon: <IconCheck className="h-5 w-5 shrink-0 text-emerald-600" />,
  },
  warning: {
    wrap: 'bg-amber-500/10 text-ink-900 ring-amber-500/25',
    icon: <IconAlert className="h-5 w-5 shrink-0 text-amber-500" />,
  },
  danger: {
    wrap: 'bg-red-500/10 text-ink-900 ring-red-500/25',
    icon: <IconAlert className="h-5 w-5 shrink-0 text-red-500" />,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className,
}: {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const style = ALERT_STYLES[variant];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl p-4 text-sm ring-1 ring-inset',
        style.wrap,
        className
      )}
      role="alert"
    >
      {style.icon}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="mt-0.5 text-ink-600">{children}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 rounded-full p-1 text-ink-500 transition-colors hover:bg-white/10 hover:text-ink-900"
          aria-label="Dismiss"
        >
          <IconX className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------- EmptyState --------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-ink-400 ring-1 ring-inset ring-white/[0.07] [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------ SegmentedControl ----------------------------- */

/**
 * iOS-style segmented control. Shared by the pricing interval switch, the
 * imports status filter, and the deductions filter so they stay consistent.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5 ring-1 ring-inset ring-white/[0.07]',
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full font-medium transition-all duration-150 ease-ios active:scale-[0.97]',
              size === 'sm' ? 'px-3 py-1 text-[12px]' : 'px-4 py-1.5 text-[13px]',
              active
                ? 'bg-white/[0.13] text-ink-900 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
