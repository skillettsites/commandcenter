'use client';

import { useEffect, useMemo, useState } from 'react';
import { projects } from '@/lib/projects';
import { Module, Segmented, AreaChart, fmtNum, timeAgo } from './DashKit';

interface Recent {
  search_query: string;
  result_found: boolean;
  created_at: string;
  geo_city: string | null;
  duration_ms: number | null;
  search_type: string | null;
}
interface Summary { today: number; month: number; avgDurationMs: number | null; recent: Recent[] }
interface Point { period: string; count: number }
interface Prediction { todaySearches: number; todayPurchases: number; predictedTotal: number; predictedLow: number; predictedHigh: number }
interface ChartEntry { searches: Point[]; purchases?: Point[]; prediction?: Prediction }

type Range = '24h' | '7d' | '1m' | 'all';

function color(id: string) {
  return projects.find((p) => p.id === id)?.color ?? 'var(--accent)';
}
function label(id: string) {
  return projects.find((p) => p.id === id)?.name ?? id;
}
function fmtPeriod(p: string): string {
  if (p.includes('T')) return `${p.slice(-2)}:00`;
  const [, m, d] = p.split('-');
  return `${+d}/${+m}`;
}

export default function SearchesBoard() {
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [chart, setChart] = useState<Record<string, ChartEntry>>({});
  const [range, setRange] = useState<Range>('1m');
  const [site, setSite] = useState<string>('carcostcheck');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/searches').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (alive && j) setSummary(j);
      if (alive) setLoading(false);
    }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/searches?range=${range}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (alive && j) setChart(j);
    }).catch(() => {});
    return () => { alive = false; };
  }, [range]);

  const sites = useMemo(
    () => Object.entries(summary)
      .filter(([, v]) => (v?.month ?? 0) > 0 || (v?.today ?? 0) > 0)
      .sort((a, b) => (b[1].month ?? 0) - (a[1].month ?? 0))
      .map(([id]) => id),
    [summary]
  );

  // keep selected site valid
  useEffect(() => {
    if (sites.length && !sites.includes(site)) setSite(sites[0]);
  }, [sites, site]);

  const entry = chart[site];
  const sum = summary[site];
  const c = color(site);

  const chartData = useMemo(() => {
    if (!entry?.searches?.length) return null;
    const labels = entry.searches.map((p) => fmtPeriod(p.period));
    const searchData = entry.searches.map((p) => p.count);
    const purchaseMap = new Map((entry.purchases ?? []).map((p) => [p.period, p.count]));
    const purchaseData = entry.searches.map((p) => purchaseMap.get(p.period) ?? 0);
    const hasPurchases = (entry.purchases ?? []).some((p) => p.count > 0);
    return { labels, searchData, purchaseData, hasPurchases };
  }, [entry]);

  return (
    <Module
      eyebrow="Demand"
      title="Searches"
      accent="var(--accent)"
      icon={<span>🔎</span>}
      right={
        <Segmented
          value={range}
          onChange={setRange}
          options={[{ value: '24h', label: '24h' }, { value: '7d', label: 'Week' }, { value: '1m', label: '30d' }, { value: 'all', label: 'All' }]}
        />
      }
    >
      {loading ? (
        <div className="skeleton h-56 w-full" />
      ) : sites.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">No search activity tracked.</p>
      ) : (
        <>
          {/* site pills */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-4 -mx-1 px-1">
            {sites.slice(0, 7).map((id) => (
              <button
                key={id}
                onClick={() => setSite(id)}
                className={`chip flex-shrink-0 ${site === id ? 'chip-active' : ''}`}
                style={site === id ? { background: `color-mix(in srgb, ${color(id)} 18%, transparent)`, color: color(id), borderColor: `color-mix(in srgb, ${color(id)} 35%, transparent)` } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color(id) }} />
                {label(id)}
                <span className="opacity-70 tabular-nums">{summary[id]?.month ?? 0}</span>
              </button>
            ))}
          </div>

          {/* stat row */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Today" value={fmtNum(sum?.today ?? 0)} />
            <Stat label="This month" value={fmtNum(sum?.month ?? 0)} />
            <Stat label="Avg time" value={sum?.avgDurationMs ? `${(sum.avgDurationMs / 1000).toFixed(1)}s` : '—'} />
            {entry?.prediction ? (
              <Stat
                label="Sales f'cast"
                value={fmtNum(entry.prediction.predictedTotal)}
                sub={`${entry.prediction.todayPurchases} so far · ${entry.prediction.predictedLow}–${entry.prediction.predictedHigh}`}
                accent="var(--green)"
              />
            ) : (
              <Stat label="Result rate" value={resultRate(sum?.recent)} />
            )}
          </div>

          {/* chart */}
          {chartData ? (
            <AreaChart
              height={190}
              labels={chartData.labels}
              series={[
                { name: 'Searches', color: c, data: chartData.searchData, type: 'area' },
                ...(chartData.hasPurchases ? [{ name: 'Purchases', color: 'var(--green)', data: chartData.purchaseData, type: 'bar' as const }] : []),
              ]}
            />
          ) : (
            <div className="h-44 flex items-center justify-center text-[12px] text-[var(--text-tertiary)]">No chart data for this range</div>
          )}

          {/* recent feed */}
          <div className="mt-5">
            <div className="section-eyebrow mb-2.5">Recent searches · {label(site)}</div>
            <div className="space-y-1">
              {(sum?.recent ?? []).slice(0, 8).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[12px] py-1 border-b border-[var(--hairline)] last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.result_found ? 'bg-[var(--green)]' : 'bg-[var(--text-tertiary)]'}`} />
                    <span className="text-[var(--text-primary)] font-medium truncate">{r.search_query || '—'}</span>
                    {r.search_type && <span className="chip !py-0 !px-1.5 !text-[9px] flex-shrink-0">{r.search_type}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-[10px] text-[var(--text-tertiary)]">
                    {r.geo_city && <span className="hidden sm:inline">{r.geo_city}</span>}
                    <span>{timeAgo(r.created_at)}</span>
                  </div>
                </div>
              ))}
              {(sum?.recent ?? []).length === 0 && <p className="text-[12px] text-[var(--text-tertiary)]">No recent searches.</p>}
            </div>
          </div>
        </>
      )}
    </Module>
  );
}

function resultRate(recent?: Recent[]): string {
  if (!recent || !recent.length) return '—';
  const found = recent.filter((r) => r.result_found).length;
  return `${Math.round((found / recent.length) * 100)}%`;
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color: accent || 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{sub}</div>}
    </div>
  );
}
