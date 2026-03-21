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
}

interface AggregatedStats {
  todayVisitors: number;
  monthVisitors: number;
  allTimeVisitors: number;
  todayPageViews: number;
  monthPageViews: number;
  allTimePageViews: number;
  sitesToday: SiteTodayData[];
}

const RANGE_LABEL: Record<string, string> = { '24h': 'Last 24 Hours', '1m': 'Last 30 Days', 'all': 'All Time' };

export default function AllSitesStats() {
  const [expanded, setExpanded] = useState(true);
  const [chartRange, setChartRange] = useState<'24h' | '1m' | 'all'>('24h');
  const [data, setData] = useState<CombinedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AggregatedStats | null>(null);

  // Fetch aggregated summary stats on mount
  useEffect(() => {
    fetch('/api/analytics')
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (json?.data) {
          const results = json.data as Array<{
            siteId: string;
            activeUsers: number;
            pageViews: number;
            monthVisitors: number;
            totalVisitors: number;
          }>;

          const sitesToday: SiteTodayData[] = results
            .filter(r => r.activeUsers > 0 || r.pageViews > 0)
            .map(r => {
              const proj = projects.find(p => p.id === r.siteId);
              return {
                siteId: r.siteId,
                name: proj?.name || r.siteId,
                color: proj?.color || '#888',
                visitors: r.activeUsers,
                pageViews: r.pageViews,
              };
            })
            .sort((a, b) => b.visitors - a.visitors || b.pageViews - a.pageViews);

          setStats({
            todayVisitors: results.reduce((s, r) => s + r.activeUsers, 0),
            monthVisitors: results.reduce((s, r) => s + r.monthVisitors, 0),
            allTimeVisitors: results.reduce((s, r) => s + r.totalVisitors, 0),
            todayPageViews: results.reduce((s, r) => s + r.pageViews, 0),
            monthPageViews: 0,
            allTimePageViews: 0,
            sitesToday,
          });
        }
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
    setChartRange(prev => prev === '24h' ? '1m' : prev === '1m' ? 'all' : '24h');
  };

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
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatBox label="Today" value={stats?.todayVisitors ?? 0} sub={`${stats?.todayPageViews ?? 0} views`} />
              <StatBox label="This Month" value={stats?.monthVisitors ?? 0} />
              <StatBox label="All Time" value={stats?.allTimeVisitors ?? 0} />
            </div>

            {/* Sites with visitors today */}
            {stats?.sitesToday && stats.sitesToday.length > 0 && (
              <div className="mb-4 space-y-1">
                <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                  Active Today
                </p>
                {stats.sitesToday.map(site => (
                  <div key={site.siteId} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: site.color }} />
                      <span className="text-[11px] text-[var(--text-secondary)]">{site.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[var(--text-primary)]">{site.visitors} visitors</span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">{site.pageViews} views</span>
                    </div>
                  </div>
                ))}
              </div>
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

                {/* Per-site breakdown */}
                {data.perSite.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                      By Site
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

function StatBox({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-[18px] font-bold text-[var(--text-primary)]">{value.toLocaleString()}</p>
      <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function CombinedChart({ hourly, range, onCycleRange }: { hourly: HourlyData[]; range: '24h' | '1m' | 'all'; onCycleRange: () => void }) {
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
  const displayData = range === '24h' ? hourly.slice(-24) : hourly;
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

  const labelStep = range === '24h' ? 6 : range === '1m' ? 7 : Math.max(1, Math.floor(displayData.length / 6));

  function formatLabel(raw: string): string {
    if (range === '24h') {
      const hour = raw.slice(-2);
      return `${hour}:00`;
    }
    const clean = raw.replace(/-/g, '');
    const day = clean.slice(6, 8);
    const month = clean.slice(4, 6);
    return `${parseInt(day)}/${parseInt(month)}`;
  }

  function formatTooltip(raw: string): string {
    if (range === '24h') {
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
            <span className="text-[10px] text-[var(--text-tertiary)]">{site.users.toLocaleString()} users</span>
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
