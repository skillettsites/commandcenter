import { NextRequest, NextResponse } from 'next/server';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { projects } from '@/lib/projects';
import { getServiceClient } from '@/lib/supabase';
import { isExcludedDate } from '@/lib/analytics-filter';

export const dynamic = 'force-dynamic';

let _client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient | null {
  if (_client) return _client;
  const email = process.env.GA_CLIENT_EMAIL;
  const key = process.env.GA_PRIVATE_KEY;
  if (!email || !key) return null;
  _client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: email,
      private_key: key.replace(/\\n/g, '\n'),
    },
  });
  return _client;
}

// First-party fallback: build the detail view from the Supabase `pageviews`
// table for sites GA can't read (e.g. BriefMyNews, whose GA4 property isn't
// shared with the reader service account). Uses pageviews as a visitor proxy.
async function buildFromPageviews(siteId: string, range: string) {
  const now = Date.now();
  const hourlyBuckets = range === 'today' || range === '24h' || range === 'yesterday';
  let from: string;
  if (range === '7d') from = new Date(now - 7 * 864e5).toISOString();
  else if (range === '90d') from = new Date(now - 90 * 864e5).toISOString();
  else if (range === '1m' || range === '30d') from = new Date(now - 30 * 864e5).toISOString();
  else if (range === 'all') from = '2020-01-01T00:00:00.000Z';
  else if (range === 'today') from = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
  else from = new Date(now - 24 * 3600e3).toISOString();

  const supabase = getServiceClient();
  const { data } = await supabase
    .from('pageviews')
    .select('created_at, path, referrer')
    .eq('site_id', siteId)
    .gte('created_at', from)
    .limit(50000);

  const rows = data ?? [];
  const byTime = new Map<string, number>();
  const byPath = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.created_at as string);
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const key = hourlyBuckets ? `${ymd}${String(d.getUTCHours()).padStart(2, '0')}` : ymd;
    byTime.set(key, (byTime.get(key) ?? 0) + 1);
    if (r.path) byPath.set(r.path as string, (byPath.get(r.path as string) ?? 0) + 1);
    let src = '(direct)';
    if (r.referrer) { try { src = new URL(r.referrer as string).hostname; } catch { /* keep direct */ } }
    bySource.set(src, (bySource.get(src) ?? 0) + 1);
  }

  const hourly = Array.from(byTime.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateHour, count]) => ({ dateHour, pageViews: count, users: count, sessions: count }));
  const topPages = Array.from(byPath.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([path, views]) => ({ path, views }));
  const sources = Array.from(bySource.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([source, sessions]) => ({ source, sessions, users: sessions }));

  return { hourly, sources, topPages, source: 'pageviews' as const };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const client = getClient();
  if (!client) {
    return NextResponse.json({ error: 'GA credentials not configured' }, { status: 503 });
  }

  const project = projects.find(p => p.id === siteId);
  if (!project) {
    return NextResponse.json({ error: 'Unknown site' }, { status: 404 });
  }
  // No GA property -> serve first-party pageviews directly.
  if (!project.gaPropertyId) {
    const range = request.nextUrl.searchParams.get('range') || '24h';
    return NextResponse.json(await buildFromPageviews(siteId, range));
  }

  const propertyId = `properties/${project.gaPropertyId}`;
  const range = request.nextUrl.searchParams.get('range') || '24h';

  // Determine date range and dimension based on range param
  let startDate: string;
  let timeDimension: string;
  if (range === '7d') {
    startDate = '7daysAgo';
    timeDimension = 'date';
  } else if (range === '90d') {
    startDate = '90daysAgo';
    timeDimension = 'date';
  } else if (range === '1m' || range === '30d') {
    startDate = '30daysAgo';
    timeDimension = 'date';
  } else if (range === 'all') {
    startDate = '2020-01-01';
    timeDimension = 'date';
  } else if (range === 'today') {
    startDate = 'today';
    timeDimension = 'dateHour';
  } else {
    startDate = 'yesterday';
    timeDimension = 'dateHour';
  }

  try {
    const [hourlyResponse, referralResponse, topPagesResponse] = await Promise.all([
      client.runReport({
        property: propertyId,
        dateRanges: [{ startDate, endDate: 'today' }],
        dimensions: [{ name: timeDimension }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
          { name: 'sessions' },
        ],
        orderBys: [{ dimension: { dimensionName: timeDimension, orderType: 'ALPHANUMERIC' } }],
      }),
      client.runReport({
        property: propertyId,
        dateRanges: [{ startDate, endDate: 'today' }],
        dimensions: [{ name: 'sessionSource' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property: propertyId,
        dateRanges: [{ startDate, endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
    ]);

    // Parse hourly data (dropping bot-flood anomaly days that skew the chart)
    const hourly = (hourlyResponse[0].rows ?? [])
      .map(row => ({
        dateHour: row.dimensionValues?.[0]?.value ?? '',
        pageViews: parseInt(row.metricValues?.[0]?.value ?? '0'),
        users: parseInt(row.metricValues?.[1]?.value ?? '0'),
        sessions: parseInt(row.metricValues?.[2]?.value ?? '0'),
      }))
      .filter(row => !isExcludedDate(row.dateHour));

    // Parse referral sources
    const sources = (referralResponse[0].rows ?? []).map(row => ({
      source: row.dimensionValues?.[0]?.value ?? '(unknown)',
      sessions: parseInt(row.metricValues?.[0]?.value ?? '0'),
      users: parseInt(row.metricValues?.[1]?.value ?? '0'),
    }));

    // Parse top pages
    const topPages = (topPagesResponse[0].rows ?? []).map(row => ({
      path: row.dimensionValues?.[0]?.value ?? '/',
      views: parseInt(row.metricValues?.[0]?.value ?? '0'),
    }));

    // GA returned nothing (e.g. property not shared with the reader account, or
    // no data) -> fall back to first-party pageviews so the chart isn't blank.
    if (hourly.length === 0) {
      const fb = await buildFromPageviews(siteId, range);
      if (fb.hourly.length > 0) return NextResponse.json(fb);
    }

    return NextResponse.json({ hourly, sources, topPages });
  } catch (err) {
    console.error(`Analytics detail error for ${siteId}:`, err);
    // GA call failed (commonly a permission error on a property that isn't
    // shared with the reader account) -> serve first-party pageviews instead.
    try {
      return NextResponse.json(await buildFromPageviews(siteId, range));
    } catch {
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
  }
}
