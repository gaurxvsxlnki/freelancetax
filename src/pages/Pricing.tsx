import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { Seo } from '../components/Seo';
import { MarketingFooter, MarketingNav } from '../components/marketing';
import { Alert, Badge, Button } from '../components/ui/primitives';
import { startCheckout, type BillingInterval } from '../lib/billing-api';
import {
  PRO_MONTHLY_LABEL,
  PRO_YEARLY_LABEL,
  PRO_YEARLY_PER_MONTH_LABEL,
  PRO_YEARLY_SAVING_LABEL,
  PRO_YEARLY_SAVING_PCT,
} from '../lib/constants';
import { IconCheck, IconMinus } from '../components/icons';
import { cn } from '../lib/cn';

interface FeatureRow {
  feature: string;
  free: string | boolean;
  pro: string | boolean;
}

const ROWS: FeatureRow[] = [
  { feature: 'Income tracking', free: true, pro: true },
  { feature: 'Expense tracking', free: '20 / month', pro: 'Unlimited' },
  { feature: 'Receipt scans', free: '5 / month', pro: 'Unlimited' },
  { feature: 'AI deduction insights', free: 'Basic', pro: 'Advanced' },
  { feature: 'Tax estimates', free: 'Basic', pro: 'Advanced' },
  { feature: 'Dashboard & analytics', free: 'Basic', pro: 'Advanced' },
  { feature: 'Annual reports & CSV export', free: false, pro: true },
  { feature: 'Tax deadline reminders', free: false, pro: true },
];

