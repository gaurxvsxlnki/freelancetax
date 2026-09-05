import { Link, useNavigate } from 'react-router-dom';
import { useSubscription } from '../context/SubscriptionContext';
import { getBackend } from '../backend';
import { cn } from '../lib/cn';
import { formatNumber } from '../lib/format';
import { PRO_MONTHLY_LABEL, PRO_YEARLY_LABEL, PRO_YEARLY_SAVING_PCT } from '../lib/constants';
import { Badge, Button } from './ui/primitives';
import { Modal } from './ui/overlays';
import { IconSparkles } from './icons';

/** Small pill shown next to the user identity (FREE / PRO). */
export function PlanPill({ className }: { className?: string }) {
  const { isPro } = useSubscription();
  return (
    <Badge tone={isPro ? 'green' : 'neutral'} className={className}>
      {isPro ? 'PRO' : 'FREE'}
    </Badge>
  );
}

/** Horizontal usage bar: "Expenses · 14 / 20" (or "Unlimited" for Pro). */
export function UsageMeter({
  label,
  used,
  limit,
  unlimited,
}: {
  label: string;
  used: number;
  limit: number | null;
  unlimited: boolean;
}) {
  if (unlimited || limit === null) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="font-medium text-ink-500">Unlimited</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const atLimit = used >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-700">{label}</span>
        <span className={cn('tabular font-medium', atLimit ? 'text-amber-700' : 'text-ink-500')}>
          {formatNumber(used)} / {formatNumber(limit)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/40 shadow-well">
        <div
          className={cn('h-full rounded-full transition-all', atLimit ? 'bg-amber-500' : 'bg-brand-600')}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Shown when a Free-plan limit or Pro feature is reached. Never opens on its
 * own — callers decide when the entitlement check fails.
 */
export function UpgradePromptModal({
  open,
  onClose,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { paymentsConfigured } = useSubscription();
  const backend = getBackend();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="FreelanceTax Pro"
      size="sm"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button icon={<IconSparkles />} onClick={() => navigate('/pricing')}>
            Upgrade to Pro
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {backend.isDemo && (
          <div className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <strong>Demo mode.</strong> Payments aren't connected here, so subscriptions can't be
            activated from this environment. Connect Supabase + Stripe to go live.
          </div>
        )}
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700/15 text-brand-800">
            <IconSparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-ink-900">{title}</p>
            <div className="mt-1 text-sm leading-relaxed text-ink-600">{description}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.07] p-4 text-sm">
          <div>
            <p className="font-medium text-ink-900">Pro</p>
            <p className="mt-1 text-ink-500">Unlimited expenses &amp; receipt scans</p>
            <p className="mt-1 text-ink-500">AI deduction insights &amp; reports</p>
            <p className="mt-1 text-ink-500">CSV export</p>
          </div>
          <div className="border-l border-white/[0.06] pl-4">
            <p className="font-medium text-ink-900">{PRO_MONTHLY_LABEL}<span className="text-xs text-ink-500">/mo</span></p>
            <p className="mt-1 text-ink-500">or {PRO_YEARLY_LABEL}/year</p>
            <p className="mt-1 text-xs text-emerald-700">Save ~{PRO_YEARLY_SAVING_PCT}% annually</p>
          </div>
        </div>
        {paymentsConfigured ? (
          <p className="text-xs text-ink-400">
            You'll complete checkout securely with Stripe. No card details are stored in
            FreelanceTax.
          </p>
        ) : (
          <p className="text-xs text-ink-400">
            View the pricing page to compare plans. Activating Pro requires payment credentials
            on the server.
          </p>
        )}
      </div>
    </Modal>
  );
}

export function PricingLink({ className }: { className?: string }) {
  return (
    <Link to="/pricing" className={cn('text-sm font-medium text-brand-700 hover:underline', className)}>
      Compare plans
    </Link>
  );
}