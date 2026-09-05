import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getBackend } from '../backend';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { PlanPill, UsageMeter, UpgradePromptModal } from '../components/billing';
import { PageHeader } from '../components/layout/AppShell';
import { Alert, Badge, Button, Card, Skeleton } from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/overlays';
import { formatDate } from '../lib/format';
import { expenseEntitlement, receiptEntitlement } from '../lib/subscription';
import { changeSubscription, openBillingPortal, startCheckout } from '../lib/billing-api';
import { IconSparkles } from '../components/icons';
import { PRO_MONTHLY_LABEL, PRO_YEARLY_LABEL, PRO_YEARLY_SAVING_PCT } from '../lib/constants';

const PRICE_LABEL = {
  month: `${PRO_MONTHLY_LABEL}/month`,
  year: `${PRO_YEARLY_LABEL}/year`,
} as const;

export function BillingPage() {
  const backend = getBackend();
  const { user } = useAuth();
  const toast = useToast();
  const { loading, subscription, usage, isPro, refresh, paymentsConfigured } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const justUpgraded = searchParams.get('checkout') === 'success';

  const expenseEnt = expenseEntitlement(usage, subscription);
  const receiptEnt = receiptEntitlement(usage, subscription);

  const run = async (
    key: string,
    fn: () => Promise<{ ok: boolean; url?: string; error?: string }>,
    okMsg: string,
    onSuccess?: () => void
  ) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong. Please try again.');
        return;
      }
      if (res.url) {
        window.location.assign(res.url);
        return;
      }
      if (okMsg) toast.success(okMsg);
      await refresh();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const upgrade = (interval: 'month' | 'year') =>
    void run('upgrade', () => startCheckout(interval), 'Welcome to FreelanceTax Pro!');

  if (loading) {
    return (
      <div>
        <PageHeader title="Billing" description="Your plan, usage, and subscription." />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Manage your plan and see how you're using it this month."
        actions={<PlanPill />}
      />

      {justUpgraded && (
        <Alert
          variant="success"
          title="Welcome to FreelanceTax Pro! 🎉"
          onClose={() => setSearchParams({}, { replace: true })}
          className="mb-6"
        >
          Your subscription is active. All Pro features are unlocked — thanks for supporting
          FreelanceTax.
        </Alert>
      )}

      {error && (
        <Alert variant="danger" title="Something went wrong" className="mb-6">
          {error}
        </Alert>
      )}

      {!paymentsConfigured && (
        <Alert variant="info" title="Payments aren't connected in this environment" className="mb-6">
          Real subscriptions require a Supabase project with Stripe credentials. Add{' '}
          <code className="rounded bg-ink-100 px-1">STRIPE_SECRET_KEY</code>,{' '}
          <code className="rounded bg-ink-100 px-1">STRIPE_WEBHOOK_SECRET</code>, and price ids to the
          server to activate checkout.
          {backend.isDemo && ' Demo mode data stays in your browser.'}
        </Alert>
      )}

      {subscription?.status === 'past_due' && (
        <Alert variant="danger" title="Your payment failed" className="mb-6">
          We couldn't charge your payment method. Update your billing information to keep Pro active
          — your access is preserved for now.
          <div className="mt-2">
            <Button size="sm" variant="secondary" loading={busy === 'portal'} onClick={() => void run('portal', openBillingPortal, '')}>
              Update billing info
            </Button>
          </div>
        </Alert>
      )}
      {subscription?.status === 'incomplete' && (
        <Alert variant="warning" title="Your subscription needs attention" className="mb-6">
          Your last checkout wasn't completed. Try upgrading again to finish setting up Pro.
        </Alert>
      )}
      {subscription?.cancel_at_period_end && isPro && (
        <Alert variant="warning" title="Your Pro plan is set to cancel" className="mb-6">
          Pro access continues until <strong>{formatDate(subscription.current_period_end ?? '')}</strong>.
          After that your account returns to the Free plan.
          <div className="mt-2">
            <Button size="sm" onClick={() => void run('reactivate', () => changeSubscription('reactivate'), 'Subscription reactivated')}>
              Reactivate Pro
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Plan card */}
        <Card
          title="Current plan"
          subtitle={isPro ? 'Unlimited tracking and all Pro features.' : 'Track income and expenses with monthly limits.'}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-ink-900">
                {isPro ? 'Pro' : 'Free'}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {isPro && subscription?.billing_interval
                  ? PRICE_LABEL[subscription.billing_interval]
                  : '$0 forever'}
              </p>
            </div>
            {subscription ? (
              <Badge
                tone={subscription.status === 'active' ? 'green' : subscription.status === 'past_due' ? 'red' : 'amber'}
              >
                {subscription.status === 'active' ? 'Active' : subscription.status.replace('_', ' ')}
              </Badge>
            ) : (
              <Badge tone="neutral">Free plan</Badge>
            )}
          </div>

          <dl className="mt-5 space-y-2 text-sm">
            {isPro && subscription?.current_period_end && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Next billing date</dt>
                <dd className="font-medium text-ink-900">{formatDate(subscription.current_period_end)}</dd>
              </div>
            )}
            {isPro && subscription?.cancel_at_period_end && subscription?.current_period_end && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Pro access ends</dt>
                <dd className="font-medium text-amber-700">{formatDate(subscription.current_period_end)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Account</dt>
              <dd className="font-medium text-ink-900">{user?.email}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            {isPro ? (
              <>
                <Button
                  variant="secondary"
                  loading={busy === 'portal'}
                  onClick={() => void run('portal', openBillingPortal, '')}
                >
                  Manage subscription
                </Button>
                {!subscription?.cancel_at_period_end && (
                  <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                    Cancel subscription
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button icon={<IconSparkles />} onClick={() => setUpgradeOpen(true)}>
                  Upgrade to Pro
                </Button>
                <Button variant="secondary" onClick={() => void upgrade('year')}>
                  {PRO_YEARLY_LABEL}/year — save ~{PRO_YEARLY_SAVING_PCT}%
                </Button>
              </>
            )}
          </div>
          {isPro && !paymentsConfigured && (
            <p className="mt-4 text-xs text-ink-400">
              Demo records don't reflect real payments. Connect Supabase + Stripe to manage a live
              subscription.
            </p>
          )}
        </Card>

        {/* Usage card */}
        <Card title="Monthly usage" subtitle={isPro ? 'Pro — no monthly limits.' : `Resets at the start of each month (${usage?.period ?? ''}).`}>
          {isPro ? (
            <div className="space-y-4 py-2 text-sm text-ink-600">
              <p>
                You're on the Pro plan, so nothing is capped this month. Nice.
              </p>
              <div className="space-y-4 rounded-xl bg-ink-50 p-4 ring-1 ring-inset ring-ink-100">
                <UsageMeter label="Expense transactions" used={expenseEnt.used} limit={null} unlimited />
                <UsageMeter label="Receipt scans" used={receiptEnt.used} limit={null} unlimited />
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-2">
              <UsageMeter label="Expense transactions" used={expenseEnt.used} limit={expenseEnt.limit} unlimited={false} />
              <UsageMeter label="Receipt scans" used={receiptEnt.used} limit={receiptEnt.limit} unlimited={false} />
              <div className="rounded-lg bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
                Hitting a limit? Expenses and receipt scans reset at the start of each month.
                Upgrade to Pro any time for unlimited usage.
              </div>
              <Button icon={<IconSparkles />} onClick={() => setUpgradeOpen(true)}>
                Compare plans &amp; upgrade
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 rounded-xl border border-ink-200 bg-ink-50/60 p-4 text-xs leading-relaxed text-ink-500">
        Payments are processed securely by Stripe — FreelanceTax never stores your card details. You
        can update payment methods, download invoices, and cancel from Stripe's billing portal.
      </div>

      <UpgradePromptModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Go unlimited with Pro"
        description="Remove monthly expense and receipt-scan limits, unlock CSV export and annual reports, and get advanced deduction insights."
      />

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel your Pro subscription?"
        message={
          <>
            You'll keep Pro access until the end of your current billing period (
            {subscription?.current_period_end ? formatDate(subscription.current_period_end) : 'your billing period'}
            ), then your account returns to the Free plan. Your data stays safe.
          </>
        }
        confirmLabel="Cancel subscription"
        loading={busy === 'cancel'}
        onConfirm={() => {
          void run(
            'cancel',
            () => changeSubscription('cancel'),
            'Subscription cancelled — Pro access continues until the end of your billing period',
            () => setConfirmCancel(false)
          );
        }}
      />
    </div>
  );
}
