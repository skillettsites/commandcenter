'use client';

import { useEffect, useState } from 'react';
import { projects } from '@/lib/projects';
import { Module, MiniSpark, fmtNum, fmtCompact, gbp, gbpCompact } from './DashKit';

/* ----------------------------- helpers ----------------------------- */
const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function wow(daily: number[]): { now: number; prev: number; pct: number | null } {
  if (daily.length < 8) {
    const now = daily.reduce((s, v) => s + v, 0);
    return { now, prev: 0, pct: null };
  }
  const last14 = daily.slice(-14);
  const pad = last14.length < 14 ? new Array(14 - last14.length).fill(0).concat(last14) : last14;
  const now = pad.slice(7).reduce((s, v) => s + v, 0);
  const prev = pad.slice(0, 7).reduce((s, v) => s + v, 0);
  const pct = prev > 0 ? ((now - prev) / prev) * 100 : now > 0 ? 100 : 0;
  return { now, prev, pct };
}

const pidColor = (id: string) => projects.find((p) => p.id === id)?.color ?? 'var(--accent)';
const pidName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

/* ----------------------------- types ----------------------------- */
interface SiteTrend {
  id: string;
  name: string;
  color: string;
  visitorsWow: ReturnType<typeof wow>;
  visitorSpark: number[];
  imprWow: ReturnType<typeof wow> | null;
  clicksWow: ReturnType<typeof wow> | null;
  imprSpark: number[];
}
interface Insight { tone: 'good' | 'watch' | 'info'; icon: string; title: string; detail: string; metric: string; score: number; }

const TONE: Record<Insight['tone'], { color: string; bg: string }> = {
  good: { color: 'var(--green)', bg: 'var(--green-soft)' },
  watch: { color: 'var(--orange)', bg: 'rgba(255,159,10,0.14)' },
  info: { color: 'var(--cyan)', bg: 'rgba(52,212,224,0.14)' },
};

