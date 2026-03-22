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

export async function GET(request: NextRequest) {
  const client = getClient();
  if (!client) {
    return NextResponse.json({ error: 'GA credentials not configured' }, { status: 503 });
  }

  const range = request.nextUrl.searchParams.get('range') || '24h';
  const gaProjects = projects.filter(p => p.gaPropertyId);

  let startDate: string;
  let timeDimension: string;
  if (range === '1m') {
    startDate = '30daysAgo';
    timeDimension = 'date';
  } else if (range === 'all') {
    startDate = '2020-01-01';
    timeDimension = 'date';
  } else if (range === 'today' || range === '1h') {
    startDate = 'today';
    timeDimension = 'dateHour';
  } else {
    startDate = 'yesterday';
    timeDimension = 'dateHour';
  }

  // Fetch time-series data for all GA projects in parallel
  const allResults = await Promise.all(
    gaProjects.map(async (project) => {
      try {
        const propertyId = `properties/${project.gaPropertyId}`;
        const [response] = await client.runReport({
          property: propertyId,
          dateRanges: [{ startDate, endDate: 'today' }],
          dimensions: [{ name: timeDimension }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'activeUsers' },
            { name: 'sessions' },
          ],
          orderBys: [{ dimension: { dimensionName: timeDimension, orderType: 'ALPHANUMERIC' } }],
        });

        return (response.rows ?? []).map(row => ({
          dateHour: row.dimensionValues?.[0]?.value ?? '',
          pageViews: parseInt(row.metricValues?.[0]?.value ?? '0'),
          users: parseInt(row.metricValues?.[1]?.value ?? '0'),
          sessions: parseInt(row.metricValues?.[2]?.value ?? '0'),
        }));
      } catch {
        return [];
      }
    })
  );

  // Merge all results by dateHour/date
  const merged = new Map<string, { dateHour: string; pageViews: number; users: number; sessions: number }>();

  for (const siteData of allResults) {
    for (const row of siteData) {
      const existing = merged.get(row.dateHour);
      if (existing) {
        existing.pageViews += row.pageViews;
        existing.users += row.users;
        existing.sessions += row.sessions;
      } else {
        merged.set(row.dateHour, { ...row });
      }
    }
  }

  // Sort by dateHour ascending
  let hourly = Array.from(merged.values()).sort((a, b) => a.dateHour.localeCompare(b.dateHour));

  // For '1h' range, filter to only the current and previous hour
  if (range === '1h') {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const prevHour = currentHour === 0 ? 23 : currentHour - 1;
    const todayStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const currentKey = `${todayStr}${String(currentHour).padStart(2, '0')}`;
    const prevKey = `${todayStr}${String(prevHour).padStart(2, '0')}`;
    hourly = hourly.filter(h => h.dateHour === currentKey || h.dateHour === prevKey);
  }

  // For '1h' range, build the set of allowed dateHour keys so per-site bars match
  let allowedKeys: Set<string> | null = null;
  if (range === '1h') {
    allowedKeys = new Set(hourly.map(h => h.dateHour));
  }

  // Per-site breakdown for the bar chart (filtered to match the selected range)
  const perSite = gaProjects.map((project, i) => {
    let data = allResults[i];
    // For '1h', filter per-site data to same hours as the chart
    if (allowedKeys) {
      data = data.filter(r => allowedKeys!.has(r.dateHour));
    }
    const totalViews = data.reduce((sum, r) => sum + r.pageViews, 0);
    const totalUsers = data.reduce((sum, r) => sum + r.users, 0);
    return {
      siteId: project.id,
      name: project.name,
      color: project.color,
      pageViews: totalViews,
      users: totalUsers,
    };
  }).filter(s => s.pageViews > 0).sort((a, b) => b.pageViews - a.pageViews);

  return NextResponse.json({ hourly, perSite });
}
