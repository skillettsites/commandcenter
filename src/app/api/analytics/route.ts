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

  const results: AnalyticsResult[] = await Promise.all(
    gaProjects.map(async (project) => {
      try {
        const [response] = await client.runReport({
          property: `properties/${project.gaPropertyId}`,
          dateRanges: [{ startDate: 'today', endDate: 'today' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
          ],
        });

        const row = response.rows?.[0];
        return {
          siteId: project.id,
          activeUsers: parseInt(row?.metricValues?.[0]?.value ?? '0'),
          sessions: parseInt(row?.metricValues?.[1]?.value ?? '0'),
          pageViews: parseInt(row?.metricValues?.[2]?.value ?? '0'),
        };
      } catch {
        return {
          siteId: project.id,
          activeUsers: 0,
          sessions: 0,
          pageViews: 0,
        };
      }
    })
  );

  return NextResponse.json({ data: results });
}
