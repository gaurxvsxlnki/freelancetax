import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getBackend } from '../backend';
import { FREELANCER_TYPES, INCOME_RANGES, US_STATES } from '../lib/constants';
import { Button, Alert, Card } from '../components/ui/primitives';
import { Field, Input, Select, Toggle } from '../components/ui/forms';

/**
 * One-page onboarding shown after signup. Saves into the profile table;
 * everything here can be edited later from Settings.
 */
export function OnboardingPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [freelancerType, setFreelancerType] = useState(profile?.freelancer_type ?? 'Freelancer');
  const [state, setState] = useState(profile?.state ?? '');
  const [incomeRange, setIncomeRange] = useState(profile?.annual_income_range ?? '');
  const [worksFromHome, setWorksFromHome] = useState(profile?.works_from_home ?? false);
  const [businessUse, setBusinessUse] = useState(String(profile?.business_use_percentage ?? 50));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const usePct = Math.round(Number(businessUse));
    if (!fullName.trim()) {
      setError('Please tell us your first name.');
      return;
    }
    if (!state) {
      setError('Please select the state you work in.');
      return;
    }
    if (!incomeRange) {
      setError('Please select your approximate annual income.');
      return;
    }
    if (!Number.isFinite(usePct) || usePct < 0 || usePct > 100) {
      setError('Business use percentage must be between 0 and 100.');
      return;
    }

    setSaving(true);
    try {
      await getBackend().saveProfile({
        user_id: user!.id,
        full_name: fullName.trim(),
        freelancer_type: freelancerType,
        state,
        annual_income_range: incomeRange,
        works_from_home: worksFromHome,
        business_use_percentage: usePct,
        onboarding_completed: true,
      });
      await refreshProfile();
      toast.success('Welcome to FreelanceTax!', 'Your profile is set up.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M16 6v20M10 12h8a4 4 0 0 1 0 8h-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight text-ink-900">FreelanceTax</span>
          </div>
          <button
            onClick={() => void signOut().then(() => navigate('/login'))}
            className="text-sm font-medium text-ink-500 hover:text-ink-900"
          >
            Sign out
          </button>
        </div>

        <Card
          title="Let's set up your workspace"
          subtitle="A few quick questions help us tailor your tax estimates. You can change any of this later in Settings."
        >
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {error && (
              <Alert variant="danger" title="We need a bit more info">
                {error}
              </Alert>
            )}

            <Field label="Your name" hint="How should we greet you?" required>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sam Rivera"
                autoFocus
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="What kind of work do you do?" required>
                <Select
                  options={FREELANCER_TYPES}
                  value={freelancerType}
                  onChange={(e) => setFreelancerType(e.target.value)}
                />
              </Field>
              <Field label="Which US state do you work in?" required>
                <Select
                  options={US_STATES}
                  placeholder="Select a state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Approximate annual income"
              hint="Used to tailor your estimated tax set-aside. Ranges only."
              required
            >
              <Select
                options={INCOME_RANGES}
                placeholder="Select a range"
                value={incomeRange}
                onChange={(e) => setIncomeRange(e.target.value)}
              />
            </Field>

            <div className="space-y-3 rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
              <Toggle
                checked={worksFromHome}
                onChange={setWorksFromHome}
                label="Do you work from home?"
                description="Home-office and shared expenses can be partially deductible."
              />
              <div className="border-t border-white/[0.06] pt-3">
                <Field
                  label="Business use of shared expenses"
                  hint="e.g. what % of your internet or phone bill is for work. Used to calculate business-use amounts."
                >
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

            <Button type="submit" fullWidth size="lg" loading={saving}>
              {saving ? 'Saving…' : 'Get started'}
            </Button>
            <p className="text-center text-xs text-ink-400">
              Estimates are informational only and are not tax advice.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}