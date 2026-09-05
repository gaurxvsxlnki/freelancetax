import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { MarketingFooter, MarketingNav } from '../components/marketing';
import { BarChart } from '../components/charts';
import { PRO_MONTHLY_LABEL, PRO_YEARLY_LABEL, PRO_YEARLY_SAVING_PCT } from '../lib/constants';
import { Badge, Button } from '../components/ui/primitives';
import {
  IconCalculator,
  IconCheck,
  IconFile,
  IconReceipt,
  IconShield,
  IconSparkles,
  IconTrendingUp,
} from '../components/icons';

const STEPS = [
  {
    n: 'Track',
    icon: IconFile,
    title: 'Track income & expenses',
    body: 'Log payments from clients and platforms, then record the expenses that come with running your business.',
  },
  {
    n: 'Scan',
    icon: IconReceipt,
    title: 'Scan receipts',
    body: 'Snap a photo of a receipt and keep a secure copy. Review the details before they become expenses.',
  },
  {
    n: 'Review',
    icon: IconSparkles,
    title: 'Review deduction insights',
    body: 'Each expense gets an assessment of whether it may qualify as a business deduction — you decide what to include.',
  },
  {
    n: 'Estimate',
    icon: IconCalculator,
    title: 'Estimate your taxes',
    body: 'See an estimated tax picture and a suggested monthly set-aside, so tax season has fewer surprises.',
  },
];

const FEATURES = [
  {
    icon: IconFile,
    title: 'Expense tracking',
    body: 'Categorize spending, mark business-use percentages, and separate business from personal in seconds.',
  },
  {
    icon: IconReceipt,
    title: 'Receipt scanning',
    body: 'Upload JPG, PNG, WebP, or PDF receipts. Files live in a private, per-user storage bucket.',
  },
  {
    icon: IconSparkles,
    title: 'AI deduction insights',
    body: 'Discover expenses that may qualify as business deductions, with plain-language explanations.',
  },
  {
    icon: IconCalculator,
    title: 'Tax estimates',
    body: 'An estimated federal tax snapshot built from your own numbers — not a filing service.',
  },
  {
    icon: IconTrendingUp,
    title: 'Financial dashboard',
    body: 'Income by month, spending by category, potential deductions, and deadlines in one place.',
  },
  {
    icon: IconShield,
    title: 'Your data stays yours',
    body: 'Row-level security isolates every user. You can export or print your own summaries any time.',
  },
];

