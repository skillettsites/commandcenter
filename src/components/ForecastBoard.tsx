'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  projectNetWorth,
  freedomPlan,
  sleeveAllocation,
  FREEDOM_TARGET_MONTHLY,
  BASE_BLEND,
  gbpCompact,
  gbp,
  type ScenarioResult,
} from '@/lib/forecasts';

/* ----------------------------- data types ----------------------------- */
interface FinancesData {
  totals?: { netWorth: number };
}
interface StripeData {
  totalRevenue: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
  accounts: { name: string; thisMonthRevenue: number; thisMonthCharges: number; totalRevenue: number }[];
}

const THIS_YEAR = new Date().getFullYear();

/* ----------------------------- shared bits ----------------------------- */
function SectionCard({
  title,
  eyebrow,
  accent,
  children,
  index = 0,
  action,
}: {
  title: string;
  eyebrow?: string;
  accent: string;
  children: React.ReactNode;
  index?: number;
  action?: React.ReactNode;
}) {
  return (
    <section className="glass card-hl rise-in p-5 lg:p-6" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full mt-1.5" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
          <div>
            {eyebrow && <div className="section-eyebrow">{eyebrow}</div>}
            <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* Smooth single-series projection chart with optional target line. */
function ProjChart({
  series,
  color,
  target,
  targetLabel,
  formatY,
}: {
  series: { x: number; y: number }[];
  color: string;
  target?: number;
  targetLabel?: string;
  formatY: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) return <div className="h-44" />;

  const W = 320, H = 170;
  const pad = { t: 14, r: 12, b: 22, l: 12 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const maxY = Math.max(...series.map((p) => p.y), target ?? 0) * 1.06;
  const minX = series[0].x, maxX = series[series.length - 1].x;

  const px = (x: number) => pad.l + ((x - minX) / (maxX - minX || 1)) * innerW;
  const py = (y: number) => pad.t + innerH - (y / maxY) * innerH;

  const pts = series.map((p) => ({ ...p, sx: px(p.x), sy: py(p.y) }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].sx.toFixed(1)},${pad.t + innerH} L${pts[0].sx.toFixed(1)},${pad.t + innerH} Z`;
  const gid = `pc-${color.replace(/[^a-z]/gi, '')}`;
  const sel = hover != null ? pts[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * W;
        let best = 0, bd = Infinity;
        pts.forEach((p, i) => { const d = Math.abs(p.sx - mx); if (d < bd) { bd = d; best = i; } });
        setHover(best);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad.l} x2={pad.l + innerW} y1={pad.t + innerH * g} y2={pad.t + innerH * g} stroke="currentColor" opacity={0.06} strokeWidth={0.5} />
      ))}
      {target != null && target <= maxY && (
        <>
          <line x1={pad.l} x2={pad.l + innerW} y1={py(target)} y2={py(target)} stroke="var(--orange)" strokeWidth={1} strokeDasharray="4,3" opacity={0.8} />
          {targetLabel && (
            <text x={pad.l + innerW} y={py(target) - 4} textAnchor="end" fontSize="8" fill="var(--orange)" fontFamily="system-ui">{targetLabel}</text>
          )}
        </>
      )}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.sx} cy={p.sy} r={hover === i ? 4 : 2} fill={hover === i ? '#fff' : color} stroke={color} strokeWidth={hover === i ? 2 : 0} />
      ))}
      {[0, Math.floor(pts.length / 2), pts.length - 1].map((i) => (
        <text key={i} x={pts[i].sx} y={H - 4} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize="8" fill="currentColor" opacity={0.4} fontFamily="system-ui">
          {THIS_YEAR + pts[i].x}
        </text>
      ))}
      {sel && (
        <g>
          <line x1={sel.sx} x2={sel.sx} y1={pad.t} y2={pad.t + innerH} stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
          <text x={Math.min(sel.sx, W - 50)} y={pad.t + 2} fontSize="9" fontWeight="600" fill="var(--text-primary)" fontFamily="system-ui">{formatY(sel.y)}</text>
        </g>
      )}
    </svg>
  );
}

function HeadlineCard({ label, value, sub, accent, index }: { label: string; value: string; sub: string; accent: string; index: number }) {
  return (
    <div className="glass card-hl lift rise-in p-5 flex flex-col gap-1.5" style={{ animationDelay: `${index * 60}ms` }}>
      <span className="section-eyebrow">{label}</span>
      <div className="text-[30px] font-bold tracking-tight tabular-nums" style={{ color: accent }}>{value}</div>
      <span className="text-[12px] text-[var(--text-tertiary)]">{sub}</span>
    </div>
  );
}

/* ----------------------------- main board ----------------------------- */
export default function ForecastBoard() {
  const [fin, setFin] = useState<FinancesData | null>(null);
  const [stripe, setStripe] = useState<StripeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState(0.078);
  const [yld, setYld] = useState(7.8);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/finances').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/stripe-revenue').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([f, s]) => {
      if (!alive) return;
      setFin(f);
      setStripe(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const netWorth = fin?.totals?.netWorth ?? null;
  const nwSeries = useMemo(
    () => (netWorth != null ? projectNetWorth(netWorth, rate, 10).map((p) => ({ x: p.year, y: p.value })) : []),
    [netWorth, rate]
  );

  /* freedom plan — independent of live fetch (uses authoritative pot) */
  const plan = useMemo(() => freedomPlan(yld), [yld]);
  const quitWinners = plan.filter((s) => s.quit && s.clears);
  const bestQuit = [...plan].filter((s) => s.quit).sort((a, b) => b.totalMo - a.totalMo)[0];
  const alloc = useMemo(() => sleeveAllocation(), []);
  const allocTotal = alloc.reduce((a, x) => a + x.value, 0);

  /* revenue forecast (Stripe amounts are in pence) */
  const rev = useMemo(() => {
    if (!stripe) return null;
    const P = 100;
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const thisMonth = (stripe.thisMonthRevenue ?? 0) / P;
    const total = (stripe.totalRevenue ?? 0) / P;
    const runRate = dayOfMonth > 0 ? (thisMonth / dayOfMonth) * daysInMonth : thisMonth;
    const arr = runRate * 12;
    const accounts = (stripe.accounts ?? [])
      .map((a) => {
        const m = (a.thisMonthRevenue ?? 0) / P;
        return { name: a.name, thisMonth: m, total: (a.totalRevenue ?? 0) / P, runRate: dayOfMonth > 0 ? (m / dayOfMonth) * daysInMonth : m };
      })
      .filter((a) => a.thisMonth > 0 || a.total > 0)
      .sort((a, b) => b.runRate - a.runRate);
    return { runRate, arr, accounts, dayOfMonth, daysInMonth, projectedMonth: runRate, thisMonth, total, charges: stripe.thisMonthCharges ?? 0 };
  }, [stripe]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="glass p-5 h-28"><div className="skeleton h-full w-full" /></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="glass p-6 h-72"><div className="skeleton h-full w-full" /></div>)}
        </div>
      </div>
    );
  }

  const nw5 = netWorth != null ? netWorth * Math.pow(1 + rate, 5) : null;

  return (
    <div className="space-y-6">
      {/* ---------- headline forecasts ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HeadlineCard
          index={0}
          label="Net worth · 5 yr"
          value={nw5 != null ? gbpCompact(nw5) : '—'}
          sub={`at ${(rate * 100).toFixed(1)}% annual blend`}
          accent="var(--accent)"
        />
        <HeadlineCard
          index={1}
          label="Financial freedom"
          value={bestQuit ? `${gbpCompact(bestQuit.totalMo)}/mo` : '—'}
          sub={`${quitWinners.length}/3 both-quit routes clear £11k`}
          accent="var(--orange)"
        />
        <HeadlineCard
          index={2}
          label="Revenue run-rate"
          value={rev ? `${gbpCompact(rev.arr)}/yr` : '—'}
          sub={rev ? `${gbp(rev.runRate)}/mo projected` : '—'}
          accent="var(--green)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ---------- net worth projection ---------- */}
        <SectionCard
          index={0}
          eyebrow="Wealth"
          title="Net Worth Projection"
          accent="var(--accent)"
          action={
            <div className="flex gap-1.5">
              {[[0.05, '5%'], [0.078, '7.8%'], [0.1, '10%']].map(([r, lbl]) => (
                <button key={lbl as string} onClick={() => setRate(r as number)} className={`chip ${rate === r ? 'chip-active' : ''}`}>{lbl}</button>
              ))}
            </div>
          }
        >
          <div className="mb-3">
            <div className="text-[26px] font-bold tracking-tight text-[var(--text-primary)] tabular-nums">{netWorth != null ? gbp(netWorth) : '—'}</div>
            <div className="text-[11px] text-[var(--text-tertiary)]">today</div>
          </div>
          <ProjChart series={nwSeries} color="var(--accent)" formatY={(v) => gbpCompact(v)} />
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[1, 3, 5, 10].map((y) => {
              const v = netWorth != null ? netWorth * Math.pow(1 + rate, y) : null;
              return (
                <div key={y} className="text-center rounded-xl bg-[var(--bg-elevated)] py-2">
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{y}y</div>
                  <div className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">{v != null ? gbpCompact(v) : '—'}</div>
                </div>
              );
            })}
          </div>
          {netWorth != null && (
            <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
              Compound growth on today&apos;s {gbp(netWorth)} at {(rate * 100).toFixed(1)}%/yr. Excludes new contributions, so a floor, not a ceiling.
            </p>
          )}
        </SectionCard>

        {/* ---------- path to £11k / freedom ---------- */}
        <SectionCard
          index={1}
          eyebrow="Independence"
          title="Path to £11k/mo Freedom"
          accent="var(--orange)"
          action={
            <div className="text-right">
              <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Blend yield</div>
              <div className="text-[15px] font-semibold text-[var(--text-primary)] tabular-nums">{yld.toFixed(1)}%</div>
            </div>
          }
        >
          <div className="flex items-center gap-3 mb-4">
            <input
              type="range"
              min={6}
              max={10}
              step={0.1}
              value={yld}
              onChange={(e) => setYld(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--orange)]"
            />
            <button onClick={() => setYld(parseFloat(BASE_BLEND.toFixed(1)))} className="chip">Reset 7.8%</button>
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] mb-3">
            Deploy the ~{gbpCompact(plan[0].pot)} pot into a {BASE_BLEND.toFixed(1)}% income sleeve. Net monthly income by route, vs the £{FREEDOM_TARGET_MONTHLY.toLocaleString()}/mo target:
          </p>
          <div className="space-y-3">
            {plan.map((s) => (
              <ScenarioRow key={s.id} s={s} />
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
            Both-quit routes are fully passive (no salary). Taxed per regime: Cyprus non-dom ~0%, Portugal IFICI 0% foreign income, Spain Beckham 0% on the portfolio. Mirrors the Freedom Plan dashboard (finances/retirement-plan.html).
          </p>
        </SectionCard>

        {/* ---------- business revenue forecast ---------- */}
        <SectionCard index={2} eyebrow="Business" title="Revenue Forecast" accent="var(--green)">
          {rev && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">This month</div>
                  <div className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{gbp(rev.thisMonth)}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{rev.charges} sales · day {rev.dayOfMonth}/{rev.daysInMonth}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Projected</div>
                  <div className="text-[20px] font-bold text-[var(--green)] tabular-nums">{gbp(rev.projectedMonth)}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">full-month run-rate</div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Annualised</div>
                  <div className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{gbpCompact(rev.arr)}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">at current pace</div>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="section-eyebrow">Run-rate by site</div>
                {rev.accounts.slice(0, 8).map((a) => {
                  const max = rev.accounts[0]?.runRate || 1;
                  return (
                    <div key={a.name}>
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <span className="text-[var(--text-secondary)] truncate">{a.name}</span>
                        <span className="text-[var(--text-primary)] font-medium tabular-nums">{gbp(a.runRate)}/mo</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[var(--green)] to-[var(--cyan)]" style={{ width: `${Math.max((a.runRate / max) * 100, 3)}%` }} />
                      </div>
                    </div>
                  );
                })}
                {rev.accounts.length === 0 && <p className="text-[12px] text-[var(--text-tertiary)]">No revenue recorded this month yet.</p>}
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
                Run-rate extrapolates this month&apos;s pace ({gbp(rev.thisMonth)} over {rev.dayOfMonth} days) across the full month and year. All-time revenue: {gbp(rev.total)}.
              </p>
            </>
          )}
        </SectionCard>

        {/* ---------- income sleeve composition ---------- */}
        <SectionCard index={3} eyebrow="Composition" title="The income sleeve" accent="var(--purple)">
          <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg-elevated)] mb-3">
            {alloc.map((a) => (
              <div key={a.label} style={{ width: `${(a.value / allocTotal) * 100}%`, background: a.color }} />
            ))}
          </div>
          <div className="space-y-2">
            {alloc.map((a) => (
              <div key={a.label} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
                  {a.label}
                </span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">{gbpCompact(a.value)} · {Math.round((a.value / allocTotal) * 100)}%</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Gross income/yr</div>
              <div className="text-[16px] font-semibold text-[var(--text-primary)] tabular-nums">{gbp((allocTotal - 90000) * (yld / 100))}</div>
            </div>
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Best net (passive)</div>
              <div className="text-[16px] font-semibold text-[var(--green)] tabular-nums">{bestQuit ? `${gbp(bestQuit.passiveMo)}/mo` : '—'}</div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
            62% equity-income (covered-call) / 38% bonds-credit, screened for 2-year capital stability, plus a fixed £90k growth sleeve. UBS · Fidelity · PIMCO STHS · iShares HYSD · JEQP.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

function ScenarioRow({ s }: { s: ScenarioResult }) {
  const fill = Math.min((s.totalMo / FREEDOM_TARGET_MONTHLY) * 100, 100);
  const color = s.clears ? 'var(--green)' : 'var(--orange)';
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px] mb-1">
        <span className="flex items-center gap-1.5 text-[var(--text-secondary)] min-w-0">
          <span>{s.flag}</span>
          <span className="text-[var(--text-primary)] font-medium truncate">{s.label}</span>
          <span className="chip !py-0.5 !px-2 flex-shrink-0">{s.duration}</span>
        </span>
        <span className="flex items-center gap-1 flex-shrink-0 tabular-nums font-semibold" style={{ color }}>
          {gbp(s.totalMo)}/mo {s.clears && <span>✓</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${fill}%`, background: s.clears ? 'linear-gradient(90deg,var(--green),var(--cyan))' : 'var(--orange)' }} />
      </div>
      <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
        {s.regime} · {s.quit ? `passive ${gbp(s.passiveMo)}/mo` : `incl. salary ${gbp(s.salary)}/mo`}
      </div>
    </div>
  );
}