export default function TrendingBoard() {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteTrend[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [topSearches, setTopSearches] = useState<{ site: string; query: string; count: number }[]>([]);
  const [revenue, setRevenue] = useState<{ pct: number | null; now: number; prev: number; spark: number[] } | null>(null);
  const [signups, setSignups] = useState<{ pct: number | null; now: number; prev: number; spark: number[] } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const combined = await j('/api/analytics/combined?range=1m');
      const perSite: { siteId: string }[] = combined?.perSite ?? [];
      const targets = perSite.slice(0, 12).map((s) => {
        const p = projects.find((x) => x.id === s.siteId);
        return { id: s.siteId, hasGsc: !!p?.gscSiteUrl };
      });

      // Per-site deep analysis (concurrency-limited so we don't swamp the server).
      const analyzed = await mapLimit(targets, 5, async (t): Promise<SiteTrend> => {
        const [a, g] = await Promise.all([
          j(`/api/analytics/${t.id}?range=1m`),
          t.hasGsc ? j(`/api/gsc/${t.id}/daily`) : Promise.resolve(null),
        ]);
        const hourly: { pageViews: number; users: number }[] = a?.hourly ?? [];
        const visitorSpark = hourly.map((h) => h.pageViews || 0).slice(-14);
        const visitorsWow = wow(hourly.map((h) => h.users || 0));
        const google: { impressions: number; clicks: number }[] = g?.google ?? [];
        const imprWow = google.length ? wow(google.map((d) => d.impressions || 0)) : null;
        const clicksWow = google.length ? wow(google.map((d) => d.clicks || 0)) : null;
        const imprSpark = google.map((d) => d.impressions || 0).slice(-14);
        return { id: t.id, name: pidName(t.id), color: pidColor(t.id), visitorsWow, visitorSpark, imprWow, clicksWow, imprSpark };
      });

      const [stripe, searchTop, signupData] = await Promise.all([
        j('/api/stripe-revenue'),
        j('/api/searches?view=top'),
        j('/api/signups'),
      ]);

      if (!alive) return;

      // revenue WoW from daily series (pence)
      let rev: typeof revenue = null;
      if (stripe?.dailySeries?.length) {
        const series = (stripe.dailySeries as { revenue: number }[]).map((d) => d.revenue / 100);
        const w = wow(series);
        rev = { ...w, spark: series.slice(-14) };
      }
      setRevenue(rev);

      // signups WoW from byDate
      let sg: typeof signups = null;
      if (signupData?.byDate?.length) {
        const series = (signupData.byDate as { count: number }[]).map((d) => d.count);
        const w = wow(series);
        sg = { ...w, spark: series.slice(-14) };
      }
      setSignups(sg);

      // top on-site searches (merge across search sites)
      const ts: { site: string; query: string; count: number }[] = [];
      if (searchTop && typeof searchTop === 'object') {
        for (const [siteId, v] of Object.entries(searchTop as Record<string, { top?: { query: string; count: number }[] }>)) {
          for (const q of v?.top ?? []) ts.push({ site: siteId, query: q.query, count: q.count });
        }
      }
      ts.sort((a, b) => b.count - a.count);
      setTopSearches(ts.slice(0, 10));

      setSites(analyzed);
      setInsights(buildInsights(analyzed, rev, sg, ts));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="glass p-5 h-24"><div className="skeleton h-full w-full" /></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="glass p-6 h-72"><div className="skeleton h-full w-full" /></div>)}
        </div>
      </div>
    );
  }

  const rising = [...sites].filter((s) => s.visitorsWow.pct != null && s.visitorsWow.now >= 20).sort((a, b) => (b.visitorsWow.pct ?? 0) - (a.visitorsWow.pct ?? 0));
  const slipping = [...rising].reverse().filter((s) => (s.visitorsWow.pct ?? 0) < 0);
  const momentum = [...sites].filter((s) => s.imprWow && s.imprWow.now >= 50).sort((a, b) => (b.imprWow!.pct ?? 0) - (a.imprWow!.pct ?? 0));

  return (
    <div className="space-y-5 lg:space-y-6">
      <p className="text-[14px] text-[var(--text-secondary)] max-w-2xl">
        What changed this week and what&apos;s worth your attention — movers, search momentum, and the takeaways across the network.
      </p>

      {/* ---------- worth noting ---------- */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {insights.map((ins, i) => (
            <div key={i} className="glass card-hl lift rise-in p-4 flex gap-3" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] flex-shrink-0" style={{ background: TONE[ins.tone].bg }}>{ins.icon}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{ins.title}</span>
                  <span className="text-[12px] font-bold tabular-nums flex-shrink-0" style={{ color: TONE[ins.tone].color }}>{ins.metric}</span>
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-snug">{ins.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
        {/* ---------- traffic movers ---------- */}
        <Module eyebrow="Momentum" title="Traffic Movers" accent="var(--cyan)" icon={<span>📊</span>}>
          <div className="text-[10px] text-[var(--text-tertiary)] mb-2">Visitors this week vs last week</div>
          {rising.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">Not enough history yet.</p> : (
            <div className="space-y-2.5">
              {rising.slice(0, 8).map((s) => <MoverRow key={s.id} s={s} w={s.visitorsWow} spark={s.visitorSpark} unit="visitors" />)}
            </div>
          )}
        </Module>

        {/* ---------- search momentum ---------- */}
        <Module eyebrow="Leading indicator" title="Search Momentum" accent="var(--accent)" icon={<span>🔎</span>}>
          <div className="text-[10px] text-[var(--text-tertiary)] mb-2">Google impressions WoW — these rise before clicks &amp; traffic do</div>
          {momentum.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">No Search Console momentum data.</p> : (
            <div className="space-y-2.5">
              {momentum.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-[var(--text-primary)] font-medium truncate">{s.name}</span>
                      <span className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                        <span className="text-[var(--text-tertiary)] text-[10px]">{fmtCompact(s.imprWow!.now)} impr</span>
                        <WowBadge pct={s.imprWow!.pct} />
                      </span>
                    </div>
                  </div>
                  <div className="w-16 flex-shrink-0"><MiniSpark data={s.imprSpark} color={s.color} height={24} /></div>
                </div>
              ))}
            </div>
          )}
        </Module>

        {/* ---------- trending searches ---------- */}
        <Module eyebrow="Demand" title="Trending Searches" accent="var(--orange)" icon={<span>🔥</span>}>
          <div className="text-[10px] text-[var(--text-tertiary)] mb-2">Most-searched on your sites right now</div>
          {topSearches.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">No search data.</p> : (
            <div className="space-y-1.5">
              {topSearches.map((q, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[12px] py-1 border-b border-[var(--hairline)] last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-[var(--text-tertiary)] w-4 text-right tabular-nums">{i + 1}</span>
                    <span className="text-[var(--text-primary)] font-medium truncate">{q.query || '—'}</span>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pidColor(q.site) }} title={pidName(q.site)} />
                  </div>
                  <span className="text-[var(--text-secondary)] tabular-nums flex-shrink-0">{fmtNum(q.count)}×</span>
                </div>
              ))}
            </div>
          )}
        </Module>

        {/* ---------- revenue & signup momentum ---------- */}
        <Module eyebrow="Business" title="Revenue & Signups" accent="var(--green)" icon={<span>⚡</span>}>
          <div className="space-y-4">
            <MomentumStat label="Revenue · this week" w={revenue} spark={revenue?.spark ?? []} color="var(--green)" fmt={(v) => gbp(v)} />
            <MomentumStat label="New signups · this week" w={signups} spark={signups?.spark ?? []} color="var(--purple)" fmt={(v) => fmtNum(Math.round(v))} />
          </div>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-4">Last 7 days vs the 7 before. Revenue from Stripe + Supabase; signups from shared auth.</p>
        </Module>
      </div>
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */
function WowBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[10px] text-[var(--text-tertiary)]">new</span>;
  const up = pct >= 0;
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function MoverRow({ s, w, spark, unit }: { s: SiteTrend; w: ReturnType<typeof wow>; spark: number[]; unit: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-[var(--text-primary)] font-medium truncate">{s.name}</span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{fmtNum(w.now)} {unit}</span>
            <WowBadge pct={w.pct} />
          </span>
        </div>
      </div>
      <div className="w-16 flex-shrink-0"><MiniSpark data={spark} color={s.color} height={24} /></div>
    </div>
  );
}

