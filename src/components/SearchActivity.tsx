'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

interface SiteSearchData {
  today: number;
  month: number;
  avgDurationMs?: number | null;
  recent: Array<{
    search_query: string;
    result_found: boolean;
    created_at: string;
    duration_ms?: number | null;
    search_type?: string | null;
  }>;
}

type SearchData = Record<string, SiteSearchData>;

interface ChartPoint {
  period: string;
  count: number;
}

type ChartData = Record<string, ChartPoint[]>;

type TimeRange = '24h' | '1m' | 'all';

const SITE_LABELS: Record<string, { name: string; color: string }> = {
  carcostcheck: { name: 'CarCostCheck', color: '#f59e0b' },
  postcodecheck: { name: 'PostcodeCheck', color: '#3b82f6' },
};

const RANGE_LABELS: Record<TimeRange, string> = {
  '24h': '24 Hours',
  '1m': '1 Month',
  'all': 'All Time',
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

function formatAxisLabel(period: string, range: TimeRange): string {
  if (range === '24h') {
    // period format: 2026-03-20T14
    const hour = parseInt(period.split('T')[1], 10);
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
  } else if (range === '1m') {
    // period format: 2026-03-20
    const parts = period.split('-');
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    return `${day}/${month}`;
  } else {
    // period format: 2026-03-17 (week start)
    const parts = period.split('-');
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    return `${day}/${month}`;
  }
}

interface LineChartProps {
  data: ChartPoint[];
  color: string;
  range: TimeRange;
}

function LineChart({ data, color, range }: LineChartProps) {
  const chartHeight = 120;
  const chartWidth = 300;
  const padding = { top: 8, right: 8, bottom: 22, left: 8 };

  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const maxCount = useMemo(() => {
    const m = Math.max(...data.map((d) => d.count));
    return m > 0 ? m : 1;
  }, [data]);

  const points = useMemo(() => {
    if (data.length === 0) return [];
    return data.map((d, i) => ({
      x: padding.left + (data.length === 1 ? innerWidth / 2 : (i / (data.length - 1)) * innerWidth),
      y: padding.top + innerHeight - (d.count / maxCount) * innerHeight,
      ...d,
    }));
  }, [data, maxCount, innerWidth, innerHeight, padding.left, padding.top]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
      .join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const bottomY = padding.top + innerHeight;
    return (
      `M${points[0].x},${bottomY} ` +
      points.map((p) => `L${p.x},${p.y}`).join(' ') +
      ` L${points[points.length - 1].x},${bottomY} Z`
    );
  }, [points, padding.top, innerHeight]);

  // Pick a subset of axis labels to avoid overlap
  const axisLabels = useMemo(() => {
    if (data.length === 0) return [];
    let step: number;
    if (range === '24h') {
      step = 6; // every 6 hours
    } else if (range === '1m') {
      step = 7; // every 7 days
    } else {
      step = Math.max(1, Math.floor(data.length / 6));
    }
    const labels: Array<{ x: number; label: string }> = [];
    for (let i = 0; i < data.length; i += step) {
      labels.push({
        x: points[i].x,
        label: formatAxisLabel(data[i].period, range),
      });
    }
    // Always include the last label
    const lastIdx = data.length - 1;
    if (lastIdx % step !== 0 && lastIdx > 0) {
      labels.push({
        x: points[lastIdx].x,
        label: formatAxisLabel(data[lastIdx].period, range),
      });
    }
    return labels;
  }, [data, points, range]);

  const gradientId = `grad-${color.replace('#', '')}`;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.5} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </linearGradient>
      </defs>

      {/* Gradient area fill */}
      {areaPath && (
        <path d={areaPath} fill={`url(#${gradientId})`} />
      )}

      {/* Line */}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Data point dots (only if few points) */}
      {points.length <= 30 &&
        points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={color}
            opacity={p.count > 0 ? 1 : 0.3}
          />
        ))}

      {/* X axis labels */}
      {axisLabels.map((label, i) => (
        <text
          key={i}
          x={label.x}
          y={chartHeight - 2}
          textAnchor="middle"
          fontSize="7"
          fill="var(--text-tertiary)"
          fontFamily="system-ui, sans-serif"
        >
          {label.label}
        </text>
      ))}

      {/* Baseline */}
      <line
        x1={padding.left}
        y1={padding.top + innerHeight}
        x2={padding.left + innerWidth}
        y2={padding.top + innerHeight}
        stroke="var(--border-light)"
        strokeWidth={0.5}
      />
    </svg>
  );
}

export default function SearchActivity() {
  const [data, setData] = useState<SearchData | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1m');
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

  const fetchChartData = useCallback(async (range: TimeRange) => {
    try {
      const res = await fetch(`/api/searches?range=${range}`);
      if (res.ok) {
        const json: ChartData = await res.json();
        setChartData(json);
      }
    } catch {
      // Chart data is non-critical; silently fail
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    fetchChartData(timeRange);
  }, [timeRange, fetchChartData]);

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

      {/* Expanded: full cards with charts */}
      {!collapsed && data && (
        <div className="card overflow-hidden fade-in">
          {/* Time range toggle */}
          <div className="px-3.5 pt-3 pb-2 flex items-center gap-1">
            {(['all', '1m', '24h'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={(e) => {
                  e.stopPropagation();
                  setTimeRange(r);
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  timeRange === r
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Per-site charts and details */}
          <div className="divide-y divide-[var(--border-light)]">
            {Object.entries(data).map(([siteId, siteData]) => {
              const site = SITE_LABELS[siteId];
              if (!site) return null;
              const isExpanded = expandedSite === siteId;
              const siteChartPoints = chartData?.[siteId] ?? [];

              return (
                <div key={siteId}>
                  <div
                    onClick={() => setExpandedSite(isExpanded ? null : siteId)}
                    className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
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
                        {siteData.avgDurationMs != null && (
                          <div className="text-right">
                            <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                              {siteData.avgDurationMs < 1000
                                ? `${siteData.avgDurationMs}ms`
                                : `${(siteData.avgDurationMs / 1000).toFixed(1)}s`}
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">avg</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Line chart */}
                    {siteChartPoints.length > 0 && (
                      <div className="ml-3">
                        <LineChart
                          data={siteChartPoints}
                          color={site.color}
                          range={timeRange}
                        />
                      </div>
                    )}
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
                                {search.search_type === 'trade_premium' && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold flex-shrink-0">Trade Premium</span>
                                )}
                                {search.search_type === 'trade_free' && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/15 text-green-400 font-bold flex-shrink-0">Trade Free</span>
                                )}
                                {search.duration_ms != null && (
                                  <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0">
                                    {search.duration_ms < 1000
                                      ? `${search.duration_ms}ms`
                                      : `${(search.duration_ms / 1000).toFixed(1)}s`}
                                  </span>
                                )}
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
