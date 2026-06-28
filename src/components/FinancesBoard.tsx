'use client';

import { useEffect, useMemo, useState } from 'react';
import { Module, Segmented, AreaChart, BarList, gbp, gbpCompact, fmtNum } from './DashKit';
import { upcomingMoney } from '@/lib/portfolio';

/* ----------------------------- types ----------------------------- */
interface Stock { symbol: string; account: string; shares: number; currentValue: number; costBasis: number; gainLoss: number; gainLossPercent: number; dailyChangePercent: number; livePrice: number; currency?: string; }
interface Fund { id: string; name: string; currentValue: number; gainLossPercent: number; isLive: boolean; }
interface Etrade { symbol: string; name: string; totalShares: number; vestedShares: number; unvestedShares: number; totalValue: number; vestedValue: number; unvestedValue: number; dailyChangePercent: number; livePriceGBP?: number | null; vesting?: { date: string; shares: number; label?: string }[]; }
interface CashAcct { account: string; balance: number; }
interface Property { id: string; name: string; value: number; mortgage: number; type: 'keeping' | 'selling'; rentalIncome?: number; mortgagePayment?: number; serviceCharge?: number; }
interface Dividends {
  payments: { date: string; month: number; year: number; source: string; amount: number; status: 'received' | 'forecast' }[];
  monthlyTotals: Record<string, { received: number; forecast: number }>;
  thisMonthReceived: number; thisMonthExpected: number; annualReceived: number; monthlyAverage: number;
}
interface Totals { stocks: number; funds: number; investmentCash: number; etrade: number; etradeUnvested: number; investments: number; propertyEquity: number; cash: number; pokemon: number; netWorth: number; }
interface FinData {
  stocks: Stock[]; funds: Fund[]; cashInvestmentAccounts?: CashAcct[]; etrade?: Etrade;
  properties: Property[]; cash: CashAcct[]; pokemon?: { totalGBP: number; costUSD: number };
  forexRate: number; dividends: Dividends; totals: Totals; timestamp: string;
}
interface History { history: { date: string; value: number }[]; currentValue: number; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
type NwRange = '1W' | '1M' | '1Y' | 'ALL';

function pct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; }
function pctColor(n: number) { return n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--text-tertiary)'; }

/* ============================ Eye toggle ============================ */
function Eye({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-label={revealed ? 'Hide' : 'Reveal'} className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">
      {revealed ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.3 9.3 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.2M6.2 6.2A12.4 12.4 0 003 12c0 2.5 4 7 9 7a9 9 0 003.6-.7" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="2.6" /></svg>
      )}
    </button>
  );
}

