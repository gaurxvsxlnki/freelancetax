import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-[13px] font-medium text-ink-600">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[13px] text-red-500" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] leading-relaxed text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Shared control surface. Dark translucent fill, hairline border, and an
 * accent focus ring. `appearance-none` strips the light browser chrome so
 * selects and inputs match across Safari/Chrome/Firefox.
 */
const controlBase =
  'w-full appearance-none rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 text-sm text-ink-900 ' +
  'transition-all duration-150 ease-ios ' +
  'placeholder:text-ink-400 hover:border-white/[0.14] hover:bg-white/[0.06] ' +
  'focus:border-brand-700 focus:bg-white/[0.06] focus:outline-none focus:ring-4 focus:ring-brand-700/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: ReactNode;
}

export function Input({ className, prefix, ...rest }: InputProps) {
  if (prefix) {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm text-ink-500">
          {prefix}
        </div>
        <input className={cn(controlBase, 'h-11 pl-8', className)} {...rest} />
      </div>
    );
  }
  return <input className={cn(controlBase, 'h-11', className)} {...rest} />;
}

type SelectOption = string | { value: string; label: string };

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[] | SelectOption[];
  placeholder?: string;
}

/** Custom chevron because `appearance-none` removes the native one. */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394949E' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";

export function Select({ className, options, placeholder, ...rest }: SelectProps) {
  return (
    <select
      className={cn(controlBase, 'h-11 cursor-pointer bg-no-repeat pr-10', className)}
      style={{
        backgroundImage: CHEVRON,
        backgroundPosition: 'right 0.75rem center',
      }}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const value = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, 'py-2.5 leading-relaxed', className)} rows={3} {...rest} />;
}

/** iOS-style switch. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-xl p-2.5 text-left transition-colors duration-150 hover:bg-white/[0.04]"
    >
      <span className="min-w-0">
        {label && <span className="block text-sm font-medium text-ink-900">{label}</span>}
        {description && <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-500">{description}</span>}
      </span>
      <span
        className={cn(
          'relative mt-0.5 inline-flex h-[30px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 ease-ios',
          checked ? 'bg-emerald-600' : 'bg-white/[0.14]'
        )}
      >
        <span
          className={cn(
            'inline-block h-[26px] w-[26px] transform rounded-full bg-surface shadow-md transition-transform duration-200 ease-ios',
            checked ? 'translate-x-[23px]' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  );
}
