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
                return { ...site, visitors: stats.activeUsers, pageViews: stats.pageViews };
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
          {totalVisitors > 0 && (
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              {totalVisitors} visitors
            </span>
          )}
          {totalPageViews > 0 && (
            <span className="text-[13px] text-[var(--text-tertiary)]">
              {totalPageViews} views
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

  useEffect(() => {
    if (expanded && !detail) {
      setLoading(true);
      const fetches: Promise<void>[] = [];

      if (site.gaPropertyId) {
        fetches.push(
          fetch(`/api/analytics/${site.id}`)
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
  }, [expanded, detail, site.id, site.gaPropertyId, site.gscSiteUrl]);

  // Reset detail when collapsed
  useEffect(() => {
    if (!expanded) {
      setDetail(null);
      setGscData(null);
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
            <div className="text-right">
              <span className={`text-[13px] font-medium ${
                site.visitors === null ? 'text-[var(--text-tertiary)]' :
                site.visitors > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'
              }`}>
                {site.visitors === null ? '-' : site.visitors}
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">vis</span>
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

            {!site.gaPropertyId && !site.gscSiteUrl && (
              <p className="text-[11px] text-[var(--text-tertiary)]">No GA or GSC configured</p>
            )}

            {loading && (
              <p className="text-[11px] text-[var(--text-tertiary)] animate-pulse">Loading analytics...</p>
            )}

            {/* GSC stats bar */}
            {gscData && <GscStats gsc={gscData} />}

            {detail && (
              <>
                {/* Mini bar chart - last 24h with user counts */}
                <HourlyChart hourly={detail.hourly} color={site.color} />

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

function GscStats({ gsc }: { gsc: GscData }) {
  const positionColor = gsc.position <= 10
    ? 'text-[var(--green)]'
    : gsc.position <= 30
    ? 'text-[var(--yellow)]'
    : 'text-[var(--text-secondary)]';

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
      {(gsc.pagesInSearch !== null || (gsc.pagesSubmitted !== null && gsc.pagesSubmitted > 0)) && (
        <div className="mt-2 pt-2 border-t border-[var(--border-light)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">
              Pages in search (28d)
            </span>
            <span className="text-[11px] font-medium text-[var(--text-primary)]">
              {gsc.pagesInSearch ?? 0}{gsc.pagesSubmitted ? ` / ${gsc.pagesSubmitted.toLocaleString()} submitted` : ''}
            </span>
          </div>
          {gsc.pagesSubmitted && gsc.pagesSubmitted > 0 && (
            <div className="mt-1 h-1.5 rounded-full bg-[var(--border-light)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--green)]"
                style={{ width: `${Math.min(((gsc.pagesInSearch ?? 0) / gsc.pagesSubmitted) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
      {gsc.topPages && gsc.topPages.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--border-light)]">
          <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
            Top Search Pages (28d)
          </h4>
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
        </div>
      )}
    </div>
  );
}

function HourlyChart({ hourly, color }: { hourly: HourlyData[]; color: string }) {
  if (hourly.length === 0) {
    return <p className="text-[11px] text-[var(--text-tertiary)]">No hourly data</p>;
  }

  const maxViews = Math.max(...hourly.map(h => h.pageViews), 1);
  const totalViews = hourly.reduce((sum, h) => sum + h.pageViews, 0);
  const totalUsers = hourly.reduce((sum, h) => sum + h.users, 0);

  // Get last 24 bars, pad if needed
  const last24 = hourly.slice(-24);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
          Last 24 Hours
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--text-primary)]">{totalViews} views</span>
          <span className="text-[11px] text-[var(--text-tertiary)]">{totalUsers} users</span>
        </div>
      </div>
      <div className="flex items-end gap-[2px] h-12">
        {last24.map((h, i) => {
          const height = Math.max((h.pageViews / maxViews) * 100, h.pageViews > 0 ? 8 : 0);
          const hour = h.dateHour.slice(-2);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0">
              {/* User count above bar (only show if > 0) */}
              {h.users > 0 && (
                <span className="text-[7px] font-medium text-[var(--text-tertiary)] leading-none mb-0.5">
                  {h.users}
                </span>
              )}
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${height}%`,
                  backgroundColor: h.pageViews > 0 ? color : 'var(--border-light)',
                  opacity: h.pageViews > 0 ? 0.8 : 0.3,
                  minHeight: h.pageViews > 0 ? '3px' : '1px',
                }}
                title={`${hour}:00 - ${h.pageViews} views, ${h.users} users`}
              />
            </div>
          );
        })}
      </div>
      {/* Hour labels */}
      <div className="flex gap-[2px] mt-0.5">
        {last24.map((h, i) => {
          const hour = h.dateHour.slice(-2);
          // Only show every 6th label to avoid crowding
          if (i % 6 !== 0) return <div key={i} className="flex-1" />;
          return (
            <div key={i} className="flex-1 text-[8px] text-[var(--text-tertiary)]">
              {hour}
            </div>
          );
        })}
      </div>
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
