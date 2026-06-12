'use client';

import { useEffect, useMemo, useState } from 'react';
import { Module, Segmented, AreaChart, BarList, gbp, gbpCompact } from './DashKit';

interface Account {
  name: string;
  totalRevenue: number;
  chargeCount: number;
  todayRevenue: number;
  todayCharges: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
  recentCharges: { amount: number; site: string; email: string; date: string }[];
}
interface StripeData {
  accounts: Account[];
  totalRevenue: number;
  totalCharges: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
  todayRevenue: number;
  todayCharges: number;
  dailySeries: { date: string; revenue: number; charges: number }[];
}

const P = 100; // pence → pounds

function parseEnGb(d: string): number {
  // "DD/MM/YYYY"
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

export default function RevenueBoard() {
  const [data, setData] = useState<StripeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'month' | 'all'>('month');

  useEffect(() => {
    let alive = true;
    fetch('/api/stripe-revenue')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const series = (data.dailySeries ?? []).filter((d) => (range === 'month' ? d.date.startsWith(ym) : true));
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const runRate = dayOfMonth > 0 ? ((data.thisMonthRevenue / P) / dayOfMonth) * daysInMonth : data.thisMonthRevenue / P;

    const accounts = (data.accounts ?? [])
      .map((a) => ({ name: a.name, month: a.thisMonthRevenue / P, total: a.totalRevenue / P, monthCharges: a.thisMonthCharges }))
      .filter((a) => a.month > 0 || a.total > 0)
      .sort((a, b) => b.month - a.month || b.total - a.total);

    const recent = (data.accounts ?? [])
      .flatMap((a) => a.recentCharges.map((c) => ({ ...c, account: a.name, ts: parseEnGb(c.date) })))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);

    return { series, runRate, accounts, recent, dayOfMonth, daysInMonth };
  }, [data, range]);

  return (
    <Module
      eyebrow="Business"
      title="Revenue"
      accent="var(--green)"
      icon={<span>💷</span>}
      right={
        <Segmented
          value={range}
          onChange={setRange}
          options={[{ value: 'month', label: 'Month' }, { value: 'all', label: 'All' }]}
        />
      }
    >
      {loading ? (
        <div className="skeleton h-56 w-full" />
      ) : !data || !view ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">Revenue unavailable.</p>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Today" value={gbp(data.todayRevenue / P)} sub={`${data.todayCharges} sales`} />
            <Stat label="This month" value={gbp(data.thisMonthRevenue / P)} sub={`${data.thisMonthCharges} sales`} accent="var(--green)" />
            <Stat label="Run-rate" value={gbp(view.runRate)} sub={`day ${view.dayOfMonth}/${view.daysInMonth}`} />
            <Stat label="All time" value={gbpCompact(data.totalRevenue / P)} sub={`${data.totalCharges} sales`} />
          </div>

          {/* Chart */}
          <AreaChart
            height={190}
            labels={view.series.map((d) => { const [, m, dd] = d.date.split('-'); return `${+dd}/${+m}`; })}
            formatValue={(v) => gbp(v)}
            series={[
              { name: 'Revenue', color: 'var(--green)', data: view.series.map((d) => d.revenue / P), type: 'area' },
            ]}
          />

          {/* Per-account + recent */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <div>
              <div className="section-eyebrow mb-2.5">By site · this month</div>
              <BarList
                formatValue={(v) => gbp(v)}
                items={view.accounts.slice(0, 6).map((a, i) => ({
                  label: a.name,
                  value: a.month,
                  sub: `· ${a.monthCharges}`,
                  color: ['var(--green)', 'var(--cyan)', 'var(--accent)', 'var(--purple)', 'var(--orange)', 'var(--yellow)'][i % 6],
                }))}
              />
            </div>
            <div>
              <div className="section-eyebrow mb-2.5">Recent sales</div>
              <div className="space-y-1.5">
                {view.recent.length === 0 && <p className="text-[12px] text-[var(--text-tertiary)]">No recent sales.</p>}
                {view.recent.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-[12px] py-1 border-b border-[var(--hairline)] last:border-0">
                    <div className="min-w-0">
                      <div className="text-[var(--text-primary)] font-medium truncate">{c.account}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] truncate">{c.email || 'guest'}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[var(--green)] font-semibold tabular-nums">{gbp(c.amount / P, 2)}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{c.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Module>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color: accent || 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-tertiary)]">{sub}</div>}
    </div>
  );
}
