'use client';

import { useState, useEffect } from 'react';
import { projects } from '@/lib/projects';

interface HourlyData {
  dateHour: string;
  pageViews: number;
  users: number;
  sessions: number;
}

interface PerSiteData {
  siteId: string;
  name: string;
  color: string;
  pageViews: number;
  users: number;
}

interface CombinedData {
  hourly: HourlyData[];
  perSite: PerSiteData[];
}

interface SiteTodayData {
  siteId: string;
  name: string;
  color: string;
  visitors: number;
  pageViews: number;
  source: string; // which source provided the best number
}

interface AggregatedStats {
  todayVisitors: number;
  monthVisitors: number;
  allTimeVisitors: number;
  todayPageViews: number;
  monthPageViews: number;
  allTimePageViews: number;
  sources: { vercel: boolean; ga: boolean; tracked: boolean };
  sitesToday: SiteTodayData[];
}

const RANGE_LABEL: Record<string, string> = { '1h': 'Last Hour', 'today': 'Today', '24h': 'Last 24 Hours', '1m': 'Last 30 Days', 'all': 'All Time' };

export default function AllSitesStats() {
  const [expanded, setExpanded] = useState(true);
  const [chartRange, setChartRange] = useState<'1h' | 'today' | '24h' | '1m' | 'all'>('1h');
  const [data, setData] = useState<CombinedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AggregatedStats | null>(null);

  // Fetch all three data sources on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/analytics').then(res => res.ok ? res.json() : null).catch(() => null),
      fetch('/api/pageviews?view=summary').then(res => res.ok ? res.json() : null).catch(() => null),
      fetch('/api/vercel-analytics').then(res => res.ok ? res.json() : null).catch(() => null),
    ])
      .then(([gaJson, pvJson, vercelJson]) => {
        // GA4 data
        const gaResults = (gaJson?.data ?? []) as Array<{
          siteId: string;
          activeUsers: number;
          pageViews: number;
          monthVisitors: number;
          totalVisitors: number;
        }>;
        const gaMap = new Map(gaResults.map(r => [r.siteId, r]));

        // Supabase tracked pageviews
        const tracked = (pvJson ?? {}) as Record<string, { today: number; week: number; month: number; total: number }>;

        // Vercel Web Analytics
        const vercelResults = (vercelJson?.data ?? []) as Array<{
          siteId: string;
          today: { pageViews: number; visitors: number };
          month: { pageViews: number; visitors: number };
          allTime: { pageViews: number; visitors: number };
          enabled: boolean;
        }>;
        const vercelMap = new Map(vercelResults.map(r => [r.siteId, r]));

        const hasVercel = vercelResults.some(r => r.enabled);
        const hasGa = gaResults.length > 0;
        const hasTracked = Object.keys(tracked).length > 0;

        // Build per-site best numbers
        const allSiteIds = new Set([
          ...Object.keys(tracked),
          ...gaResults.map(r => r.siteId),
          ...vercelResults.map(r => r.siteId),
        ]);

        let todayTotal = 0;
        let monthTotal = 0;
        let allTimeTotal = 0;
        let todayPvTotal = 0;
        let monthPvTotal = 0;
        let allTimePvTotal = 0;

        const sitesToday: SiteTodayData[] = [];

        for (const siteId of allSiteIds) {
          const proj = projects.find(p => p.id === siteId);
          const pv = tracked[siteId];
          const ga = gaMap.get(siteId);
          const vc = vercelMap.get(siteId);

          // For each metric, take the MAX across all sources
          // This gives the most complete picture since each source misses some traffic
          const todayVisitors = Math.max(
            vc?.today.visitors ?? 0,
            ga?.activeUsers ?? 0,
            pv?.today ?? 0,
          );
          const monthVisitors = Math.max(
            vc?.month.visitors ?? 0,
            ga?.monthVisitors ?? 0,
            pv?.month ?? 0,
          );
          const allTimeVisitors = Math.max(
            vc?.allTime.visitors ?? 0,
            ga?.totalVisitors ?? 0,
            pv?.total ?? 0,
          );

          const todayPv = Math.max(
            vc?.today.pageViews ?? 0,
            ga?.pageViews ?? 0,
            pv?.today ?? 0,
          );
          const monthPv = Math.max(
            vc?.month.pageViews ?? 0,
            pv?.month ?? 0,
          );
          const allTimePv = Math.max(
            vc?.allTime.pageViews ?? 0,
            pv?.total ?? 0,
          );

          todayTotal += todayVisitors;
          monthTotal += monthVisitors;
          allTimeTotal += allTimeVisitors;
          todayPvTotal += todayPv;
          monthPvTotal += monthPv;
          allTimePvTotal += allTimePv;

          // Determine best source for today
          const vcToday = vc?.today.visitors ?? 0;
          const gaToday = ga?.activeUsers ?? 0;
          const pvToday = pv?.today ?? 0;
          const bestToday = Math.max(vcToday, gaToday, pvToday);
          const source = bestToday === vcToday && vcToday > 0 ? 'Vercel'
            : bestToday === gaToday && gaToday > 0 ? 'GA4'
            : bestToday === pvToday && pvToday > 0 ? 'Tracked'
            : '';

          if (todayVisitors > 0) {
            sitesToday.push({
              siteId,
              name: proj?.name || siteId,
              color: proj?.color || '#888',
              visitors: todayVisitors,
              pageViews: todayPv,
              source,
            });
          }
        }

        sitesToday.sort((a, b) => b.visitors - a.visitors || b.pageViews - a.pageViews);

        setStats({
          todayVisitors: todayTotal,
          monthVisitors: monthTotal,
          allTimeVisitors: allTimeTotal,
          todayPageViews: todayPvTotal,
          monthPageViews: monthPvTotal,
          allTimePageViews: allTimePvTotal,
          sources: { vercel: hasVercel, ga: hasGa, tracked: hasTracked },
          sitesToday,
        });
      })
      .catch(() => {});
  }, []);

  // Fetch chart data when expanded or range changes
  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    fetch(`/api/analytics/combined?range=${chartRange}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => { if (json) setData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expanded, chartRange]);

  const cycleRange = () => {
    setChartRange(prev => prev === '1h' ? 'today' : prev === 'today' ? '24h' : prev === '24h' ? '1m' : prev === '1m' ? 'all' : '1h');
  };

  // Build source tag string
  const sourceTag = stats?.sources
    ? [
        stats.sources.vercel ? 'Vercel' : null,
        stats.sources.ga ? 'GA4' : null,
        stats.sources.tracked ? 'Tracked' : null,
      ].filter(Boolean).join(' + ')
    : '';

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            All Sites Stats
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        {stats && (
          <div className="flex items-center gap-3">
            {stats.allTimeVisitors > 0 && (
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                {stats.allTimeVisitors.toLocaleString()} total
              </span>
            )}
            {stats.monthVisitors > 0 && (
              <span className="text-[13px] text-[var(--text-secondary)]">
                {stats.monthVisitors.toLocaleString()} month
              </span>
            )}
            {stats.todayVisitors > 0 && (
              <span className="text-[13px] text-[var(--text-tertiary)]">
                {stats.todayVisitors} today
              </span>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="card overflow-hidden fade-in">
          <div className="p-3.5">
            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3 mb-1">
              <StatBox label="Today" value={stats?.todayVisitors ?? 0} secondary={stats ? `${stats.todayPageViews} pv` : undefined} />
              <StatBox label="This Month" value={stats?.monthVisitors ?? 0} secondary={stats ? `${stats.monthPageViews.toLocaleString()} pv` : undefined} />
              <StatBox label="All Time" value={stats?.allTimeVisitors ?? 0} secondary={stats ? `${stats.allTimePageViews.toLocaleString()} pv` : undefined} />
            </div>
            {sourceTag && (
              <p className="text-[9px] text-center text-[var(--text-tertiary)] opacity-50 mb-4">
                Best of: {sourceTag}
              </p>
            )}

            {/* Chart */}
            {loading && !data ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[12px] text-[var(--text-tertiary)]">Loading chart...</span>
              </div>
            ) : data ? (
              <>
                <CombinedChart
                  hourly={data.hourly}
                  range={chartRange}
                  onCycleRange={cycleRange}
                />

                {/* Per-site breakdown from chart data */}
                {data.perSite.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                      By Site ({RANGE_LABEL[chartRange]})
                    </p>
                    {data.perSite.map(site => (
                      <SiteBar key={site.siteId} site={site} max={data.perSite[0].pageViews} />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, secondary }: { label: string; value: number; secondary?: string }) {
  return (
    <div className="text-center">
      <p className="font-bold text-[var(--text-primary)] whitespace-nowrap text-[clamp(0.75rem,3.4vw,1.125rem)]">{value.toLocaleString()}</p>
      <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</p>
      {secondary && (
        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 opacity-60">{secondary}</p>
      )}
    </div>
  );
}

function CombinedChart({ hourly, range, onCycleRange }: { hourly: HourlyData[]; range: '1h' | 'today' | '24h' | '1m' | 'all'; onCycleRange: () => void }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Reset selection when range changes
  useEffect(() => { setSelectedIdx(null); }, [range]);

  if (hourly.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <button onClick={(e) => { e.stopPropagation(); onCycleRange(); }} className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider hover:underline cursor-pointer">
          {RANGE_LABEL[range]} &rarr;
        </button>
        <p className="text-[11px] text-[var(--text-tertiary)]">No data</p>
      </div>
    );
  }

  const totalViews = hourly.reduce((sum, h) => sum + h.pageViews, 0);
  const totalUsers = hourly.reduce((sum, h) => sum + h.users, 0);
  const displayData = (range === '24h' || range === 'today') ? hourly.slice(-24) : hourly;
  const maxViews = Math.max(...displayData.map(h => h.pageViews), 1);

  const chartWidth = 300;
  const chartHeight = 140;
  const pad = { top: 10, right: 8, bottom: 20, left: 8 };
  const innerW = chartWidth - pad.left - pad.right;
  const innerH = chartHeight - pad.top - pad.bottom;

  const points = displayData.map((h, i) => ({
    x: pad.left + (displayData.length === 1 ? innerW / 2 : (i / (displayData.length - 1)) * innerW),
    y: pad.top + innerH - (h.pageViews / maxViews) * innerH,
    views: h.pageViews,
    users: h.users,
    label: h.dateHour,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = points.length > 0
    ? `M${points[0].x},${pad.top + innerH} ${points.map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${pad.top + innerH} Z`
    : '';

  const labelStep = (range === '24h' || range === 'today') ? 6 : range === '1m' ? 7 : Math.max(1, Math.floor(displayData.length / 6));

  function formatLabel(raw: string): string {
    if (range === '24h' || range === 'today') {
      const hour = raw.slice(-2);
      return `${hour}:00`;
    }
    const clean = raw.replace(/-/g, '');
    const day = clean.slice(6, 8);
    const month = clean.slice(4, 6);
    return `${parseInt(day)}/${parseInt(month)}`;
  }

  function formatTooltip(raw: string): string {
    if (range === '24h' || range === 'today') {
      const hour = raw.slice(-2);
      return `${hour}:00`;
    }
    const clean = raw.replace(/-/g, '');
    const year = clean.slice(0, 4);
    const month = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
  }

  function handleChartClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation();
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - clickX);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setSelectedIdx(selectedIdx === closest ? null : closest);
  }

  const sel = selectedIdx !== null ? points[selectedIdx] : null;
  const color = 'var(--accent)';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <button onClick={(e) => { e.stopPropagation(); onCycleRange(); }} className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider hover:underline cursor-pointer">
          {RANGE_LABEL[range]} &rarr;
        </button>
        {sel ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--accent)]">{formatTooltip(sel.label)}</span>
            <span className="text-[11px] font-medium text-[var(--text-primary)]">{sel.views} views</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">{sel.users} users</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--text-primary)]">{totalViews.toLocaleString()} views</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">{totalUsers.toLocaleString()} users</span>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto cursor-pointer" preserveAspectRatio="xMidYMid meet" onClick={handleChartClick}>
        <defs>
          <linearGradient id="combined-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a84ff" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#0a84ff" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#combined-grad)" />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        {sel && (
          <line x1={sel.x} y1={pad.top} x2={sel.x} y2={pad.top + innerH} stroke={color} strokeWidth={1} opacity={0.5} strokeDasharray="3,3" />
        )}
        {displayData.length <= 31 && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={selectedIdx === i ? 5 : (p.views > 0 ? 3 : 1.5)} fill={selectedIdx === i ? 'white' : color} stroke={selectedIdx === i ? color : 'none'} strokeWidth={selectedIdx === i ? 2 : 0} opacity={p.views > 0 ? 1 : 0.3} />
        ))}
        {points.map((p, i) => {
          if (i % labelStep !== 0) return null;
          return (
            <text key={`label-${i}`} x={p.x} y={chartHeight - 2} textAnchor="middle" fontSize="7" fill="currentColor" opacity={0.35} fontFamily="system-ui, sans-serif">
              {formatLabel(p.label)}
            </text>
          );
        })}
        <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} stroke="currentColor" opacity={0.1} strokeWidth={0.5} />
      </svg>
    </div>
  );
}

function SiteBar({ site, max }: { site: PerSiteData; max: number }) {
  const width = Math.max((site.pageViews / max) * 100, 4);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] text-[var(--text-secondary)] truncate">{site.name}</span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-1">
            <span className="text-[11px] font-medium text-[var(--text-primary)]">{site.pageViews.toLocaleString()} views</span>
            {site.users > 0 && (
              <span className="text-[10px] text-[var(--text-tertiary)]">{site.users.toLocaleString()} users</span>
            )}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--border-light)] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${width}%`, backgroundColor: site.color }}
          />
        </div>
      </div>
    </div>
  );
}