export function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isPro, subscription, paymentsConfigured } = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [busy, setBusy] = useState<BillingInterval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const choose = async (billing: BillingInterval) => {
    setError(null);
    if (!user) {
      navigate(`/signup?plan=${billing}`);
      return;
    }
    setBusy(billing);
    try {
      const res = await startCheckout(billing);
      if (!res.ok || !res.url) {
        setError(res.error ?? 'Could not start checkout. Please try again.');
        return;
      }
      setStarted(true);
      window.location.assign(res.url);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Seo
        title="FreelanceTax Pricing — Free & Pro Plans"
        description="Start free with 20 expenses and 5 receipt scans a month, or upgrade to Pro for unlimited tracking, AI deduction insights, reports, and CSV export."
      />
      <MarketingNav />

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-ink-900">Pricing</h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-ink-600">
            Start free, upgrade when you're ready. Every plan keeps your data private and organized.
          </p>
        </div>

        {isPro && (
          <Alert variant="success" title="You're on Pro" className="mx-auto mt-8 max-w-2xl">
            Thanks for supporting FreelanceTax. Manage your subscription from the{' '}
            <Link to="/billing" className="font-medium underline">billing page</Link>.
          </Alert>
        )}
        {error && (
          <Alert variant="danger" title="Couldn't start checkout" className="mx-auto mt-8 max-w-2xl">
            {error}
          </Alert>
        )}
        {!paymentsConfigured && user && (
          <Alert variant="info" title="Payments are not configured yet" className="mx-auto mt-8 max-w-2xl">
            This project hasn't been connected to Stripe yet, so real checkouts aren't available in
            this environment. Add the billing secrets (see .env.example / supabase docs) to go live.
          </Alert>
        )}

        {/* Billing toggle */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <button
            onClick={() => setInterval('month')}
            className={cn('rounded-lg px-4 py-2 text-sm font-medium', interval === 'month' ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('year')}
            className={cn('rounded-lg px-4 py-2 text-sm font-medium', interval === 'year' ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
          >
            Annual
            <Badge tone="green" className="ml-2">Save ~{PRO_YEARLY_SAVING_PCT}%</Badge>
          </button>
        </div>

        {/* Plan cards */}
        <div className="mx-auto mt-8 grid max-w-3xl gap-6 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-ink-200 bg-white p-8 shadow-card">
            <p className="text-lg font-semibold text-ink-900">Free</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">$0</p>
            <p className="mt-1 text-sm text-ink-500">forever</p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-700">
              <PlanLine ok>Income tracking</PlanLine>
              <PlanLine ok>Expense tracking · 20/month</PlanLine>
              <PlanLine ok>Receipt scans · 5/month</PlanLine>
              <PlanLine ok>Basic deduction insights</PlanLine>
              <PlanLine ok>Basic tax estimate</PlanLine>
              <PlanLine ok={false}>CSV export</PlanLine>
              <PlanLine ok={false}>Annual reports</PlanLine>
            </ul>
            {user ? (
              <Button variant="secondary" fullWidth size="lg" className="mt-8" disabled>
                {isPro ? 'Your current plan is Pro' : 'Your current plan'}
              </Button>
            ) : (
              <Link to="/signup">
                <Button variant="secondary" fullWidth size="lg" className="mt-8">
                  Start free
                </Button>
              </Link>
            )}
          </div>

          <div className="relative flex flex-col rounded-2xl border-2 border-brand-700 bg-white p-8 shadow-pop">
            <Badge tone="blue" className="absolute -top-3 left-8">RECOMMENDED</Badge>
            <div className="flex items-baseline justify-between">
              <p className="text-lg font-semibold text-ink-900">Pro</p>
              <p className="text-xs text-ink-400">
                {interval === 'year' ? `billed ${PRO_YEARLY_LABEL} yearly` : 'billed monthly'}
              </p>
            </div>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">
              {interval === 'year' ? PRO_YEARLY_LABEL : PRO_MONTHLY_LABEL}
              <span className="text-base font-normal text-ink-500">
                {interval === 'year' ? '/year' : '/month'}
              </span>
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              {interval === 'year'
                ? `≈ ${PRO_YEARLY_PER_MONTH_LABEL}/month — save ${PRO_YEARLY_SAVING_LABEL} a year`
                : `or ${PRO_YEARLY_LABEL}/year with annual billing`}
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-700">
              <PlanLine ok>Unlimited income &amp; expenses</PlanLine>
              <PlanLine ok>Unlimited receipt scans</PlanLine>
              <PlanLine ok>AI deduction insights</PlanLine>
              <PlanLine ok>Advanced tax estimates</PlanLine>
              <PlanLine ok>Annual reports &amp; CSV export</PlanLine>
              <PlanLine ok>Tax deadline reminders</PlanLine>
              <PlanLine ok>Priority support</PlanLine>
            </ul>
            <Button
              fullWidth
              size="lg"
              className="mt-8"
              loading={busy === interval}
              disabled={busy !== null || (user != null && isPro && subscription?.status === 'active')}
              onClick={() => void choose(interval)}
            >
              {user ? (isPro ? 'Manage subscription' : 'Upgrade to Pro') : 'Choose Pro'}
            </Button>
            {user && isPro && subscription?.status === 'active' && (
              <p className="mt-2 text-center text-xs text-ink-400">
                You're already on Pro — head to{' '}
                <Link to="/billing" className="font-medium text-brand-700 hover:underline">billing</Link> to
                manage it.
              </p>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-ink-400">
          {started ? 'Redirecting to secure checkout…' : 'Secure checkout powered by Stripe. Prices in USD. Cancel anytime.'}
        </p>

        {/* Comparison table */}
        <div className="mt-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-900">Compare plans</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-200">
            <table className="w-full min-w-[520px] bg-white text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/70">
                  <th className="px-6 py-4 font-medium text-ink-500">Feature</th>
                  <th className="w-36 px-6 py-4 font-semibold text-ink-900">Free</th>
                  <th className="w-36 bg-brand-50 px-6 py-4 font-semibold text-brand-800">Pro</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.feature} className="border-b border-ink-100 last:border-0">
                    <td className="px-6 py-3.5 text-ink-700">{r.feature}</td>
                    <td className="px-6 py-3.5"><CellValue value={r.free} muted /></td>
                    <td className="bg-brand-50/60 px-6 py-3.5"><CellValue value={r.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-10 rounded-xl bg-ink-50 p-4 text-center text-xs leading-relaxed text-ink-500">
          Estimates and deduction insights are informational only and are not tax advice. Consult a
          qualified tax professional for your situation.
        </p>
      </section>

      <MarketingFooter />
    </div>
  );
}

function CellValue({ value, muted = false }: { value: string | boolean; muted?: boolean }) {
  if (value === true) return <IconCheck className="h-5 w-5 text-emerald-600" aria-label="Included" />;
  if (value === false) return <IconMinus className="h-5 w-5 text-ink-300" aria-label="Not included" />;
  return <span className={cn('font-medium', muted ? 'text-ink-600' : 'text-ink-900')}>{value}</span>;
}

function PlanLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-start gap-2.5', !ok && 'text-ink-400')}>
      {ok ? (
        <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <IconMinus className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />
      )}
      <span>{children}</span>
    </li>
  );
}
