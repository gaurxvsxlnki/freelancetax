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

const STYLES: Record<ToastVariant, { icon: ReactNode }> = {
  success: { icon: <IconCheck className="h-[18px] w-[18px] text-emerald-600" /> },
  error: { icon: <IconAlert className="h-[18px] w-[18px] text-red-500" /> },
  info: { icon: <IconAlert className="h-[18px] w-[18px] text-brand-800" /> },
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
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] sm:items-end sm:p-6 sm:pb-6"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const style = STYLES[t.variant];
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl',
                'border border-white/10 bg-surface-3/90 px-3.5 py-3 shadow-pop backdrop-blur-xl',
                'animate-toast-in'
              )}
              role={t.variant === 'error' ? 'alert' : 'status'}
            >
              <div className="mt-0.5 shrink-0">{style.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-ink-900">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-[12px] leading-snug text-ink-500">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="-mr-1 shrink-0 rounded-full p-1 text-ink-400 transition-colors hover:bg-white/10 hover:text-ink-900"
                aria-label="Dismiss notification"
              >
                <IconX className="h-3.5 w-3.5" />
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