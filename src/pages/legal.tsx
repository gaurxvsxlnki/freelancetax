import type { ReactNode } from 'react';
import { Seo } from '../components/Seo';
import { MarketingFooter, MarketingNav } from '../components/marketing';

function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-400">Last updated: {updated}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-700">{children}</div>
      </div>
      <MarketingFooter />
    </div>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-ink-900">{children}</h2>;
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 4, 2026">
      <Seo title="FreelanceTax — Privacy Policy" description="How FreelanceTax collects, uses, and protects your financial data." noIndex={false} />
      <P>
        FreelanceTax is designed for people who take their financial privacy seriously. This policy
        explains what data the app stores and why.
      </P>
      <H>Information we collect</H>
      <P>
        When you create an account we store your email address and the profile details you provide
        (name, work type, state, approximate income range, and work-from-home setup). The financial
        information you enter — income, expenses, receipts, and tax estimates — is stored only in
        connection with your account.
      </P>
      <H>How your data is secured</H>
      <P>
        Each account's data is isolated with row-level security, meaning your records are never
        returned to another user. Receipt files are kept in a private, per-user storage bucket.
        Passwords are handled by our authentication provider — FreelanceTax never stores your
        password, and payment card details are handled exclusively by our payment provider.
      </P>
      <H>Payments</H>
      <P>
        When you subscribe, your card details go directly to Stripe over a secure connection. We
        never see or store your full card number. We keep only the subscription status needed to
        manage your plan.
      </P>
      <H>What we do not do</H>
      <P>
        We do not sell your data. We do not share your financial records with advertisers. We do not
        use your income or expense data to build profiles of you for third parties.
      </P>
      <H>Contact</H>
      <P>
        Questions about this policy can be directed to the operator of the FreelanceTax instance you
        are using. If you self-host, you control all data.
      </P>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="September 4, 2026">
      <Seo title="FreelanceTax — Terms of Service" description="The terms that govern your use of FreelanceTax." noIndex={false} />
      <P>
        By creating an account or using FreelanceTax, you agree to these terms.
      </P>
      <H>Service description</H>
      <P>
        FreelanceTax provides organizational and estimating tools for independent workers to track
        income and expenses, store receipts, and see informational tax estimates. It is not a tax
        preparation or filing service.
      </P>
      <H>Accounts and acceptable use</H>
      <P>
        You are responsible for keeping your login credentials private and for the accuracy of the
        information you enter. You may not attempt to access another user's data, bypass usage
        limits or security controls, or use the service for unlawful purposes.
      </P>
      <H>Subscriptions and billing</H>
      <P>
        The Free plan is available without charge subject to the usage limits described in the app
        and on the pricing page. Pro is a paid subscription billed monthly or annually through our
        payment provider. You may cancel at any time; cancellation takes effect at the end of the
        current billing period, and access continues through that period. Fees are non-refundable
        except as required by law.
      </P>
      <H>No tax, legal, or financial advice</H>
      <P>
        FreelanceTax provides organizational tools and estimates for informational purposes. It does
        not provide personalized tax, legal, or accounting advice, and it does not guarantee tax
        savings or tax outcomes. Consult a qualified professional for advice about your situation.
      </P>
      <H>Availability and liability</H>
      <P>
        The service is provided "as is" without warranties of any kind. To the maximum extent
        permitted by law, the operator is not liable for indirect, incidental, or consequential
        damages, including lost profits, arising from your use of the service.
      </P>
      <H>Changes</H>
      <P>
        These terms may be updated from time to time. Continued use after changes are posted means
        you accept the updated terms.
      </P>
    </LegalLayout>
  );
}

export function DisclaimerPage() {
  return (
    <LegalLayout title="Tax Disclaimer" updated="September 4, 2026">
      <Seo title="FreelanceTax — Tax Disclaimer" description="Important information about FreelanceTax estimates and insights." noIndex={false} />
      <P>
        FreelanceTax provides organizational tools and estimates for informational purposes. It does
        not provide personalized tax, legal, or accounting advice and does not guarantee tax savings
        or tax outcomes.
      </P>
      <H>Deduction insights</H>
      <P>
        When FreelanceTax suggests that an expense "may qualify" as a business deduction, that is an
        organizational hint based only on the information you entered — its category, merchant, and
        your business-use percentage. It is not a determination that the expense is deductible.
        Deductibility depends on your specific facts and the law applicable to your situation.
      </P>
      <H>Tax estimates</H>
      <P>
        Tax estimates use a simplified, single-filer federal calculation. They do not include state
        and local taxes, your full filing status, dependents, itemized deductions, or other
        individual factors. Estimates are informational only and may not reflect your actual tax
        liability.
      </P>
      <H>Not affiliated with the IRS</H>
      <P>
        FreelanceTax is not an official IRS product, is not affiliated with the IRS or any government
        agency, and does not file tax returns.
      </P>
      <H>Always consult a professional</H>
      <P>
        Consider consulting a qualified tax professional for personalized advice about your income,
        expenses, estimated payments, and deductions.
      </P>
    </LegalLayout>
  );
}
