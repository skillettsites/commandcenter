import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { ukTodayStart, ukMonthStart } from '@/lib/uk-time';

export const dynamic = 'force-dynamic';

const ALL_SITES = [
  'findyourstay', 'postcodecheck', 'carcostcheck', 'bestlondontours',
  'thebesttours', 'daveknowsai', 'aicareerswap', 'helpafterloss',
  'helpafterlife', 'aibetfinder', 'guardmybusiness', 'briefmynews',
  'davidskillett', 'skicrowdchecker', 'askyourstay',
];

// GET /api/pageviews?site_id=findyourstay&range=today|24h|7d|1m|all&view=summary|top-pages|geo|recent|full
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteFilter = searchParams.get('site_id');
  const range = searchParams.get('range') || 'today';
  const view = searchParams.get('view') || 'summary';

  const supabase = getServiceClient();
  const now = new Date();
  const todayStart = ukTodayStart();
  const monthStart = ukMonthStart();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const sites = siteFilter ? [siteFilter] : ALL_SITES;

  function getFromDate(): string {
    if (range === 'today') return todayStart;
    if (range === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    if (range === '7d') return weekStart;
    if (range === '1m') return monthStart;
    return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  const fromDate = getFromDate();

  // Summary: counts per site
  if (view === 'summary') {
    const results: Record<string, { today: number; week: number; month: number; total: number }> = {};

    for (const siteId of sites) {
      const [todayRes, weekRes, monthRes, totalRes] = await Promise.all([
        supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteId).gte('created_at', todayStart),
        supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteId).gte('created_at', weekStart),
        supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteId).gte('created_at', monthStart),
        supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteId),
      ]);

      results[siteId] = {
        today: todayRes.count ?? 0,
        week: weekRes.count ?? 0,
        month: monthRes.count ?? 0,
        total: totalRes.count ?? 0,
      };
    }

    return NextResponse.json(results);
  }

  // Top pages
  if (view === 'top-pages') {
    const results: Record<string, { total: number; pages: Array<{ path: string; count: number }> }> = {};

    for (const siteId of sites) {
      const { data: rows } = await supabase
        .from('pageviews')
        .select('path')
        .eq('site_id', siteId)
        .gte('created_at', fromDate)
        .order('created_at', { ascending: false })
        .limit(5000);

      const counts = new Map<string, number>();
      for (const row of rows ?? []) {
        counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
      }

      const sorted = Array.from(counts.entries())
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      results[siteId] = { total: rows?.length ?? 0, pages: sorted };
    }

    return NextResponse.json(results);
  }

  // Geo breakdown
  if (view === 'geo') {
    const results: Record<string, {
      topCountries: Array<{ country: string; count: number }>;
      topCities: Array<{ city: string; country: string; count: number }>;
      deviceBreakdown: Record<string, number>;
    }> = {};

    for (const siteId of sites) {
      const { data: rows } = await supabase
        .from('pageviews')
        .select('geo_country, geo_city, device_type')
        .eq('site_id', siteId)
        .gte('created_at', fromDate)
        .limit(10000);

      const countries = new Map<string, number>();
      const cities = new Map<string, { country: string; count: number }>();
      const devices: Record<string, number> = {};

      for (const row of rows ?? []) {
        if (row.geo_country) {
          countries.set(row.geo_country, (countries.get(row.geo_country) ?? 0) + 1);
        }
        if (row.geo_city && row.geo_country) {
          const key = `${row.geo_city}|${row.geo_country}`;
          const existing = cities.get(key);
          if (existing) existing.count++;
          else cities.set(key, { country: row.geo_country, count: 1 });
        }
        const dt = row.device_type || 'unknown';
        devices[dt] = (devices[dt] ?? 0) + 1;
      }

      results[siteId] = {
        topCountries: Array.from(countries.entries())
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        topCities: Array.from(cities.entries())
          .map(([key, data]) => ({ city: key.split('|')[0], country: data.country, count: data.count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        deviceBreakdown: devices,
      };
    }

    return NextResponse.json(results);
  }

  // Recent pageviews
  if (view === 'recent') {
    const results: Record<string, Array<{
      path: string; referrer: string | null; geo_city: string | null;
      geo_country: string | null; device_type: string | null; created_at: string;
    }>> = {};

    for (const siteId of sites) {
      const { data: rows } = await supabase
        .from('pageviews')
        .select('path, referrer, geo_city, geo_country, device_type, created_at')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(30);

      results[siteId] = rows ?? [];
    }

    return NextResponse.json(results);
  }

  // Full: combines summary + top pages + geo + recent for a single site
  if (view === 'full' && siteFilter) {
    const [todayRes, weekRes, monthRes, totalRes] = await Promise.all([
      supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteFilter).gte('created_at', todayStart),
      supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteFilter).gte('created_at', weekStart),
      supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteFilter).gte('created_at', monthStart),
      supabase.from('pageviews').select('*', { count: 'exact', head: true }).eq('site_id', siteFilter),
    ]);

    const { data: allRows } = await supabase
      .from('pageviews')
      .select('path, referrer, geo_city, geo_region, geo_country, device_type, created_at')
      .eq('site_id', siteFilter)
      .gte('created_at', fromDate)
      .order('created_at', { ascending: false })
      .limit(5000);

    const rows = allRows ?? [];

    // Top pages
    const pathCounts = new Map<string, number>();
    const countries = new Map<string, number>();
    const cities = new Map<string, { country: string; count: number }>();
    const devices: Record<string, number> = {};
    const referrers = new Map<string, number>();

    for (const row of rows) {
      pathCounts.set(row.path, (pathCounts.get(row.path) ?? 0) + 1);
      if (row.geo_country) countries.set(row.geo_country, (countries.get(row.geo_country) ?? 0) + 1);
      if (row.geo_city && row.geo_country) {
        const key = `${row.geo_city}|${row.geo_country}`;
        const existing = cities.get(key);
        if (existing) existing.count++;
        else cities.set(key, { country: row.geo_country, count: 1 });
      }
      const dt = row.device_type || 'unknown';
      devices[dt] = (devices[dt] ?? 0) + 1;
      if (row.referrer) {
        try {
          const host = new URL(row.referrer).hostname;
          referrers.set(host, (referrers.get(host) ?? 0) + 1);
        } catch { /* skip invalid */ }
      }
    }

    return NextResponse.json({
      summary: {
        today: todayRes.count ?? 0,
        week: weekRes.count ?? 0,
        month: monthRes.count ?? 0,
        total: totalRes.count ?? 0,
      },
      topPages: Array.from(pathCounts.entries())
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
      topCountries: Array.from(countries.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      topCities: Array.from(cities.entries())
        .map(([key, data]) => ({ city: key.split('|')[0], country: data.country, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      deviceBreakdown: devices,
      topReferrers: Array.from(referrers.entries())
        .map(([host, count]) => ({ host, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      recent: rows.slice(0, 30),
    });
  }

  // Geo detail: countries with percentages, cities with regions, city pairs (searches), device breakdown
  if (view === 'geo-detail') {
    const siteIds = siteFilter ? [siteFilter] : ALL_SITES;

    // Fetch pageviews for geo data
    const { data: pvRows } = await supabase
      .from('pageviews')
      .select('site_id, geo_country, geo_city, geo_region, device_type')
      .in('site_id', siteIds)
      .gte('created_at', fromDate)
      .limit(20000);

    const rows = pvRows ?? [];
    const totalRows = rows.length;

    // Aggregate countries
    const countryMap = new Map<string, number>();
    const cityMap = new Map<string, { city: string; region: string; country: string; count: number }>();
    const deviceMap: Record<string, number> = {};

    for (const row of rows) {
      if (row.geo_country) {
        countryMap.set(row.geo_country, (countryMap.get(row.geo_country) ?? 0) + 1);
      }
      if (row.geo_city) {
        const key = `${row.geo_city}|${row.geo_region || ''}|${row.geo_country || ''}`;
        const existing = cityMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          cityMap.set(key, {
            city: row.geo_city,
            region: row.geo_region || '',
            country: row.geo_country || '',
            count: 1,
          });
        }
      }
      const dt = row.device_type || 'unknown';
      deviceMap[dt] = (deviceMap[dt] ?? 0) + 1;
    }

    const topCountries = Array.from(countryMap.entries())
      .map(([country, count]) => ({
        country,
        count,
        percentage: totalRows > 0 ? Math.round((count / totalRows) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const topCities = Array.from(cityMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);

    // City pairs: only for postcodecheck and carcostcheck, from the searches table
    let cityPairs: Array<{ visitorCity: string; searchedArea: string; count: number }> = [];
    const searchSites = siteIds.filter(s => s === 'postcodecheck' || s === 'carcostcheck');

    if (searchSites.length > 0) {
      const { data: searchRows } = await supabase
        .from('searches')
        .select('geo_city, search_query')
        .in('site_id', searchSites)
        .gte('created_at', fromDate)
        .not('geo_city', 'is', null)
        .limit(10000);

      if (searchRows && searchRows.length > 0) {
        const pairMap = new Map<string, { visitorCity: string; searchedArea: string; count: number }>();
        for (const row of searchRows) {
          if (row.geo_city && row.search_query) {
            const key = `${row.geo_city}|${row.search_query}`;
            const existing = pairMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              pairMap.set(key, {
                visitorCity: row.geo_city,
                searchedArea: row.search_query,
                count: 1,
              });
            }
          }
        }
        cityPairs = Array.from(pairMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 30);
      }
    }

    return NextResponse.json({
      topCountries,
      topCities,
      cityPairs,
      deviceBreakdown: deviceMap,
    });
  }

  return NextResponse.json({ error: 'Invalid view parameter. Use: summary, top-pages, geo, geo-detail, recent, or full' }, { status: 400 });
}