function MomentumStat({ label, w, spark, color, fmt }: { label: string; w: { pct: number | null; now: number; prev: number } | null; spark: number[]; color: string; fmt: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-1">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</div>
          <div className="text-[22px] font-bold text-[var(--text-primary)] tabular-nums">{w ? fmt(w.now) : '—'}</div>
        </div>
        <div className="text-right">
          <WowBadge pct={w?.pct ?? null} />
          {w && <div className="text-[10px] text-[var(--text-tertiary)] tabular-nums">was {fmt(w.prev)}</div>}
        </div>
      </div>
      <MiniSpark data={spark} color={color} height={30} />
    </div>
  );
}

/* ----------------------------- insight engine ----------------------------- */
function buildInsights(
  sites: SiteTrend[],
  rev: { pct: number | null; now: number; prev: number } | null,
  sg: { pct: number | null; now: number; prev: number } | null,
  searches: { site: string; query: string; count: number }[],
): Insight[] {
  const out: Insight[] = [];

  const gainers = sites.filter((s) => s.visitorsWow.pct != null && s.visitorsWow.now >= 30).sort((a, b) => (b.visitorsWow.pct ?? 0) - (a.visitorsWow.pct ?? 0));
  const top = gainers[0];
  if (top && (top.visitorsWow.pct ?? 0) >= 15) {
    out.push({ tone: 'good', icon: '📈', title: `${top.name} is trending up`, metric: `+${(top.visitorsWow.pct ?? 0).toFixed(0)}%`, detail: `${fmtNum(top.visitorsWow.prev)} → ${fmtNum(top.visitorsWow.now)} weekly visitors`, score: 100 + (top.visitorsWow.pct ?? 0) });
  }
  const faller = [...sites].filter((s) => s.visitorsWow.pct != null && s.visitorsWow.now >= 20 && (s.visitorsWow.pct ?? 0) <= -15).sort((a, b) => (a.visitorsWow.pct ?? 0) - (b.visitorsWow.pct ?? 0))[0];
  if (faller) {
    out.push({ tone: 'watch', icon: '📉', title: `${faller.name} traffic slipping`, metric: `${(faller.visitorsWow.pct ?? 0).toFixed(0)}%`, detail: `Down to ${fmtNum(faller.visitorsWow.now)} weekly visitors from ${fmtNum(faller.visitorsWow.prev)} — worth a look`, score: 90 + Math.abs(faller.visitorsWow.pct ?? 0) });
  }
  const surge = sites.filter((s) => s.imprWow && s.imprWow.now >= 200 && (s.imprWow.pct ?? 0) >= 25).sort((a, b) => (b.imprWow!.pct ?? 0) - (a.imprWow!.pct ?? 0))[0];
  if (surge) {
    out.push({ tone: 'info', icon: '🔎', title: `${surge.name} impressions climbing`, metric: `+${(surge.imprWow!.pct ?? 0).toFixed(0)}%`, detail: `${fmtCompact(surge.imprWow!.now)} Google impressions this week — clicks usually follow`, score: 80 + (surge.imprWow!.pct ?? 0) });
  }
  // clicks rising even faster (already converting)
  const clickRise = sites.filter((s) => s.clicksWow && s.clicksWow.now >= 30 && (s.clicksWow.pct ?? 0) >= 25).sort((a, b) => (b.clicksWow!.pct ?? 0) - (a.clicksWow!.pct ?? 0))[0];
  if (clickRise && clickRise.id !== surge?.id) {
    out.push({ tone: 'good', icon: '🚀', title: `${clickRise.name} winning clicks`, metric: `+${(clickRise.clicksWow!.pct ?? 0).toFixed(0)}%`, detail: `${fmtNum(clickRise.clicksWow!.now)} Google clicks this week, up from ${fmtNum(clickRise.clicksWow!.prev)}`, score: 75 + (clickRise.clicksWow!.pct ?? 0) });
  }
  if (rev && rev.pct != null && rev.now > 0) {
    if (rev.pct >= 20) out.push({ tone: 'good', icon: '💷', title: 'Revenue accelerating', metric: `+${rev.pct.toFixed(0)}%`, detail: `${gbp(rev.now)} this week vs ${gbp(rev.prev)} last week`, score: 85 + rev.pct });
    else if (rev.pct <= -25) out.push({ tone: 'watch', icon: '💷', title: 'Revenue cooling off', metric: `${rev.pct.toFixed(0)}%`, detail: `${gbp(rev.now)} this week, down from ${gbp(rev.prev)}`, score: 70 + Math.abs(rev.pct) });
  }
  if (sg && sg.pct != null && sg.now >= 3 && sg.pct >= 40) {
    out.push({ tone: 'good', icon: '👤', title: 'Signups picking up', metric: `+${sg.pct.toFixed(0)}%`, detail: `${sg.now} new users this week vs ${sg.prev} last week`, score: 60 + sg.pct });
  }
  if (searches[0]) {
    out.push({ tone: 'info', icon: '🔥', title: `Most searched: ${searches[0].query}`, metric: `${fmtNum(searches[0].count)}×`, detail: `Top query on ${pidName(searches[0].site)} this period`, score: 50 });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}
