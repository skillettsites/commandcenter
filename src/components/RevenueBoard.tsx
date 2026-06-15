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
  const [range, setRange] = useState<'week' | 'month' | 'all'>('month');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [statView, setStatView] = useState<'today' | 'month' | 'all' | null>(null);

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
    const allSeries = data.dailySeries ?? [];
    const series = range === 'month' ? allSeries.filter((d) => d.date.startsWith(ym))
      : range === 'week' ? allSeries.slice(-7)
      : allSeries;
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
          onChange={(v) => { setRange(v); setSelectedDay(null); }}
          options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All' }]}
        />
      }
    >
      {loading ? (
        <div className="skeleton h-56 w-full" />
      ) : !data || !view ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">Revenue unavailable.</p>
      ) : (
        <>
          {/* KPI row — tap a card to reveal its breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Today" value={gbp(data.todayRevenue / P)} sub={`${data.todayCharges} sales`} active={statView === 'today'} onClick={() => setStatView((v) => (v === 'today' ? null : 'today'))} />
            <Stat label="This month" value={gbp(data.thisMonthRevenue / P)} sub={`${data.thisMonthCharges} sales`} accent="var(--green)" active={statView === 'month'} onClick={() => setStatView((v) => (v === 'month' ? null : 'month'))} />
            <Stat label="Run-rate" value={gbp(view.runRate)} sub={`day ${view.dayOfMonth}/${view.daysInMonth}`} />
            <Stat label="All time" value={gbpCompact(data.totalRevenue / P)} sub={`${data.totalCharges} sales`} active={statView === 'all'} onClick={() => setStatView((v) => (v === 'all' ? null : 'all'))} />
          </div>

          {/* KPI reveal panel */}
          {statView && (() => {
            if (statView === 'today') {
              const todayStr = new Date().toLocaleDateString('en-GB');
              const sales = (data.accounts ?? [])
                .flatMap((a) => a.recentCharges.map((c) => ({ ...c, account: a.name })))
                .filter((c) => c.date === todayStr)
                .sort((a, b) => b.amount - a.amount);
              return (
                <RevealPanel title={`Today · ${gbp(data.todayRevenue / P, 2)} from ${data.todayCharges} sales`} onClose={() => setStatView(null)}>
                  {sales.length === 0
                    ? <p className="text-[11px] text-[var(--text-tertiary)]">No sales recorded yet today.</p>
                    : sales.map((c, i) => (
                        <Row key={i} left={`${c.account} · ${c.email || 'guest'}`} right={gbp(c.amount / P, 2)} />
                      ))}
                </RevealPanel>
              );
            }
            const rows = (data.accounts ?? [])
              .map((a) => ({
                name: a.name,
                value: statView === 'month' ? a.thisMonthRevenue : a.totalRevenue,
                count: statView === 'month' ? a.thisMonthCharges : a.chargeCount,
              }))
              .filter((a) => a.value > 0)
              .sort((a, b) => b.value - a.value);
            return (
              <RevealPanel
                title={statView === 'month'
                  ? `This month · ${gbp(data.thisMonthRevenue / P, 2)} from ${data.thisMonthCharges} sales`
                  : `All time · ${gbp(data.totalRevenue / P, 2)} from ${data.totalCharges} sales`}
                onClose={() => setStatView(null)}
              >
                {rows.length === 0
                  ? <p className="text-[11px] text-[var(--text-tertiary)]">No sales in this period.</p>
                  : rows.map((r) => (
                      <Row key={r.name} left={r.name} right={`${gbp(r.value / P, 2)} · ${r.count}`} />
                    ))}
              </RevealPanel>
            );
          })()}

          {/* Chart — click any day for a breakdown */}
          <AreaChart
            height={190}
            labels={view.series.map((d) => { const [, m, dd] = d.date.split('-'); return `${+dd}/${+m}`; })}
            formatValue={(v) => gbp(v)}
            onPointClick={(i) => setSelectedDay((cur) => (cur === i ? null : i))}
            selected={selectedDay}
            series={[
              { name: 'Revenue', color: 'var(--green)', data: view.series.map((d) => d.revenue / P), type: 'area' },
            ]}
          />
          {selectedDay === null && (
            <p className="text-[10px] text-[var(--text-tertiary)] text-center mt-1">Tap a day for its breakdown</p>
          )}

          {/* Day breakdown */}
          {selectedDay !== null && view.series[selectedDay] && (() => {
            const day = view.series[selectedDay];
            const [yy, mm, dd] = day.date.split('-');
            const human = `${+dd}/${+mm}/${yy}`;
            const daySales = (data.accounts ?? [])
              .flatMap((a) => a.recentCharges.map((c) => ({ ...c, account: a.name })))
              .filter((c) => { const m = c.date.match(/(\d{2})\/(\d{2})\/(\d{4})/); return !!m && `${m[3]}-${m[2]}-${m[1]}` === day.date; });
            return (
              <div className="mt-3 rounded-xl bg-[var(--bg-elevated)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] font-semibold text-[var(--text-primary)]">{human}</div>
                  <button onClick={() => setSelectedDay(null)} className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Close</button>
                </div>
                <div className="flex gap-6 mb-2">
                  <div>
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Revenue</div>
                    <div className="text-[18px] font-bold text-[var(--green)] tabular-nums">{gbp(day.revenue / P, 2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Sales</div>
                    <div className="text-[18px] font-bold tabular-nums">{day.charges}</div>
                  </div>
                </div>
                {daySales.length > 0 ? (
                  <div className="space-y-1 border-t border-[var(--hairline)] pt-2">
                    {daySales.map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-[var(--text-secondary)] truncate">{c.account} · {c.email || 'guest'}</span>
                        <span className="text-[var(--green)] font-semibold tabular-nums flex-shrink-0">{gbp(c.amount / P, 2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--text-tertiary)] border-t border-[var(--hairline)] pt-2">Per-sale detail is outside the recent window; totals are from the daily series.</p>
                )}
              </div>
            );
          })()}

          {/* Per-account + recent */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <div>
              <div className="section-eyebrow mb-2.5">By site · this month</div>
              <BarList
                formatValue={(v) => gbp(v)}
                onItemClick={(label) => setSelectedAccount((cur) => (cur === label ? null : label))}
                activeLabel={selectedAccount ?? undefined}
                items={view.accounts.slice(0, 6).map((a, i) => ({
                  label: a.name,
                  value: a.month,
                  sub: `· ${a.monthCharges}`,
                  color: ['var(--green)', 'var(--cyan)', 'var(--accent)', 'var(--purple)', 'var(--orange)', 'var(--yellow)'][i % 6],
                }))}
              />
              {selectedAccount && (() => {
                const acc = (data.accounts ?? []).find((a) => a.name === selectedAccount);
                if (!acc) return null;
                return (
                  <div className="mt-2.5 rounded-lg bg-[var(--bg-elevated)] p-2.5 text-[11px] space-y-1">
                    <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">Today</span><span className="tabular-nums">{gbp(acc.todayRevenue / P, 2)} · {acc.todayCharges} sales</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">This month</span><span className="tabular-nums">{gbp(acc.thisMonthRevenue / P, 2)} · {acc.thisMonthCharges} sales</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-tertiary)]">All time</span><span className="tabular-nums">{gbp(acc.totalRevenue / P, 2)} · {acc.chargeCount} sales</span></div>
                  </div>
                );
              })()}
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

function Stat({ label, value, sub, accent, onClick, active }: { label: string; value: string; sub?: string; accent?: string; onClick?: () => void; active?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl bg-[var(--bg-elevated)] p-3 transition-colors ${onClick ? 'cursor-pointer hover:bg-[var(--bg-card)]' : ''} ${active ? 'ring-2 ring-[var(--green)]/60' : ''}`}
    >
      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1">
        {label}
        {onClick && <span className="text-[var(--text-tertiary)] opacity-50">{active ? '▾' : '›'}</span>}
      </div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color: accent || 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-tertiary)]">{sub}</div>}
    </div>
  );
}

function RevealPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-4 -mt-1 rounded-xl bg-[var(--bg-elevated)] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</div>
        <button onClick={onClose} className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Close</button>
      </div>
      <div className="space-y-1 max-h-56 overflow-y-auto">{children}</div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-[var(--text-secondary)] truncate">{left}</span>
      <span className="text-[var(--green)] font-semibold tabular-nums flex-shrink-0">{right}</span>
    </div>
  );
}
