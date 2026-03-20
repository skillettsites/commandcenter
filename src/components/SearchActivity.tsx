'use client';

import { useState, useEffect, useCallback } from 'react';

interface SiteSearchData {
  today: number;
  month: number;
  recent: Array<{
    search_query: string;
    result_found: boolean;
    created_at: string;
  }>;
}

type SearchData = Record<string, SiteSearchData>;

const SITE_LABELS: Record<string, { name: string; color: string }> = {
  carcostcheck: { name: 'CarCostCheck', color: '#f59e0b' },
  postcodecheck: { name: 'PostcodeCheck', color: '#3b82f6' },
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
  return `${diffDays}d ago`;
}

export default function SearchActivity() {
  const [data, setData] = useState<SearchData | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/searches');
      if (res.ok) {
        const json: SearchData = await res.json();
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

  const totalToday = data
    ? Object.values(data).reduce((sum, s) => sum + s.today, 0)
    : 0;
  const totalMonth = data
    ? Object.values(data).reduce((sum, s) => sum + s.month, 0)
    : 0;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Searches
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
                {totalMonth.toLocaleString()} month
              </span>
              <span className={`text-[13px] font-medium ${totalToday > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'}`}>
                {totalToday} today
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

      {/* Collapsed: compact dots */}
      {collapsed && data && (
        <div className="flex flex-wrap gap-1.5 px-1 fade-in">
          {Object.entries(data).map(([siteId, siteData]) => {
            const site = SITE_LABELS[siteId];
            if (!site) return null;
            return (
              <div
                key={siteId}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: site.color }} />
                <span className="text-[11px] text-[var(--text-secondary)]">{site.name.replace('Check', '')}</span>
                <span className={`text-[10px] font-medium ${siteData.today > 0 ? 'text-[var(--green)]' : 'text-[var(--text-tertiary)]'}`}>
                  {siteData.today}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded: full cards */}
      {!collapsed && data && (
        <div className="card overflow-hidden divide-y divide-[var(--border-light)] fade-in">
          {Object.entries(data).map(([siteId, siteData]) => {
            const site = SITE_LABELS[siteId];
            if (!site) return null;
            const isExpanded = expandedSite === siteId;

            return (
              <div key={siteId}>
                <div
                  onClick={() => setExpandedSite(isExpanded ? null : siteId)}
                  className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: site.color }} />
                    </div>
                    <span className="text-[14px] font-medium text-[var(--text-primary)] flex-1 min-w-0 truncate">
                      {site.name}
                    </span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                          {siteData.month.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">month</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[13px] font-medium ${
                          siteData.today > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'
                        }`}>
                          {siteData.today}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">today</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded: recent searches list */}
                {isExpanded && (
                  <div className="px-3.5 pb-3 fade-in">
                    <div className="ml-3 sm:ml-5">
                      <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                        Recent Searches
                      </h4>
                      {siteData.recent.length === 0 ? (
                        <p className="text-[11px] text-[var(--text-tertiary)]">No searches yet</p>
                      ) : (
                        <div className="space-y-1">
                          {siteData.recent.map((search, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                search.result_found ? 'bg-[var(--green)]' : 'bg-[var(--red)]'
                              }`} />
                              <span className="text-[12px] font-mono text-[var(--text-primary)] flex-1 min-w-0 truncate">
                                {search.search_query}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0">
                                {timeAgo(search.created_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error state */}
      {!collapsed && error && !data && (
        <div className="card px-3.5 py-3 fade-in">
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Search tracking not available. Run the migration SQL in the Supabase Dashboard.
          </p>
        </div>
      )}
    </div>
  );
}
