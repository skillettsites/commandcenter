import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { ukTodayStart, ukMonthStart } from '@/lib/uk-time';

export const dynamic = 'force-dynamic';

const SITES = ['helpafterloss', 'helpafterlife'];

export async function GET() {
  const supabase = getServiceClient();
  const todayStart = ukTodayStart();
  const monthStart = ukMonthStart();
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all checklist download events
  const { data: rows, error } = await supabase
    .from('pageviews')
    .select('site_id, created_at, referrer, geo_city, geo_country, device_type')
    .eq('path', '/__checklist-download')
    .in('site_id', SITES)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = rows || [];

  // Compute stats per site
  const sites: Record<string, { today: number; week: number; month: number; total: number }> = {};
  for (const s of SITES) {
    const siteRows = all.filter((r) => r.site_id === s);
    sites[s] = {
      today: siteRows.filter((r) => r.created_at >= todayStart).length,
      week: siteRows.filter((r) => r.created_at >= weekStart).length,
      month: siteRows.filter((r) => r.created_at >= monthStart).length,
      total: siteRows.length,
    };
  }

  // Top referrer pages (which page the banner was on)
  const refCounts: Record<string, number> = {};
  for (const r of all) {
    const ref = r.referrer || 'direct';
    refCounts[ref] = (refCounts[ref] || 0) + 1;
  }
  const topPages = Object.entries(refCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([page, count]) => ({ page, count }));

  // Recent downloads (last 10)
  const recent = all.slice(0, 10).map((r) => ({
    site: r.site_id,
    time: r.created_at,
    from: r.referrer || '/',
    city: r.geo_city,
    country: r.geo_country,
    device: r.device_type,
  }));

  // Totals
  const today = all.filter((r) => r.created_at >= todayStart).length;
  const week = all.filter((r) => r.created_at >= weekStart).length;
  const month = all.filter((r) => r.created_at >= monthStart).length;

  return NextResponse.json({
    today,
    week,
    month,
    total: all.length,
    sites,
    topPages,
    recent,
  });
}
