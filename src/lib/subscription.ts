import { FREE_EXPENSES_PER_MONTH, FREE_RECEIPT_SCANS_PER_MONTH } from './constants';
import type { Subscription, SubscriptionPlan, SubscriptionStatus, UsageInfo } from './types';

/** Statuses where Pro access is honored. past_due keeps access (grace period). */
const PRO_HONORED: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

export function isEffectivePro(subscription: Subscription | null): boolean {
  return Boolean(
    subscription &&
      subscription.plan === 'pro' &&
      PRO_HONORED.includes(subscription.status)
  );
}

/** Effective plan for display/decisions: null subscription => Free. */
export function effectivePlan(subscription: Subscription | null): SubscriptionPlan {
  return isEffectivePro(subscription) ? 'pro' : 'free';
}

export interface Entitlement {
  allowed: boolean;
  /** Set when a limit blocks the action. */
  limit: number | null;
  used: number;
  unlimited: boolean;
}

export function expenseEntitlement(
  usage: UsageInfo | null,
  subscription: Subscription | null
): Entitlement {
  const unlimited = isEffectivePro(subscription);
  return {
    allowed: unlimited || (usage?.expensesUsed ?? 0) < (usage?.expensesLimit ?? FREE_EXPENSES_PER_MONTH),
    limit: usage?.expensesLimit ?? FREE_EXPENSES_PER_MONTH,
    used: usage?.expensesUsed ?? 0,
    unlimited,
  };
}

export function receiptEntitlement(
  usage: UsageInfo | null,
  subscription: Subscription | null
): Entitlement {
  const unlimited = isEffectivePro(subscription);
  return {
    allowed: unlimited || (usage?.receiptScansUsed ?? 0) < (usage?.receiptScansLimit ?? FREE_RECEIPT_SCANS_PER_MONTH),
    limit: usage?.receiptScansLimit ?? FREE_RECEIPT_SCANS_PER_MONTH,
    used: usage?.receiptScansUsed ?? 0,
    unlimited,
  };
}

export function subscriptionStatusLabel(subscription: Subscription | null): {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'neutral' | 'blue';
} {
  if (!subscription) return { label: 'Free plan', tone: 'neutral' };
  switch (subscription.status) {
    case 'active':
      return { label: 'Active', tone: 'green' };
    case 'trialing':
      return { label: 'Trial', tone: 'blue' };
    case 'past_due':
      return { label: 'Payment issue', tone: 'red' };
    case 'incomplete':
      return { label: 'Payment incomplete', tone: 'amber' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'amber' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
  }
}
