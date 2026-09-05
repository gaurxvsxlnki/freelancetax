import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getBackend } from '../backend';
import { useAuth } from './AuthContext';
import { effectivePlan, isEffectivePro } from '../lib/subscription';
import type { Subscription, SubscriptionPlan, SubscriptionStatus, UsageInfo } from '../lib/types';

export interface BillingState {
  /** True while the plan/usage is being loaded for the first time. */
  loading: boolean;
  subscription: Subscription | null;
  usage: UsageInfo | null;
  plan: SubscriptionPlan;
  /** Effective Pro access (active/trialing/past_due honored). */
  isPro: boolean;
  /** Detailed provider status, or null-equivalent for Free users. */
  status: SubscriptionStatus | null;
  /** Whether real payments can be processed in this environment. */
  paymentsConfigured: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<BillingState | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const backend = getBackend();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setUsage(null);
      setLoading(false);
      return;
    }
    try {
      const [sub, usg] = await Promise.all([backend.getSubscription(), backend.getUsage()]);
      setSubscription(sub);
      setUsage(usg);
    } catch {
      // Keep whatever we had; the UI treats failures as Free rather than blocking.
      setSubscription((prev) => prev ?? null);
      setUsage((prev) => prev ?? null);
    } finally {
      setLoading(false);
    }
  }, [backend, user]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const value = useMemo<BillingState>(() => {
    const pro = isEffectivePro(subscription);
    return {
      loading,
      subscription,
      usage,
      plan: effectivePlan(subscription),
      isPro: pro,
      status: subscription ? subscription.status : null,
      paymentsConfigured: !backend.isDemo,
      refresh: load,
    };
  }, [backend.isDemo, load, loading, subscription, usage]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): BillingState {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}
