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
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-[0_4px_14px_-4px_rgba(112,118,255,0.7)]">
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
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">FreelanceTax</div>
        <div className="text-[11px] text-ink-500">Taxes for independent work</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium',
      'transition-all duration-150 ease-ios active:scale-[0.98]',
      isActive
        ? 'bg-white/[0.09] text-ink-900 shadow-sm'
        : 'text-ink-500 hover:bg-white/[0.05] hover:text-ink-900'
    );

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      <div className="space-y-1">
        {NAV_MAIN.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-400 group-hover:text-ink-600'
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
      <div className="space-y-1 border-t border-white/[0.06] pt-4">
        {NAV_SECONDARY.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-400 group-hover:text-ink-600'
                  )}
                />
                {item.label}
              </>
            )}
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
    <div className="border-t border-white/[0.06] p-3 pb-safe">
      {backend.isDemo && (
        <div className="mb-3 rounded-xl bg-amber-500/10 px-3 py-2 text-[11.5px] leading-snug text-amber-800 ring-1 ring-inset ring-amber-500/25">
          <strong>Demo mode.</strong> Data stays in this browser. Add your Supabase keys to
          connect a real database.
        </div>
      )}
      <div className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700/20 text-[11px] font-semibold text-brand-900 ring-1 ring-inset ring-brand-700/30">
          {initials(user?.email ?? '?')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-ink-900">{user?.email}</div>
        </div>
        <button
          onClick={() => {
            void signOut().then(() => navigate('/login'));
          }}
          className="shrink-0 rounded-full p-1.5 text-ink-400 transition-colors hover:bg-red-500/15 hover:text-red-500"
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

/** The five destinations surfaced in the native-style mobile tab bar. */
const TAB_BAR = [
  { to: '/dashboard', label: 'Home', icon: IconHome },
  { to: '/income', label: 'Income', icon: IconDollar },
  { to: '/expenses', label: 'Expenses', icon: IconFile },
  { to: '/tax-estimate', label: 'Taxes', icon: IconCalculator },
  { to: '/copilot', label: 'Copilot', icon: IconBot },
];

/**
 * iOS-style bottom tab bar (mobile only). Frosted, safe-area aware, with the
 * tint-on-active treatment familiar from native apps. The drawer remains
 * available from the header for the full navigation set.
 */
function MobileTabBar() {
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.09] glass pb-safe shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.9)] lg:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {TAB_BAR.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pb-1.5 pt-2 transition-transform duration-150 ease-ios active:scale-[0.92]"
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-[22px] w-[22px] shrink-0 transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-400'
                  )}
                />
                <span
                  className={cn(
                    'w-full truncate text-center text-[10px] font-medium leading-none transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-400'
                  )}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-black">
      {/* Desktop sidebar — frosted, hairline-separated from the canvas. */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[0.07] bg-surface/80 backdrop-blur-xl lg:flex">
        <div className="px-4 py-5 pt-safe">
          <Brand />
        </div>
        <NavItems />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[288px] max-w-[85vw] flex-col border-r border-white/10 bg-surface-2/95 shadow-pop backdrop-blur-xl">
            <div className="flex items-center justify-between px-4 py-5 pt-safe">
              <Brand />
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-full bg-white/[0.06] p-1.5 text-ink-500 transition-colors hover:bg-white/[0.12] hover:text-ink-900"
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
      <div className="lg:pl-[248px]">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-white/[0.07] glass px-4 pt-safe sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="-ml-1 shrink-0 rounded-full p-2 text-ink-500 transition-colors hover:bg-white/[0.07] hover:text-ink-900 lg:hidden"
              aria-label="Open menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden truncate text-[13px] text-ink-500 lg:block">
              Welcome back, {user?.email?.split('@')[0] ?? 'there'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/billing"
              className="rounded-full p-1 transition-transform duration-150 ease-ios active:scale-95"
              aria-label="View plan and billing"
              title="View plan and billing"
            >
              <PlanBadge />
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:px-6 lg:py-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
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
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.022em] text-ink-900">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}