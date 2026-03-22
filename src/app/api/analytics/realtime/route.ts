import { NextResponse } from 'next/server';
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

export async function GET() {
  const client = getClient();
  if (!client) {
    return NextResponse.json({ data: [] });
  }

  const gaProjects = projects.filter(p => p.gaPropertyId);

  const results = await Promise.all(
    gaProjects.map(async (project) => {
      try {
        const [response] = await client.runRealtimeReport({
          property: `properties/${project.gaPropertyId}`,
          metrics: [
            { name: 'activeUsers' },
          ],
        });

        const activeUsers = parseInt(response.rows?.[0]?.metricValues?.[0]?.value ?? '0');

        return {
          siteId: project.id,
          realtimeUsers: activeUsers,
        };
      } catch {
        return {
          siteId: project.id,
          realtimeUsers: 0,
        };
      }
    })
  );

  return NextResponse.json({
    data: results,
    timestamp: new Date().toISOString(),
  });
}
