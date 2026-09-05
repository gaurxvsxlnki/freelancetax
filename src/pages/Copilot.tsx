import { useMemo, useState, type FormEvent } from 'react';
import { getBackend } from '../backend';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useAsync } from '../lib/useAsync';
import { answerQuestion, SUGGESTED_QUESTIONS, type CopilotAnswer } from '../lib/copilot';
import { TAX_DISCLAIMER } from '../lib/constants';
import { PageHeader } from '../components/layout/AppShell';
import { Alert, Button, Card, EmptyState, Skeleton } from '../components/ui/primitives';
import { UpgradePromptModal } from '../components/billing';
import { IconBot, IconSparkles } from '../components/icons';

export function CopilotPage() {
  const { prefs } = useAuth();
  const backend = getBackend();
  const { isPro } = useSubscription();
  const year = prefs?.tax_year ?? new Date().getFullYear();

  const { data, loading } = useAsync(async () => {
    const [income, expenses, receipts, payments] = await Promise.all([
      backend.listIncome(),
      backend.listExpenses(),
      backend.listReceipts(),
      backend.listTaxPayments(),
    ]);
    return { income, expenses, receipts, payments };
  });

  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [thinking, setThinking] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const hasData = useMemo(
    () => Boolean(data && (data.income.length > 0 || data.expenses.length > 0)),
    [data]
  );

  const ask = async (raw?: string) => {
    const q = (raw ?? question).trim();
    if (!q || !data) return;
    setThinking(true);
    setAsked(q);
    // Answers are computed locally from the user's own records; the brief pause
    // just keeps the interaction feel consistent and prevents double-submits.
    await new Promise((r) => setTimeout(r, 300));
    setAnswer(answerQuestion(q, {
      income: data.income,
      expenses: data.expenses,
      receiptsCount: data.receipts.length,
      receiptsNeedingReview: data.receipts.filter((r) => r.processing_status === 'needs_review').length,
      payments: data.payments,
      currentYear: year,
    }));
    setThinking(false);
    setQuestion('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!thinking) void ask();
  };

  return (
    <div>
      <PageHeader
        title="FreelanceTax AI"
        description="Ask questions about your own finances — every answer is computed from the records you've entered."
      />

      {!isPro ? (
        <>
          <Card>
            <EmptyState
              icon={<IconSparkles />}
              title="FreelanceTax AI is a Pro feature"
              description="Ask questions like 'What was my highest expense category?' and get answers computed from your data — instantly."
              action={<Button icon={<IconSparkles />} onClick={() => setUpgradeOpen(true)}>Upgrade to Pro</Button>}
            />
          </Card>
          <UpgradePromptModal
            open={upgradeOpen}
            onClose={() => setUpgradeOpen(false)}
            title="Unlock FreelanceTax AI"
            description="Chat-style answers about your income, expenses, tax reserve, and review queue — always grounded in your own stored data."
          />
        </>
      ) : loading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : !hasData ? (
        <Card>
          <EmptyState
            icon={<IconBot />}
            title="Nothing to ask about yet"
            description="Add some income and expenses first — FreelanceTax AI only answers from data you've actually recorded."
          />
        </Card>
      ) : (
        <div className="mx-auto max-w-3xl">
          <form onSubmit={onSubmit} className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <IconBot className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-600" />
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. How much did I spend on software this year?"
                className="h-12 w-full rounded-xl border border-ink-200 bg-white pl-11 pr-4 text-sm text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                aria-label="Ask about your finances"
              />
            </div>
            <Button type="submit" size="lg" loading={thinking} disabled={!question.trim()}>
              Ask
            </Button>
          </form>

          <div className="mb-6 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.slice(0, 4).map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                disabled={thinking}
                className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
              >
                {s}
              </button>
            ))}
          </div>

          {thinking && (
            <Card className="flex items-center gap-3 text-sm text-ink-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden="true" />
              Looking through your records…
            </Card>
          )}

          {asked && answer && !thinking && (
            <Card className="border-brand-200">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
                  <IconBot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-400">“{asked}”</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-900">{answer.text}</p>
                  {answer.lines && answer.lines.length > 0 && (
                    <dl className="mt-4 space-y-1.5 overflow-hidden rounded-xl border border-ink-100">
                      {answer.lines.map((l) => (
                        <div key={l.label} className="flex items-baseline justify-between gap-4 bg-ink-50/60 px-4 py-2 text-sm">
                          <dt className="text-ink-700">{l.label}</dt>
                          <dd className="tabular font-medium text-ink-900">{l.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {answer.followUps.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {answer.followUps.slice(0, 2).map((f) => (
                        <button
                          key={f}
                          onClick={() => void ask(f)}
                          className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          <div className="mt-6 space-y-2">
            <Alert variant="info" title="How FreelanceTax AI works">
              Answers are computed live from <strong>your own records</strong> — the assistant never
              invents income, expenses, or projections, and it won't guess when data is missing.
            </Alert>
            <p className="text-xs leading-relaxed text-ink-500">{TAX_DISCLAIMER}</p>
          </div>
        </div>
      )}
    </div>
  );
}
