import { Link } from 'react-router-dom';
import { Card } from '../components/ui/primitives';
import {
  IconCalculator,
  IconDollar,
  IconFile,
  IconReceipt,
  IconShield,
  IconSparkles,
  IconTrendingUp,
} from '../components/icons';

const STEPS = [
  {
    icon: IconDollar,
    title: 'Record your income',
    body: 'Add every payment you receive from clients, platforms, or gigs on the Income page.',
    to: '/income',
    cta: 'Add income',
  },
  {
    icon: IconFile,
    title: 'Track your expenses',
    body: 'Log business and personal expenses with a category and business-use percentage.',
    to: '/expenses',
    cta: 'Add expenses',
  },
  {
    icon: IconReceipt,
    title: 'Upload receipts',
    body: 'Snap or drag in a receipt. Review the extracted details, then save it as an expense.',
    to: '/receipts',
    cta: 'Upload a receipt',
  },
  {
    icon: IconSparkles,
    title: 'Check deduction insights',
    body: 'Every expense gets an assessment of whether it may qualify as a business deduction.',
    to: '/deductions',
    cta: 'View insights',
  },
  {
    icon: IconCalculator,
    title: 'See your tax estimate',
    body: 'Get an estimated tax amount and suggested set-aside from your own numbers.',
    to: '/tax-estimate',
    cta: 'View estimate',
  },
  {
    icon: IconTrendingUp,
    title: 'Review your dashboard',
    body: 'Your dashboard ties it all together — totals, charts, alerts, and deadlines.',
    to: '/dashboard',
    cta: 'Open dashboard',
  },
];

const FAQS = [
  {
    q: 'Is FreelanceTax a tax filing service?',
    a: 'No. FreelanceTax is an organizing and estimating tool. It does not file taxes, and its estimates are informational only.',
  },
  {
    q: 'Are the tax estimates accurate?',
    a: 'Estimates use a simplified single-filer federal calculation from the information you provide. They do not include state taxes or individual factors, so they may differ from your actual liability. Treat them as guidance, not a final number.',
  },
  {
    q: 'How does receipt scanning work?',
    a: 'When you upload a receipt, the file is stored securely in your private storage. If an OCR/AI provider is connected to your Supabase project, the receipt is processed server-side and the extracted details are shown for your review. Otherwise the receipt is marked "review needed" so you can enter the details yourself — nothing is ever assumed.',
  },
  {
    q: 'How are deduction insights generated?',
    a: 'Each expense is assessed from what you entered: its category, merchant, business-use percentage, and whether you marked it business or personal. The assessment is a suggestion to help you organize — it never guarantees that a deduction will be allowed.',
  },
  {
    q: 'Is my financial data private?',
    a: 'Yes. Your data is isolated per user with row-level security, receipts live in a private per-user storage bucket, and only your own rows are ever returned to you.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. The Reports page lets you download your income, expenses, and annual summary as CSV files, and print a clean report.',
  },
];

export function HelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Help</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-500">
        Everything you need to get the most out of FreelanceTax.
      </p>

      <Card title="Get started in 6 steps" subtitle="The fastest path from zero to organized." className="mt-6">
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-lg border border-ink-100 bg-ink-50/50 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-700/15 text-brand-800 [&>svg]:h-5 [&>svg]:w-5">
                <s.icon />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">
                  <span className="mr-1.5 text-ink-400">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">{s.body}</p>
                <Link to={s.to} className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
                  {s.cta} →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Frequently asked questions" className="mt-6">
        <div className="divide-y divide-ink-100">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink-900">
                {f.q}
                <span className="shrink-0 text-ink-400 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">{f.a}</p>
            </details>
          ))}
        </div>
      </Card>

      <Card title="Your privacy and security" className="mt-6">
        <div className="flex items-start gap-3 text-sm text-ink-600">
          <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <p className="leading-relaxed">
            FreelanceTax never stores your password, never shows other users' data, and keeps receipt
            files in a private bucket only you can access. If you need help with your account or data,
            you can reach out through your Supabase project's support channels.
          </p>
        </div>
        <p className="mt-4 rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-500 ring-1 ring-inset ring-ink-100">
          FreelanceTax insights and estimates are for organizational purposes only and are not tax,
          legal, or financial advice. Consider consulting a qualified tax professional for your
          situation.
        </p>
      </Card>
    </div>
  );
}