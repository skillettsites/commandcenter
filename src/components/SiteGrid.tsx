'use client';

import { useState, useEffect } from 'react';
import { HealthResult, AnalyticsResult, GscData } from '@/lib/types';
import { projects } from '@/lib/projects';

interface SiteData {
  id: string;
  name: string;
  url: string;
  color: string;
  status: 'up' | 'slow' | 'down' | 'checking';
  responseTime: number | null;
  visitors: number | null;
  pageViews: number | null;
  totalVisitors: number | null;
  monthVisitors: number | null;
  gaPropertyId?: string;
  gscSiteUrl?: string;
}

interface HourlyData {
  dateHour: string;
  pageViews: number;
  users: number;
  sessions: number;
}

interface SourceData {
  source: string;
  sessions: number;
  users: number;
}

interface TopPageData {
  path: string;
  views: number;
}

interface SiteDetail {
  hourly: HourlyData[];
  sources: SourceData[];
  topPages: TopPageData[];
}

export default function SiteGrid() {
  const [sites, setSites] = useState<SiteData[]>(
    projects
      .filter(p => p.url && p.id !== 'dashboard')
      .map(p => ({
        ...p,
        status: 'checking' as const,
        responseTime: null,
        visitors: null,
        pageViews: null,
        totalVisitors: null,
        monthVisitors: null,
      }))
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const results: HealthResult[] = await res.json();
          setSites(prev =>
            prev.map(site => {
              const result = results.find(r => r.siteId === site.id);
              if (result) {
                return { ...site, status: result.status, responseTime: result.responseTime };
              }
              return { ...site, status: 'down' };
            })
          );
        }
      } catch {
        setSites(prev => prev.map(s => ({ ...s, status: 'down' })));
      }
    }

    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics');
        if (res.ok) {
          const { data }: { data: AnalyticsResult[] } = await res.json();
          setSites(prev =>
            prev.map(site => {
              const stats = data.find(d => d.siteId === site.id);
              if (stats) {
                return {
                  ...site,
                  visitors: stats.activeUsers,
                  pageViews: stats.pageViews,
                  totalVisitors: stats.totalVisitors,
                  monthVisitors: stats.monthVisitors,
                };
              }
              return site;
            })
          );
        }
      } catch {
        // Analytics not configured yet
      }
    }

    fetchHealth();
    fetchAnalytics();
  }, []);

  // Sort by visitors descending (null/0 at bottom)
  const sortedSites = [...sites].sort((a, b) => {
    const aVis = a.visitors ?? 0;
    const bVis = b.visitors ?? 0;
    if (bVis !== aVis) return bVis - aVis;
    // Secondary sort by page views
    return (b.pageViews ?? 0) - (a.pageViews ?? 0);
  });

  const visibleSites = showAll ? sortedSites : sortedSites.slice(0, 5);
  const hasMore = sortedSites.length > 5;

  const allUp = sites.every(s => s.status === 'up');
  const anyDown = sites.some(s => s.status === 'down');
  const checking = sites.some(s => s.status === 'checking');
  const totalVisitors = sites.reduce((sum, s) => sum + (s.visitors ?? 0), 0);
  const totalPageViews = sites.reduce((sum, s) => sum + (s.pageViews ?? 0), 0);
  const allTimeVisitors = sites.reduce((sum, s) => sum + (s.totalVisitors ?? 0), 0);
  const monthlyVisitors = sites.reduce((sum, s) => sum + (s.monthVisitors ?? 0), 0);

  return (
    <div className="space-y-2">
      {/* Header row - tappable to collapse */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Sites
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          {allTimeVisitors > 0 && (
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              {allTimeVisitors.toLocaleString()} total
            </span>
          )}
          {monthlyVisitors > 0 && (
            <span className="text-[13px] text-[var(--text-secondary)]">
              {monthlyVisitors.toLocaleString()} month
            </span>
          )}
          {totalVisitors > 0 && (
            <span className="text-[13px] text-[var(--text-tertiary)]">
              {totalVisitors} today
            </span>
          )}
          {checking ? (
            <span className="text-[13px] text-[var(--text-tertiary)]">Checking...</span>
          ) : (
            <span className={`text-[13px] font-medium ${allUp ? 'text-[var(--green)]' : anyDown ? 'text-[var(--red)]' : 'text-[var(--yellow)]'}`}>
              {allUp ? 'All up' : anyDown ? 'Issues' : 'Slow'}
            </span>
          )}
        </div>
      </div>

      {/* Compact status dots row (always visible) */}
      {collapsed && (
        <div className="flex flex-wrap gap-1.5 px-1 fade-in">
          {sortedSites.map(site => {
            const dotColor = site.status === 'up' ? 'var(--green)' : site.status === 'slow' ? 'var(--yellow)' : site.status === 'checking' ? 'var(--text-tertiary)' : 'var(--red)';
            return (
              <div
                key={site.id}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]"
                title={site.name}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                <span className="text-[11px] text-[var(--text-secondary)]">{site.name.replace('Check', '').replace('Score', '')}</span>
                {(site.visitors ?? 0) > 0 && (
                  <span className="text-[10px] font-medium text-[var(--green)]">{site.visitors}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compact list view (default, not collapsed) */}
      {!collapsed && (
        <div className="card overflow-hidden divide-y divide-[var(--border-light)] fade-in">
          {visibleSites.map(site => (
            <SiteRow
              key={site.id}
              site={site}
              expanded={expanded === site.id}
              onToggle={() => setExpanded(expanded === site.id ? null : site.id)}
            />
          ))}
          {hasMore && (
            <div
              onClick={() => setShowAll(!showAll)}
              className="px-3.5 py-2 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors text-center"
            >
              <span className="text-[13px] font-medium text-[var(--accent)]">
                {showAll ? 'Show Less' : `View All ${sortedSites.length} Sites`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SiteRow({
  site,
  expanded,
  onToggle,
}: {
  site: SiteData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [gscData, setGscData] = useState<GscData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartRange, setChartRange] = useState<'24h' | '1m' | 'all'>('24h');

  const cycleRange = () => {
    const next = chartRange === '24h' ? '1m' : chartRange === '1m' ? 'all' : '24h';
    setChartRange(next);
  };

  // Fetch detail data when expanded or range changes
  useEffect(() => {
    if (expanded) {
      setLoading(true);
      const fetches: Promise<void>[] = [];

      if (site.gaPropertyId) {
        fetches.push(
          fetch(`/api/analytics/${site.id}?range=${chartRange}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setDetail(data); })
            .catch(() => {})
        );
      }

      if (site.gscSiteUrl) {
        fetches.push(
          fetch(`/api/gsc/${site.id}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setGscData(data); })
            .catch(() => {})
        );
      }

      Promise.all(fetches).finally(() => setLoading(false));
    }
  }, [expanded, chartRange, site.id, site.gaPropertyId, site.gscSiteUrl]);

  // Reset detail when collapsed
  useEffect(() => {
    if (!expanded) {
      setDetail(null);
      setGscData(null);
      setChartRange('24h');
    }
  }, [expanded]);

  const statusDot =
    site.status === 'up'
      ? 'bg-[var(--green)]'
      : site.status === 'slow'
      ? 'bg-[var(--yellow)]'
      : site.status === 'checking'
      ? 'bg-[var(--text-tertiary)] animate-pulse'
      : 'bg-[var(--red)]';

  const domain = site.url
    .replace('https://', '')
    .replace('http://', '')
    .replace(/\/$/, '');

  return (
    <div>
      <div
        onClick={onToggle}
        className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Color bar + status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: site.color }} />
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
          </div>

          {/* Name */}
          <span className="text-[14px] font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate">
            {site.name}
          </span>

          {/* Stats */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {site.totalVisitors !== null && site.totalVisitors > 0 && (
              <div className="text-right">
                <span className="text-[13px] font-medium text-[var(--text-primary)]">
                  {site.totalVisitors.toLocaleString()}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">total</span>
              </div>
            )}
            {site.monthVisitors !== null && site.monthVisitors > 0 && (
              <div className="text-right">
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                  {site.monthVisitors.toLocaleString()}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">month</span>
              </div>
            )}
            <div className="text-right">
              <span className={`text-[13px] font-medium ${
                site.visitors === null ? 'text-[var(--text-tertiary)]' :
                site.visitors > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'
              }`}>
                {site.visitors === null ? '-' : site.visitors}
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">today</span>
            </div>
            <div className="text-right">
              <span className={`text-[13px] font-medium ${
                site.pageViews === null ? 'text-[var(--text-tertiary)]' :
                site.pageViews > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
              }`}>
                {site.pageViews === null ? '-' : site.pageViews}
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">pv</span>
            </div>
            {site.responseTime !== null && (
              <span className={`text-[12px] font-medium w-12 text-right ${
                site.responseTime < 1000 ? 'text-[var(--green)]' :
                site.responseTime < 3000 ? 'text-[var(--yellow)]' : 'text-[var(--red)]'
              }`}>
                {site.responseTime}ms
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-3.5 pb-3 fade-in">
          <div className="ml-3 sm:ml-7 space-y-3">
            {/* Domain + visit link */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[var(--text-tertiary)] truncate">{domain}</span>
              <a
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-[12px] text-[var(--accent)] font-medium flex-shrink-0"
              >
                Visit
              </a>
            </div>

            {/* Integration status badges */}
            {!loading && (!site.gaPropertyId || !site.gscSiteUrl) && (
              <div className="flex flex-wrap gap-1.5">
                {!site.gaPropertyId && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">
                    GA not configured
                  </span>
                )}
                {!site.gscSiteUrl && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">
                    GSC not configured
                  </span>
                )}
              </div>
            )}

            {/* GSC stats bar */}
            {gscData && <GscStats gsc={gscData} />}

            {detail && (
              <>
                {/* Mini bar chart - last 24h with user counts */}
                <HourlyChart hourly={detail.hourly} color={site.color} range={chartRange} onCycleRange={cycleRange} />

                {/* Traffic sources + top pages - stacked on mobile, side by side on wider */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                      Traffic Sources
                    </h4>
                    {detail.sources.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-tertiary)]">No data</p>
                    ) : (
                      <div className="space-y-1">
                        {detail.sources.map((s, i) => (
                          <SourceRow key={i} source={s} maxSessions={detail.sources[0]?.sessions ?? 1} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                      Top Pages
                    </h4>
                    {detail.topPages.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-tertiary)]">No data</p>
                    ) : (
                      <div className="space-y-1">
                        {detail.topPages.map((p, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1 min-w-0">
                              {p.path}
                            </span>
                            <span className="text-[11px] font-medium text-[var(--text-primary)] flex-shrink-0">
                              {p.views}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 pt-2 border-t border-[var(--border-light)]">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-1.5 w-full text-left"
      >
        <span className="text-[10px] text-[var(--text-tertiary)]">{open ? '▾' : '▸'}</span>
        <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
          {title}
        </h4>
        <span className="text-[10px] text-[var(--text-tertiary)]">({count})</span>
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function GscStats({ gsc }: { gsc: GscData }) {
  const positionColor = gsc.position <= 10
    ? 'text-[var(--green)]'
    : gsc.position <= 30
    ? 'text-[var(--yellow)]'
    : 'text-[var(--text-secondary)]';

  const inSearch = gsc.pagesInSearch ?? 0;

  return (
    <div className="rounded-lg bg-[var(--bg-elevated)] p-2.5">
      <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
        Search Console (7d)
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <div className="text-[14px] font-semibold text-[var(--text-primary)]">{gsc.clicks}</div>
          <div className="text-[9px] text-[var(--text-tertiary)]">Clicks</div>
        </div>
        <div>
          <div className="text-[14px] font-semibold text-[var(--text-primary)]">{gsc.impressions.toLocaleString()}</div>
          <div className="text-[9px] text-[var(--text-tertiary)]">Impressions</div>
        </div>
        <div>
          <div className={`text-[14px] font-semibold ${positionColor}`}>{gsc.position > 0 ? gsc.position.toFixed(1) : '-'}</div>
          <div className="text-[9px] text-[var(--text-tertiary)]">Avg Position</div>
        </div>
        <div>
          <div className="text-[14px] font-semibold text-[var(--text-primary)]">{(gsc.ctr * 100).toFixed(1)}%</div>
          <div className="text-[9px] text-[var(--text-tertiary)]">CTR</div>
        </div>
      </div>

      {/* Pages in search */}
      {inSearch > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--border-light)]">
          <div className="flex items-center gap-2">
            <div className="text-[13px] font-semibold text-[var(--green)]">{inSearch.toLocaleString()}</div>
            <div className="text-[9px] text-[var(--text-tertiary)]">pages appeared in search (28d)</div>
          </div>
        </div>
      )}

      {/* Top search queries */}
      {gsc.topQueries && gsc.topQueries.length > 0 && (
        <CollapsibleSection title="Top Keywords (28d)" count={gsc.topQueries.length}>
          <div className="space-y-1">
            {gsc.topQueries.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1 min-w-0">
                  {q.query}
                </span>
                <span className="text-[11px] font-medium text-[var(--green)] flex-shrink-0">
                  {q.clicks}c
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0">
                  {q.impressions.toLocaleString()}i
                </span>
                <span className={`text-[10px] flex-shrink-0 w-6 text-right ${q.position <= 10 ? 'text-[var(--green)]' : q.position <= 30 ? 'text-[var(--yellow)]' : 'text-[var(--text-tertiary)]'}`}>
                  #{Math.round(q.position)}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Top search pages */}
      {gsc.topPages && gsc.topPages.length > 0 && (
        <CollapsibleSection title="Top Pages (28d)" count={gsc.topPages.length}>
          <div className="space-y-1">
            {gsc.topPages.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1 min-w-0">
                  {p.page}
                </span>
                <span className="text-[11px] font-medium text-[var(--green)] flex-shrink-0">
                  {p.clicks}c
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0">
                  {p.impressions.toLocaleString()}i
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

const RANGE_LABEL: Record<string, string> = { '24h': 'Last 24 Hours', '1m': 'Last 30 Days', 'all': 'All Time' };

function HourlyChart({ hourly, color, range, onCycleRange }: { hourly: HourlyData[]; color: string; range: '24h' | '1m' | 'all'; onCycleRange: () => void }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (hourly.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <button onClick={(e) => { e.stopPropagation(); onCycleRange(); }} className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider hover:underline">
          {RANGE_LABEL[range]} &rarr;
        </button>
        <p className="text-[11px] text-[var(--text-tertiary)]">No data</p>
      </div>
    );
  }

  const totalViews = hourly.reduce((sum, h) => sum + h.pageViews, 0);
  const totalUsers = hourly.reduce((sum, h) => sum + h.users, 0);
  const data = range === '24h' ? hourly.slice(-24) : hourly;
  const maxViews = Math.max(...data.map(h => h.pageViews), 1);

  const chartWidth = 300;
  const chartHeight = 120;
  const pad = { top: 10, right: 8, bottom: 20, left: 8 };
  const innerW = chartWidth - pad.left - pad.right;
  const innerH = chartHeight - pad.top - pad.bottom;

  const points = data.map((h, i) => ({
    x: pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    y: pad.top + innerH - (h.pageViews / maxViews) * innerH,
    views: h.pageViews,
    users: h.users,
    label: h.dateHour,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = points.length > 0 ? `M${points[0].x},${pad.top + innerH} ${points.map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${pad.top + innerH} Z` : '';
  const gradId = `hourly-${color.replace('#', '')}-${range}`;

  const labelStep = range === '24h' ? 6 : range === '1m' ? 7 : Math.max(1, Math.floor(data.length / 6));

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
    // Find nearest point
    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - clickX);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setSelectedIdx(selectedIdx === closest ? null : closest);
  }

  const sel = selectedIdx !== null ? points[selectedIdx] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <button onClick={(e) => { e.stopPropagation(); onCycleRange(); }} className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider hover:underline cursor-pointer">
          {RANGE_LABEL[range]} &rarr;
        </button>
        {sel ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium" style={{ color }}>{formatTooltip(sel.label)}</span>
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
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        {/* Selected point vertical line */}
        {sel && (
          <line x1={sel.x} y1={pad.top} x2={sel.x} y2={pad.top + innerH} stroke={color} strokeWidth={1} opacity={0.5} strokeDasharray="3,3" />
        )}
        {data.length <= 31 && points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={selectedIdx === i ? 5 : (p.views > 0 ? 3 : 1.5)} fill={selectedIdx === i ? 'white' : color} stroke={selectedIdx === i ? color : 'none'} strokeWidth={selectedIdx === i ? 2 : 0} opacity={p.views > 0 ? 1 : 0.3} />
          </g>
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

function SourceRow({ source, maxSessions }: { source: SourceData; maxSessions: number }) {
  const width = Math.max((source.sessions / maxSessions) * 100, 4);
  const label = source.source === '(direct)' ? 'Direct' :
    source.source === '(not set)' ? 'Unknown' :
    source.source;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] text-[var(--text-secondary)] truncate">{label}</span>
          <span className="text-[11px] font-medium text-[var(--text-primary)] flex-shrink-0 ml-1">{source.sessions}</span>
        </div>
        <div className="h-1 rounded-full bg-[var(--border-light)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  );
}
