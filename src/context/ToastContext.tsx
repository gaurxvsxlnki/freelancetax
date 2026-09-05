import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { IconAlert, IconCheck, IconX } from '../components/icons';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastVariant, { wrap: string; icon: ReactNode }> = {
  success: {
    wrap: 'border-emerald-200 bg-white',
    icon: <IconCheck className="h-5 w-5 text-emerald-600" />,
  },
  error: {
    wrap: 'border-red-200 bg-white',
    icon: <IconAlert className="h-5 w-5 text-red-600" />,
  },
  info: {
    wrap: 'border-brand-200 bg-white',
    icon: <IconAlert className="h-5 w-5 text-brand-600" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, description?: string) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((prev) => [...prev.slice(-3), { id, variant, title, description }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  const api: ToastApi = {
    success: (title, description) => push('success', title, description),
    error: (title, description) => push('error', title, description),
    info: (title, description) => push('info', title, description),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:pr-6 sm:pb-6" aria-live="polite">
        {toasts.map((t) => {
          const style = STYLES[t.variant];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-pop',
                style.wrap
              )}
              role={t.variant === 'error' ? 'alert' : 'status'}
            >
              <div className="shrink-0">{style.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-ink-500">{t.description}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                aria-label="Dismiss notification"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}