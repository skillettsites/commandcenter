'use client';

import { useState, useEffect, useCallback } from 'react';
import { projects } from '@/lib/projects';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────

interface ChartPoint {
  period: string;
  count: number;
}

interface SearchChartData {
  carcostcheck: ChartPoint[];
  postcodecheck: ChartPoint[];
}

interface PerSiteData {
  siteId: string;
  name: string;
  color: string;
  pageViews: number;
  users: number;
}

interface CombinedData {
  hourly: Array<{ dateHour: string; pageViews: number; users: number }>;
  perSite: PerSiteData[];
}

interface StripeData {
  totalRevenue: number;
  totalCharges: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
  accounts: Array<{
    name: string;
    sites: string[];
    totalRevenue: number;
    chargeCount: number;
  }>;
}

interface ConversionData {
  counts: Record<string, number>;
  total: number;
}

interface PageviewSummary {
  [siteId: string]: { today: number; week: number; month: number; total: number };
}

interface GscSiteData {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  pagesIndexed: number | null;
  pagesSubmitted: number | null;
  pagesInSearch: number | null;
  pagesGained: number | null;
}

interface BingSiteData {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  pagesInIndex: number | null;
}

interface SiteIndexing {
  siteId: string;
  name: string;
  color: string;
  gsc: GscSiteData | null;
  bing: BingSiteData | null;
}

interface AISummary {
  working: string[];
  not_working: string[];
  suggestions: string[];
  revenue_analysis: string;
  generated_at: string;
}

// ── Site colours ───────────────────────────────────────────────────

const SITE_COLORS: Record<string, { name: string; color: string }> = {
  carcostcheck: { name: 'CarCostCheck', color: '#3B82F6' },
  postcodecheck: { name: 'PostcodeCheck', color: '#10B981' },
};

// ── Helpers ────────────────────────────────────────────────────────

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function formatDayLabel(period: string): string {
  const parts = period.split('-');
  if (parts.length < 3) return period;
  return `${parseInt(parts[2])}/${parseInt(parts[1])}`;
}

