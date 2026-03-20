import { NextRequest, NextResponse } from 'next/server';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { projects } from '@/lib/projects';

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
  if (!project?.gaPropertyId) {
    return NextResponse.json({ error: 'No GA property for this site' }, { status: 404 });
  }

  const propertyId = `properties/${project.gaPropertyId}`;
  const range = request.nextUrl.searchParams.get('range') || '24h';

  // Determine date range and dimension based on range param
  let startDate: string;
  let timeDimension: string;
  if (range === '1m') {
    startDate = '30daysAgo';
    timeDimension = 'date';
  } else if (range === 'all') {
    startDate = '2020-01-01';
    timeDimension = 'date';
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

    // Parse hourly data
    const hourly = (hourlyResponse[0].rows ?? []).map(row => ({
      dateHour: row.dimensionValues?.[0]?.value ?? '',
      pageViews: parseInt(row.metricValues?.[0]?.value ?? '0'),
      users: parseInt(row.metricValues?.[1]?.value ?? '0'),
      sessions: parseInt(row.metricValues?.[2]?.value ?? '0'),
    }));

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

    return NextResponse.json({ hourly, sources, topPages });
  } catch (err) {
    console.error(`Analytics detail error for ${siteId}:`, err);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
