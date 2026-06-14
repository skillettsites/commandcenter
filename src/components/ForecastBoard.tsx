'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  projectNetWorth,
  freedomPlan,
  liveBizGross,
  sleeveAllocation,
  sleeveFundDetail,
  scenarioWaterfall,
  FREEDOM_TARGET_MONTHLY,
  BASE_BLEND,
  gbpCompact,
  gbp,
  type ScenarioResult,
  type AllocSlice,
} from '@/lib/forecasts';

/* ----------------------------- data types ----------------------------- */
interface FreedomSources {
  deployablePot: number;
  deployableGross: number;
  friction: number;
  keptOutside: number;
  sources: {
    investments: { total: number; isaAndGia: number; iceVested: number; stocks: number; funds: number; investmentCash: number };
    propertySales: { total: number; properties: { id: string; name: string; equity: number }[] };
    family: { total: number; items: { id: string; source: string; amount: number; status: string }[] };
    cash: { total: number; accounts: { account: string; balance: number }[] };
  };
  keptProperties: { id: string; name: string; equity: number }[];
}
interface FinancesData {
  totals?: { netWorth: number };
  freedom?: FreedomSources;
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
          <rect x={Math.min(Math.max(sel.sx - 26, pad.l), W - 56)} y={pad.t - 1} width={52} height={14} rx={3} fill="var(--bg-elevated)" opacity={0.92} />
          <text x={Math.min(Math.max(sel.sx, pad.l + 26), W - 30)} y={pad.t + 9} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-primary)" fontFamily="system-ui">{formatY(sel.y)}</text>
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

/* Donut built from allocation slices, with an active-segment highlight. */
function AllocDonut({ slices, activeIdx, onPick }: { slices: AllocSlice[]; activeIdx: number | null; onPick: (i: number) => void }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const R = 54, r = 33, C = 60;
  let acc = 0;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pull = activeIdx === i ? 3 : 0;
    const mid = (a0 + a1) / 2;
    const ox = Math.cos(mid) * pull, oy = Math.sin(mid) * pull;
    const x0 = C + ox + R * Math.cos(a0), y0 = C + oy + R * Math.sin(a0);
    const x1 = C + ox + R * Math.cos(a1), y1 = C + oy + R * Math.sin(a1);
    const xi1 = C + ox + r * Math.cos(a1), yi1 = C + oy + r * Math.sin(a1);
    const xi0 = C + ox + r * Math.cos(a0), yi0 = C + oy + r * Math.sin(a0);
    const d = `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${r},${r} 0 ${large} 0 ${xi0},${yi0} Z`;
    return { d, color: s.color, i };
  });
  const sel = activeIdx != null ? slices[activeIdx] : null;
  return (
    <svg viewBox="0 0 120 120" className="w-full h-auto max-w-[220px] mx-auto">
      {arcs.map((a) => (
        <path
          key={a.i}
          d={a.d}
          fill={a.color}
          opacity={activeIdx == null || activeIdx === a.i ? 1 : 0.4}
          stroke="var(--bg-primary)"
          strokeWidth={1}
          style={{ cursor: 'pointer', transition: 'opacity .15s' }}
          onClick={() => onPick(a.i)}
        />
      ))}
      <text x={C} y={sel ? C - 4 : C + 1} textAnchor="middle" fontSize={sel ? 10 : 9} fontWeight="700" fill="var(--text-primary)" fontFamily="system-ui">
        {sel ? gbpCompact(sel.value) : 'Pot'}
      </text>
      {sel && (
        <text x={C} y={C + 9} textAnchor="middle" fontSize="6.5" fill="var(--text-tertiary)" fontFamily="system-ui">
          {sel.ticker} · {sel.pctOfPot.toFixed(0)}%
        </text>
      )}
    </svg>
  );
}

