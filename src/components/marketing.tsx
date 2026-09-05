import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function MarketingLogo({ light: _light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-[0_4px_14px_-4px_rgba(112,118,255,0.7)]">
        <svg viewBox="0 0 32 32" className="h-5 w-5 text-white" fill="none" aria-hidden="true">
          <path d="M16 6v20M10 12h8a4 4 0 0 1 0 8h-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">FreelanceTax</div>
        <div className="text-[11px] text-ink-500">Taxes for independent work</div>
      </div>
    </Link>
  );
}

export function MarketingNav({ dark: _dark = false }: { dark?: boolean }) {
  const { user } = useAuth();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-white/[0.07] glass pt-safe">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <MarketingLogo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Public navigation">
          <Link to="/pricing" className="rounded-full px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-white/[0.07] hover:text-ink-900">
            Pricing
          </Link>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="rounded-full px-3 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-white/[0.07]"
              >
                Open app
              </Link>
              <Link
                to="/billing"
                className="rounded-full bg-brand-700 px-4 py-2 text-sm font-medium text-white transition-all duration-150 ease-ios hover:bg-brand-800 active:scale-[0.97]"
              >
                My plan
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-white/[0.07] hover:text-ink-900"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-full bg-brand-700 px-4 py-2 text-sm font-medium text-white transition-all duration-150 ease-ios hover:bg-brand-800 active:scale-[0.97]"
              >
                Start free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="no-print border-t border-white/[0.07] bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-sm">
          <MarketingLogo />
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            Simple tax &amp; expense tracking for freelancers, gig workers, and solo creators.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm">
          <div>
            <p className="font-medium text-ink-900">Product</p>
            <ul className="mt-2 space-y-2 text-ink-500">
              <li><Link to="/pricing" className="hover:text-ink-900">Pricing</Link></li>
              <li><Link to="/signup" className="hover:text-ink-900">Start free</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-ink-900">Legal</p>
            <ul className="mt-2 space-y-2 text-ink-500">
              <li><Link to="/privacy" className="hover:text-ink-900">Privacy policy</Link></li>
              <li><Link to="/terms" className="hover:text-ink-900">Terms of service</Link></li>
              <li><Link to="/disclaimer" className="hover:text-ink-900">Tax disclaimer</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.07] px-4 py-5 text-center text-xs leading-relaxed text-ink-400">
        FreelanceTax provides organizational tools and estimates for informational purposes only and is
        not affiliated with the IRS. Not tax advice.
      </div>
    </footer>
  );
}
