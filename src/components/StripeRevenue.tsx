'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

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
  todayRevenue: number;
  todayCharges: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
  recentCharges: ChargeInfo[];
}

const ACCOUNT_SHORT: Record<string, string> = {
  CarCostCheck: 'CCC',
  PostcodeCheck: 'PCC',
  MatchMySkillset: 'MMS',
};

interface DailyPoint {
  date: string;
  revenue: number;
  charges: number;
}

interface StripeData {
  accounts: AccountData[];
  totalRevenue: number;
  totalCharges: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
  todayRevenue: number;
  todayCharges: number;
  dailySeries: DailyPoint[];
}

type ChartView = 'today' | 'month' | 'total' | null;

const VIEW_LABELS: Record<Exclude<ChartView, null>, string> = {
  today: 'Today (last 14 days)',
  month: 'This Month',
  total: 'All Time',
};

interface TooltipPayload {
  active?: boolean;
  payload?: Array<{ value: number; payload: DailyPoint }>;
  label?: string;
}

function ChartTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const d = new Date(point.date + 'T00:00:00Z');
  const label = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 shadow-lg">
      <div className="text-[10px] text-[var(--text-secondary)]">{label}</div>
      <div className="text-xs font-bold text-green-400">
        £{(point.revenue / 100).toFixed(2)}
      </div>
      <div className="text-[10px] text-[var(--text-secondary)]">
        {point.charges} {point.charges === 1 ? 'sale' : 'sales'}
      </div>
    </div>
  );
}

export default function StripeRevenue() {
  const [data, setData] = useState<StripeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [chartView, setChartView] = useState<ChartView>(null);

  useEffect(() => {
    fetch('/api/stripe-revenue')
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo<DailyPoint[]>(() => {
    if (!data?.dailySeries?.length || !chartView) return [];
    if (chartView === 'today') {
      return data.dailySeries.slice(-14);
    }
    if (chartView === 'month') {
      const ym = new Date().toISOString().slice(0, 7);
      return data.dailySeries.filter((d) => d.date.startsWith(ym));
    }
    return data.dailySeries;
  }, [data, chartView]);

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

  if (!data) return null;

  const toggleView = (view: Exclude<ChartView, null>) => {
    setChartView((current) => (current === view ? null : view));
  };

  const cardBase =
    'rounded-xl p-2.5 text-center transition-colors cursor-pointer';
  const cardIdle = 'bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)]';
  const cardActive = 'bg-[var(--bg-primary)] ring-2 ring-green-500/60';

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
      <div className="grid grid-cols-4 gap-2 mt-3">
        <button
          type="button"
          onClick={() => toggleView('today')}
          className={`${cardBase} ${chartView === 'today' ? cardActive : cardIdle}`}
        >
          <div className="font-bold text-sky-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">
            £{(data.todayRevenue / 100).toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">Today</div>
        </button>
        <button
          type="button"
          onClick={() => toggleView('month')}
          className={`${cardBase} ${chartView === 'month' ? cardActive : cardIdle}`}
        >
          <div className="font-bold text-emerald-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">
            £{(data.thisMonthRevenue / 100).toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">This Month</div>
        </button>
        <button
          type="button"
          onClick={() => toggleView('total')}
          className={`${cardBase} ${chartView === 'total' ? cardActive : cardIdle}`}
        >
          <div className="font-bold text-green-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">
            £{(data.totalRevenue / 100).toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">Revenue</div>
        </button>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="font-bold text-amber-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">{data.totalCharges}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">Total Sales</div>
        </div>
      </div>

      {/* Per-account split: always visible, shows today / month / total per site */}
      {data.accounts.some((a) => a.chargeCount > 0) && (
        <div className="mt-3 bg-[var(--bg-primary)] rounded-xl p-2.5">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 items-center">
            <div className="text-[10px] text-[var(--text-secondary)]"></div>
            <div className="text-[10px] text-sky-400 text-right">Today</div>
            <div className="text-[10px] text-emerald-400 text-right">Month</div>
            <div className="text-[10px] text-green-400 text-right">Total</div>

            {data.accounts
              .filter((a) => a.chargeCount > 0)
              .map((a) => (
                <div key={a.name} className="contents">
                  <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {ACCOUNT_SHORT[a.name] || a.name}
                  </div>
                  <div className="text-[11px] text-right text-[var(--text-primary)]">
                    £{(a.todayRevenue / 100).toFixed(2)}
                    <span className="text-[9px] text-[var(--text-secondary)]"> ({a.todayCharges})</span>
                  </div>
                  <div className="text-[11px] text-right text-[var(--text-primary)]">
                    £{(a.thisMonthRevenue / 100).toFixed(2)}
                    <span className="text-[9px] text-[var(--text-secondary)]"> ({a.thisMonthCharges})</span>
                  </div>
                  <div className="text-[11px] text-right text-[var(--text-primary)]">
                    £{(a.totalRevenue / 100).toFixed(2)}
                    <span className="text-[9px] text-[var(--text-secondary)]"> ({a.chargeCount})</span>
                  </div>
                </div>
              ))}

            <div className="text-[11px] font-bold text-[var(--text-primary)] border-t border-[var(--border)] pt-1">
              Total
            </div>
            <div className="text-[11px] text-right font-bold text-sky-400 border-t border-[var(--border)] pt-1">
              £{(data.todayRevenue / 100).toFixed(2)}
              <span className="text-[9px] text-[var(--text-secondary)] font-normal"> ({data.todayCharges})</span>
            </div>
            <div className="text-[11px] text-right font-bold text-emerald-400 border-t border-[var(--border)] pt-1">
              £{(data.thisMonthRevenue / 100).toFixed(2)}
              <span className="text-[9px] text-[var(--text-secondary)] font-normal"> ({data.thisMonthCharges})</span>
            </div>
            <div className="text-[11px] text-right font-bold text-green-400 border-t border-[var(--border)] pt-1">
              £{(data.totalRevenue / 100).toFixed(2)}
              <span className="text-[9px] text-[var(--text-secondary)] font-normal"> ({data.totalCharges})</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartView && chartData.length > 0 && (
        <div className="mt-3 bg-[var(--bg-primary)] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              {VIEW_LABELS[chartView]}
            </span>
            <button
              type="button"
              onClick={() => setChartView(null)}
              className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Close
            </button>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="stripeRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v + 'T00:00:00Z');
                    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                  }}
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                  tickFormatter={(v: number) => `£${(v / 100).toFixed(0)}`}
                  width={40}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#stripeRev)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Expanded account detail */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {data.accounts.filter(a => a.chargeCount > 0).map((account) => (
            <div key={account.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{account.name}</span>
                <span className="text-[11px] font-bold text-green-400">
                  £{(account.totalRevenue / 100).toFixed(2)} ({account.chargeCount} sales)
                </span>
              </div>
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