/* horizontal source bar for the capital breakdown */
function SourceBar({ label, value, max, color, open, onToggle, children }: {
  label: string; value: number; max: number; color: string; open: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[var(--bg-elevated)] overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-2.5 hover:bg-[var(--bg-elevated-hover,rgba(255,255,255,0.03))] transition-colors">
        <div className="flex items-center justify-between text-[12px] mb-1.5">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)] min-w-0">
            <span className={`text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
            <span className="truncate">{label}</span>
          </span>
          <span className="font-semibold tabular-nums flex-shrink-0" style={{ color }}>{gbp(value)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max((value / max) * 100, 3)}%`, background: color }} />
        </div>
      </button>
      {open && children && <div className="px-3 pb-3 pt-0.5 space-y-1">{children}</div>}
    </div>
  );
}

function DetailRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className={muted ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}>{label}</span>
      <span className="tabular-nums text-[var(--text-primary)] font-medium">{value}</span>
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
  const [activeScenario, setActiveScenario] = useState<string>('s5');
  const [openSource, setOpenSource] = useState<string | null>('investments');
  const [allocPick, setAllocPick] = useState<number | null>(null);
  const [showCapital, setShowCapital] = useState(true);

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
  const free = fin?.freedom ?? null;
  const nwSeries = useMemo(
    () => (netWorth != null ? projectNetWorth(netWorth, rate, 10).map((p) => ({ x: p.year, y: p.value })) : []),
    [netWorth, rate]
  );

  /* freedom plan — business income is now LIVE from Stripe: this month's run-rate
     across all accounts, net of fees/COGS, plus GYG + YouTube. Falls back to the
     model constant when Stripe data is absent, so it never goes stale. */
  const plan = useMemo(() => {
    let biz: number | undefined;
    if (stripe) {
      const now = new Date();
      const dom = now.getDate();
      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const grossMo = (stripe.thisMonthRevenue ?? 0) / 100;
      const runRate = dom > 0 ? (grossMo / dom) * dim : grossMo;
      if (runRate > 0) biz = liveBizGross(runRate);
    }
    return freedomPlan(yld, biz);
  }, [yld, stripe]);
  const quitWinners = plan.filter((s) => s.quit && s.clears);
  const bestQuit = [...plan].filter((s) => s.quit).sort((a, b) => b.totalMo - a.totalMo)[0];
  const active = plan.find((s) => s.id === activeScenario) ?? plan[0];
  const waterfall = useMemo(() => scenarioWaterfall(active), [active]);
  const wfMax = Math.max(...waterfall.map((w) => Math.abs(w.value)));
  const passiveExSalary = active.netPortMo + active.rents + active.bizNet;
  const alloc = useMemo(() => sleeveAllocation(), []);
  const allocTotal = alloc.reduce((a, x) => a + x.value, 0);
  const allocSlices = useMemo(() => sleeveFundDetail(1467152, yld), [yld]);

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
  const potForDisplay = free?.deployablePot ?? plan[0].pot;
  const sourceList = free
    ? [
        { key: 'investments', label: 'Investments today (ISA + GIA + ICE vested)', value: free.sources.investments.total, color: 'var(--accent)' },
        { key: 'property', label: 'Property sale equity (Newbury · Didcot · Shoebury)', value: free.sources.propertySales.total, color: 'var(--purple)' },
        { key: 'family', label: 'Family money (mum + sister + loan)', value: free.sources.family.total, color: 'var(--green)' },
        { key: 'cash', label: 'All cash deployed (no buffer)', value: free.sources.cash.total, color: 'var(--orange)' },
      ]
    : [];
  const sourceMax = Math.max(...sourceList.map((s) => s.value), 1);

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

      {/* ---------- capital breakdown: where the pot comes from ---------- */}
      <SectionCard
        index={0}
        eyebrow="Step 1 · Capital"
        title="The deployable pot — where it comes from"
        accent="var(--green)"
        action={
          <button onClick={() => setShowCapital((v) => !v)} className="chip">
            {showCapital ? 'Hide' : 'Show'} breakdown
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Deployable pot</div>
            <div className="text-[22px] font-bold text-[var(--green)] tabular-nums">{gbpCompact(potForDisplay)}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">into the income portfolio</div>
          </div>
          <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">CGT friction</div>
            <div className="text-[22px] font-bold text-[var(--red)] tabular-nums">−{free ? gbpCompact(free.friction) : '£8k'}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">on GIA gains when liquidating</div>
          </div>
          <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Kept outside</div>
            <div className="text-[22px] font-bold text-[var(--text-primary)] tabular-nums">{free ? gbpCompact(free.keptOutside) : '—'}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Binnacle + Cordage equity, rented</div>
          </div>
        </div>

        {showCapital && free && (
          <>
            <p className="text-[11px] text-[var(--text-tertiary)] mb-2.5">Tap a source to see what is inside it. Live from the portfolio, so it never goes stale.</p>
            <div className="space-y-2">
              {sourceList.map((s) => (
                <SourceBar
                  key={s.key}
                  label={s.label}
                  value={s.value}
                  max={sourceMax}
                  color={s.color}
                  open={openSource === s.key}
                  onToggle={() => setOpenSource(openSource === s.key ? null : s.key)}
                >
                  {s.key === 'investments' && (
                    <>
                      <DetailRow label="Stocks (ISA + GIA)" value={gbp(free.sources.investments.stocks)} />
                      <DetailRow label="Income funds (ISA)" value={gbp(free.sources.investments.funds)} />
                      <DetailRow label="Investment cash" value={gbp(free.sources.investments.investmentCash)} />
                      <DetailRow label="ICE vested (E*Trade)" value={gbp(free.sources.investments.iceVested)} />
                      <DetailRow label="ISA + GIA subtotal" value={gbp(free.sources.investments.isaAndGia)} muted />
                    </>
                  )}
                  {s.key === 'property' && free.sources.propertySales.properties.map((p) => (
                    <DetailRow key={p.id} label={p.name} value={gbp(p.equity)} />
                  ))}
                  {s.key === 'family' && free.sources.family.items.map((it) => (
                    <DetailRow key={it.id} label={`${it.source} (${it.status})`} value={gbp(it.amount)} />
                  ))}
                  {s.key === 'cash' && free.sources.cash.accounts.map((c) => (
                    <DetailRow key={c.account} label={c.account} value={gbp(c.balance)} />
                  ))}
                </SourceBar>
              ))}
              <div className="rounded-xl bg-[var(--bg-elevated)] p-2.5 flex items-center justify-between">
                <span className="text-[12px] text-[var(--text-secondary)]">= Deployable pot (after {gbp(free.friction)} CGT friction)</span>
                <span className="text-[14px] font-bold text-[var(--green)] tabular-nums">{gbp(free.deployablePot)}</span>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
              Assumes Newbury, Didcot &amp; Shoeburyness complete, mum&apos;s £300k + sister&apos;s £100k + £40k loan all received, Binnacle &amp; Cordage kept and rented, and every pound of cash deployed (no buffer). Mirrors the Freedom Plan pot build.
            </p>
          </>
        )}
        {!free && <p className="text-[12px] text-[var(--text-tertiary)]">Live pot breakdown unavailable.</p>}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ---------- net worth projection ---------- */}
        <SectionCard
          index={1}
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
            <div className="text-[11px] text-[var(--text-tertiary)]">today · hover the line for any year</div>
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

        {/* ---------- path to £11k / freedom — interactive drill-down ---------- */}
        <SectionCard
          index={2}
          eyebrow="Step 2 · Independence"
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
            Deploy the ~{gbpCompact(plan[0].pot)} pot into a {yld.toFixed(1)}% income sleeve. Tap a route to see exactly how it reaches £{FREEDOM_TARGET_MONTHLY.toLocaleString()}/mo.
            {stripe ? ` Website income is live from Stripe (~${gbp((active.bizNet / (1 - active.bizTax)))}/mo, net of fees and COGS, + GYG and YouTube).` : ''}
          </p>
          <div className="space-y-2.5">
            {plan.map((s) => (
              <ScenarioRow key={s.id} s={s} active={s.id === activeScenario} onClick={() => setActiveScenario(s.id)} />
            ))}
          </div>

          {/* active scenario waterfall */}
          <div className="mt-4 rounded-xl bg-[var(--bg-elevated)] p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span>{active.flag}</span>
                <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{active.label}</span>
              </div>
              <span className="chip !py-0.5 !px-2 flex-shrink-0">{active.duration}</span>
            </div>
            <div className="space-y-1.5">
              {waterfall.map((w) => (
                <div key={w.label}>
                  <div className="flex items-center justify-between text-[11.5px] mb-0.5">
                    <span className={w.emphasis ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'}>{w.label}</span>
                    <span className="tabular-nums font-medium flex-shrink-0" style={{ color: w.value < 0 ? 'var(--red)' : w.emphasis ? 'var(--green)' : 'var(--text-primary)' }}>
                      {w.value < 0 ? '−' : ''}{gbp(Math.abs(w.value))}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max((Math.abs(w.value) / wfMax) * 100, 2)}%`, background: w.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className={`mt-3 text-[11px] rounded-lg p-2.5 ${passiveExSalary >= FREEDOM_TARGET_MONTHLY ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--orange-soft,rgba(255,159,10,0.12))]'}`} style={passiveExSalary >= FREEDOM_TARGET_MONTHLY ? undefined : { color: 'var(--orange)' }}>
              {passiveExSalary >= FREEDOM_TARGET_MONTHLY ? (
                <>Passive income (ex-salary) is <b>{gbp(passiveExSalary)}/mo</b> — clears £11k with <b>{gbp(passiveExSalary - FREEDOM_TARGET_MONTHLY)}/mo</b> to spare.</>
              ) : (
                <>Passive income (ex-salary) is <b>{gbp(passiveExSalary)}/mo</b> — short of £11k by <b>{gbp(FREEDOM_TARGET_MONTHLY - passiveExSalary)}/mo</b>{active.salary ? `; the £${Math.round(active.salary).toLocaleString()}/mo salary closes it while you work` : ''}.</>
              )}
            </div>
          </div>

          <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
            Both-quit routes are fully passive (no salary). Taxed per regime: Cyprus non-dom ~0%, Portugal IFICI 0% foreign income, Spain Beckham 0% on the portfolio. Mirrors the Freedom Plan scenario waterfall.
          </p>
        </SectionCard>

        {/* ---------- gap to 11k table ---------- */}
        <SectionCard index={3} eyebrow="Step 3 · The £11k question" title="Which routes clear £11k passive" accent="var(--purple)">
          <div className="space-y-2">
            {[...plan]
              .map((s) => ({ s, passive: s.netPortMo + s.rents + s.bizNet }))
              .sort((a, b) => b.passive - a.passive)
              .map(({ s, passive }) => {
                const hit = passive >= FREEDOM_TARGET_MONTHLY;
                const gapV = passive - FREEDOM_TARGET_MONTHLY;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveScenario(s.id)}
                    className={`w-full text-left rounded-xl p-2.5 transition-colors ${s.id === activeScenario ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]' : 'bg-[var(--bg-elevated)]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0 text-[12px]">
                        <span>{s.flag}</span>
                        <span className="text-[var(--text-primary)] font-medium truncate">{s.label}</span>
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0 text-[12px]">
                        <span className="tabular-nums text-[var(--text-secondary)]">{gbp(passive)}/mo</span>
                        <span className="tabular-nums font-semibold" style={{ color: hit ? 'var(--green)' : 'var(--orange)' }}>
                          {hit ? '✓ ≥ £11k' : `${gbp(gapV)}`}
                        </span>
                      </span>
                    </div>
                    {s.salary > 0 && <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 pl-5">+ {gbp(s.salary)}/mo salary while working</div>}
                  </button>
                );
              })}
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-3">
            Passive net excludes salary, so the both-quit verdict is honest. Cyprus, Portugal and Spain+SL each clear £11k with the portfolio + rents + websites alone. Growing the sites shrinks every gap £ for £.
          </p>
        </SectionCard>

        {/* ---------- allocation — interactive donut + table ---------- */}
        <SectionCard
          index={4}
          eyebrow="Step 4 · Allocation"
          title="The income sleeve"
          accent="var(--cyan)"
          action={
            <div className="text-right">
              <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider">Blended yield</div>
              <div className="text-[15px] font-semibold text-[var(--text-primary)] tabular-nums">{(BASE_BLEND * (yld / BASE_BLEND)).toFixed(1)}%</div>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <AllocDonut slices={allocSlices} activeIdx={allocPick} onPick={(i) => setAllocPick(allocPick === i ? null : i)} />
            <div className="space-y-1.5">
              {allocSlices.map((a, i) => (
                <button
                  key={a.ticker}
                  onClick={() => setAllocPick(allocPick === i ? null : i)}
                  className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${allocPick === i ? 'bg-[var(--bg-elevated)]' : ''}`}
                >
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2 text-[var(--text-secondary)] min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: a.color }} />
                      <span className="truncate">{a.name}</span>
                    </span>
                    <span className="text-[var(--text-primary)] font-medium tabular-nums flex-shrink-0">{a.pctOfPot.toFixed(0)}%</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* picked holding detail */}
          {allocPick != null && (
            <div className="mt-3 rounded-xl bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">{allocSlices[allocPick].name}</span>
                <span className="chip !py-0.5 !px-2">{allocSlices[allocPick].kind === 'bd' ? 'Bond' : allocSlices[allocPick].kind === 'growth' ? 'Growth' : 'Equity'}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div><div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Deployed</div><div className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">{gbp(allocSlices[allocPick].value)}</div></div>
                <div><div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Yield</div><div className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">{allocSlices[allocPick].yield > 0 ? `${allocSlices[allocPick].yield.toFixed(1)}%` : '~0%'}</div></div>
                <div><div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">£/mo gross</div><div className="text-[13px] font-semibold text-[var(--green)] tabular-nums">{gbp(allocSlices[allocPick].monthly)}</div></div>
                <div><div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Pays</div><div className="text-[13px] font-semibold text-[var(--text-primary)]">{allocSlices[allocPick].freq}</div></div>
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: allocSlices[allocPick].navState === 'good' ? 'var(--green)' : allocSlices[allocPick].navState === 'watch' ? 'var(--orange)' : allocSlices[allocPick].navState === 'risk' ? 'var(--red)' : 'var(--text-tertiary)' }} />
                NAV stability: {allocSlices[allocPick].nav}
              </div>
            </div>
          )}

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
            62% equity-income (covered-call) / 38% bonds-credit, screened for 2-year capital stability, plus a fixed £90k growth sleeve (NVDA · GOOGL · TSLA). Tap any holding for its yield, NAV stability and monthly income.
          </p>
        </SectionCard>

        {/* ---------- business revenue forecast ---------- */}
        <SectionCard index={5} eyebrow="Business" title="Revenue Forecast" accent="var(--green)">
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
      </div>
    </div>
  );
}

function ScenarioRow({ s, active, onClick }: { s: ScenarioResult; active: boolean; onClick: () => void }) {
  const fill = Math.min((s.totalMo / FREEDOM_TARGET_MONTHLY) * 100, 100);
  const color = s.clears ? 'var(--green)' : 'var(--orange)';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl px-2.5 py-2 transition-colors ${active ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]' : 'hover:bg-[var(--bg-elevated)]'}`}
    >
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
    </button>
  );
}
