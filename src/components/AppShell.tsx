'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

type NavItem = { href: string; label: string; icon: React.ReactNode };

const NAV: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-[22px] h-[22px]">
        <rect x="3" y="3" width="7.5" height="9" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="5.5" rx="2" />
        <rect x="13.5" y="12" width="7.5" height="9" rx="2" />
        <rect x="3" y="15.5" width="7.5" height="5.5" rx="2" />
      </svg>
    ),
  },
  {
    href: '/trending',
    label: 'Trending',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-[22px] h-[22px]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c.7 2.6-.4 4.2-1.7 5.6C8.6 10.3 7 12 7 14.8A5 5 0 0017 15c0-1.6-.6-3-1.4-4 .2 1 .04 2-.6 2.7-.1-2-1-3.4-2-4.4C13.6 7.6 13.4 5 12 3z" />
      </svg>
    ),
  },
  {
    href: '/growth',
    label: 'Growth',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-[22px] h-[22px]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l5-5 3.5 3.5L20 7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7h5v5" />
      </svg>
    ),
  },
  {
    href: '/forecasts',
    label: 'Forecasts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-[22px] h-[22px]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 19h18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l4-4 3 2 5-6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 2.5" d="M17 7l3 -2" />
        <circle cx="9" cy="11" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: '/finances',
    label: 'Finances',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-[22px] h-[22px]">
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path strokeLinecap="round" d="M3 10h18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 15h3" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function RefreshButton({ className = '' }: { className?: string }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      onClick={() => {
        setSpinning(true);
        window.location.reload();
      }}
      aria-label="Refresh"
      className={`w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-elevated)] active:opacity-70 transition-colors ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        className={`w-4 h-4 text-[var(--text-secondary)] ${spinning ? 'animate-spin' : ''}`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9a7 7 0 00-12-3.5L4 9m1 6a7 7 0 0012 3.5l3-3.5" />
      </svg>
    </button>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [greeting, setGreeting] = useState('');
  const [dateLabel, setDateLabel] = useState('');

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    setDateLabel(
      now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    );
  }, [pathname]);

  const current = NAV.find((n) => isActive(pathname, n.href));
  const title = current?.label ?? 'Command Center';

  return (
    <div className="min-h-screen">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[248px] flex-col border-r border-[var(--hairline)] bg-[var(--bg-app-2)]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-6 h-[72px]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-[0_8px_24px_-8px_var(--accent)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-5 h-5">
              <circle cx="12" cy="12" r="3.2" />
              <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-[var(--text-primary)]">Command</div>
            <div className="text-[11px] text-[var(--text-tertiary)] -mt-0.5">Center</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                  active
                    ? 'text-[var(--text-primary)] bg-[var(--accent-soft)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[var(--accent)]" />
                )}
                <span className={active ? 'text-[var(--accent)]' : ''}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[var(--hairline)] flex items-center justify-between">
          <div className="text-[11px] text-[var(--text-tertiary)] leading-tight">
            <div className="text-[var(--text-secondary)] font-medium">{greeting}</div>
            <div>{dateLabel}</div>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="lg:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--bg-app)]/70 border-b border-[var(--hairline)]">
          <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 h-[60px] lg:h-[72px] flex items-center justify-between gap-3">
            {/* Mobile brand */}
            <div className="flex items-center gap-2.5 lg:hidden">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-4 h-4">
                  <circle cx="12" cy="12" r="3.2" />
                  <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
              </div>
              <span className="text-[17px] font-semibold tracking-tight">{title}</span>
            </div>

            {/* Desktop title */}
            <div className="hidden lg:block">
              <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h1>
            </div>

            <div className="flex items-center gap-2">
              <RefreshButton />
              <span className="lg:hidden">
                <ThemeToggle />
              </span>
            </div>
          </div>
        </header>

        <main className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-7 pb-28 lg:pb-12">
          {children}
        </main>
      </div>

      {/* ---------- Mobile bottom nav ---------- */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 safe-area-bottom border-t border-[var(--hairline)] bg-[var(--bg-app)]/85 backdrop-blur-xl">
        <div className="flex items-stretch justify-around px-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 transition-colors ${
                  active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-7 rounded-full bg-[var(--accent)]" />
                )}
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
