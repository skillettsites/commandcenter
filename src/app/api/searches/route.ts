import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { ukTodayStart, ukMonthStart } from '@/lib/uk-time';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Drop pre-cutoff data (early scraping spikes) so charts reflect real traffic.
const SEARCHES_CUTOFF = '2026-04-11T00:00:00Z';
const floor = (iso: string) => (iso < SEARCHES_CUTOFF ? SEARCHES_CUTOFF : iso);

// Sites that have purchase data and where it lives. Currently only CarCostCheck
// monetises directly: each row in premium_reports = £4.99 paid checkout.
const PURCHASE_SOURCES: Record<string, { table: string; siteFilter?: string }> = {
  carcostcheck: { table: 'premium_reports' },
};

// Cursor-paginate every row of `column` from `table` matching the optional
// site filter, since `fromDate`. Avoids the 1000-row PostgREST cap.
async function paginateAll(
  supabase: SupabaseClient,
  table: string,
  column: string,
  fromIso: string,
  siteFilter?: { col: string; value: string },
): Promise<Array<{ created_at: string }>> {
  const rows: Array<{ created_at: string }> = [];
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 30;
  let cursor = fromIso;
  let useGt = false;
  for (let i = 0; i < MAX_PAGES; i++) {
    let q = supabase.from(table).select(column);
    if (siteFilter) q = q.eq(siteFilter.col, siteFilter.value);
    q = useGt ? q.gt('created_at', cursor) : q.gte('created_at', cursor);
    const { data, error } = await q.order('created_at', { ascending: true }).limit(PAGE_SIZE);
    if (error) {
      console.error(`paginate error for ${table}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    const typed = data as unknown as Array<{ created_at: string }>;
    rows.push(...typed);
    if (typed.length < PAGE_SIZE) break;
    cursor = typed[typed.length - 1].created_at;
    useGt = true;
  }
  return rows;
}

// UK-local date key (YYYY-MM-DD). Lets buckets and DOW math line up with the
// user's perception of "today" rather than UTC.
function ukDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
function ukParts(d: Date): { dateKey: string; hour: number; dow: number } {
  const tzd = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  return { dateKey: ukDateKey(d), hour: tzd.getHours(), dow: tzd.getDay() };
}

interface PredictionInput {
  date: string;
  dow: number;
  searches: number;
  purchases: number;
  hourlyPurchases: number[]; // 24 buckets
}

interface PredictionResult {
  todaySearches: number;
  todayPurchases: number;
  predictedTotal: number;
  predictedLow: number;
  predictedHigh: number;
  signals: {
    paceProjection: number;
    searchProjection: number;
    dowBaseline: number;
    completionFactor: number;
    dowConversionRate: number;
    trendFactor: number;
    sampleDays: number;
    hour: number;
    dow: number;
  };
}

function predictTodayPurchases(history: PredictionInput[]): PredictionResult | null {
  if (history.length === 0) return null;
  const today = history[history.length - 1];
  const past = history.slice(0, -1);
  if (past.length === 0) return null;

  const ukNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const todayHour = ukNow.getHours();

  // Same-DOW history (excluding today)
  const sameDow = past.filter((h) => h.dow === today.dow);

  const last7 = past.slice(-7);
  const last28 = past.slice(-28);
  const avg = (arr: PredictionInput[], pick: (h: PredictionInput) => number) =>
    arr.length === 0 ? 0 : arr.reduce((s, h) => s + pick(h), 0) / arr.length;

  const last7PurchaseAvg = avg(last7, (h) => h.purchases);
  const last28PurchaseAvg = avg(last28, (h) => h.purchases);
  const trendFactor = last28PurchaseAvg > 0 ? last7PurchaseAvg / last28PurchaseAvg : 1;

  // DOW baselines
  const dowSearchAvg = avg(sameDow, (h) => h.searches);
  const dowPurchaseAvg = avg(sameDow, (h) => h.purchases);
  const dowConversion = dowSearchAvg > 0 ? dowPurchaseAvg / dowSearchAvg : 0;

  // Hour-of-day completion: on past same-DOW days, what fraction of daily
  // purchases had landed by `todayHour` (inclusive)?
  let totalUpToHour = 0;
  let totalAllDay = 0;
  for (const h of sameDow) {
    totalUpToHour += h.hourlyPurchases.slice(0, todayHour + 1).reduce((s, n) => s + n, 0);
    totalAllDay += h.purchases;
  }
  // Floor at 0.05 so we never divide by ~0 early in the day; cap at 1.0.
  const completionFactor = totalAllDay > 0
    ? Math.min(1, Math.max(0.05, totalUpToHour / totalAllDay))
    : 0.5;

  // Three independent projections
  const paceProjection = today.purchases / completionFactor;
  const searchProjection = today.searches * dowConversion * trendFactor;
  const dowBaselineProjection = dowPurchaseAvg * trendFactor;

  // Weight: pace gets more credit as the day fills up; otherwise lean on
  // search-to-conversion + DOW baseline.
  const wPace = Math.min(1, completionFactor * 1.5);
  const wSearch = (1 - wPace) * 0.6;
  const wDow = (1 - wPace) * 0.4;

  let predictedTotal = paceProjection * wPace + searchProjection * wSearch + dowBaselineProjection * wDow;
  // Floor at today's actual + 1 so the chart never shows the prediction below
  // what's already happened.
  predictedTotal = Math.max(today.purchases + 1, predictedTotal);

  // Confidence widens when we're early in the day or have few same-DOW samples.
  const sampleDayPenalty = Math.max(0, 0.1 - sameDow.length * 0.02);
  const uncertainty = 0.10 + (1 - completionFactor) * 0.20 + sampleDayPenalty;

  return {
    todaySearches: today.searches,
    todayPurchases: today.purchases,
    predictedTotal: Math.round(predictedTotal),
    predictedLow: Math.max(today.purchases, Math.round(predictedTotal * (1 - uncertainty))),
    predictedHigh: Math.round(predictedTotal * (1 + uncertainty)),
    signals: {
      paceProjection: Math.round(paceProjection * 10) / 10,
      searchProjection: Math.round(searchProjection * 10) / 10,
      dowBaseline: Math.round(dowBaselineProjection * 10) / 10,
      completionFactor: Math.round(completionFactor * 100) / 100,
      dowConversionRate: Math.round(dowConversion * 10000) / 10000,
      trendFactor: Math.round(trendFactor * 100) / 100,
      sampleDays: sameDow.length,
      hour: todayHour,
      dow: today.dow,
    },
  };
}

// GET /api/searches?site_id=carcostcheck&range=today|24h|1m|all&view=top
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteFilter = searchParams.get('site_id');
  const range = searchParams.get('range');
  const view = searchParams.get('view');

  const supabase = getServiceClient();

  const now = new Date();
  const todayStart = ukTodayStart();
  const monthStart = ukMonthStart();

  const allSiteIds = [
    'carcostcheck', 'postcodecheck', 'tapwaterscore', 'medcostcheck',
    'findyourstay', 'helpafterloss', 'helpafterlife', 'aibetfinder',
    'bestlondontours', 'davidskillett', 'thebesttours', 'daveknowsai',
    'askyourstay', 'aicareerswap', 'briefmynews',
  ];
  const sites = siteFilter ? [siteFilter] : allSiteIds;

  // Top searched queries grouped by count
  if (view === 'top') {
    const period = range || 'today';
    let fromDate: string;
    if (period === 'today') {
      fromDate = todayStart;
    } else if (period === '24h') {
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    } else if (period === '1m') {
      fromDate = monthStart;
    } else {
      fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    const results: Record<string, {
      total: number;
      top: Array<{ query: string; count: number; resultFound: boolean; lastSearched: string }>;
    }> = {};

    for (const siteId of sites) {
      const { data: rows } = await supabase
        .from('searches')
        .select('search_query, result_found, created_at')
        .eq('site_id', siteId)
        .gte('created_at', floor(fromDate))
        .order('created_at', { ascending: false });

      const grouped = new Map<string, { count: number; resultFound: boolean; lastSearched: string }>();
      for (const row of rows ?? []) {
        const existing = grouped.get(row.search_query);
        if (existing) {
          existing.count++;
        } else {
          grouped.set(row.search_query, {
            count: 1,
            resultFound: row.result_found,
            lastSearched: row.created_at,
          });
        }
      }

      const sorted = Array.from(grouped.entries())
        .map(([query, data]) => ({ query, ...data }))
        .sort((a, b) => new Date(b.lastSearched).getTime() - new Date(a.lastSearched).getTime());

      results[siteId] = {
        total: rows?.length ?? 0,
        top: sorted,
      };
    }

    return NextResponse.json(results);
  }

  // Time-series chart data
  if (range) {
    type ChartPoint = { period: string; count: number };
    type SiteChart = {
      searches: ChartPoint[];
      purchases?: ChartPoint[];
      prediction?: PredictionResult;
    };
    const chartResults: Record<string, SiteChart> = {};

    for (const siteId of sites) {
      let fromDate: Date;
      if (range === 'today') {
        fromDate = new Date(todayStart);
      } else if (range === '24h') {
        fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (range === '1m') {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      }

      const searchRows = await paginateAll(
        supabase,
        'searches',
        'created_at',
        floor(fromDate.toISOString()),
        { col: 'site_id', value: siteId },
      );

      // Optional purchases for sites that monetise.
      const purchaseSource = PURCHASE_SOURCES[siteId];
      const purchaseRows = purchaseSource
        ? await paginateAll(
            supabase,
            purchaseSource.table,
            'created_at',
            floor(fromDate.toISOString()),
            purchaseSource.siteFilter ? { col: 'site_id', value: purchaseSource.siteFilter } : undefined,
          )
        : [];

      const searchBuckets = new Map<string, number>();
      const purchaseBuckets = new Map<string, number>();

      if (range === 'today' || range === '24h') {
        const hours = range === 'today' ? now.getUTCHours() + 1 : 24;
        const start = range === 'today' ? new Date(todayStart) : fromDate;
        for (let h = 0; h < hours; h++) {
          const bucketTime = new Date(start.getTime() + h * 60 * 60 * 1000);
          const key = `${bucketTime.getUTCFullYear()}-${String(bucketTime.getUTCMonth() + 1).padStart(2, '0')}-${String(bucketTime.getUTCDate()).padStart(2, '0')}T${String(bucketTime.getUTCHours()).padStart(2, '0')}`;
          searchBuckets.set(key, 0);
          purchaseBuckets.set(key, 0);
        }
        const hourKey = (iso: string) => {
          const d = new Date(iso);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
        };
        for (const r of searchRows) {
          const k = hourKey(r.created_at);
          if (searchBuckets.has(k)) searchBuckets.set(k, (searchBuckets.get(k) ?? 0) + 1);
        }
        for (const r of purchaseRows) {
          const k = hourKey(r.created_at);
          if (purchaseBuckets.has(k)) purchaseBuckets.set(k, (purchaseBuckets.get(k) ?? 0) + 1);
        }
      } else if (range === '1m') {
        // 30 daily buckets keyed by UK-local date so they line up with the
        // user's perception of "today".
        const cutoffMs = new Date(SEARCHES_CUTOFF).getTime();
        for (let d = 29; d >= 0; d--) {
          const bucketTime = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
          if (bucketTime.getTime() < cutoffMs) continue;
          const key = ukDateKey(bucketTime);
          searchBuckets.set(key, 0);
          purchaseBuckets.set(key, 0);
        }
        for (const r of searchRows) {
          const k = ukDateKey(new Date(r.created_at));
          if (searchBuckets.has(k)) searchBuckets.set(k, (searchBuckets.get(k) ?? 0) + 1);
        }
        for (const r of purchaseRows) {
          const k = ukDateKey(new Date(r.created_at));
          if (purchaseBuckets.has(k)) purchaseBuckets.set(k, (purchaseBuckets.get(k) ?? 0) + 1);
        }
      } else {
        // Weekly buckets (Monday-anchored) for the all-time view.
        const effectiveFrom = new Date(floor(fromDate.toISOString()));
        const startOfWeek = new Date(effectiveFrom);
        startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay() + 1);
        const cursor = new Date(startOfWeek);
        while (cursor <= now) {
          const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
          searchBuckets.set(key, 0);
          purchaseBuckets.set(key, 0);
          cursor.setUTCDate(cursor.getUTCDate() + 7);
        }
        const weekKey = (iso: string) => {
          const d = new Date(iso);
          const monday = new Date(d);
          monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);
          return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
        };
        for (const r of searchRows) {
          const k = weekKey(r.created_at);
          if (searchBuckets.has(k)) searchBuckets.set(k, (searchBuckets.get(k) ?? 0) + 1);
        }
        for (const r of purchaseRows) {
          const k = weekKey(r.created_at);
          if (purchaseBuckets.has(k)) purchaseBuckets.set(k, (purchaseBuckets.get(k) ?? 0) + 1);
        }
      }

      const result: SiteChart = {
        searches: Array.from(searchBuckets.entries()).map(([period, count]) => ({ period, count })),
      };
      if (purchaseSource) {
        result.purchases = Array.from(purchaseBuckets.entries()).map(([period, count]) => ({ period, count }));

        // Build the prediction input from the same data we already paginated.
        // History is keyed by UK-local date so DOW math is consistent.
        if (range === '1m') {
          const dailyMap = new Map<string, PredictionInput>();
          // Seed with the buckets we have so missing days = 0.
          for (const [date] of searchBuckets) {
            const d = new Date(`${date}T12:00:00`);
            dailyMap.set(date, {
              date,
              dow: ukParts(d).dow,
              searches: searchBuckets.get(date) ?? 0,
              purchases: purchaseBuckets.get(date) ?? 0,
              hourlyPurchases: new Array(24).fill(0),
            });
          }
          for (const r of purchaseRows) {
            const { dateKey, hour } = ukParts(new Date(r.created_at));
            const row = dailyMap.get(dateKey);
            if (row) row.hourlyPurchases[hour]++;
          }
          // History array sorted by date asc; today is the last entry.
          const todayKey = ukDateKey(new Date());
          const sorted = Array.from(dailyMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
          // Ensure today exists even if no data yet (start-of-day prediction).
          if (!dailyMap.has(todayKey)) {
            sorted.push({
              date: todayKey,
              dow: ukParts(new Date()).dow,
              searches: 0,
              purchases: 0,
              hourlyPurchases: new Array(24).fill(0),
            });
          }
          const prediction = predictTodayPurchases(sorted);
          if (prediction) result.prediction = prediction;
        }
      }
      chartResults[siteId] = result;
    }

    return NextResponse.json(chartResults);
  }

  // Default: return summary counts + recent searches
  const results: Record<string, {
    today: number;
    month: number;
    avgDurationMs: number | null;
    recent: Array<{ search_query: string; result_found: boolean; created_at: string; geo_city: string | null; geo_region: string | null; geo_country: string | null; duration_ms: number | null; search_type: string | null }>;
  }> = {};

  for (const siteId of sites) {
    const { count: todayCount } = await supabase
      .from('searches')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .gte('created_at', todayStart);

    const { count: monthCount } = await supabase
      .from('searches')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .gte('created_at', monthStart);

    const { data: recentRows } = await supabase
      .from('searches')
      .select('search_query, result_found, created_at, geo_city, geo_region, geo_country, duration_ms, search_type')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Calculate average search duration for this site (last 100 searches with duration)
    const { data: durationRows } = await supabase
      .from('searches')
      .select('duration_ms')
      .eq('site_id', siteId)
      .not('duration_ms', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    const durations = (durationRows ?? []).map((r: { duration_ms: number }) => r.duration_ms).filter((d: number) => d > 0);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : null;

    results[siteId] = {
      today: todayCount ?? 0,
      month: monthCount ?? 0,
      avgDurationMs: avgDuration,
      recent: recentRows ?? [],
    };
  }

  return NextResponse.json(results);
}
