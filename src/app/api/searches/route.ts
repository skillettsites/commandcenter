import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { ukTodayStart, ukMonthStart } from '@/lib/uk-time';

export const dynamic = 'force-dynamic';

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
        .gte('created_at', fromDate)
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
    const chartResults: Record<string, Array<{ period: string; count: number }>> = {};

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

      const { data: rows } = await supabase
        .from('searches')
        .select('created_at')
        .eq('site_id', siteId)
        .gte('created_at', fromDate.toISOString())
        .order('created_at', { ascending: true });

      const buckets = new Map<string, number>();

      if (range === 'today' || range === '24h') {
        const hours = range === 'today'
          ? now.getUTCHours() + 1
          : 24;
        const start = range === 'today' ? new Date(todayStart) : fromDate;
        for (let h = 0; h < hours; h++) {
          const bucketTime = new Date(start.getTime() + h * 60 * 60 * 1000);
          const key = `${bucketTime.getUTCFullYear()}-${String(bucketTime.getUTCMonth() + 1).padStart(2, '0')}-${String(bucketTime.getUTCDate()).padStart(2, '0')}T${String(bucketTime.getUTCHours()).padStart(2, '0')}`;
          buckets.set(key, 0);
        }
        for (const row of rows ?? []) {
          const d = new Date(row.created_at);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
          if (buckets.has(key)) {
            buckets.set(key, (buckets.get(key) ?? 0) + 1);
          }
        }
      } else if (range === '1m') {
        for (let d = 29; d >= 0; d--) {
          const bucketTime = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
          const key = `${bucketTime.getUTCFullYear()}-${String(bucketTime.getUTCMonth() + 1).padStart(2, '0')}-${String(bucketTime.getUTCDate()).padStart(2, '0')}`;
          buckets.set(key, 0);
        }
        for (const row of rows ?? []) {
          const d = new Date(row.created_at);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          if (buckets.has(key)) {
            buckets.set(key, (buckets.get(key) ?? 0) + 1);
          }
        }
      } else {
        const startOfWeek = new Date(fromDate);
        startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay() + 1);
        const cursor = new Date(startOfWeek);
        while (cursor <= now) {
          const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
          buckets.set(key, 0);
          cursor.setUTCDate(cursor.getUTCDate() + 7);
        }
        for (const row of rows ?? []) {
          const d = new Date(row.created_at);
          const monday = new Date(d);
          monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);
          const key = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
          if (buckets.has(key)) {
            buckets.set(key, (buckets.get(key) ?? 0) + 1);
          }
        }
      }

      chartResults[siteId] = Array.from(buckets.entries()).map(([period, count]) => ({
        period,
        count,
      }));
    }

    return NextResponse.json(chartResults);
  }

  // Default: return summary counts + recent searches
  const results: Record<string, {
    today: number;
    month: number;
    avgDurationMs: number | null;
    recent: Array<{ search_query: string; result_found: boolean; created_at: string; geo_city: string | null; geo_region: string | null; geo_country: string | null; duration_ms: number | null }>;
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
      .select('search_query, result_found, created_at, geo_city, geo_region, geo_country, duration_ms')
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
