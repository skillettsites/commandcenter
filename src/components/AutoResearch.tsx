'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { projects } from '@/lib/projects';

interface MetricRow {
  id: number;
  site_id: string;
  date: string;
  gsc_clicks: number;
  gsc_impressions: number;
  gsc_ctr: number;
  gsc_position: number;
  gsc_pages_indexed: number;
  ga_visitors: number;
  ga_pageviews: number;
  tracked_pageviews: number;
  tracked_searches: number;
  changes_made: number;
  changes_kept: number;
}

interface ChangeRow {
  id: number;
  site_id: string;
  page_path: string | null;
  change_type: string;
  change_description: string;
  before_value: string | null;
  after_value: string | null;
  metric_before: Record<string, number> | null;
  metric_after: Record<string, number> | null;
  status: string;
  created_at: string;
}

interface MetricsResponse {
  metrics: MetricRow[];
  changes: ChangeRow[];
  summary: {
    latestBySite: Record<string, MetricRow>;
    totalChanges: number;
    confirmedChanges: number;
  };
}

type TimeRange = '7d' | '1m' | '3m';
type ChartMetric = 'clicks' | 'impressions' | 'position';

const TRACKED_SITES = projects.filter(
  (p) => p.gaPropertyId && p.id !== 'personal' && p.id !== 'dashboard' && p.id !== 'general'
);

const RANGE_LABELS: Record<TimeRange, string> = {
  '7d': '7 Days',
  '1m': '1 Month',
  '3m': '3 Months',
};

const CHART_LABELS: Record<ChartMetric, string> = {
  clicks: 'GSC Clicks',
  impressions: 'Impressions',
  position: 'Avg Position',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B' },
  deployed: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
  confirmed: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' },
  reverted: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' },
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  meta_title: 'Title',
  meta_description: 'Description',
  schema: 'Schema',
  internal_link: 'Internal Link',
  content: 'Content',
  heading: 'Heading',
  image_alt: 'Image Alt',
};

function MiniLineChart({
  data,
  color,
  inverted = false,
  width = 280,
  height = 80,
}: {
  data: number[];
  color: string;
  inverted?: boolean;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-[var(--text-tertiary)]"
        style={{ width, height }}
      >
        Not enough data
      </div>
    );
  }

  const padding = 4;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * chartW;
    let y: number;
    if (inverted) {
      // For position: lower is better, so invert
      y = padding + ((val - min) / range) * chartH;
    } else {
      y = padding + chartH - ((val - min) / range) * chartH;
    }
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Area fill
  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

  const latest = data[data.length - 1];
  const previous = data[data.length - 2];
  const diff = latest - previous;
  const trendUp = inverted ? diff < 0 : diff > 0;
  const trendLabel = inverted
    ? (diff < 0 ? `${Math.abs(diff).toFixed(1)} better` : diff > 0 ? `${diff.toFixed(1)} worse` : 'no change')
    : (diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : 'no change');

  return (
    <div>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Latest point dot */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
      </svg>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {inverted ? latest.toFixed(1) : latest.toLocaleString()}
        </span>
        <span
          className="text-[10px] font-medium"
          style={{ color: trendUp ? '#10B981' : diff === 0 ? 'var(--text-tertiary)' : '#EF4444' }}
        >
          {trendLabel}
        </span>
      </div>
    </div>
  );
}