// ── Custom Recharts tooltip ────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 11,
      }}
    >
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 2, fontSize: 10 }}>
        {label}
      </p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, fontWeight: 600 }}>
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function GrowthAnalytics({ startExpanded = false }: { startExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [searchChart, setSearchChart] = useState<SearchChartData | null>(null);
  const [trafficData, setTrafficData] = useState<CombinedData | null>(null);
  const [stripeData, setStripeData] = useState<StripeData | null>(null);
  const [conversions, setConversions] = useState<ConversionData | null>(null);
  const [pageviews, setPageviews] = useState<PageviewSummary | null>(null);
  const [allIndexing, setAllIndexing] = useState<SiteIndexing[]>([]);
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // All sites that have GSC or Bing configured
  const INDEXING_SITES = projects
    .filter(p => p.gscSiteUrl || p.bingSiteUrl)
    .filter(p => p.id !== 'dashboard')
    .map(p => ({ id: p.id, name: p.name, color: p.color }));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [sc, td, sd, cv, pv] = await Promise.all([
      safeFetch<SearchChartData>('/api/searches?range=1m'),
      safeFetch<CombinedData>('/api/analytics/combined?range=1m'),
      safeFetch<StripeData>('/api/stripe-revenue'),
      safeFetch<ConversionData>('/api/conversions?range=1m'),
      safeFetch<PageviewSummary>('/api/pageviews?view=summary'),
    ]);
    setSearchChart(sc);
    setTrafficData(td);
    setStripeData(sd);
    setConversions(cv);
    setPageviews(pv);

    // Fetch GSC + Bing for all sites in parallel
    const indexingResults = await Promise.all(
      INDEXING_SITES.map(async (site) => {
        const [gsc, bing] = await Promise.all([
          safeFetch<GscSiteData>(`/api/gsc/${site.id}`),
          safeFetch<BingSiteData>(`/api/bing/${site.id}`),
        ]);
        return { siteId: site.id, name: site.name, color: site.color, gsc, bing };
      })
    );
    setAllIndexing(indexingResults);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (expanded) fetchAll();
  }, [expanded, fetchAll]);

  const handleAiSummary = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/analytics/summary');
      if (res.ok) {
        const data: AISummary = await res.json();
        setAiSummary(data);
      }
    } catch {
      // silently fail
    }
    setAiLoading(false);
  };

  // Build merged search chart data for AreaChart
  const mergedSearchData = (() => {
    if (!searchChart) return [];
    const ccc = searchChart.carcostcheck ?? [];
    const pcc = searchChart.postcodecheck ?? [];
    const map = new Map<string, { period: string; label: string; carcostcheck: number; postcodecheck: number }>();
    for (const p of ccc) {
      map.set(p.period, {
        period: p.period,
        label: formatDayLabel(p.period),
        carcostcheck: p.count,
        postcodecheck: 0,
      });
    }
    for (const p of pcc) {
      const existing = map.get(p.period);
      if (existing) {
        existing.postcodecheck = p.count;
      } else {
        map.set(p.period, {
          period: p.period,
          label: formatDayLabel(p.period),
          carcostcheck: 0,
          postcodecheck: p.count,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
  })();

  const cccMonthSearches = searchChart?.carcostcheck?.reduce((s, p) => s + p.count, 0) ?? 0;
  const pccMonthSearches = searchChart?.postcodecheck?.reduce((s, p) => s + p.count, 0) ?? 0;

  // Traffic chart data
  const trafficChartData = (trafficData?.hourly ?? []).map(h => ({
    label: formatDayLabel(h.dateHour),
    pageViews: h.pageViews,
    users: h.users,
  }));

  // Funnel numbers
  const totalMonthPageviews = pageviews
    ? Object.values(pageviews).reduce((s, v) => s + (v.month || 0), 0)
    : 0;
  const totalMonthSearches = cccMonthSearches + pccMonthSearches;
  const totalConversions = conversions?.total ?? 0;
  const totalPurchases = stripeData?.thisMonthCharges ?? 0;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Growth Analytics
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        {stripeData && (
          <span className="text-[13px] font-medium text-green-400">
            £{(stripeData.thisMonthRevenue / 100).toFixed(2)} this month
          </span>
        )}
      </div>

      {expanded && (
        <div className="card overflow-hidden fade-in">
          <div className="p-3.5 space-y-5">

            {/* AI Summary Button */}
            <div>
              <button
                onClick={handleAiSummary}
                disabled={aiLoading}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
                style={{
                  background: aiLoading ? 'var(--bg-elevated)' : 'var(--accent)',
                  color: aiLoading ? 'var(--text-tertiary)' : '#fff',
                  cursor: aiLoading ? 'wait' : 'pointer',
                }}
              >
                {aiLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Generating AI Summary...
                  </span>
                ) : (
                  'Generate AI Summary'
                )}
              </button>

              {aiSummary && (
                <div className="mt-3 space-y-3">
                  <AISummarySection title="Working Well" items={aiSummary.working} icon="+" color="var(--green)" />
                  <AISummarySection title="Needs Attention" items={aiSummary.not_working} icon="!" color="var(--orange)" />
                  <AISummarySection title="Suggestions" items={aiSummary.suggestions} icon=">" color="var(--accent)" />
                  {aiSummary.revenue_analysis && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-1">
                        Revenue Analysis
                      </p>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                        {aiSummary.revenue_analysis}
                      </p>
                    </div>
                  )}
                  <p className="text-[9px] text-[var(--text-tertiary)] text-center opacity-50">
                    Generated {new Date(aiSummary.generated_at).toLocaleString('en-GB')}
                  </p>
                </div>
              )}
            </div>

            {loading && !searchChart ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[12px] text-[var(--text-tertiary)]">Loading analytics...</span>
              </div>
            ) : (
              <>
                {/* 1. Search Trends */}
                <Section title="Search Trends (30 days)">
                  <div className="flex items-center gap-4 mb-2">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: SITE_COLORS.carcostcheck.color }} />
                      <span className="text-[11px] text-[var(--text-secondary)]">CCC {cccMonthSearches.toLocaleString()}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: SITE_COLORS.postcodecheck.color }} />
                      <span className="text-[11px] text-[var(--text-secondary)]">PCC {pccMonthSearches.toLocaleString()}</span>
                    </span>
                  </div>
                  {mergedSearchData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={mergedSearchData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="ga-grad-ccc" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={SITE_COLORS.carcostcheck.color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={SITE_COLORS.carcostcheck.color} stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="ga-grad-pcc" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={SITE_COLORS.postcodecheck.color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={SITE_COLORS.postcodecheck.color} stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="carcostcheck"
                          name="CarCostCheck"
                          stroke={SITE_COLORS.carcostcheck.color}
                          fill="url(#ga-grad-ccc)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="postcodecheck"
                          name="PostcodeCheck"
                          stroke={SITE_COLORS.postcodecheck.color}
                          fill="url(#ga-grad-pcc)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-[11px] text-[var(--text-tertiary)] text-center py-4">No search data available</p>
                  )}
                </Section>

                {/* 2. Traffic Overview */}
                <Section title="Traffic Overview (30 days)">
                  {trafficChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={trafficChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="ga-grad-traffic" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="pageViews"
                          name="Page Views"
                          stroke="var(--accent)"
                          fill="url(#ga-grad-traffic)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-[11px] text-[var(--text-tertiary)] text-center py-4">No traffic data available</p>
                  )}

                  {/* Top 5 sites */}
                  {trafficData?.perSite && trafficData.perSite.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                        Top Sites
                      </p>
                      {trafficData.perSite.slice(0, 5).map(site => {
                        const maxPv = trafficData.perSite[0].pageViews || 1;
                        const width = Math.max((site.pageViews / maxPv) * 100, 4);
                        return (
                          <div key={site.siteId} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] text-[var(--text-secondary)] truncate">{site.name}</span>
                                <span className="text-[11px] font-medium text-[var(--text-primary)] flex-shrink-0 ml-1">
                                  {site.pageViews.toLocaleString()}
                                </span>
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
                      })}
                    </div>
                  )}
                </Section>

                {/* 3. Revenue Summary */}
                <Section title="Revenue">
                  {stripeData ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <MetricBox
                          label="This Month"
                          value={`£${(stripeData.thisMonthRevenue / 100).toFixed(2)}`}
                          color="text-green-400"
                        />
                        <MetricBox
                          label="Purchases"
                          value={String(stripeData.thisMonthCharges)}
                          color="text-amber-400"
                        />
                        <MetricBox
                          label="Avg Order"
                          value={stripeData.thisMonthCharges > 0
                            ? `£${(stripeData.thisMonthRevenue / stripeData.thisMonthCharges / 100).toFixed(2)}`
                            : '£0.00'}
                          color="text-[var(--text-primary)]"
                        />
                      </div>
                      {stripeData.accounts.filter(a => a.chargeCount > 0).length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                            By Site
                          </p>
                          {stripeData.accounts.filter(a => a.chargeCount > 0).map(account => (
                            <div key={account.name} className="flex items-center justify-between">
                              <span className="text-[11px] text-[var(--text-secondary)]">{account.name}</span>
                              <span className="text-[11px] font-medium text-green-400">
                                £{(account.totalRevenue / 100).toFixed(2)} ({account.chargeCount} sales)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-[var(--text-tertiary)] text-center py-2">Data unavailable</p>
                  )}
                </Section>

                {/* 4. Conversion Funnel */}
                <Section title="Conversion Funnel (this month)">
                  <FunnelChart
                    steps={[
                      { label: 'Visitors', value: totalMonthPageviews },
                      { label: 'Searches', value: totalMonthSearches },
                      { label: 'Checkouts', value: totalConversions },
                      { label: 'Purchases', value: totalPurchases },
                    ]}
                  />
                </Section>

                {/* 5. Indexing Health - All Sites */}
                <Section title="Indexing Health">
                  {/* Summary: per-site Google + Bing indexed counts */}
                  {allIndexing.length > 0 && (
                    <div className="mb-4">
                      {/* Totals */}
                      {(() => {
                        const totalGoogle = allIndexing.reduce((sum, s) => sum + (s.gsc?.pagesInSearch ?? 0), 0);
                        const totalBing = allIndexing.reduce((sum, s) => sum + (s.bing?.pagesInIndex ?? 0), 0);
                        const totalSubmitted = allIndexing.reduce((sum, s) => sum + (s.gsc?.pagesSubmitted ?? 0), 0);
                        return (
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <MetricBox label="Google (in search)" value={totalGoogle.toLocaleString()} color="text-blue-400" />
                            <MetricBox label="Bing (indexed)" value={totalBing.toLocaleString()} color="text-cyan-400" />
                            <MetricBox label="Submitted" value={totalSubmitted.toLocaleString()} color="text-[var(--text-primary)]" />
                          </div>
                        );
                      })()}

                      {/* Per-site progress bars */}
                      <div className="bg-[var(--bg-primary)] rounded-xl p-3">
                        <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                          Pages Found in Search / Submitted in Sitemap
                        </p>
                        <div className="space-y-2.5">
                          {allIndexing
                            .filter(s => (s.gsc?.pagesInSearch ?? 0) > 0 || (s.gsc?.pagesSubmitted ?? 0) > 0 || (s.bing?.pagesInIndex ?? 0) > 0)
                            .sort((a, b) => (b.gsc?.pagesSubmitted ?? 0) - (a.gsc?.pagesSubmitted ?? 0))
                            .map(site => {
                              const googleInSearch = site.gsc?.pagesInSearch ?? 0;
                              const bingIndexed = site.bing?.pagesInIndex ?? 0;
                              const submitted = site.gsc?.pagesSubmitted ?? 0;
                              const bestIndexed = Math.max(googleInSearch, bingIndexed);
                              const pct = submitted > 0 ? Math.round((bestIndexed / submitted) * 100) : 0;
                              return (
                                <div key={site.siteId}>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: site.color }} />
                                      <span className="text-[10px] text-[var(--text-secondary)]">{site.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] text-blue-400">G:{googleInSearch}</span>
                                      <span className="text-[9px] text-cyan-400">B:{bingIndexed}</span>
                                      {submitted > 0 && (
                                        <span className="text-[9px] text-[var(--text-tertiary)]">/ {submitted.toLocaleString()}</span>
                                      )}
                                    </div>
                                  </div>
                                  {submitted > 0 && (
                                    <div className="h-2 bg-[var(--bg-card)] rounded-full overflow-hidden relative">
                                      {/* Bing bar (behind) */}
                                      <div
                                        className="absolute inset-y-0 left-0 rounded-full opacity-40"
                                        style={{ width: `${Math.max(Math.round((bingIndexed / submitted) * 100), 0)}%`, backgroundColor: '#06b6d4' }}
                                      />
                                      {/* Google bar (front) */}
                                      <div
                                        className="absolute inset-y-0 left-0 rounded-full"
                                        style={{ width: `${Math.max(Math.round((googleInSearch / submitted) * 100), 0)}%`, backgroundColor: site.color }}
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {site.gsc?.pagesGained != null && site.gsc.pagesGained !== 0 && (
                                      <span className={`text-[9px] font-medium ${site.gsc.pagesGained > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {site.gsc.pagesGained > 0 ? '+' : ''}{site.gsc.pagesGained} pages vs last month
                                      </span>
                                    )}
                                    {submitted > 0 && pct < 100 && (
                                      <span className="text-[9px] text-[var(--text-tertiary)]">
                                        {(submitted - bestIndexed).toLocaleString()} to go ({pct}%)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Per-site detail cards */}
                  <div className="space-y-3">
                    {allIndexing.map(site => (
                      <IndexingRow
                        key={site.siteId}
                        site={site.name}
                        color={site.color}
                        gsc={site.gsc}
                        bing={site.bing}
                      />
                    ))}
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
        {title}
      </p>
      {children}
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
      <div className={`text-[16px] font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function AISummarySection({ title, items, icon, color }: { title: string; items: string[]; icon: string; color: string }) {
  if (!items.length) return null;
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color }}>
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span
              className="text-[11px] font-bold flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-0.5"
              style={{ background: `${color}20`, color }}
            >
              {icon}
            </span>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelChart({ steps }: { steps: Array<{ label: string; value: number }> }) {
  const maxVal = Math.max(...steps.map(s => s.value), 1);
  const colors = ['var(--accent)', '#3B82F6', 'var(--orange)', 'var(--green)'];

  // Build conversion rate labels between steps
  const rates: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].value;
    const curr = steps[i].value;
    if (prev > 0) {
      rates.push(`${((curr / prev) * 100).toFixed(1)}%`);
    } else {
      rates.push('N/A');
    }
  }

  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const width = Math.max((step.value / maxVal) * 100, 6);
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-[var(--text-secondary)]">{step.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-[var(--text-primary)]">
                  {step.value.toLocaleString()}
                </span>
                {i > 0 && (
                  <span className="text-[9px] text-[var(--text-tertiary)]">
                    ({rates[i - 1]})
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full bg-[var(--border-light)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${width}%`, backgroundColor: colors[i] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IndexingRow({
  site,
  color,
  gsc,
  bing,
}: {
  site: string;
  color: string;
  gsc: GscSiteData | null;
  bing: BingSiteData | null;
}) {
  const [open, setOpen] = useState(false);
  const inSearch = gsc?.pagesInSearch ?? 0;
  const submitted = gsc?.pagesSubmitted ?? 0;
  const bingIndexed = bing?.pagesInIndex ?? 0;
  const hasData = gsc || bing;

  if (!hasData) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-1.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[12px] font-medium text-[var(--text-primary)]">{site}</span>
        </div>
        <div className="flex items-center gap-3">
          {(inSearch > 0 || bingIndexed > 0) && (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              G:{inSearch} B:{bingIndexed}
            </span>
          )}
          {gsc && (
            <span className="text-[10px] font-medium text-[var(--text-primary)]">
              {gsc.clicks} clicks
            </span>
          )}
          <svg className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 ml-3 mt-1 mb-2">
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <p className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Google</p>
            {gsc ? (
              <div className="space-y-0.5">
                <MetricLine label="In Search" value={String(inSearch)} />
                {gsc.pagesGained != null && (
                  <MetricLine label="Change" value={`${gsc.pagesGained > 0 ? '+' : ''}${gsc.pagesGained}`} />
                )}
                {submitted > 0 && (
                  <>
                    <MetricLine label="Submitted" value={submitted.toLocaleString()} />
                    <div className="h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden my-1">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(submitted > 0 ? Math.round((inSearch / submitted) * 100) : 0, 1)}%`, backgroundColor: color }} />
                    </div>
                    <MetricLine label="Remaining" value={`${(submitted - inSearch).toLocaleString()}`} />
                  </>
                )}
                <MetricLine label="Clicks (7d)" value={gsc.clicks.toLocaleString()} />
                <MetricLine label="Impressions" value={gsc.impressions.toLocaleString()} />
                <MetricLine label="CTR" value={`${(gsc.ctr * 100).toFixed(1)}%`} />
                <MetricLine label="Avg Pos" value={gsc.position > 0 ? gsc.position.toFixed(1) : 'N/A'} />
              </div>
            ) : (
              <p className="text-[10px] text-[var(--text-tertiary)]">No data</p>
            )}
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <p className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Bing</p>
            {bing ? (
              <div className="space-y-0.5">
                {bing.pagesInIndex != null && (
                  <MetricLine label="Indexed" value={bing.pagesInIndex.toLocaleString()} />
                )}
                <MetricLine label="Clicks (7d)" value={bing.clicks.toLocaleString()} />
                <MetricLine label="Impressions" value={bing.impressions.toLocaleString()} />
                <MetricLine label="CTR" value={`${(bing.ctr * 100).toFixed(1)}%`} />
                <MetricLine label="Avg Pos" value={bing.position > 0 ? bing.position.toFixed(1) : 'N/A'} />
              </div>
            ) : (
              <p className="text-[10px] text-[var(--text-tertiary)]">No data</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[10px] font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
