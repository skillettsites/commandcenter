'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { projects } from '@/lib/projects';
import { Module, Segmented, fmtNum, fmtCompact } from './DashKit';

type Range = '7d' | '30d' | '90d' | 'all';

// Stripe account name (from /api/stripe-revenue) -> site id (projects.ts)
const ACCOUNT_TO_SITE: Record<string, string> = {
  CarCostCheck: 'carcostcheck',
  PostcodeCheck: 'postcodecheck',
  MatchMySkillset: 'matchmyskillset',
  AppealAFine: 'appealafine',
  HomeBuyerCheck: 'homebuyercheck',
};

interface DailyPoint { date: string; revenue: number; charges: number }
interface Account { name: string; dailySeries: DailyPoint[] }
interface StripeData { accounts: Account[] }
interface TrafficRow { dateHour: string; pageViews: number; users: number; sessions: number }
interface MergedPoint { date: string; visitors: number; pageViews: number; revenue: number; sales: number }

// Sites that have a GA property (so the graph has traffic data), CCC first.
const SITE_OPTIONS = projects
  .filter((p) => p.gaPropertyId && p.id !== 'dashboard')
  .sort((a, b) => (a.id === 'carcostcheck' ? -1 : b.id === 'carcostcheck' ? 1 : a.name.localeCompare(b.name)));

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90, 'all': 100000 };

// GA date dimension value 'YYYYMMDD' -> 'YYYY-MM-DD'
function gaDate(v: string): string {
  if (v.length === 8) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v;
}

interface TipProps {
  active?: boolean;
  payload?: Array<{ payload: MergedPoint }>;
  color?: string;
}
function ChartTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const d = new Date(p.date + 'T00:00:00Z');
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 shadow-lg">
      <div className="text-[10px] text-[var(--text-secondary)]">
        {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className="text-xs font-bold text-[var(--text-primary)]">{fmtNum(p.visitors)} visitors</div>
      {(p.sales > 0 || p.revenue > 0) && (
        <div className="text-xs font-bold text-emerald-400">
          £{(p.revenue / 100).toFixed(2)} · {p.sales} {p.sales === 1 ? 'sale' : 'sales'}
        </div>
      )}
    </div>
  );
}

