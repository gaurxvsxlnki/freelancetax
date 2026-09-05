import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { getBackend } from '../../backend';
import { cn } from '../../lib/cn';
import { initials } from '../../lib/format';
import {
  IconBot,
  IconCalculator,
  IconDollar,
  IconFile,
  IconHelp,
  IconHome,
  IconLink,
  IconLogout,
  IconMenu,
  IconReceipt,
  IconSettings,
  IconSparkles,
  IconX,
} from '../icons';
import { Badge } from '../ui/primitives';

const NAV_MAIN = [
  { to: '/dashboard', label: 'Dashboard', icon: IconHome },
  { to: '/copilot', label: 'AI Copilot', icon: IconBot },
  { to: '/income', label: 'Income', icon: IconDollar },
  { to: '/expenses', label: 'Expenses', icon: IconFile },
  { to: '/receipts', label: 'Receipts', icon: IconReceipt },
  { to: '/imports', label: 'Imports', icon: IconLink },
  { to: '/deductions', label: 'Deductions', icon: IconSparkles },
  { to: '/tax-estimate', label: 'Tax Estimate', icon: IconCalculator },
  { to: '/reports', label: 'Reports', icon: IconFile },
];

const NAV_SECONDARY = [
  { to: '/settings', label: 'Settings', icon: IconSettings },
  { to: '/help', label: 'Help', icon: IconHelp },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
        <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M16 6v20M10 12h8a4 4 0 0 1 0 8h-8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-ink-900">FreelanceTax</div>
        <div className="text-[11px] text-ink-500">Taxes for independent work</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-brand-50 text-brand-800'
        : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
    );

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      <div className="space-y-1">
        {NAV_MAIN.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass} onClick={onNavigate}>
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className="space-y-1 border-t border-ink-100 pt-4">
        {NAV_SECONDARY.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass} onClick={onNavigate}>
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function SidebarFooter() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const backend = getBackend();

  return (
    <div className="border-t border-ink-100 p-3">
      {backend.isDemo && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 ring-1 ring-inset ring-amber-200">
          <strong>Demo mode.</strong> Data stays in this browser. Add your Supabase keys to
          connect a real database.
        </div>
      )}
      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
          {initials(user?.email ?? '?')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink-900">{user?.email}</div>
        </div>
        <button
          onClick={() => {
            void signOut().then(() => navigate('/login'));
          }}
          className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
          title="Sign out"
          aria-label="Sign out"
        >
          <IconLogout className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

function PlanBadge() {
  const { isPro } = useSubscription();
  return (
    <Badge tone={isPro ? 'green' : 'neutral'}>{isPro ? 'PRO' : 'FREE'}</Badge>
  );
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-ink-100">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="px-4 py-5">
          <Brand />
        </div>
        <NavItems />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-pop">
            <div className="flex items-center justify-between px-4 py-5">
              <Brand />
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Close menu"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <NavItems onNavigate={() => setDrawerOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden"
              aria-label="Open menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden text-sm text-ink-500 lg:block">
              Welcome back, {user?.email?.split('@')[0] ?? 'there'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/billing"
              className="rounded-md p-1 transition-colors hover:bg-ink-100"
              aria-label="View plan and billing"
              title="View plan and billing"
            >
              <PlanBadge />
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}