export default function AutoResearch() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('clicks');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshotRunning, setSnapshotRunning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range: timeRange });
      if (selectedSite !== 'all') params.set('site_id', selectedSite);
      const res = await fetch(`/api/autoresearch/metrics?${params}`);
      if (res.ok) {
        const json: MetricsResponse = await res.json();
        setData(json);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, timeRange]);

  useEffect(() => {
    if (!collapsed) {
      fetchData();
    }
  }, [collapsed, fetchData]);

  const runSnapshot = async () => {
    setSnapshotRunning(true);
    try {
      const res = await fetch('/api/autoresearch/snapshot', { method: 'POST' });
      if (res.ok) {
        // Refresh data after snapshot
        await fetchData();
      }
    } catch {
      // Silently fail, user can retry
    } finally {
      setSnapshotRunning(false);
    }
  };

  // Prepare chart data for selected site or all sites aggregated
  const chartData = useMemo(() => {
    if (!data?.metrics.length) return [];

    // Group by date
    const byDate: Record<string, { clicks: number; impressions: number; position: number; count: number }> = {};

    for (const row of data.metrics) {
      if (selectedSite !== 'all' && row.site_id !== selectedSite) continue;
      if (!byDate[row.date]) {
        byDate[row.date] = { clicks: 0, impressions: 0, position: 0, count: 0 };
      }
      byDate[row.date].clicks += row.gsc_clicks;
      byDate[row.date].impressions += row.gsc_impressions;
      byDate[row.date].position += row.gsc_position;
      byDate[row.date].count += 1;
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        clicks: vals.clicks,
        impressions: vals.impressions,
        position: vals.count > 0 ? vals.position / vals.count : 0,
      }));
  }, [data, selectedSite]);

  const chartValues = useMemo(() => {
    return chartData.map((d) => d[chartMetric]);
  }, [chartData, chartMetric]);

  // Accent color
  const accentColor = useMemo(() => {
    if (selectedSite === 'all') return 'var(--accent)';
    const proj = projects.find((p) => p.id === selectedSite);
    return proj?.color || 'var(--accent)';
  }, [selectedSite]);

  // Summary stats
  const totalChanges = data?.summary.totalChanges ?? 0;
  const confirmedChanges = data?.summary.confirmedChanges ?? 0;

  // Site health for selected site
  const siteHealth = useMemo(() => {
    if (!data?.summary.latestBySite) return null;
    if (selectedSite === 'all') {
      // Aggregate latest across all sites
      const entries = Object.values(data.summary.latestBySite);
      if (entries.length === 0) return null;
      return {
        gsc_clicks: entries.reduce((s, e) => s + (e.gsc_clicks || 0), 0),
        gsc_impressions: entries.reduce((s, e) => s + (e.gsc_impressions || 0), 0),
        gsc_position: entries.reduce((s, e) => s + (e.gsc_position || 0), 0) / entries.length,
        ga_visitors: entries.reduce((s, e) => s + (e.ga_visitors || 0), 0),
        ga_pageviews: entries.reduce((s, e) => s + (e.ga_pageviews || 0), 0),
        tracked_pageviews: entries.reduce((s, e) => s + (e.tracked_pageviews || 0), 0),
        tracked_searches: entries.reduce((s, e) => s + (e.tracked_searches || 0), 0),
        gsc_pages_indexed: entries.reduce((s, e) => s + (e.gsc_pages_indexed || 0), 0),
      };
    }
    return data.summary.latestBySite[selectedSite] || null;
  }, [data, selectedSite]);

  // Get site name helper
  const getSiteName = (siteId: string) => {
    const p = projects.find((proj) => proj.id === siteId);
    return p?.name || siteId;
  };

  const getSiteColor = (siteId: string) => {
    const p = projects.find((proj) => proj.id === siteId);
    return p?.color || '#6B7280';
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            AutoResearch
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          {data && !collapsed && (
            <>
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                {totalChanges} changes
              </span>
              <span className="text-[13px] text-[var(--text-secondary)]">
                {confirmedChanges} confirmed
              </span>
            </>
          )}
          {!data && !error && !collapsed && loading && (
            <span className="text-[13px] text-[var(--text-tertiary)]">Loading...</span>
          )}
        </div>
      </div>

      {/* Expanded */}
      {!collapsed && (
        <div className="card overflow-hidden fade-in">
          {/* Site toggle pills */}
          <div className="px-3.5 pt-3 pb-1">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedSite('all')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  selectedSite === 'all'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                All Sites
              </button>
              {TRACKED_SITES.map((site) => (
                <button
                  key={site.id}
                  onClick={() => setSelectedSite(site.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                    selectedSite === site.id
                      ? 'text-white'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                  style={selectedSite === site.id ? { backgroundColor: site.color } : undefined}
                >
                  {site.name}
                </button>
              ))}
            </div>
          </div>

          {/* Time range + snapshot button */}
          <div className="px-3.5 pt-2 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {(['7d', '1m', '3m'] as TimeRange[]).map((r) => (
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                runSnapshot();
              }}
              disabled={snapshotRunning}
              className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-40"
            >
              {snapshotRunning ? 'Running...' : 'Take Snapshot'}
            </button>
          </div>

          {/* Loading / Error */}
          {loading && !data && (
            <div className="px-3.5 py-6 text-center">
              <span className="text-[12px] text-[var(--text-tertiary)]">Loading metrics...</span>
            </div>
          )}

          {error && !data && (
            <div className="px-3.5 py-4">
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Could not load AutoResearch data. Run a snapshot first to populate metrics.
              </p>
            </div>
          )}

          {data && (
            <div>
              {/* Chart metric selector */}
              <div className="px-3.5 pb-2 flex items-center gap-1 border-b border-[var(--border-light)]">
                {(['clicks', 'impressions', 'position'] as ChartMetric[]).map((m) => (
                  <button
                    key={m}
                    onClick={(e) => {
                      e.stopPropagation();
                      setChartMetric(m);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                      chartMetric === m
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {CHART_LABELS[m]}
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div className="px-3.5 py-3">
                <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mb-2">
                  {CHART_LABELS[chartMetric]} over {RANGE_LABELS[timeRange]}
                </p>
                {chartValues.length > 0 ? (
                  <MiniLineChart
                    data={chartValues}
                    color={typeof accentColor === 'string' && accentColor.startsWith('#') ? accentColor : '#3B82F6'}
                    inverted={chartMetric === 'position'}
                    width={320}
                    height={100}
                  />
                ) : (
                  <div className="py-6 text-center text-[11px] text-[var(--text-tertiary)]">
                    No data yet. Run a daily snapshot to start tracking.
                  </div>
                )}
              </div>

              {/* Site Health Summary */}
              {siteHealth && (
                <div className="px-3.5 py-2.5 border-t border-[var(--border-light)]">
                  <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mb-2">
                    Latest Snapshot
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatCard label="GSC Clicks" value={siteHealth.gsc_clicks} />
                    <StatCard label="Impressions" value={siteHealth.gsc_impressions} />
                    <StatCard label="Avg Position" value={Number(siteHealth.gsc_position).toFixed(1)} />
                    <StatCard label="GA Visitors" value={siteHealth.ga_visitors} />
                    <StatCard label="GA Pageviews" value={siteHealth.ga_pageviews} />
                    <StatCard label="Tracked Views" value={siteHealth.tracked_pageviews} />
                    <StatCard label="Tracked Searches" value={siteHealth.tracked_searches} />
                    <StatCard label="Pages Indexed" value={siteHealth.gsc_pages_indexed} />
                  </div>
                </div>
              )}

              {/* Recent Changes Log */}
              <div className="px-3.5 py-2.5 border-t border-[var(--border-light)]">
                <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mb-2">
                  Recent Changes
                </p>
                {data.changes.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-tertiary)] py-3 text-center">
                    No changes logged yet. Changes will appear here as AutoResearch makes improvements.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {data.changes.slice(0, 10).map((change) => {
                      const statusStyle = STATUS_COLORS[change.status] || STATUS_COLORS.pending;
                      return (
                        <div
                          key={change.id}
                          className="rounded-lg px-2.5 py-2 bg-[var(--bg-elevated)]"
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: getSiteColor(change.site_id) }}
                              />
                              <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                                {getSiteName(change.site_id)}
                              </span>
                              {change.page_path && (
                                <span className="text-[10px] text-[var(--text-tertiary)] truncate">
                                  {change.page_path}
                                </span>
                              )}
                            </div>
                            <span
                              className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                            >
                              {change.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded bg-[var(--bg-card)]"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              {CHANGE_TYPE_LABELS[change.change_type] || change.change_type}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] truncate">
                              {change.change_description}
                            </span>
                          </div>
                          {/* Before/after metrics if available */}
                          {(change.metric_before || change.metric_after) && (
                            <div className="flex items-center gap-2 mt-1">
                              {change.metric_before && (
                                <span className="text-[10px] text-[var(--text-tertiary)]">
                                  Before: {Object.entries(change.metric_before).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                </span>
                              )}
                              {change.metric_after && (
                                <span className="text-[10px] text-[#10B981]">
                                  After: {Object.entries(change.metric_after).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  const display = typeof value === 'number' ? value.toLocaleString() : value;
  return (
    <div className="rounded-lg px-2.5 py-2 bg-[var(--bg-elevated)]">
      <p className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</p>
      <p className="text-[14px] font-semibold text-[var(--text-primary)] mt-0.5">{display}</p>
    </div>
  );
}
