import { NextRequest, NextResponse } from 'next/server';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { projects } from '@/lib/projects';
import { getServiceClient } from '@/lib/supabase';
import { ukTodayStr, ukMonthStr } from '@/lib/uk-time';

export const dynamic = 'force-dynamic';

const ALL_SITES = projects
  .filter(p => p.url && p.id !== 'dashboard' && p.id !== 'general' && p.id !== 'personal')
  .map(p => p.id);

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
  if (range === '7d') {
    startDate = '7daysAgo';
    timeDimension = 'date';
  } else if (range === '1m') {
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

  // Fetch tracked pageviews from Supabase for per-site breakdown
  const supabase = getServiceClient();
  const now = new Date();
  let pvFromDate: string;
  if (range === '1h') {
    pvFromDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  } else if (range === 'today') {
    pvFromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  } else if (range === '24h') {
    pvFromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  } else if (range === '7d') {
    pvFromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (range === '1m') {
    pvFromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  } else {
    pvFromDate = '2020-01-01T00:00:00.000Z';
  }

  // Fetch Vercel analytics for per-site breakdown
  const vercelToken = process.env.VERCEL_API_TOKEN;
  const vercelTeamId = process.env.VERCEL_TEAM_ID;
  const vercelPerSite: Record<string, { pageViews: number; visitors: number }> = {};

  if (vercelToken && vercelTeamId) {
    const vercelProjects = projects.filter(p => p.vercelProjectId);
    const today = ukTodayStr();
    const monthStart = ukMonthStr() + '-01';
    const allTimeStart = '2025-01-01';

    // Pick the right date range based on the dashboard range
    let vFrom: string;
    let vTo: string;
    if (range === '1h' || range === 'today' || range === '24h') {
      vFrom = today;
      vTo = today;
    } else if (range === '7d') {
      vFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      vTo = today;
    } else if (range === '1m') {
      vFrom = monthStart;
      vTo = today;
    } else {
      vFrom = allTimeStart;
      vTo = today;
    }

    await Promise.all(
      vercelProjects.map(async (project) => {
        try {
          const url = `https://vercel.com/api/web-analytics/overview?projectId=${project.vercelProjectId}&teamId=${vercelTeamId}&from=${vFrom}&to=${vTo}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${vercelToken}` },
            next: { revalidate: 0 },
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.error) {
              vercelPerSite[project.id] = {
                pageViews: data.total ?? 0,
                visitors: data.devices ?? 0,
              };
            }
          }
        } catch {
          // skip failed fetches
        }
      })
    );
  }

  // Get tracked pageview counts per site
  const trackedCounts: Record<string, number> = {};
  await Promise.all(
    ALL_SITES.map(async (siteId) => {
      const { count } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('created_at', pvFromDate);
      trackedCounts[siteId] = count ?? 0;
    })
  );

  // GA4 per-site totals
  const gaPerSite = new Map(gaProjects.map((project, i) => {
    let data = allResults[i];
    if (allowedKeys) {
      data = data.filter(r => allowedKeys!.has(r.dateHour));
    }
    const totalViews = data.reduce((sum, r) => sum + r.pageViews, 0);
    const totalUsers = data.reduce((sum, r) => sum + r.users, 0);
    return [project.id, { views: totalViews, users: totalUsers }] as const;
  }));

  // Sites that actually returned GA data this range. Used to decide which sites
  // need a first-party (tracked pageviews) fallback so GA-less sites like
  // BriefMyNews still appear in the traffic chart instead of a flat/empty line.
  const gaSites = new Set(
    [...gaPerSite].filter(([, v]) => v.views > 0).map(([id]) => id)
  );

  // Per-site breakdown: MAX across Vercel, GA4, and tracked pageviews
  const allSiteIds = new Set([...ALL_SITES, ...gaProjects.map(p => p.id)]);
  const perSite = Array.from(allSiteIds)
    .map(siteId => {
      const proj = projects.find(p => p.id === siteId);
      const tracked = trackedCounts[siteId] ?? 0;
      const ga = gaPerSite.get(siteId);
      const vercel = vercelPerSite[siteId];
      const gaViews = ga?.views ?? 0;
      const gaUsers = ga?.users ?? 0;
      const vercelViews = vercel?.pageViews ?? 0;
      const vercelUsers = vercel?.visitors ?? 0;
      // When a site has no GA/Vercel visitor data, fall back to its tracked
      // pageview count as a visitor proxy so it isn't stuck at zero.
      const trackedUsersProxy = gaSites.has(siteId) ? 0 : tracked;
      return {
        siteId,
        name: proj?.name || siteId,
        color: proj?.color || '#888',
        pageViews: Math.max(tracked, gaViews, vercelViews),
        users: Math.max(gaUsers, vercelUsers, trackedUsersProxy),
      };
    })
    .filter(s => s.pageViews > 0 || s.users > 0)
    .sort((a, b) => b.pageViews - a.pageViews);

  // Fold first-party pageviews into the time-series for GA-less sites so their
  // traffic shows as a line. GA-tracked sites already contribute above, so we
  // only supplement sites with no GA data (avoids double-counting).
  const trackedOnlySites = ALL_SITES.filter(
    id => (trackedCounts[id] ?? 0) > 0 && !gaSites.has(id)
  );
  if (trackedOnlySites.length > 0) {
    const { data: pvRows } = await supabase
      .from('pageviews')
      .select('created_at')
      .in('site_id', trackedOnlySites)
      .gte('created_at', pvFromDate)
      .limit(20000);
    for (const r of pvRows ?? []) {
      const d = new Date(r.created_at as string);
      const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
      const key = timeDimension === 'dateHour' ? `${ymd}${String(d.getUTCHours()).padStart(2, '0')}` : ymd;
      if (range === '1h' && allowedKeys && !allowedKeys.has(key)) continue;
      const existing = merged.get(key);
      if (existing) existing.pageViews += 1;
      else merged.set(key, { dateHour: key, pageViews: 1, users: 0, sessions: 0 });
    }
    hourly = Array.from(merged.values()).sort((a, b) => a.dateHour.localeCompare(b.dateHour));
    if (range === '1h' && allowedKeys) hourly = hourly.filter(h => allowedKeys!.has(h.dateHour));
  }

  return NextResponse.json({ hourly, perSite });
}
