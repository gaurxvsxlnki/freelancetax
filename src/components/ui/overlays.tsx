import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { Button } from './primitives';
import { IconX } from '../icons';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Mobile: bottom sheet that slides up. Desktop: centered dialog. */}
      <div
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden',
          'rounded-t-3xl border border-white/10 bg-surface-3/95 shadow-pop backdrop-blur-xl',
          'animate-sheet-up sm:animate-scale-in sm:rounded-3xl',
          SIZES[size]
        )}
      >
        {/* Grab handle — iOS sheet affordance, mobile only. */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <div className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
            {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full bg-white/[0.06] p-1.5 text-ink-500 transition-colors hover:bg-white/[0.12] hover:text-ink-900"
            aria-label="Close dialog"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer && (
          <div className="border-t border-white/[0.07] bg-white/[0.02] px-5 py-4 pb-safe sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading} fullWidth className="sm:w-auto">
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading} fullWidth className="sm:w-auto">
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-sm leading-relaxed text-ink-600">{message}</div>
    </Modal>
  );
}
