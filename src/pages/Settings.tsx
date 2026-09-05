import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getBackend } from '../backend';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { FREELANCER_TYPES, INCOME_RANGES, US_STATES } from '../lib/constants';
import { supportedTaxYears } from '../lib/tax';
import { Badge, Button, Alert, Card } from '../components/ui/primitives';
import { Field, Input, Select, Toggle } from '../components/ui/forms';
import { IconChevronRight, IconLogout } from '../components/icons';

export function SettingsPage() {
  const { user, profile, prefs, refreshProfile, refreshPrefs, signOut } = useAuth();
  const { isPro, subscription } = useSubscription();
  const toast = useToast();
  const navigate = useNavigate();

  // --- Profile form -----------------------------------------------------------
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [freelancerType, setFreelancerType] = useState(profile?.freelancer_type ?? 'Freelancer');
  const [state, setState] = useState(profile?.state ?? '');
  const [incomeRange, setIncomeRange] = useState(profile?.annual_income_range ?? '');
  const [worksFromHome, setWorksFromHome] = useState(profile?.works_from_home ?? false);
  const [businessUse, setBusinessUse] = useState(String(profile?.business_use_percentage ?? 50));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    const usePct = Math.round(Number(businessUse));
    if (!fullName.trim()) {
      setProfileError('Please enter your name.');
      return;
    }
    if (!state) {
      setProfileError('Please select your state.');
      return;
    }
    if (!Number.isFinite(usePct) || usePct < 0 || usePct > 100) {
      setProfileError('Business use percentage must be between 0 and 100.');
      return;
    }
    setSavingProfile(true);
    try {
      await getBackend().saveProfile({
        full_name: fullName.trim(),
        freelancer_type: freelancerType,
        state,
        annual_income_range: incomeRange,
        works_from_home: worksFromHome,
        business_use_percentage: usePct,
        onboarding_completed: true,
      });
      await refreshProfile();
      toast.success('Profile updated');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  // --- Preferences form -----------------------------------------------------------
  const [taxYear, setTaxYear] = useState(String(prefs?.tax_year ?? new Date().getFullYear()));
  const [emailReminders, setEmailReminders] = useState(prefs?.email_reminders ?? false);
  const [alertsMissingReceipts, setAlertsMissingReceipts] = useState(prefs?.alerts_missing_receipts ?? true);
  const [alertsUncategorized, setAlertsUncategorized] = useState(prefs?.alerts_uncategorized ?? true);
  const [alertsReserve, setAlertsReserve] = useState(prefs?.alerts_reserve ?? true);
  const [alertsDeadlines, setAlertsDeadlines] = useState(prefs?.alerts_deadlines ?? true);
  const [alertsUnusualSpending, setAlertsUnusualSpending] = useState(prefs?.alerts_unusual_spending ?? true);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const savePrefs = async (e: FormEvent) => {
    e.preventDefault();
    setPrefsError(null);
    setSavingPrefs(true);
    try {
      await getBackend().savePrefs({
        tax_year: Number(taxYear) || new Date().getFullYear(),
        email_reminders: emailReminders,
        alerts_missing_receipts: alertsMissingReceipts,
        alerts_uncategorized: alertsUncategorized,
        alerts_reserve: alertsReserve,
        alerts_deadlines: alertsDeadlines,
        alerts_unusual_spending: alertsUnusualSpending,
      });
      await refreshPrefs();
      toast.success('Preferences saved');
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : 'Could not save your preferences. Please try again.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const onSignOut = async () => {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error('Could not sign you out', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Settings</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-500">
        Manage your profile, preferences, and account.
      </p>

      <div className="mt-6 space-y-6">
        <Link to="/billing" className="block no-underline">
          <Card className="transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700/15 text-brand-800">
                  <IconChevronRight className="h-5 w-5 rotate-180" />
                </div>
                <div>
                  <p className="font-semibold text-ink-900">Plan &amp; billing</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {isPro
                      ? subscription?.cancel_at_period_end
                        ? 'Pro · cancels at end of period'
                        : 'Pro · unlimited tracking'
                      : 'Free plan · 20 expenses and 5 receipt scans per month'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={isPro ? 'green' : 'neutral'}>{isPro ? 'PRO' : 'FREE'}</Badge>
                <span className="text-sm font-medium text-brand-700">Manage →</span>
              </div>
            </div>
          </Card>
        </Link>

        <Card title="Profile" subtitle="Used to tailor your tax estimates and insights.">
          <form onSubmit={saveProfile} className="space-y-5" noValidate>
            {profileError && (
              <Alert variant="danger" title="Couldn't save your profile">
                {profileError}
              </Alert>
            )}
            <Field label="Your name" required>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sam Rivera"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="What kind of work do you do?" required>
                <Select options={FREELANCER_TYPES} value={freelancerType} onChange={(e) => setFreelancerType(e.target.value)} />
              </Field>
              <Field label="Which US state do you work in?" required>
                <Select options={US_STATES} placeholder="Select a state" value={state} onChange={(e) => setState(e.target.value)} />
              </Field>
            </div>
            <Field label="Approximate annual income" required>
              <Select options={INCOME_RANGES} placeholder="Select a range" value={incomeRange} onChange={(e) => setIncomeRange(e.target.value)} />
            </Field>
            <div className="space-y-3 rounded-lg border border-white/[0.06] bg-black/20 shadow-well p-4">
              <Toggle
                checked={worksFromHome}
                onChange={setWorksFromHome}
                label="I work from home"
                description="Home-office and shared expenses can be partially deductible."
              />
              <div className="border-t border-white/[0.06] pt-3">
                <Field label="Business use of shared expenses" hint="e.g. what % of your internet or phone bill is for work.">
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      inputMode="numeric"
                      value={businessUse}
                      onChange={(e) => setBusinessUse(e.target.value)}
                      className="w-28"
                      aria-label="Business use percentage"
                    />
                    <span className="text-sm font-medium text-ink-700">%</span>
                  </div>
                </Field>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingProfile}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Preferences" subtitle="Defaults used across your workspace.">
          <form onSubmit={savePrefs} className="space-y-5" noValidate>
            {prefsError && (
              <Alert variant="danger" title="Couldn't save your preferences">
                {prefsError}
              </Alert>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Tax year" hint="The year used for estimates, deadlines, and defaults." required>
                <Select options={supportedTaxYears().map(String)} value={taxYear} onChange={(e) => setTaxYear(e.target.value)} />
              </Field>
              <Field label="Currency" hint="Display currency for all amounts.">
                <Select options={['USD']} value="USD" disabled aria-label="Currency (USD only)" />
              </Field>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/20 shadow-well p-2">
              <Toggle
                checked={emailReminders}
                onChange={setEmailReminders}
                label="Quarterly deadline reminders"
                description="Show quarterly deadline reminders in the app. Email delivery is not part of FreelanceTax yet — see Help for the current status."
              />
            </div>
            <div className="space-y-1 rounded-lg border border-white/[0.06] bg-black/20 shadow-well p-2">
              <p className="px-2 pt-2 text-[12px] font-medium text-ink-500">
                Dashboard alerts
              </p>
              <Toggle
                checked={alertsMissingReceipts}
                onChange={setAlertsMissingReceipts}
                label="Missing receipts"
                description="Warn when business expenses have no receipt attached."
              />
              <Toggle
                checked={alertsUncategorized}
                onChange={setAlertsUncategorized}
                label="Uncategorized expenses"
                description="Flag expenses still filed under “Other”."
              />
              <Toggle
                checked={alertsReserve}
                onChange={setAlertsReserve}
                label="Tax reserve below estimate"
                description="Remind you when set-asides trail your estimated tax."
              />
              <Toggle
                checked={alertsDeadlines}
                onChange={setAlertsDeadlines}
                label="Quarterly deadlines"
                description="Show upcoming estimated-payment deadlines."
              />
              <Toggle
                checked={alertsUnusualSpending}
                onChange={setAlertsUnusualSpending}
                label="Unusual spending"
                description="Warn when a month's business spending is far above your recent average."
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingPrefs}>
                Save preferences
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Account" subtitle="Your sign-in details and session.">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-900">{user?.email}</p>
              <p className="mt-0.5 text-sm text-ink-500">
                Passwords are managed securely by your sign-in provider. To change yours, use the
                forgot-password link at sign-in.
              </p>
            </div>
            <Button variant="danger" icon={<IconLogout />} onClick={() => void onSignOut()}>
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}