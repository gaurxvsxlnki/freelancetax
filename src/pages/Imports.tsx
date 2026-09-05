import { useEffect, useMemo, useState } from 'react';
import { getBackend } from '../backend';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../lib/useAsync';
import {
  applyOverrides,
  CLASSIFICATION_LABEL,
  guessForMerchant,
  merchantKey,
} from '../lib/categorize';
import { money, moneyCents, formatDate, pluralize } from '../lib/format';
import type { ImportedTransaction, LinkedAccount, TxnClassification } from '../lib/types';
import { PageHeader } from '../components/layout/AppShell';
import { Alert, Badge, Button, Card, EmptyState, SegmentedControl, Skeleton } from '../components/ui/primitives';
import { Select } from '../components/ui/forms';
import { ConfirmDialog } from '../components/ui/overlays';
import { UpgradePromptModal } from '../components/billing';
import {
  connectStripeIncome,
  disconnectBankAccount,
  disconnectIncomeAccount,
  exchangePlaid,
  finishStripeIncome,
  getPlaidLinkToken,
  openPlaidLink,
  syncBankAccount,
  syncIncomeAccount,
} from '../lib/integration-api';
import { IconLink, IconRefresh, IconTrash, IconUnlink } from '../components/icons';
import { cn } from '../lib/cn';

const CLASS_TONE: Record<TxnClassification, 'green' | 'amber' | 'neutral'> = {
  business: 'green',
  review: 'amber',
  personal: 'neutral',
};

const PROVIDER_LABEL: Record<string, string> = {
  plaid: 'Bank (Plaid)',
  stripe: 'Stripe income',
  paypal: 'PayPal',
  other: 'Manual',
};

