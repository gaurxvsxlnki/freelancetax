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
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-sm disabled:hover:bg-brand-700',
  secondary:
    'bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 active:bg-ink-100 shadow-sm disabled:hover:bg-white',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200 disabled:hover:bg-transparent',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm disabled:hover:bg-red-600',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
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
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:cursor-not-allowed disabled:opacity-60',
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
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-brand-50 text-brand-800 ring-brand-200',
  purple: 'bg-violet-50 text-violet-800 ring-violet-200',
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
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
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
    <section className={cn('rounded-xl border border-ink-200 bg-white shadow-card', className)} {...rest}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-ink-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
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
    wrap: 'bg-brand-50 text-brand-900 ring-brand-200',
    icon: <IconAlert className="h-5 w-5 shrink-0 text-brand-700" />,
  },
  success: {
    wrap: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    icon: <IconCheck className="h-5 w-5 shrink-0 text-emerald-700" />,
  },
  warning: {
    wrap: 'bg-amber-50 text-amber-900 ring-amber-200',
    icon: <IconAlert className="h-5 w-5 shrink-0 text-amber-700" />,
  },
  danger: {
    wrap: 'bg-red-50 text-red-900 ring-red-200',
    icon: <IconAlert className="h-5 w-5 shrink-0 text-red-700" />,
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
    <div className={cn('flex items-start gap-3 rounded-lg p-4 text-sm ring-1 ring-inset', style.wrap, className)} role="alert">
      {style.icon}
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
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
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400 [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}