import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui/primitives';
import { LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage } from './pages/auth';
import { OnboardingPage } from './pages/Onboarding';
import { DashboardPage } from './pages/Dashboard';
import { CopilotPage } from './pages/Copilot';
import { ImportsPage } from './pages/Imports';
import { IncomePage } from './pages/Income';
import { ExpensesPage } from './pages/Expenses';
import { ReceiptsPage } from './pages/Receipts';
import { DeductionsPage } from './pages/Deductions';
import { TaxEstimatePage } from './pages/TaxEstimate';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { HelpPage } from './pages/Help';
import { BillingPage } from './pages/Billing';
import { LandingPage } from './pages/Landing';
import { PricingPage } from './pages/Pricing';
import { DisclaimerPage, PrivacyPage, TermsPage } from './pages/legal';

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-neu-md">
          <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
            <path
              d="M16 6v20M10 12h8a4 4 0 0 1 0 8h-8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-sm font-medium text-ink-500">Loading FreelanceTax…</div>
        <Spinner className="h-5 w-5 text-brand-600" />
      </div>
    </div>
  );
}

/** Blocks signed-out visitors. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  if (initializing) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Blocks visitors who haven't finished onboarding. */
function RequireOnboarding({ children }: { children: ReactNode }) {
  const { user, profile, initializing } = useAuth();
  if (initializing) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Keeps signed-in users away from the login/signup screens. */
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  if (initializing) return <FullPageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-center">
      <div className="text-5xl font-semibold tracking-tight text-ink-900">404</div>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        This page doesn't exist or has been moved.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ToastProvider>
          <Routes>
          {/* Public marketing pages */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />

          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            }
          />

          <Route
            element={
              <RequireAuth>
                <RequireOnboarding>
                  <AppShell />
                </RequireOnboarding>
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/copilot" element={<CopilotPage />} />
            <Route path="/income" element={<IncomePage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/receipts" element={<ReceiptsPage />} />
            <Route path="/imports" element={<ImportsPage />} />
            <Route path="/deductions" element={<DeductionsPage />} />
            <Route path="/tax-estimate" element={<TaxEstimatePage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}