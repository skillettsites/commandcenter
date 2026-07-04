import { NextResponse } from 'next/server';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { projects } from '@/lib/projects';
import { getServiceClient } from '@/lib/supabase';

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

  // First-party live activity: distinct-ish views in the last 5 minutes from the
  // pageviews table. Covers sites GA can't see (e.g. GA property not shared) so
  // every site with someone on it shows up.
  const recentMap = new Map<string, number>();
  try {
    const supabase = getServiceClient();
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('pageviews')
      .select('site_id')
      .gte('created_at', since)
      .limit(20000);
    for (const row of data ?? []) {
      recentMap.set(row.site_id, (recentMap.get(row.site_id) ?? 0) + 1);
    }
  } catch {
    /* first-party fallback unavailable */
  }

  const allSiteIds = new Set<string>([...gaMap.keys(), ...recentMap.keys()]);
  const data = Array.from(allSiteIds).map((siteId) => ({
    siteId,
    realtimeUsers: Math.max(gaMap.get(siteId) ?? 0, recentMap.get(siteId) ?? 0),
  }));

  return NextResponse.json({ data, timestamp: new Date().toISOString() });
}
