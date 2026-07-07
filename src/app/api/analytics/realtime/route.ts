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
  const gaProjects = projects.filter(p => p.gaPropertyId);

  // GA4 realtime active users (accurate uniques, but only for GA-tracked sites)
  const gaMap = new Map<string, number>();
  if (client) {
    await Promise.all(
      gaProjects.map(async (project) => {
        try {
          const [response] = await client.runRealtimeReport({
            property: `properties/${project.gaPropertyId}`,
            metrics: [{ name: 'activeUsers' }],
          });
          gaMap.set(project.id, parseInt(response.rows?.[0]?.metricValues?.[0]?.value ?? '0'));
        } catch {
          gaMap.set(project.id, 0);
        }
      })
    );
  }

  const data = Array.from(gaMap.entries()).map(([siteId, realtimeUsers]) => ({
    siteId,
    realtimeUsers,
  }));

  return NextResponse.json({ data, timestamp: new Date().toISOString() });
}
