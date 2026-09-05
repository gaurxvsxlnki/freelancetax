import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabaseConfigured } from '../lib/supabase';
import { getBackend } from '../backend';
import { Button, Alert, Spinner } from '../components/ui/primitives';
import { Field, Input } from '../components/ui/forms';
import { IconCheck, IconShield, IconTrendingUp } from '../components/icons';

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const backend = getBackend();
  return (
    <div className="flex min-h-screen bg-black">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-surface-2 p-10 text-ink-900 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-[0_4px_14px_-4px_rgba(112,118,255,0.7)]">
            <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M16 6v20M10 12h8a4 4 0 0 1 0 8h-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">FreelanceTax</div>
            <div className="text-xs text-ink-400">Taxes for independent work</div>
          </div>
        </div>
        <div className="max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Know what you owe, before tax season surprises you.
          </h1>
          <ul className="space-y-3 text-sm text-ink-500">
            <li className="flex items-start gap-3">
              <IconTrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
              Track income and expenses in minutes, not spreadsheets.
            </li>
            <li className="flex items-start gap-3">
              <IconCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
              Snap a receipt and review the details before they become expenses.
            </li>
            <li className="flex items-start gap-3">
              <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
              Get estimated quarterly set-aside guidance from your own data.
            </li>
          </ul>
        </div>
        <p className="text-xs text-ink-500">
          Estimates are informational only and are not tax advice.
          {backend.isDemo && ' You are in local demo mode — data stays in your browser.'}
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden="true">
                <path d="M16 6v20M10 12h8a4 4 0 0 1 0 8h-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-lg font-semibold tracking-tight text-ink-900">FreelanceTax</div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h2>
          <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-center text-sm text-ink-500">{footer}</div>
        </div>
      </div>
    </div>
  );
}

function PasswordStrengthHint() {
  return <p className="text-xs text-ink-400">At least 6 characters. Never share your password.</p>;
}

/* ---------------------------------- Login ---------------------------------- */

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const profile = await signIn(email, password);
      navigate(profile?.onboarding_completed ? '/dashboard' : '/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see your income, expenses, and tax estimate."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="danger" title="Unable to sign in">
            {error}
          </Alert>
        )}
        <Field label="Email" required>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Password" required>
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

/* ---------------------------------- Signup ---------------------------------- */

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and a password.');
      return;
    }
    if (password.length < 6) {
      setError('Your password must be at least 6 characters long.');
      return;
    }
    setLoading(true);
    try {
      const result = await signUp(email, password);
      if (result.needsConfirmation) {
        setConfirmationSent(true);
        return;
      }
      navigate(result.profile?.onboarding_completed ? '/dashboard' : '/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start tracking your freelance finances in about a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {confirmationSent ? (
        <Alert variant="success" title="Check your email">
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your
          account, then sign in.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="danger" title="Unable to create your account">
              {error}
            </Alert>
          )}
          <Field label="Email" required>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Password" required hint={<PasswordStrengthHint />}>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Create account
          </Button>
          <p className="text-xs leading-relaxed text-ink-400">
            By creating an account you agree to use FreelanceTax for organizing your finances.
            We never sell your data.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

/* ---------------------------------- Forgot password ---------------------------------- */

export function ForgotPasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const backend = getBackend();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await backend.resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a secure link to create a new password."
      footer={
        <>
          {user ? (
            <button onClick={() => navigate('/dashboard')} className="font-medium text-brand-700 hover:underline">
              Back to dashboard
            </button>
          ) : (
            <Link to="/login" className="font-medium text-brand-700 hover:underline">
              Back to sign in
            </Link>
          )}
        </>
      }
    >
      {sent ? (
        <Alert variant="success" title="Check your inbox">
          If an account exists for <strong>{email}</strong>, a password reset link is on its way.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="danger" title="Could not send a reset link">
              {error}
            </Alert>
          )}
          <Field label="Email" required>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/* ---------------------------------- Reset password ---------------------------------- */

export function ResetPasswordPage() {
  const { user, initializing } = useAuth();
  const backend = getBackend();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // supabase-js exchanges the recovery code automatically (detectSessionInUrl),
  // which can take a tick — `initializing` covers that window so we don't flash
  // the "link expired" state at someone who followed a perfectly good link.
  const hasRecoveryParam = Boolean(
    searchParams.get('code') ||
      // Older Supabase recovery links deliver tokens in the URL fragment.
      (typeof window !== 'undefined' && window.location.hash.includes('access_token'))
  );
  const isRecoverySession = supabaseConfigured && Boolean(hasRecoveryParam || user);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Your new password must be at least 6 characters long.');
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await backend.updatePassword(password);
      toast.success('Password updated', 'You can now sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Enter a new password for your account."
      footer={
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {!supabaseConfigured ? (
        <Alert variant="info" title="Demo mode">
          Password reset emails require a Supabase project. Once you add{' '}
          <code className="rounded bg-ink-100 px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-ink-100 px-1">VITE_SUPABASE_ANON_KEY</code>, reset links
          work end-to-end.
        </Alert>
      ) : initializing ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : !isRecoverySession ? (
        // Landing here without a recovery session means the link was missing,
        // already used, or expired. Say so instead of showing a form that can
        // only fail.
        <Alert variant="warning" title="This reset link isn't valid">
          Password reset links can only be used once and expire after a short time. Request a new
          one and use the most recent email.
          <div className="mt-3">
            <Link
              to="/forgot-password"
              className="font-medium text-brand-700 hover:underline"
            >
              Send a new reset link
            </Link>
          </div>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="danger" title="Could not update your password">
              {error}
            </Alert>
          )}
          <Field label="New password" required>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Confirm new password" required>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}