'use client';

import { useEffect, useState } from 'react';

type Spark = number[];

interface Kpi {
  netWorth: number | null;
  netWorthSpark: Spark;
  netWorthMonthDelta: number | null;
  netWorthEoyProjection: number | null;
  monthRevenue: number | null;
  monthCharges: number | null;
  revenueSpark: Spark;
  revenueRunRate: number | null;
  visitorsToday: number | null;
  pageViewsToday: number | null;
  visitorSpark: Spark;
  liveNow: number | null;
  liveSites: number | null;
}

function Sparkline({ data, color }: { data: Spark; color: string }) {
  if (!data || data.length < 2) return <div className="h-9" />;
  const w = 120;
  const h = 36;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `spark-${color.replace(/[^a-z]/gi, '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-9">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EyeToggle({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      aria-label={revealed ? 'Hide net worth' : 'Reveal net worth'}
      className="w-7 h-7 -mr-1 -mt-1 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
    >
      {revealed ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.3 9.3 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.2M6.2 6.2A12.4 12.4 0 003 12c0 2.5 4 7 9 7a9 9 0 003.6-.7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      )}
    </button>
  );
}

function KpiCard({
  label,
  value,
  loading,
  delta,
  spark,
  color,
  footnote,
  href,
  index,
  blur,
  onToggleBlur,
}: {
  label: string;
  value: string;
  loading: boolean;
  delta?: { text: string; positive?: boolean } | null;
  spark: Spark;
  color: string;
  footnote?: string;
  href?: string;
  index: number;
  blur?: boolean;
  onToggleBlur?: () => void;
}) {
  const hidden = !!blur;
  const blurCls = hidden ? 'blur-[7px] select-none pointer-events-none' : '';
  const inner = (
    <div
      className="glass card-hl lift rise-in p-4 sm:p-5 h-full flex flex-col justify-between min-h-[148px]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="section-eyebrow">{label}</span>
        <div className="flex items-center gap-1.5">
          {delta && !loading && !hidden && (
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                color: delta.positive ? 'var(--green)' : 'var(--red)',
                background: delta.positive ? 'var(--green-soft)' : 'var(--red-soft)',
              }}
            >
              {delta.positive ? '↑' : '↓'} {delta.text}
            </span>
          )}
          {onToggleBlur && !loading && <EyeToggle revealed={!hidden} onToggle={onToggleBlur} />}
        </div>
      </div>

      <div className="mt-2">
        {loading ? (
          <div className="skeleton h-8 w-28" />
        ) : (
          <div className={`text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--text-primary)] tabular-nums transition-all ${blurCls}`}>
            {value}
          </div>
        )}
      </div>

      <div className={`mt-1 -mx-1 transition-all ${blurCls}`}>
        {loading ? <div className="h-9" /> : <Sparkline data={spark} color={color} />}
      </div>

      {footnote && !loading && (
        <div className={`mt-1 text-[11px] text-[var(--text-tertiary)] transition-all ${blurCls}`}>{footnote}</div>
      )}
    </div>
  );

  return href ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

const empty: Kpi = {
  netWorth: null, netWorthSpark: [], netWorthMonthDelta: null, netWorthEoyProjection: null,
  monthRevenue: null, monthCharges: null, revenueSpark: [], revenueRunRate: null,
  visitorsToday: null, pageViewsToday: null, visitorSpark: [],
  liveNow: null, liveSites: null,
};

const ANNUAL_BLEND = 0.078; // long-run blended return used for EOY projection

type DoneKey = 'net' | 'rev' | 'vis' | 'live';

export default function HeroStats() {
  const [kpi, setKpi] = useState<Kpi>(empty);
  const [done, setDone] = useState<Record<DoneKey, boolean>>({ net: false, rev: false, vis: false, live: false });
  const [revealNetWorth, setRevealNetWorth] = useState(false); // blurred by default for privacy

  useEffect(() => {
    let alive = true;
    const j = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const merge = (patch: Partial<Kpi>, key: DoneKey) => {
      if (!alive) return;
      setKpi((prev) => ({ ...prev, ...patch }));
      setDone((prev) => ({ ...prev, [key]: true }));
    };

    // Net worth — finances + 1M history (independent, fast)
    Promise.all([j('/api/finances'), j('/api/finances/history?range=1M')]).then(([fin, hist]) => {
      const patch: Partial<Kpi> = {};
      if (fin?.totals?.netWorth != null) patch.netWorth = fin.totals.netWorth;
      if (Array.isArray(hist?.history) && hist.history.length > 1) {
        const series = hist.history.map((p: { value: number }) => p.value);
        patch.netWorthSpark = series;
        const first = series[0];
        const last = series[series.length - 1];
        if (first) patch.netWorthMonthDelta = ((last - first) / first) * 100;
        if (patch.netWorth == null) patch.netWorth = last;
      }
      if (patch.netWorth != null) {
        const now = new Date();
        const monthsLeft = 12 - now.getMonth() - now.getDate() / 30;
        patch.netWorthEoyProjection = patch.netWorth * (1 + (ANNUAL_BLEND * monthsLeft) / 12);
      }
      merge(patch, 'net');
    });

    // Revenue — Stripe (can be slow; updates on its own)
    j('/api/stripe-revenue').then((stripe) => {
      const patch: Partial<Kpi> = {};
      if (stripe) {
        // Stripe amounts are in pence
        patch.monthRevenue = (stripe.thisMonthRevenue ?? 0) / 100;
        patch.monthCharges = stripe.thisMonthCharges ?? 0;
        const series: { date: string; revenue: number }[] = Array.isArray(stripe.dailySeries) ? stripe.dailySeries : [];
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthDays = series.filter((d) => d.date?.startsWith(ym));
        patch.revenueSpark = (monthDays.length > 1 ? monthDays : series.slice(-30)).map((d) => d.revenue / 100);
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        if (patch.monthRevenue != null && dayOfMonth > 0) {
          patch.revenueRunRate = (patch.monthRevenue / dayOfMonth) * daysInMonth;
        }
      }
      merge(patch, 'rev');
    });

    // Visitors today
    j('/api/analytics/combined?range=today').then((combined) => {
      const patch: Partial<Kpi> = {};
      if (Array.isArray(combined?.hourly)) {
        const hourly = combined.hourly as { pageViews: number; users: number }[];
        patch.visitorsToday = hourly.reduce((s, h) => s + (h.users || 0), 0);
        patch.pageViewsToday = hourly.reduce((s, h) => s + (h.pageViews || 0), 0);
        patch.visitorSpark = hourly.map((h) => h.pageViews || 0);
      }
      merge(patch, 'vis');
    });

    // Live now
    j('/api/analytics/realtime').then((realtime) => {
      const patch: Partial<Kpi> = {};
      if (Array.isArray(realtime?.data)) {
        const rows = realtime.data as { realtimeUsers: number }[];
        patch.liveNow = rows.reduce((s, r) => s + (r.realtimeUsers || 0), 0);
        patch.liveSites = rows.filter((r) => (r.realtimeUsers || 0) > 0).length;
      }
      merge(patch, 'live');
    });

    return () => { alive = false; };
  }, []);

  const gbp = (n: number, opts: { k?: boolean } = {}) => {
    if (opts.k) {
      if (Math.abs(n) >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
      if (Math.abs(n) >= 1000) return `£${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
    }
    return `£${Math.round(n).toLocaleString()}`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <KpiCard
        index={0}
        label="Net Worth"
        loading={!done.net}
        value={kpi.netWorth != null ? gbp(kpi.netWorth) : '—'}
        delta={kpi.netWorthMonthDelta != null ? { text: `${Math.abs(kpi.netWorthMonthDelta).toFixed(1)}% mo`, positive: kpi.netWorthMonthDelta >= 0 } : null}
        spark={kpi.netWorthSpark}
        color="var(--accent)"
        footnote={kpi.netWorthEoyProjection != null ? `Projected ${gbp(kpi.netWorthEoyProjection, { k: true })} by year-end` : undefined}
        href="/finances"
        blur={!revealNetWorth}
        onToggleBlur={() => setRevealNetWorth((v) => !v)}
      />
      <KpiCard
        index={1}
        label="Revenue · Month"
        loading={!done.rev}
        value={kpi.monthRevenue != null ? gbp(kpi.monthRevenue) : '—'}
        delta={kpi.monthCharges != null ? { text: `${kpi.monthCharges} sales`, positive: true } : null}
        spark={kpi.revenueSpark}
        color="var(--green)"
        footnote={kpi.revenueRunRate != null ? `Run-rate ${gbp(kpi.revenueRunRate)}/mo` : undefined}
        href="/growth"
      />
      <KpiCard
        index={2}
        label="Visitors · Today"
        loading={!done.vis}
        value={kpi.visitorsToday != null ? kpi.visitorsToday.toLocaleString() : '—'}
        delta={null}
        spark={kpi.visitorSpark}
        color="var(--cyan)"
        footnote={kpi.pageViewsToday != null ? `${kpi.pageViewsToday.toLocaleString()} page views today` : undefined}
        href="/growth"
      />
      <KpiCard
        index={3}
        label="Live Now"
        loading={!done.live}
        value={kpi.liveNow != null ? kpi.liveNow.toLocaleString() : '—'}
        delta={null}
        spark={kpi.visitorSpark}
        color="var(--orange)"
        footnote={kpi.liveSites != null ? `Active on ${kpi.liveSites} site${kpi.liveSites === 1 ? '' : 's'}` : undefined}
      />
    </div>
  );
}
