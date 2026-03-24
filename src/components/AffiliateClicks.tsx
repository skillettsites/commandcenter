'use client';

import { useState, useEffect, useCallback } from 'react';

interface RecentClick {
  id: number;
  time: string;
  site: string;
  type: string;
  section: string;
  city: string;
  geo_city: string | null;
  geo_country: string | null;
}

interface SiteStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

interface TopItem {
  city?: string;
  section?: string;
  count: number;
}

interface ClickData {
  today: number;
  week: number;
  month: number;
  total: number;
  recent: RecentClick[];
  sites: Record<string, SiteStats>;
  byType: Record<string, SiteStats>;
  topCities: TopItem[];
  topSections: TopItem[];
  topGeoCities: TopItem[];
}

type Tab = 'recent' | 'stats' | 'cities' | 'sections';

const SITE_COLORS: Record<string, string> = {
  findyourstay: '#F59E0B',
  bestlondontours: '#E11D48',
  thebesttours: '#14B8A6',
};

const SITE_NAMES: Record<string, string> = {
  findyourstay: 'FindYourStay',
  bestlondontours: 'BestLondonTours',
  thebesttours: 'TheBestTours',
};

const TYPE_COLORS: Record<string, string> = {
  expedia: '#003B95',
  gyg: '#FF5533',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

function formatSection(section: string): string {
  return section
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AffiliateClicks() {
  const [data, setData] = useState<ClickData | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [tab, setTab] = useState<Tab>('recent');
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/affiliate-clicks?mode=full');
      if (res.ok) {
        const json: ClickData = await res.json();
        setData(json);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'recent', label: 'Recent' },
    { key: 'stats', label: 'Stats' },
    { key: 'cities', label: 'Cities' },
    { key: 'sections', label: 'Sections' },
  ];

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Affiliate Clicks
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <>
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                {data.month.toLocaleString()} month
              </span>
              <span className={`text-[13px] font-medium ${data.today > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'}`}>
                {data.today} today
              </span>
            </>
          )}
          {!data && !error && (
            <span className="text-[13px] text-[var(--text-tertiary)]">Loading...</span>
          )}
          {error && (
            <span className="text-[13px] text-[var(--text-tertiary)]">No data</span>
          )}
        </div>
      </div>

      {/* Collapsed: compact per-site badges */}
      {collapsed && data && (
        <div className="flex flex-wrap gap-1.5 px-1 fade-in">
          {Object.entries(data.sites).map(([siteId, stats]) => (
            <div
              key={siteId}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: SITE_COLORS[siteId] || '#6B7280' }}
              />
              <span className="text-[11px] text-[var(--text-secondary)]">
                {SITE_NAMES[siteId] || siteId}
              </span>
              <span className={`text-[10px] font-medium ${stats.today > 0 ? 'text-[var(--green)]' : 'text-[var(--text-tertiary)]'}`}>
                {stats.today}
              </span>
            </div>
          ))}
          {/* Type badges */}
          {Object.entries(data.byType).map(([type, stats]) => (
            <div
              key={type}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: TYPE_COLORS[type] || '#6B7280' }}
              />
              <span className="text-[11px] text-[var(--text-secondary)] capitalize">
                {type}
              </span>
              <span className={`text-[10px] font-medium ${stats.today > 0 ? 'text-[var(--green)]' : 'text-[var(--text-tertiary)]'}`}>
                {stats.total}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded */}
      {!collapsed && data && (
        <div className="card overflow-hidden fade-in">
          {/* Tab bar */}
          <div className="px-3.5 pt-3 pb-2 flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={(e) => {
                  e.stopPropagation();
                  setTab(t.key);
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Stats summary row */}
          <div className="px-3.5 pb-2">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Today', value: data.today, highlight: data.today > 0 },
                { label: 'Week', value: data.week, highlight: false },
                { label: 'Month', value: data.month, highlight: false },
                { label: 'All Time', value: data.total, highlight: false },
              ].map((stat) => (
                <div key={stat.label} className="text-center py-1.5 rounded-lg bg-[var(--bg-elevated)]">
                  <div className={`text-[15px] font-semibold ${stat.highlight ? 'text-[var(--green)]' : 'text-[var(--text-primary)]'}`}>
                    {stat.value.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="divide-y divide-[var(--border-light)]">
            {/* Recent clicks tab */}
            {tab === 'recent' && (
              <div className="px-3.5 py-2.5 fade-in">
                <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  Last 20 Clicks
                </h4>
                {data.recent.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-tertiary)]">No clicks yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.recent.map((click) => (
                      <div key={click.id} className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TYPE_COLORS[click.type] || '#6B7280' }}
                        />
                        <span className="text-[11px] font-medium text-[var(--text-primary)] flex-shrink-0 w-[60px] truncate capitalize">
                          {click.type}
                        </span>
                        <span
                          className="w-1 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SITE_COLORS[click.site] || '#6B7280' }}
                        />
                        <span className="text-[11px] text-[var(--text-secondary)] flex-1 min-w-0 truncate">
                          {click.city || click.section || '-'}
                        </span>
                        {click.geo_city && (
                          <span className="text-[9px] text-[var(--text-tertiary)] flex-shrink-0 truncate max-w-[80px]">
                            {click.geo_city}{click.geo_country ? `, ${click.geo_country}` : ''}
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0 w-[50px] text-right">
                          {timeAgo(click.time)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Stats breakdown tab */}
            {tab === 'stats' && (
              <div className="px-3.5 py-2.5 fade-in">
                {/* By site */}
                <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  By Site
                </h4>
                <div className="space-y-1.5 mb-3">
                  {Object.entries(data.sites)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([siteId, stats]) => (
                      <div key={siteId} className="flex items-center gap-2">
                        <span
                          className="w-1 h-5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SITE_COLORS[siteId] || '#6B7280' }}
                        />
                        <span className="text-[12px] font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate">
                          {SITE_NAMES[siteId] || siteId}
                        </span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`text-[11px] font-medium ${stats.today > 0 ? 'text-[var(--green)]' : 'text-[var(--text-tertiary)]'}`}>
                            {stats.today} today
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {stats.month} mo
                          </span>
                          <span className="text-[11px] text-[var(--text-tertiary)]">
                            {stats.total}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>

                {/* By type */}
                <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  By Provider
                </h4>
                <div className="space-y-1.5">
                  {Object.entries(data.byType)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([type, stats]) => (
                      <div key={type} className="flex items-center gap-2">
                        <span
                          className="w-1 h-5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TYPE_COLORS[type] || '#6B7280' }}
                        />
                        <span className="text-[12px] font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate capitalize">
                          {type}
                        </span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`text-[11px] font-medium ${stats.today > 0 ? 'text-[var(--green)]' : 'text-[var(--text-tertiary)]'}`}>
                            {stats.today} today
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {stats.month} mo
                          </span>
                          <span className="text-[11px] text-[var(--text-tertiary)]">
                            {stats.total}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Top cities tab */}
            {tab === 'cities' && (
              <div className="px-3.5 py-2.5 fade-in">
                <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  Top Page Cities (most clicked)
                </h4>
                {data.topCities.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-tertiary)]">No data yet</p>
                ) : (
                  <div className="space-y-1">
                    {data.topCities.map((item, i) => {
                      const maxCount = data.topCities[0]?.count || 1;
                      const pct = (item.count / maxCount) * 100;
                      return (
                        <div key={i} className="relative">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-[var(--accent)] opacity-10"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center justify-between py-1 px-1">
                            <span className="text-[12px] text-[var(--text-primary)] capitalize">
                              {item.city || 'unknown'}
                            </span>
                            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                              {item.count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {data.topGeoCities.length > 0 && (
                  <>
                    <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 mt-4">
                      Top User Locations
                    </h4>
                    <div className="space-y-1">
                      {data.topGeoCities.map((item, i) => {
                        const maxCount = data.topGeoCities[0]?.count || 1;
                        const pct = (item.count / maxCount) * 100;
                        return (
                          <div key={i} className="relative">
                            <div
                              className="absolute inset-y-0 left-0 rounded bg-[var(--green)] opacity-10"
                              style={{ width: `${pct}%` }}
                            />
                            <div className="relative flex items-center justify-between py-1 px-1">
                              <span className="text-[12px] text-[var(--text-primary)]">
                                {item.city || 'unknown'}
                              </span>
                              <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                                {item.count}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Top sections tab */}
            {tab === 'sections' && (
              <div className="px-3.5 py-2.5 fade-in">
                <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  Top Sections (most clicked)
                </h4>
                {data.topSections.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-tertiary)]">No data yet</p>
                ) : (
                  <div className="space-y-1">
                    {data.topSections.map((item, i) => {
                      const maxCount = data.topSections[0]?.count || 1;
                      const pct = (item.count / maxCount) * 100;
                      return (
                        <div key={i} className="relative">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-[var(--orange)] opacity-10"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center justify-between py-1 px-1">
                            <span className="text-[12px] text-[var(--text-primary)]">
                              {formatSection(item.section || 'unknown')}
                            </span>
                            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                              {item.count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {!collapsed && error && !data && (
        <div className="card px-3.5 py-3 fade-in">
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Affiliate click tracking not available.
          </p>
        </div>
      )}
    </div>
  );
}