/* ============================ main ============================ */
export default function FinancesBoard() {
  const [data, setData] = useState<FinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [nwRange, setNwRange] = useState<NwRange>('1M');
  const [hist, setHist] = useState<History | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/finances').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) { setData(j); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/finances/history?range=${nwRange}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j) setHist(j); }).catch(() => {});
    return () => { alive = false; };
  }, [nwRange]);

  const blur = (el: React.ReactNode) => <span className={reveal ? '' : 'blur-[8px] select-none'}>{el}</span>;

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="glass p-6 h-64"><div className="skeleton h-full w-full" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 glass p-6 h-80"><div className="skeleton h-full w-full" /></div>
          <div className="lg:col-span-5 glass p-6 h-80"><div className="skeleton h-full w-full" /></div>
        </div>
      </div>
    );
  }
  if (!data) return <p className="text-[13px] text-[var(--text-tertiary)]">Finances unavailable.</p>;

  const t = data.totals;
  const upcomingTotal = upcomingMoney.reduce((s, m) => s + m.amount, 0);
  const projectedNetWorth = t.netWorth + upcomingTotal;

  /* allocation */
  const alloc = [
    { label: 'Investments', value: t.investments, color: 'var(--accent)' },
    { label: 'Property equity', value: t.propertyEquity, color: 'var(--purple)' },
    { label: 'Cash', value: t.cash, color: 'var(--green)' },
    { label: 'Collectibles', value: t.pokemon, color: 'var(--orange)' },
  ].filter((a) => a.value > 0);
  const allocTotal = alloc.reduce((s, a) => s + a.value, 0) || 1;

  /* net worth history series + delta */
  const nwSeries = (hist?.history ?? []).map((h) => h.value);
  const nwLabels = (hist?.history ?? []).map((h) => { const p = h.date.slice(0, 10).split('-'); return `${+p[2]}/${+p[1]}`; });
  const nwDelta = nwSeries.length > 1 ? ((nwSeries[nwSeries.length - 1] - nwSeries[0]) / nwSeries[0]) * 100 : 0;

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* ---------- net worth hero ---------- */}
      <Module
        eyebrow="Wealth"
        title="Net Worth"
        accent="var(--accent)"
        right={
          <div className="flex items-center gap-2">
            <Segmented value={nwRange} onChange={setNwRange} options={[{ value: '1W', label: '1W' }, { value: '1M', label: '1M' }, { value: '1Y', label: '1Y' }, { value: 'ALL', label: 'All' }]} />
            <Eye revealed={reveal} onToggle={() => setReveal((v) => !v)} />
          </div>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <div className="text-[34px] sm:text-[38px] font-bold tracking-tight text-[var(--text-primary)] tabular-nums leading-none">
              {blur(gbp(t.netWorth))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] uppercase tracking-wider text-[var(--orange)]">Projected</span>
              <span className="text-[18px] font-bold text-[var(--orange)] tabular-nums leading-none">{blur(gbp(projectedNetWorth))}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">incl. £{Math.round(upcomingTotal / 1000)}k upcoming</span>
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-1.5">£1 = ${(1 / data.forexRate).toFixed(4)} · updated {new Date(data.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          {nwSeries.length > 1 && (
            <span className="text-[13px] font-semibold px-2.5 py-1 rounded-full" style={{ color: pctColor(nwDelta), background: nwDelta >= 0 ? 'var(--green-soft)' : 'var(--red-soft)' }}>
              {pct(nwDelta)} · {nwRange}
            </span>
          )}
        </div>

        <div className={reveal ? '' : 'blur-[8px] select-none pointer-events-none'}>
          <AreaChart height={210} labels={nwLabels} formatValue={(v) => gbpCompact(v)} series={[{ name: 'Net worth', color: 'var(--accent)', data: nwSeries, type: 'area' }]} />
        </div>

        {/* allocation */}
        <div className="mt-5">
          <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg-elevated)] mb-3">
            {alloc.map((a) => <div key={a.label} style={{ width: `${(a.value / allocTotal) * 100}%`, background: a.color }} />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {alloc.map((a) => (
              <div key={a.label} className="rounded-xl bg-[var(--bg-elevated)] p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: a.color }} />{a.label}
                </div>
                <div className="text-[16px] font-bold text-[var(--text-primary)] tabular-nums">{blur(gbpCompact(a.value))}</div>
                <div className="text-[10px] text-[var(--text-tertiary)]">{Math.round((a.value / allocTotal) * 100)}%</div>
              </div>
            ))}
          </div>
        </div>
      </Module>

      {/* ---------- family / upcoming money ---------- */}
      <Module
        eyebrow="Incoming"
        title="Family / Upcoming Money"
        accent="var(--orange)"
        icon={<span>👪</span>}
        right={<div className="text-right"><div className="text-[16px] font-bold text-[var(--orange)] tabular-nums">{blur(gbp(upcomingTotal))}</div><div className="text-[11px] text-[var(--text-tertiary)]">not in net worth</div></div>}
      >
        <div className="space-y-2">
          {upcomingMoney.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.status === 'confirmed' ? 'var(--green)' : item.status === 'expected' ? 'var(--orange)' : 'var(--text-tertiary)' }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{item.source}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] truncate">{item.notes} · {item.status}</div>
                </div>
              </div>
              <span className="text-[14px] font-bold text-[var(--text-primary)] tabular-nums flex-shrink-0">{blur(gbp(item.amount))}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-3">Money owed / incoming (sister&apos;s repayment, house-sale shares). Excluded from net worth above; added into projected net worth.</p>
      </Module>

      {/* ---------- investments + dividends ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        <div className="lg:col-span-7">
          <InvestmentsModule data={data} blurValues={!reveal} forexRate={data.forexRate} />
        </div>
        <div className="lg:col-span-5">
          <DividendsModule data={data} />
        </div>
      </div>

      {/* ---------- properties + cash ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        <div className="lg:col-span-7">
          <PropertiesModule data={data} blurValues={!reveal} />
        </div>
        <div className="lg:col-span-5">
          <CashModule data={data} blurValues={!reveal} />
        </div>
      </div>
    </div>
  );
}

/* ============================ Investments ============================ */
interface Holding { key: string; name: string; sub: string; value: number; gainPct: number | null; dailyPct: number | null; symbol?: string; currency?: string; }

function InvestmentsModule({ data, blurValues, forexRate }: { data: FinData; blurValues: boolean; forexRate: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [chart, setChart] = useState<Record<string, { date: string; price: number }[]>>({});

  const holdings: Holding[] = useMemo(() => {
    const rows: Holding[] = [];
    for (const s of data.stocks ?? []) rows.push({ key: `s-${s.symbol}`, name: s.symbol, sub: `${s.account} · ${s.shares} sh`, value: s.currentValue, gainPct: s.gainLossPercent, dailyPct: s.dailyChangePercent, symbol: s.symbol, currency: s.currency });
    for (const f of data.funds ?? []) rows.push({ key: `f-${f.id}`, name: f.name, sub: 'Income fund', value: f.currentValue, gainPct: f.gainLossPercent, dailyPct: null });
    if (data.etrade && data.etrade.vestedValue > 0) rows.push({ key: 'etrade', name: `${data.etrade.symbol} (E*Trade)`, sub: `${data.etrade.vestedShares} vested · ${data.etrade.unvestedShares} unvested (excl.)`, value: data.etrade.vestedValue, gainPct: null, dailyPct: data.etrade.dailyChangePercent });
    for (const c of data.cashInvestmentAccounts ?? []) if (c.balance > 0) rows.push({ key: `ic-${c.account}`, name: c.account, sub: 'Investment cash', value: c.balance, gainPct: null, dailyPct: null });
    return rows.sort((a, b) => b.value - a.value);
  }, [data]);

  const max = Math.max(1, ...holdings.map((h) => h.value));
  const todayChange = (data.stocks ?? []).reduce((s, st) => s + (st.currentValue * (st.dailyChangePercent || 0)) / 100, 0) + (data.etrade ? (data.etrade.vestedValue * (data.etrade.dailyChangePercent || 0)) / 100 : 0);

  function toggle(h: Holding) {
    const next = open === h.key ? null : h.key;
    setOpen(next);
    if (next && h.symbol && !chart[h.key]) {
      fetch(`/api/finances/chart?symbol=${encodeURIComponent(h.symbol)}&period=1M`).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (j?.chartData) setChart((p) => ({ ...p, [h.key]: j.chartData }));
      }).catch(() => {});
    }
  }

  const blur = (n: React.ReactNode) => <span className={blurValues ? 'blur-[7px] select-none' : ''}>{n}</span>;

  return (
    <Module
      eyebrow="Markets"
      title="Investments"
      accent="var(--accent)"
      icon={<span>📈</span>}
      right={<div className="text-right"><div className="text-[16px] font-bold text-[var(--text-primary)] tabular-nums">{blur(gbpCompact(data.totals.investments))}</div><div className="text-[11px] tabular-nums" style={{ color: pctColor(todayChange) }}>{todayChange >= 0 ? '+' : ''}{gbp(Math.abs(todayChange))} today</div></div>}
    >
      <div className="space-y-1">
        {holdings.map((h) => {
          const isOpen = open === h.key;
          return (
            <div key={h.key} className="rounded-xl overflow-hidden border border-transparent hover:border-[var(--hairline)] transition-colors">
              <button onClick={() => toggle(h)} className={`w-full text-left p-2.5 ${h.symbol || h.key === 'etrade' ? 'cursor-pointer hover:bg-[var(--surface-hover)]' : 'cursor-default'} transition-colors`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{h.name}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] truncate">{h.sub}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">{blur(gbp(h.value))}</div>
                    <div className="flex items-center gap-1.5 justify-end text-[10px] tabular-nums">
                      {h.dailyPct != null && <span style={{ color: pctColor(h.dailyPct) }}>{pct(h.dailyPct)}</span>}
                      {h.gainPct != null && <span className="text-[var(--text-tertiary)]">{pct(h.gainPct)} all</span>}
                    </div>
                  </div>
                </div>
                <div className="h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max((h.value / max) * 100, 2)}%`, background: (h.gainPct ?? h.dailyPct ?? 0) >= 0 ? 'var(--accent)' : 'var(--red)' }} />
                </div>
              </button>
              {isOpen && h.symbol && (
                <div className="px-2.5 pb-2.5 fade-in">
                  {chart[h.key] ? (
                    <AreaChart height={130} yTicks={false} labels={chart[h.key].map((p) => { const d = new Date(p.date); return `${d.getDate()}/${d.getMonth() + 1}`; })} formatValue={(v) => h.currency === 'USD' ? `$${v.toFixed(2)}` : `£${v.toFixed(2)}`} series={[{ name: `${h.name} price`, color: 'var(--cyan)', data: chart[h.key].map((p) => p.price), type: 'area' }]} />
                  ) : <div className="h-[130px] flex items-center justify-center text-[11px] text-[var(--text-tertiary)]">Loading chart…</div>}
                </div>
              )}
              {isOpen && h.key === 'etrade' && data.etrade && (
                <EtradeBreakdown etrade={data.etrade} blur={blur} />
              )}
            </div>
          );
        })}
      </div>
    </Module>
  );
}

/* ============================ E*Trade vesting breakdown ============================ */
function EtradeBreakdown({ etrade, blur }: { etrade: Etrade; blur: (n: React.ReactNode) => React.ReactNode }) {
  const perShareGBP = etrade.livePriceGBP ?? (etrade.unvestedShares > 0 ? etrade.unvestedValue / etrade.unvestedShares : 0);
  const sched = (etrade.vesting ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="px-2.5 pb-3 fade-in space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[var(--bg-elevated)] p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">Vested · in net worth</div>
          <div className="text-[15px] font-bold text-[var(--text-primary)] tabular-nums">{blur(gbp(etrade.vestedValue))}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">{etrade.vestedShares.toLocaleString()} shares</div>
        </div>
        <div className="rounded-lg bg-[var(--bg-elevated)] p-2.5 border border-dashed border-[var(--hairline)]">
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">Unvested · excluded</div>
          <div className="text-[15px] font-bold text-[var(--text-tertiary)] tabular-nums">{blur(gbp(etrade.unvestedValue))}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">{etrade.unvestedShares.toLocaleString()} shares</div>
        </div>
      </div>
      <div>
        <div className="section-eyebrow mb-1.5">Vesting schedule</div>
        {sched.length === 0 ? (
          <p className="text-[11px] text-[var(--text-tertiary)]">Vest dates not set yet — add the dates + share counts from E*Trade.</p>
        ) : (
          <div className="space-y-1">
            {sched.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-0.5 border-b border-[var(--hairline)] last:border-0">
                <span className="text-[var(--text-secondary)]">{new Date(v.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{v.label ? ` · ${v.label}` : ''}</span>
                <span className="tabular-nums text-[var(--text-primary)]">{v.shares.toLocaleString()} sh · {blur(gbp(Math.round(v.shares * perShareGBP)))}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">Unvested shares stay out of net worth until each vest date. Est. value at the live ICE price.</p>
      </div>
    </div>
  );
}

/* ============================ Dividends ============================ */
function DividendsModule({ data }: { data: FinData }) {
  const d = data.dividends;
  const keeping = (data.properties ?? []).filter((p) => p.type === 'keeping');
  const netRental = keeping.reduce((s, p) => s + (p.rentalIncome ?? 0) - (p.mortgagePayment ?? 0) - (p.serviceCharge ?? 0), 0);

  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = Object.keys(d.monthlyTotals ?? {}).sort().slice(-12);
  const labels = months.map((m) => MONTHS[+m.split('-')[1] - 1]);
  const received = months.map((m) => (d.monthlyTotals[m]?.received ?? 0) + (m <= curYM && netRental > 0 ? netRental : 0));
  const projected = months.map((m) => (d.monthlyTotals[m]?.received ?? 0) + (d.monthlyTotals[m]?.forecast ?? 0) + (netRental > 0 ? netRental : 0));

  const combinedMonthly = d.monthlyAverage + Math.max(0, Math.round(netRental));
  const combinedAnnual = d.annualReceived + Math.max(0, Math.round(netRental * 12));

  return (
    <Module eyebrow="Income" title="Dividends & Income" accent="var(--green)" icon={<span>💸</span>}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Avg / month</div>
          <div className="text-[20px] font-bold text-[var(--green)] tabular-nums">{gbp(combinedMonthly)}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">divs {gbp(d.monthlyAverage)}{netRental > 0 ? ` + rent ${gbp(Math.round(netRental))}` : ''}</div>
        </div>
        <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Est. annual</div>
          <div className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{gbpCompact(combinedAnnual)}</div>
          <div className="text-[10px] text-[var(--text-tertiary)]">this month {gbp(d.thisMonthReceived)}{d.thisMonthExpected > 0 ? ` +${gbp(d.thisMonthExpected)}` : ''}</div>
        </div>
      </div>
      {months.length > 1 ? (
        <AreaChart
          height={180}
          labels={labels}
          formatValue={(v) => gbp(v)}
          series={[
            { name: 'Projected', color: 'var(--cyan)', data: projected, type: 'area' },
            { name: 'Received', color: 'var(--green)', data: received, type: 'area' },
          ]}
        />
      ) : <div className="h-44 flex items-center justify-center text-[12px] text-[var(--text-tertiary)]">Building income history…</div>}
      <p className="text-[10px] text-[var(--text-tertiary)] mt-2">Monthly income from fund/stock dividends{netRental > 0 ? ' + net rental' : ''}. Received vs forecast. See Forecasts for the path to £11k/mo.</p>
    </Module>
  );
}

/* ============================ Properties ============================ */
function PropertiesModule({ data, blurValues }: { data: FinData; blurValues: boolean }) {
  const props = data.properties ?? [];
  const keeping = props.filter((p) => p.type === 'keeping');
  const selling = props.filter((p) => p.type === 'selling');
  const blur = (n: React.ReactNode) => <span className={blurValues ? 'blur-[7px] select-none' : ''}>{n}</span>;

  function Row({ p }: { p: Property }) {
    const equity = p.value - p.mortgage;
    const ltv = p.value > 0 ? (p.mortgage / p.value) * 100 : 0;
    return (
      <div className="rounded-xl bg-[var(--bg-card-2)] border border-[var(--hairline)] p-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{p.name}</span>
          <span className="text-[13px] font-bold text-[var(--text-primary)] tabular-nums flex-shrink-0">{blur(gbpCompact(equity))} <span className="text-[10px] font-normal text-[var(--text-tertiary)]">equity</span></span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
          <span>{blur(gbpCompact(p.value))} value · {blur(gbpCompact(p.mortgage))} mortgage</span>
          <span>{p.mortgage > 0 ? `${Math.round(ltv)}% LTV` : 'owned'}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden flex">
          <div className="h-full" style={{ width: `${100 - ltv}%`, background: 'var(--purple)' }} />
          <div className="h-full" style={{ width: `${ltv}%`, background: 'var(--bg-elevated)' }} />
        </div>
        {p.type === 'keeping' && (p.rentalIncome ?? 0) > 0 && (
          <div className="text-[10px] text-[var(--green)] mt-1.5">+{gbp(p.rentalIncome ?? 0)}/mo rent{(p.mortgagePayment ?? 0) > 0 ? ` · ${gbp((p.rentalIncome ?? 0) - (p.mortgagePayment ?? 0) - (p.serviceCharge ?? 0))} net` : ''}</div>
        )}
      </div>
    );
  }

  return (
    <Module eyebrow="Property" title="Properties" accent="var(--purple)" icon={<span>🏠</span>}
      right={<div className="text-right"><div className="text-[16px] font-bold text-[var(--text-primary)] tabular-nums">{blur(gbpCompact(data.totals.propertyEquity))}</div><div className="text-[11px] text-[var(--text-tertiary)]">total equity</div></div>}>
      {keeping.length > 0 && <><div className="section-eyebrow mb-2">Keeping</div><div className="space-y-2 mb-4">{keeping.map((p) => <Row key={p.id} p={p} />)}</div></>}
      {selling.length > 0 && <><div className="section-eyebrow mb-2">Selling</div><div className="space-y-2">{selling.map((p) => <Row key={p.id} p={p} />)}</div></>}
      {props.length === 0 && <p className="text-[12px] text-[var(--text-tertiary)]">No properties.</p>}
    </Module>
  );
}

/* ============================ Cash & collectibles ============================ */
function CashModule({ data, blurValues }: { data: FinData; blurValues: boolean }) {
  const cash = (data.cash ?? []).filter((c) => c.balance !== 0).sort((a, b) => b.balance - a.balance);
  const blur = (n: React.ReactNode) => <span className={blurValues ? 'blur-[7px] select-none' : ''}>{n}</span>;
  return (
    <Module eyebrow="Liquidity" title="Cash & Collectibles" accent="var(--green)" icon={<span>💷</span>}
      right={<div className="text-right"><div className="text-[16px] font-bold text-[var(--text-primary)] tabular-nums">{blur(gbpCompact(data.totals.cash))}</div><div className="text-[11px] text-[var(--text-tertiary)]">total cash</div></div>}>
      <BarList items={cash.map((c, i) => ({ label: c.account, value: c.balance, color: ['var(--green)', 'var(--cyan)', 'var(--accent)', 'var(--purple)', 'var(--orange)'][i % 5] }))} formatValue={(v) => (blurValues ? '••••' : gbp(v))} />
      {data.pokemon && data.pokemon.totalGBP > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--hairline)] flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">🃏 Pokémon cards</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">cost ${fmtNum(Math.round(data.pokemon.costUSD))}</div>
          </div>
          <div className="text-[15px] font-bold text-[var(--orange)] tabular-nums">{blur(gbp(data.pokemon.totalGBP))}</div>
        </div>
      )}
    </Module>
  );
}