export function ImportsPage() {
  const backend = getBackend();
  const toast = useToast();
  const { isPro } = useSubscription();
  const { data, loading, error, reload } = useAsync(async () => {
    const [accounts, transactions, overrides] = await Promise.all([
      backend.listLinkedAccounts(),
      backend.listTransactions(),
      backend.listCategoryOverrides(),
    ]);
    return { accounts, transactions, overrides };
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [connecting, setConnecting] = useState<'bank' | 'stripe' | null>(null);

  // Stripe OAuth bounces back to /imports?code=…&state=… — finish the link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? '';
    if (!code) return;
    setConnecting('stripe');
    void (async () => {
      try {
        const res = await finishStripeIncome(code, state);
        if (res.ok) {
          toast.success('Stripe connected', typeof res.data?.message === 'string' ? String(res.data.message) : undefined);
        } else {
          toast.error('Could not connect Stripe', res.error);
        }
        await reload();
      } catch (err) {
        toast.error('Could not connect Stripe', err instanceof Error ? err.message : undefined);
      } finally {
        setConnecting(null);
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'reviewed' | 'ignored' | 'all'>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disconnectTarget, setDisconnectTarget] = useState<LinkedAccount | null>(null);

  // per-row category choice (initialized lazily from the suggestion)
  const [categoryFor, setCategoryFor] = useState<Record<string, string>>({});
  const [bulkCategory, setBulkCategory] = useState('');

  const byId = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);
  const accounts = data?.accounts ?? [];
  const transactions = data?.transactions ?? [];
  const overrides = data?.overrides ?? [];

  const pending = useMemo(() => transactions.filter((t) => t.status === 'pending'), [transactions]);
  const pendingValue = pending.reduce((s, t) => s + t.amount, 0);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return transactions;
    return transactions.filter((t) => t.status === statusFilter);
  }, [transactions, statusFilter]);

  const categoryOptions = useMemo(
    () => (statusFilter !== 'pending' ? [] : ['Software', 'Equipment', 'Advertising', 'Office', 'Internet', 'Phone', 'Transportation', 'Travel', 'Professional services', 'Education', 'Food & dining', 'Other']),
    [statusFilter]
  );

  const suggestion = (t: ImportedTransaction) => {
    const base = guessForMerchant(t.merchant, t.kind);
    return applyOverrides(base, t.merchant, overrides);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const review = async (t: ImportedTransaction, action: 'business' | 'income' | 'personal' | 'ignore', chosenCategory?: string) => {
    setBusy(`review-${t.id}`);
    try {
      if (action === 'ignore') {
        await backend.reviewTransaction({ transactionId: t.id, action: 'ignore' });
        toast.success('Ignored', `${t.merchant} won't be added to your records`);
        await reload();
        return;
      }
      const cat = chosenCategory ?? categoryFor[t.id] ?? suggestion(t).category;
      const guess = action === 'personal' ? suggestion(t) : null;
      // Remember corrections that differ from the suggestion.
      const key = merchantKey(t.merchant);
      if (key && action !== 'personal' && cat && cat !== (t.suggested_category ?? guess?.category)) {
        await backend.saveCategoryOverride({
          merchant_key: key,
          category: cat,
          classification: 'business',
        });
      }
      await backend.reviewTransaction({
        transactionId: t.id,
        action,
        category: cat,
      });
      toast.success(
        action === 'business' || action === 'income' ? 'Added from import' : 'Marked as personal',
        action === 'business' || action === 'income' ? `${t.merchant} · ${moneyCents(t.amount)}` : undefined
      );
      await reload();
    } catch (err) {
      toast.error('Could not update this transaction', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const bulkReview = async (action: 'business' | 'income' | 'personal') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(`bulk-${action}`);
    try {
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        const t = transactions.find((x) => x.id === id);
        if (!t) continue;
        // "Add to expenses" on a mixed selection must add income rows as
        // income, otherwise the backend rejects them and the loop aborts.
        const rowAction =
          action === 'personal' ? 'personal' : t.kind === 'income' ? 'income' : 'business';
        const cat = rowAction === 'personal' ? undefined : bulkCategory || suggestion(t).category;
        try {
          await backend.reviewTransaction({ transactionId: id, action: rowAction, category: cat });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0) toast.success(`${ok} ${pluralize(ok, 'transaction')} updated`);
      if (failed > 0) {
        toast.error(
          `${failed} ${pluralize(failed, 'transaction')} could not be updated`,
          'They were left pending — try them individually.'
        );
      }
      setSelected(new Set());
      setBulkCategory('');
      await reload();
    } catch (err) {
      toast.error('Could not update the selection', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const runConnect = async (kind: 'bank' | 'stripe') => {
    if (!isPro) {
      setUpgradeOpen(true);
      return;
    }
    setConnecting(kind);
    try {
      const res = kind === 'bank' ? await getPlaidLinkToken() : await connectStripeIncome();
      if (!res.ok) {
        toast.error(kind === 'bank' ? 'Could not start the bank connection' : 'Could not start the income connection', res.error);
        return;
      }
      // Provider-hosted flow (Stripe OAuth): just redirect.
      const url = res.url ?? (res.data?.url ? String(res.data.url) : '');
      if (kind === 'stripe' && url) {
        window.location.assign(url);
        return;
      }
      // Plaid: open the Link popup with the token, then exchange it.
      const token = res.data?.link_token ? String(res.data.link_token) : '';
      if (kind === 'bank' && token) {
        const linked = await openPlaidLink(token, (payload) => exchangePlaid(payload));
        if (!linked.ok) {
          toast.error('Bank connection failed', linked.error);
        } else {
          toast.success('Bank connected', typeof linked.data?.message === 'string' ? String(linked.data.message) : undefined);
        }
        await reload();
        return;
      }
      toast.error('Could not start the connection', 'The connection service returned an unexpected response.');
    } finally {
      setConnecting(null);
    }
  };

  const runSync = async (account: LinkedAccount) => {
    setBusy(`sync-${account.id}`);
    try {
      // Route by PROVIDER, not by kind — an income account could belong to a
      // provider we have no sync function for (e.g. PayPal).
      const res =
        account.provider === 'plaid'
          ? await syncBankAccount(account.id)
          : account.provider === 'stripe'
            ? await syncIncomeAccount(account.id)
            : { ok: false as const, error: `Syncing ${PROVIDER_LABEL[account.provider] ?? account.provider} accounts isn't supported yet.` };
      if (!res.ok) {
        toast.error('Sync failed', res.error);
      } else {
        toast.success('Synced', `${res.data?.imported ?? 0} new transactions imported`);
      }
      await reload();
    } catch (err) {
      toast.error('Sync failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const runDisconnect = async () => {
    if (!disconnectTarget) return;
    setBusy(`disconnect-${disconnectTarget.id}`);
    try {
      const res =
        disconnectTarget.provider === 'plaid'
          ? await disconnectBankAccount(disconnectTarget.id)
          : disconnectTarget.provider === 'stripe'
            ? await disconnectIncomeAccount(disconnectTarget.id)
            : {
                ok: false as const,
                error: `Disconnecting ${PROVIDER_LABEL[disconnectTarget.provider] ?? disconnectTarget.provider} accounts isn't supported yet.`,
              };
      if (!res.ok) {
        toast.error('Could not disconnect', res.error);
        return;
      }
      toast.success('Connection removed');
      setDisconnectTarget(null);
      await reload();
    } catch (err) {
      toast.error('Could not disconnect', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Imports"
        description="Connect your bank or income platforms and turn imported transactions into organized records."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<IconLink />} loading={connecting === 'bank'} onClick={() => void runConnect('bank')}>
              Connect bank
            </Button>
            <Button icon={<IconLink />} loading={connecting === 'stripe'} onClick={() => void runConnect('stripe')}>
              Connect income
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="danger" title="Couldn't load your connections" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Accounts */}
      <Card
        title="Connected accounts"
        subtitle={accounts.length === 0 ? 'Nothing connected yet.' : 'Connections are secure — credentials stay with the provider.'}
        className="mb-6"
      >
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<IconLink />}
            title={isPro ? 'No accounts connected' : 'Connections are a Pro feature'}
            description={
              isPro
                ? 'Connect a bank account to import transactions automatically, or link an income platform.'
                : 'Upgrade to Pro to connect your bank and import income automatically.'
            }
            action={
              isPro ? (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => void runConnect('bank')}>Connect bank</Button>
                  <Button onClick={() => void runConnect('stripe')}>Connect income</Button>
                </div>
              ) : (
                <Button onClick={() => setUpgradeOpen(true)}>Upgrade to Pro</Button>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 shadow-well p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">
                      {a.account_name || a.institution_name || 'Connected account'}
                      {a.account_mask ? ` ••••${a.account_mask}` : ''}
                    </span>
                    <Badge tone="blue">{PROVIDER_LABEL[a.provider] ?? a.provider}</Badge>
                    {a.kind === 'income' && <Badge tone="purple">Income</Badge>}
                    <Badge
                      tone={a.status === 'active' ? 'green' : a.status === 'error' || a.status === 'expired' ? 'red' : 'neutral'}
                    >
                      {a.status === 'active' ? 'Active' : a.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {a.institution_name && `${a.institution_name} · `}Last synced:{' '}
                    {a.last_synced_at ? formatDate(a.last_synced_at) : 'never'}
                    {a.last_error ? ` · ${a.last_error}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" icon={<IconRefresh />} loading={busy === `sync-${a.id}`} onClick={() => void runSync(a)}>
                    Sync now
                  </Button>
                  <Button size="sm" variant="ghost" icon={<IconUnlink />} onClick={() => setDisconnectTarget(a)}>
                    Disconnect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Review queue */}
      <Card
        title="Imported transactions"
        subtitle={
          pending.length > 0
            ? `${pending.length} ${pluralize(pending.length, 'transaction')} need${pending.length === 1 ? 's' : ''} review · ${money(pendingValue)}`
            : transactions.length > 0
              ? 'All imports reviewed.'
              : 'Imported items will appear here for review.'
        }
        padded={false}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              ariaLabel="Filter transactions by status"
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setSelected(new Set()); }}
              options={[
                { value: 'pending' as const, label: 'Needs review' },
                { value: 'reviewed' as const, label: 'Added' },
                { value: 'ignored' as const, label: 'Ignored' },
                { value: 'all' as const, label: 'All' },
              ]}
            />
          </div>
        }
      >
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconLink />}
            title={
              transactions.length === 0
                ? 'No imported transactions yet'
                : statusFilter === 'pending'
                  ? 'Nothing needs review'
                  : `No ${statusFilter} transactions`
            }
            description={
              transactions.length === 0
                ? 'Connect a bank account and sync — imports will appear here for you to review.'
                : statusFilter === 'pending'
                  ? 'You have reviewed everything. New syncs will show up here.'
                  : 'Try another filter.'
            }
          />
        ) : (
          <>
            {statusFilter === 'pending' && (
              <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3">
                <Select
                  options={categoryOptions}
                  placeholder="Category for selection…"
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="h-9 w-52"
                  aria-label="Category for bulk action"
                />
                <Button size="sm" loading={busy === 'bulk-business'} disabled={selected.size === 0} onClick={() => void bulkReview('business')}>
                  Add {selected.size > 0 ? `${selected.size} ` : ''}to expenses
                </Button>
                <Button size="sm" variant="secondary" loading={busy === 'bulk-personal'} disabled={selected.size === 0} onClick={() => void bulkReview('personal')}>
                  Mark personal
                </Button>
                {selected.size > 0 && (
                  <button onClick={() => setSelected(new Set())} className="text-xs font-medium text-ink-500 hover:text-ink-900">
                    Clear selection ({selected.size})
                  </button>
                )}
              </div>
            )}

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[12px] font-medium text-ink-400">
                    <th className="w-10 px-4 py-3">
                      {statusFilter === 'pending' && (
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={selected.size > 0 && selected.size === pending.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelected(new Set(pending.map((t) => t.id)));
                            else setSelected(new Set());
                          }}
                        />
                      )}
                    </th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Merchant</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Assessment</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const sug = suggestion(t);
                    const cat = categoryFor[t.id] ?? t.category ?? t.suggested_category ?? sug.category;
                    const classification = t.classification ?? sug.classification;
                    const account = t.account_id ? byId.get(t.account_id) : undefined;
                    return (
                      <tr key={t.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.05]">
                        <td className="px-4 py-3">
                          {statusFilter === 'pending' && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${t.merchant}`}
                              checked={selected.has(t.id)}
                              onChange={() => toggle(t.id)}
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink-500">
                          {formatDate(t.txn_date)}
                          <span className="ml-1.5 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-500">Imported</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink-900">{t.merchant || '—'}</div>
                          {account && <div className="text-xs text-ink-400">{account.account_name}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {t.status === 'pending' ? (
                            <Select
                              options={categoryOptions}
                              value={cat}
                              onChange={(e) => setCategoryFor((p) => ({ ...p, [t.id]: e.target.value }))}
                              className="h-8 w-44 text-xs"
                              aria-label={`Category for ${t.merchant}`}
                            />
                          ) : (
                            <Badge>{t.category ?? '—'}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={CLASS_TONE[classification]}>{CLASSIFICATION_LABEL[classification]}</Badge>
                        </td>
                        <td className={cn('tabular whitespace-nowrap px-4 py-3 text-right font-semibold', t.kind === 'income' ? 'text-emerald-700' : 'text-ink-900')}>
                          {t.kind === 'income' ? '+' : '−'}{moneyCents(t.amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {t.status === 'pending' ? (
                            <div className="inline-flex gap-1.5">
                              {t.kind === 'expense' ? (
                                <Button
                                  size="sm"
                                  loading={busy === `review-${t.id}`}
                                  onClick={() => void review(t, 'business', cat)}
                                >
                                  {t.suggested_classification === 'personal' ? 'Add anyway' : 'Add to expenses'}
                                </Button>
                              ) : (
                                <Button size="sm" loading={busy === `review-${t.id}`} onClick={() => void review(t, 'income', 'Freelance')}>
                                  Add to income
                                </Button>
                              )}
                              <Button size="sm" variant="secondary" disabled={busy === `review-${t.id}`} onClick={() => void review(t, 'personal')}>
                                Personal
                              </Button>
                              <button
                                onClick={() => void review(t, 'ignore')}
                                className="rounded-full p-1.5 text-ink-400 hover:bg-white/[0.08] hover:text-ink-700"
                                aria-label={`Ignore ${t.merchant}`}
                                title="Ignore"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <Badge tone={t.status === 'reviewed' ? 'green' : 'neutral'}>
                              {t.status === 'reviewed' ? 'Added' : 'Ignored'}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: native-style stacked rows (no horizontal scrolling) */}
            <ul className="divide-y divide-white/[0.06] sm:hidden">
              {filtered.map((t) => {
                const sug = suggestion(t);
                const cat = categoryFor[t.id] ?? t.category ?? t.suggested_category ?? sug.category;
                const classification = t.classification ?? sug.classification;
                const account = t.account_id ? byId.get(t.account_id) : undefined;
                return (
                  <li key={t.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      {statusFilter === 'pending' && (
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          aria-label={`Select ${t.merchant}`}
                          checked={selected.has(t.id)}
                          onChange={() => toggle(t.id)}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[15px] font-medium text-ink-900">{t.merchant || '—'}</span>
                          <span className={cn('tabular shrink-0 text-[15px] font-semibold', t.kind === 'income' ? 'text-emerald-700' : 'text-ink-900')}>
                            {t.kind === 'income' ? '+' : '−'}{moneyCents(t.amount)}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-ink-500">
                          {formatDate(t.txn_date)}
                          {account ? ` · ${account.account_name}` : ''}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge tone={CLASS_TONE[classification]}>{CLASSIFICATION_LABEL[classification]}</Badge>
                          {t.status !== 'pending' && (
                            <Badge tone={t.status === 'reviewed' ? 'green' : 'neutral'}>
                              {t.status === 'reviewed' ? 'Added' : 'Ignored'}
                            </Badge>
                          )}
                        </div>
                        {t.status === 'pending' && (
                          <div className="mt-3 space-y-2">
                            <Select
                              options={categoryOptions}
                              value={cat}
                              onChange={(e) => setCategoryFor((p) => ({ ...p, [t.id]: e.target.value }))}
                              className="h-9 w-full text-xs"
                              aria-label={`Category for ${t.merchant}`}
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              {t.kind === 'expense' ? (
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  loading={busy === `review-${t.id}`}
                                  onClick={() => void review(t, 'business', cat)}
                                >
                                  {t.suggested_classification === 'personal' ? 'Add anyway' : 'Add to expenses'}
                                </Button>
                              ) : (
                                <Button size="sm" className="flex-1" loading={busy === `review-${t.id}`} onClick={() => void review(t, 'income', 'Freelance')}>
                                  Add to income
                                </Button>
                              )}
                              <Button size="sm" variant="secondary" disabled={busy === `review-${t.id}`} onClick={() => void review(t, 'personal')}>
                                Personal
                              </Button>
                              <button
                                onClick={() => void review(t, 'ignore')}
                                className="shrink-0 rounded-full p-2 text-ink-400 transition-colors hover:bg-white/[0.08] hover:text-ink-700"
                                aria-label={`Ignore ${t.merchant}`}
                                title="Ignore"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 shadow-well p-4 text-xs leading-relaxed text-ink-500">
        <strong>How imports work:</strong> synced transactions arrive uncategorized and are never added
        to your records until you review them. Adding an item creates a normal expense or income
        entry (labeled Imported). Your categorization choices are remembered for future syncs.
        Suggestions never claim an expense is definitely deductible.
        <div className="mt-2">
          <strong>Supported today:</strong> bank accounts via Plaid and Stripe income. PayPal import
          is not available yet.
        </div>
      </div>

      <UpgradePromptModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Connections are a Pro feature"
        description="Upgrade to Pro to connect bank accounts and income platforms, auto-import transactions, and use automatic categorization."
      />

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        onClose={() => setDisconnectTarget(null)}
        title="Disconnect this account?"
        message={
          <>
            The connection will be revoked with the provider and its imported feed removed. Records
            you already added to expenses or income stay in your books.
          </>
        }
        confirmLabel="Disconnect"
        loading={busy === `disconnect-${disconnectTarget?.id}`}
        onConfirm={runDisconnect}
      />

    </div>
  );
}