export default function SitesGraph() {
  const [siteId, setSiteId] = useState('carcostcheck');
  const [range, setRange] = useState<Range>('30d');
  const [stripe, setStripe] = useState<StripeData | null>(null);
  const [traffic, setTraffic] = useState<Record<string, TrafficRow[]>>({});
  const [loading, setLoading] = useState(true);

  const site = SITE_OPTIONS.find((s) => s.id === siteId) ?? SITE_OPTIONS[0];
  const color = site?.color ?? 'var(--accent)';
  const cacheKey = `${siteId}:${range}`;
  const fetched = useRef<Set<string>>(new Set());

  // Stripe sales (all sites) — fetched once, filtered client-side.
  useEffect(() => {
    fetch('/api/stripe-revenue')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setStripe(d); })
      .catch(() => {});
  }, []);

  // Traffic for the selected site + range — cached per combo.
  useEffect(() => {
    if (fetched.current.has(cacheKey)) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/analytics/${siteId}?range=${range}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        fetched.current.add(cacheKey);
        setTraffic((prev) => ({ ...prev, [cacheKey]: d?.hourly ?? [] }));
      })
      .catch(() => setTraffic((prev) => ({ ...prev, [cacheKey]: [] })))
      .finally(() => setLoading(false));
  }, [cacheKey, siteId, range]);

  const salesSeries = useMemo<DailyPoint[]>(() => {
    if (!stripe) return [];
    const acct = stripe.accounts.find((a) => ACCOUNT_TO_SITE[a.name] === siteId);
    return acct?.dailySeries ?? [];
  }, [stripe, siteId]);

  const merged = useMemo<MergedPoint[]>(() => {
    const rows = traffic[cacheKey] ?? [];
    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - RANGE_DAYS[range]);
    const startStr = range === 'all' ? '0000-00-00' : windowStart.toISOString().slice(0, 10);

    const visMap = new Map<string, { visitors: number; pageViews: number }>();
    for (const r of rows) {
      const date = gaDate(r.dateHour);
      visMap.set(date, { visitors: r.users, pageViews: r.pageViews });
    }
    const salesMap = new Map<string, { revenue: number; sales: number }>();
    for (const s of salesSeries) salesMap.set(s.date, { revenue: s.revenue, sales: s.charges });

    const dates = new Set<string>();
    visMap.forEach((_, d) => { if (d >= startStr) dates.add(d); });
    salesMap.forEach((_, d) => { if (d >= startStr) dates.add(d); });

    return Array.from(dates)
      .sort()
      .map((date) => ({
        date,
        visitors: visMap.get(date)?.visitors ?? 0,
        pageViews: visMap.get(date)?.pageViews ?? 0,
        revenue: salesMap.get(date)?.revenue ?? 0,
        sales: salesMap.get(date)?.sales ?? 0,
      }));
  }, [traffic, cacheKey, salesSeries, range]);

  const totals = useMemo(() => {
    return merged.reduce(
      (a, p) => ({ visitors: a.visitors + p.visitors, revenue: a.revenue + p.revenue, sales: a.sales + p.sales }),
      { visitors: 0, revenue: 0, sales: 0 }
    );
  }, [merged]);

  const hasSales = totals.sales > 0;
  const gradId = `sg-${siteId}`;

  return (
    <Module
      eyebrow="Network"
      title="Sites"
      accent="var(--cyan)"
      icon={<span>🌐</span>}
      right={
        <div className="flex items-center gap-3">
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="bg-[var(--bg-card-2)] border border-[var(--hairline)] rounded-lg text-[12px] font-medium text-[var(--text-primary)] px-2.5 py-1.5 outline-none cursor-pointer hover:border-[var(--accent)] transition-colors"
          >
            {SITE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Segmented
            value={range}
            onChange={(v) => setRange(v as Range)}
            options={[
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
              { value: '90d', label: '90d' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
      }
    >
      {/* Headline for the selected site + window */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-[14px] font-semibold text-[var(--text-primary)]">{site?.name}</span>
        </div>
        <div>
          <div className="text-[22px] font-bold text-[var(--text-primary)] tabular-nums leading-none">{fmtCompact(totals.visitors)}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">visitors · {range === 'all' ? 'all time' : range}</div>
        </div>
        <div>
          <div className="text-[22px] font-bold text-emerald-400 tabular-nums leading-none">£{(totals.revenue / 100).toFixed(2)}</div>
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{totals.sales} {totals.sales === 1 ? 'sale' : 'sales'}</div>
        </div>
        {site?.url && (
          <a href={site.url} target="_blank" rel="noopener" className="text-[11px] text-[var(--accent)] hover:underline ml-auto self-center">
            {site.url.replace(/^https?:\/\//, '')} ↗
          </a>
        )}
      </div>

      {loading && merged.length === 0 ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : merged.length === 0 ? (
        <div className="h-72 flex items-center justify-center text-[12px] text-[var(--text-tertiary)]">No data for this site / range.</div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={merged} margin={{ top: 8, right: hasSales ? 8 : 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                tickFormatter={(v: string) => new Date(v + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                minTickGap={28}
              />
              <YAxis
                yAxisId="visitors"
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                tickFormatter={(v: number) => fmtCompact(v)}
                width={44}
              />
              {hasSales && (
                <YAxis
                  yAxisId="revenue"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#34d399' }}
                  tickFormatter={(v: number) => `£${Math.round(v / 100)}`}
                  width={44}
                />
              )}
              <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--border)' }} />
              <Area
                yAxisId="visitors"
                type="monotone"
                dataKey="visitors"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                activeDot={{ r: 4 }}
                name="Visitors"
              />
              {hasSales && (
                <Bar yAxisId="revenue" dataKey="revenue" fill="#10b981" fillOpacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={26} name="Revenue" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Module>
  );
}
