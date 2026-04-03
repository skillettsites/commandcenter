'use client';

import { useState, useEffect } from 'react';

interface ChargeInfo {
  amount: number;
  site: string;
  email: string;
  date: string;
}

interface AccountData {
  name: string;
  sites: string[];
  totalRevenue: number;
  chargeCount: number;
  recentCharges: ChargeInfo[];
}

interface StripeData {
  accounts: AccountData[];
  totalRevenue: number;
  totalCharges: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
}

export default function StripeRevenue() {
  const [data, setData] = useState<StripeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/stripe-revenue')
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Stripe Revenue</span>
        </div>
        <div className="text-xs text-[var(--text-secondary)] mt-2">Loading...</div>
      </div>
    );
  }

  if (!data || data.totalCharges === 0) return null;

  return (
    <div className="bg-[var(--bg-secondary)] rounded-2xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Stripe Revenue</span>
        </div>
        <svg
          className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="text-lg font-bold text-green-400">
            £{(data.totalRevenue / 100).toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">Total Revenue</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="text-lg font-bold text-emerald-400">
            £{(data.thisMonthRevenue / 100).toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">This Month</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="text-lg font-bold text-amber-400">{data.totalCharges}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">Total Sales</div>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Revenue by account */}
          {data.accounts.filter(a => a.chargeCount > 0).map((account) => (
            <div key={account.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{account.name}</span>
                <span className="text-[11px] font-bold text-green-400">
                  £{(account.totalRevenue / 100).toFixed(2)} ({account.chargeCount} sales)
                </span>
              </div>
              {/* Recent charges */}
              <div className="space-y-0.5">
                {account.recentCharges.slice(0, 3).map((charge, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-secondary)]">
                      {charge.email.length > 25 ? charge.email.slice(0, 25) + '...' : charge.email}
                    </span>
                    <span className="text-[var(--text-primary)]">
                      £{(charge.amount / 100).toFixed(2)} · {charge.date}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