const FAQS = [
  {
    q: 'Who is FreelanceTax for?',
    a: 'Freelancers, gig workers, creators, designers, developers, photographers, consultants, and other independent workers in the US who want a simple way to organize income and expenses throughout the year.',
  },
  {
    q: 'Is it free?',
    a: 'Yes — the Free plan includes income tracking, expense tracking (up to 20 expenses per month), 5 receipt scans per month, basic deduction insights, and a basic tax estimate.',
  },
  {
    q: 'What does Pro include?',
    a: `Pro removes the monthly limits: unlimited expenses, unlimited receipt scans, CSV export, annual reports, and more — for ${PRO_MONTHLY_LABEL}/month or ${PRO_YEARLY_LABEL}/year.`,
  },
  {
    q: 'Does FreelanceTax file my taxes?',
    a: 'No. FreelanceTax is an organizing and estimating tool. It does not file returns, connect to the IRS, or act as your accountant.',
  },
  {
    q: 'Are the tax estimates guaranteed?',
    a: 'No. Estimates are informational only, use simplified federal rules, and may not match your actual liability. Consider consulting a qualified tax professional.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Seo
        title="FreelanceTax — Tax & Expense Tracking for Freelancers"
        description="FreelanceTax helps freelancers organize income, track expenses, scan receipts, and discover potential deductions throughout the year."
      />
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-900 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(600px_300px_at_70%_-10%,rgba(95,114,240,0.35),transparent)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <Badge tone="blue" className="mb-4">Made for independent workers</Badge>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Stop leaving freelance tax deductions on the table.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-300">
              FreelanceTax helps freelancers organize income, track expenses, scan receipts, and
              discover potential deductions throughout the year.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup">
                <Button size="lg">Start free</Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="secondary" className="border-ink-700 bg-transparent text-white hover:bg-white/10">
                  See how it works
                </Button>
              </a>
            </div>
            <p className="mt-4 text-xs text-ink-500">
              Free forever plan · No credit card required · Cancel anytime
            </p>
          </div>

          {/* Illustrative dashboard preview (not real user data) */}
          <div aria-hidden="true" className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center justify-between px-1 pb-3">
              <div className="text-sm font-medium text-ink-300">Example dashboard</div>
              <Badge tone="green">PRO</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-4">
                <p className="text-xs text-ink-500">Income · this year</p>
                <p className="tabular mt-1 text-xl font-semibold text-ink-900">$62,400</p>
                <p className="mt-1 text-[11px] text-emerald-700">12 payments logged</p>
              </div>
              <div className="rounded-xl bg-white p-4">
                <p className="text-xs text-ink-500">Business expenses</p>
                <p className="tabular mt-1 text-xl font-semibold text-ink-900">$8,140</p>
                <p className="mt-1 text-[11px] text-ink-400">after business-use %</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-white p-4">
              <p className="mb-2 text-xs font-medium text-ink-500">Income by month</p>
              <BarChart
                data={[
                  { label: 'Jan', value: 3800 },
                  { label: 'Feb', value: 4200 },
                  { label: 'Mar', value: 5100 },
                  { label: 'Apr', value: 4600 },
                  { label: 'May', value: 5900 },
                  { label: 'Jun', value: 6300 },
                  { label: 'Jul', value: 5400 },
                  { label: 'Aug', value: 6800 },
                  { label: 'Sep', value: 6100 },
                  { label: 'Oct', value: 7200 },
                  { label: 'Nov', value: 6400 },
                  { label: 'Dec', value: 7800 },
                ]}
              />
            </div>
            <p className="px-1 pt-3 text-[11px] text-ink-500">
              Sample illustration — your dashboard shows your own real numbers.
            </p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">The problem</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">
          Freelance finances shouldn't be a year-end scramble.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-ink-600">
          When payments, subscriptions, and receipts are scattered across inboxes and apps, it's easy
          to miss expenses that may qualify as deductions — and harder to know what to set aside for
          taxes. FreelanceTax keeps it organized all year, so you always know where you stand.
        </p>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-ink-50/70 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">
              Four steps between chaos and organized.
            </h2>
          </div>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700 [&>svg]:h-5 [&>svg]:w-5">
                    <s.icon />
                  </div>
                  <span className="text-sm font-semibold text-brand-700">{s.n}</span>
                </div>
                <h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Features</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">
            Everything you need to stay on top of your money.
          </h2>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-2xl border border-ink-200 p-6 shadow-card">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white [&>svg]:h-5 [&>svg]:w-5">
                <f.icon />
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Pricing summary */}
      <section className="bg-ink-50/70 py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900">Simple, honest pricing</h2>
            <p className="mt-3 text-lg text-ink-600">
              Start free. Upgrade when you want unlimited tracking.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-card">
              <p className="text-lg font-semibold text-ink-900">Free</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">$0</p>
              <p className="mt-1 text-sm text-ink-500">forever, no card required</p>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                <PlanCheck>Income tracking</PlanCheck>
                <PlanCheck>20 expenses per month</PlanCheck>
                <PlanCheck>5 receipt scans per month</PlanCheck>
                <PlanCheck>Basic deduction insights</PlanCheck>
                <PlanCheck>Basic tax estimate</PlanCheck>
              </ul>
              <Link to="/signup" className="mt-8 block">
                <Button variant="secondary" fullWidth size="lg">Start free</Button>
              </Link>
            </div>
            <div className="relative rounded-2xl border-2 border-brand-700 bg-white p-8 shadow-pop">
              <Badge tone="blue" className="absolute -top-3 left-8">MOST POPULAR</Badge>
              <p className="text-lg font-semibold text-ink-900">Pro</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">
                {PRO_MONTHLY_LABEL}<span className="text-base font-normal text-ink-500">/month</span>
              </p>
              <p className="mt-1 text-sm text-emerald-700">or {PRO_YEARLY_LABEL}/year — save ~{PRO_YEARLY_SAVING_PCT}%</p>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                <PlanCheck>Unlimited income &amp; expenses</PlanCheck>
                <PlanCheck>Unlimited receipt scans</PlanCheck>
                <PlanCheck>AI deduction insights</PlanCheck>
                <PlanCheck>Advanced tax estimates</PlanCheck>
                <PlanCheck>Annual reports &amp; CSV export</PlanCheck>
                <PlanCheck>Tax deadline reminders</PlanCheck>
              </ul>
              <Link to="/pricing" className="mt-8 block">
                <Button fullWidth size="lg">See plan details</Button>
              </Link>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-ink-400">
            Subscriptions billed securely through Stripe. Prices in USD. Cancel anytime.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-ink-900">
          Frequently asked questions
        </h2>
        <div className="mt-8 divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white px-6 shadow-card">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink-900">
                {f.q}
                <span className="shrink-0 text-ink-400 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink-900 px-4 py-16 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-white">
          Start organizing your freelance finances today.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-ink-300">
          Set up takes about a minute. Your data stays private and organized — tax season thanks you
          later.
        </p>
        <div className="mt-8">
          <Link to="/signup">
            <Button size="lg">Start free</Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-ink-500">
          Free plan · No credit card required · Cancel anytime
        </p>
      </section>

      <MarketingFooter />
    </div>
  );
}

function PlanCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}