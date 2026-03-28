import { NextResponse } from 'next/server';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { projects } from '@/lib/projects';
import { AnalyticsResult } from '@/lib/types';

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

export async function GET() {
  const client = getClient();
  if (!client) {
    return NextResponse.json({ error: 'GA credentials not configured', data: [] });
  }

  const gaProjects = projects.filter(p => p.gaPropertyId);

  // Get first day of current month in YYYY-MM-DD format
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const results: AnalyticsResult[] = await Promise.all(
    gaProjects.map(async (project) => {
      try {
        const propertyId = `properties/${project.gaPropertyId}`;

        // Fetch realtime stats (instant, no delay), month-to-date, and all-time in parallel
        const [realtimeResponse, monthResponse, totalResponse] = await Promise.all([
          client.runRealtimeReport({
            property: propertyId,
            metrics: [
              { name: 'activeUsers' },
              { name: 'screenPageViews' },
            ],
            minuteRanges: [
              { name: 'today', startMinutesAgo: 1440, endMinutesAgo: 0 },
            ],
          }),
          client.runReport({
            property: propertyId,
            dateRanges: [{ startDate: monthStart, endDate: 'today' }],
            metrics: [{ name: 'totalUsers' }],
          }),
          client.runReport({
            property: propertyId,
            dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
            metrics: [{ name: 'totalUsers' }],
          }),
        ]);

        const realtimeRow = realtimeResponse[0].rows?.[0];
        const monthRow = monthResponse[0].rows?.[0];
        const totalRow = totalResponse[0].rows?.[0];

        return {
          siteId: project.id,
          activeUsers: parseInt(realtimeRow?.metricValues?.[0]?.value ?? '0'),
          sessions: 0,
          pageViews: parseInt(realtimeRow?.metricValues?.[1]?.value ?? '0'),
          monthVisitors: parseInt(monthRow?.metricValues?.[0]?.value ?? '0'),
          totalVisitors: parseInt(totalRow?.metricValues?.[0]?.value ?? '0'),
        };
      } catch {
        return {
          siteId: project.id,
          activeUsers: 0,
          sessions: 0,
          pageViews: 0,
          totalVisitors: 0,
          monthVisitors: 0,
        };
      }
    })
  );

  return NextResponse.json({ data: results });
}
