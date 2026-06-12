'use client';

import { useEffect, useMemo, useState } from 'react';
import { projects } from '@/lib/projects';
import { Module, Segmented, MiniSpark, fmtNum, fmtCompact } from './DashKit';

interface Detail {
  spark: number[];
  sources: { source: string; sessions: number; users: number }[];
  topPages: { path: string; views: number }[];
}
interface Gsc {
  clicks: number;
  impressions: number;
  position: number;
  topQueries: { query: string; clicks: number; position: number }[];
}
interface Site {
  id: string;
  name: string;
  color: string;
  url: string;
  hasGsc: boolean;
  status: 'up' | 'slow' | 'down' | 'unknown';
  responseTime: number | null;
  today: number;
  month: number;
  total: number;
  live: number;
}

type Sort = 'traffic' | 'live' | 'today';

const STATUS_COLOR: Record<string, string> = { up: 'var(--green)', slow: 'var(--yellow)', down: 'var(--red)', unknown: 'var(--text-tertiary)' };

export default function SitesBoard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('traffic');
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [gsc, setGsc] = useState<Record<string, Gsc>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([
      j('/api/analytics'),
      j('/api/pageviews?view=summary'),
      j('/api/analytics/realtime'),
      j('/api/health'),
    ]).then(([ga, pv, rt, health]) => {
      if (!alive) return;
      const gaMap = new Map<string, { activeUsers: number; monthVisitors: number; totalVisitors: number }>(
        (ga?.data ?? []).map((r: { siteId: string; activeUsers: number; monthVisitors: number; totalVisitors: number }) => [r.siteId, r])
      );
      const tracked = (pv ?? {}) as Record<string, { today: number; month: number; total: number }>;
      const rtMap = new Map<string, number>((rt?.data ?? []).map((r: { siteId: string; realtimeUsers: number }) => [r.siteId, r.realtimeUsers]));
      const healthMap = new Map<string, { status: string; responseTime: number | null }>(
        (Array.isArray(health) ? health : []).map((r: { siteId: string; status: string; responseTime: number | null }) => [r.siteId, r])
      );

      const list: Site[] = projects
        .filter((p) => p.url && p.id !== 'dashboard')
        .map((p) => {
          const g = gaMap.get(p.id);
          const t = tracked[p.id];
          const h = healthMap.get(p.id);
          return {
            id: p.id,
            name: p.name,
            color: p.color,
            url: p.url,
            hasGsc: !!p.gscSiteUrl,
            status: (h?.status as Site['status']) ?? 'unknown',
            responseTime: h?.responseTime ?? null,
            today: Math.max(g?.activeUsers ?? 0, t?.today ?? 0),
            month: Math.max(g?.monthVisitors ?? 0, t?.month ?? 0),
            total: Math.max(g?.totalVisitors ?? 0, t?.total ?? 0),
            live: rtMap.get(p.id) ?? 0,
          };
        });
      setSites(list);
      setLoading(false);

      // Enrich every site with a sparkline + detail (parallel).
      list.forEach((s) => {
        j(`/api/analytics/${s.id}?range=1m`).then((d) => {
          if (!alive) return;
          setDetails((prev) => ({
            ...prev,
            [s.id]: {
              spark: (d?.hourly ?? []).map((h: { pageViews: number }) => h.pageViews),
              sources: d?.sources ?? [],
              topPages: d?.topPages ?? [],
            },
          }));
        });
      });
    });
    return () => { alive = false; };
  }, []);

  const sorted = useMemo(() => {
    const arr = [...sites];
    if (sort === 'traffic') arr.sort((a, b) => b.month - a.month);
    else if (sort === 'live') arr.sort((a, b) => b.live - a.live || b.today - a.today);
    else arr.sort((a, b) => b.today - a.today);
    return arr;
  }, [sites, sort]);

  const liveTotal = sites.reduce((s, x) => s + x.live, 0);
  const upCount = sites.filter((s) => s.status === 'up').length;
  const visible = showAll ? sorted : sorted.slice(0, 9);

  function toggle(id: string) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) {
      const s = sites.find((x) => x.id === id);
      if (s && !details[id]) {
        fetch(`/api/analytics/${id}?range=1m`).then((r) => r.ok ? r.json() : null).then((d) => {
          if (d) setDetails((prev) => ({ ...prev, [id]: { spark: (d.hourly ?? []).map((h: { pageViews: number }) => h.pageViews), sources: d.sources ?? [], topPages: d.topPages ?? [] } }));
        }).catch(() => {});
      }
      if (s?.hasGsc && !gsc[id]) {
        fetch(`/api/gsc/${id}`).then((r) => r.ok ? r.json() : null).then((d) => {
          if (d) setGsc((prev) => ({ ...prev, [id]: d }));
        }).catch(() => {});
      }
    }
  }

  return (
    <Module
      eyebrow="Network"
      title="Sites"
      accent="var(--cyan)"
      icon={<span>🌐</span>}
      right={
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] pulse-dot" /> {liveTotal} live · {upCount}/{sites.length} up
          </span>
          <Segmented
            value={sort}
            onChange={setSort}
            options={[{ value: 'traffic', label: 'Top' }, { value: 'live', label: 'Live' }, { value: 'today', label: 'Today' }]}
          />
        </div>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((s) => {
              const d = details[s.id];
              const isOpen = expanded === s.id;
              return (
                <div key={s.id} className={`rounded-2xl border border-[var(--hairline)] bg-[var(--bg-card-2)] overflow-hidden transition-all ${isOpen ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
                  <button onClick={() => toggle(s.id)} className="w-full text-left p-3.5 hover:bg-[var(--surface-hover)] transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{s.name}</span>
                      </div>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        {s.live > 0 && <span className="text-[10px] font-semibold text-[var(--green)] tabular-nums">{s.live}●</span>}
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[s.status] }} title={s.status} />
                      </span>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <div className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums leading-none">{fmtNum(s.month)}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">visitors / month</div>
                      </div>
                      <div className="text-right text-[10px] text-[var(--text-tertiary)] leading-tight">
                        <div><b className="text-[var(--text-secondary)]">{fmtNum(s.today)}</b> today</div>
                        <div>{fmtCompact(s.total)} all-time</div>
                      </div>
                    </div>
                    <div className="mt-2 -mb-1 h-8">
                      <MiniSpark data={d?.spark ?? []} color={s.color} height={32} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-[var(--hairline)] fade-in">
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] mb-3 pt-2">
                        <a href={s.url} target="_blank" rel="noopener" className="text-[var(--accent)] hover:underline truncate">{s.url.replace(/^https?:\/\//, '')}</a>
                        <span>{s.responseTime != null ? `${s.responseTime}ms` : '—'} · {s.status}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <DetailCol title="Top pages" items={(d?.topPages ?? []).slice(0, 5).map((p) => ({ a: p.path, b: fmtNum(p.views) }))} />
                        <DetailCol title="Sources" items={(d?.sources ?? []).slice(0, 5).map((p) => ({ a: p.source || 'direct', b: fmtNum(p.users) }))} />
                        {s.hasGsc ? (
                          <div>
                            <div className="section-eyebrow mb-2">Search (GSC 28d)</div>
                            {gsc[s.id] ? (
                              <>
                                <div className="flex gap-3 text-[11px] mb-2">
                                  <span><b className="text-[var(--text-primary)]">{fmtNum(gsc[s.id].clicks)}</b> <span className="text-[var(--text-tertiary)]">clicks</span></span>
                                  <span><b className="text-[var(--text-primary)]">{fmtCompact(gsc[s.id].impressions)}</b> <span className="text-[var(--text-tertiary)]">impr</span></span>
                                  <span><b className="text-[var(--text-primary)]">{gsc[s.id].position?.toFixed(1)}</b> <span className="text-[var(--text-tertiary)]">pos</span></span>
                                </div>
                                <DetailCol title="" items={(gsc[s.id].topQueries ?? []).slice(0, 4).map((q) => ({ a: q.query, b: fmtNum(q.clicks) }))} />
                              </>
                            ) : <div className="text-[11px] text-[var(--text-tertiary)]">Loading…</div>}
                          </div>
                        ) : (
                          <DetailCol title="Source mix" items={[]} empty="No Search Console" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {sorted.length > 9 && (
            <button onClick={() => setShowAll(!showAll)} className="mt-3 w-full text-center text-[12px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
              {showAll ? 'Show less' : `Show all ${sorted.length} sites`}
            </button>
          )}
        </>
      )}
    </Module>
  );
}

function DetailCol({ title, items, empty }: { title: string; items: { a: string; b: string }[]; empty?: string }) {
  return (
    <div>
      {title && <div className="section-eyebrow mb-2">{title}</div>}
      {items.length === 0 ? (
        <div className="text-[11px] text-[var(--text-tertiary)]">{empty || '—'}</div>
      ) : (
        <div className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--text-secondary)] truncate">{it.a}</span>
              <span className="text-[var(--text-primary)] font-medium tabular-nums flex-shrink-0">{it.b}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
