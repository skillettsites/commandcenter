import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/searches?site_id=carcostcheck&range=24h|1m|all
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteFilter = searchParams.get('site_id');
  const range = searchParams.get('range');

  const supabase = getServiceClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const sites = siteFilter ? [siteFilter] : ['carcostcheck', 'postcodecheck'];

  // If range is specified, return time-series chart data
  if (range) {
    const chartResults: Record<string, Array<{ period: string; count: number }>> = {};

    for (const siteId of sites) {
      let fromDate: Date;
      if (range === '24h') {
        fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (range === '1m') {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        // all time: go back 1 year max for performance
        fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      }

      const { data: rows } = await supabase
        .from('searches')
        .select('created_at')
        .eq('site_id', siteId)
        .gte('created_at', fromDate.toISOString())
        .order('created_at', { ascending: true });

      const buckets = new Map<string, number>();

      if (range === '24h') {
        // Hourly buckets for last 24 hours
        for (let h = 23; h >= 0; h--) {
          const bucketTime = new Date(now.getTime() - h * 60 * 60 * 1000);
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
        // Daily buckets for last 30 days
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
        // Weekly buckets for all time
        // Start from the Monday of the fromDate week
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
          // Find the Monday of this row's week
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

  // Default: return summary data (today, month, recent)
  const results: Record<string, {
    today: number;
    month: number;
    recent: Array<{ search_query: string; result_found: boolean; created_at: string }>;
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

    const { data: recent } = await supabase
      .from('searches')
      .select('search_query, result_found, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(10);

    results[siteId] = {
      today: todayCount ?? 0,
      month: monthCount ?? 0,
      recent: recent ?? [],
    };
  }

  return NextResponse.json(results);
}
