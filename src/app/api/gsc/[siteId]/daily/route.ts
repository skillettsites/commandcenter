import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth | null {
  if (_auth) return _auth;
  const email = process.env.GA_CLIENT_EMAIL;
  const key = process.env.GA_PRIVATE_KEY;
  if (!email || !key) return null;
  _auth = new GoogleAuth({
    credentials: { client_email: email, private_key: key.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  return _auth;
}

function getDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

// GET /api/gsc/[siteId]/daily - Returns daily clicks, impressions, and unique pages in search
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const auth = getAuth();
  if (!auth) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const project = projects.find(p => p.id === siteId);
  if (!project?.gscSiteUrl) return NextResponse.json({ error: 'No GSC URL' }, { status: 404 });

  const encodedSiteUrl = encodeURIComponent(project.gscSiteUrl);

  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const headers = { 'Authorization': `Bearer ${token.token}`, 'Content-Type': 'application/json' };

    // Fetch daily clicks/impressions and daily unique pages (last 28 days)
    const [dailyRes, dailyPagesRes] = await Promise.all([
      fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          startDate: getDateString(-28),
          endDate: getDateString(-1),
          dimensions: ['date'],
        }),
      }),
      // Get unique pages per day by querying date+page
      fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          startDate: getDateString(-28),
          endDate: getDateString(-1),
          dimensions: ['date', 'page'],
          rowLimit: 25000,
        }),
      }),
    ]);

    // Parse daily metrics
    const dailyData: Array<{ date: string; clicks: number; impressions: number; pages: number }> = [];
    const dateMap = new Map<string, { clicks: number; impressions: number }>();

    if (dailyRes.ok) {
      const data = await dailyRes.json();
      for (const row of data.rows ?? []) {
        const date = row.keys[0];
        dateMap.set(date, { clicks: row.clicks ?? 0, impressions: row.impressions ?? 0 });
      }
    }

    // Count unique pages per day
    const pageDateMap = new Map<string, Set<string>>();
    if (dailyPagesRes.ok) {
      const data = await dailyPagesRes.json();
      for (const row of data.rows ?? []) {
        const date = row.keys[0];
        const page = row.keys[1];
        if (!pageDateMap.has(date)) pageDateMap.set(date, new Set());
        pageDateMap.get(date)!.add(page);
      }
    }

    // Merge into daily array
    const allDates = new Set([...dateMap.keys(), ...pageDateMap.keys()]);
    for (const date of Array.from(allDates).sort()) {
      const metrics = dateMap.get(date) ?? { clicks: 0, impressions: 0 };
      const pages = pageDateMap.get(date)?.size ?? 0;
      dailyData.push({ date, clicks: metrics.clicks, impressions: metrics.impressions, pages });
    }

    // Also fetch Bing daily data if available
    let bingDaily: Array<{ date: string; clicks: number; impressions: number }> = [];
    const apiKey = process.env.BING_WEBMASTER_API_KEY;
    if (apiKey && project.bingSiteUrl) {
      const bingSiteUrl = encodeURIComponent(project.bingSiteUrl);
      try {
        const bingRes = await fetch(
          `https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=${bingSiteUrl}&apikey=${apiKey}`
        );
        if (bingRes.ok) {
          const bingData = await bingRes.json();
          const rows = bingData.d ?? bingData ?? [];
          if (Array.isArray(rows)) {
            // Bing returns dates as /Date(timestamp)/ format
            for (const row of rows.slice(-28)) {
              const dateMatch = String(row.Date ?? '').match(/(\d+)/);
              const dateStr = dateMatch
                ? new Date(parseInt(dateMatch[1])).toISOString().split('T')[0]
                : '';
              if (dateStr) {
                bingDaily.push({
                  date: dateStr,
                  clicks: row.Clicks ?? 0,
                  impressions: row.Impressions ?? 0,
                });
              }
            }
          }
        }
      } catch {
        // silently fail
      }
    }

    return NextResponse.json({ google: dailyData, bing: bingDaily });
  } catch (err) {
    console.error(`GSC daily error for ${siteId}:`, err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
