import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { projects } from '@/lib/projects';
import { GscData } from '@/lib/types';

export const dynamic = 'force-dynamic';

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth | null {
  if (_auth) return _auth;
  const email = process.env.GA_CLIENT_EMAIL;
  const key = process.env.GA_PRIVATE_KEY;
  if (!email || !key) return null;
  _auth = new GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  return _auth;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const auth = getAuth();
  if (!auth) {
    return NextResponse.json({ error: 'GSC credentials not configured' }, { status: 503 });
  }

  const project = projects.find(p => p.id === siteId);
  if (!project?.gscSiteUrl) {
    return NextResponse.json({ error: 'No GSC site URL for this site' }, { status: 404 });
  }

  const encodedSiteUrl = encodeURIComponent(project.gscSiteUrl);

  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const headers = {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    };

    // Fetch search analytics (7d aggregate + 28d by page + 28d by query) and sitemaps in parallel
    const [searchRes, pageRes, queryRes, sitemapRes] = await Promise.all([
      fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            startDate: getDateString(-7),
            endDate: getDateString(-1),
            dimensions: [],
          }),
        }
      ),
      fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            startDate: getDateString(-28),
            endDate: getDateString(-1),
            dimensions: ['page'],
            rowLimit: 1000,
          }),
        }
      ),
      fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            startDate: getDateString(-28),
            endDate: getDateString(-1),
            dimensions: ['query'],
            rowLimit: 10,
          }),
        }
      ),
      fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps`,
        { headers }
      ),
    ]);

    let clicks = 0, impressions = 0, ctr = 0, position = 0;
    let hasSearchData = false;

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const row = searchData.rows?.[0];
      if (row) {
        clicks = row.clicks ?? 0;
        impressions = row.impressions ?? 0;
        ctr = row.ctr ?? 0;
        position = row.position ?? 0;
        hasSearchData = true;
      }
    } else {
      const errBody = await searchRes.text();
      console.error(`GSC search error for ${siteId}: ${searchRes.status}`, errBody.slice(0, 300));
      // Return 503 so frontend knows GSC isn't configured yet
      if (searchRes.status === 403) {
        return NextResponse.json({ error: 'GSC API not enabled or no access' }, { status: 503 });
      }
    }

    // Count pages appearing in search (28d) and get top pages
    let pagesInSearch: number | null = null;
    let topPages: { page: string; clicks: number; impressions: number }[] = [];
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      const rows = pageData.rows ?? [];
      pagesInSearch = rows.length;
      topPages = rows
        .sort((a: { clicks: number }, b: { clicks: number }) => b.clicks - a.clicks)
        .slice(0, 10)
        .map((r: { keys: string[]; clicks: number; impressions: number }) => ({
          page: r.keys[0].replace(project.url, '').replace(/^https?:\/\/[^/]+/, '') || '/',
          clicks: r.clicks,
          impressions: r.impressions,
        }));
    }

    // Top search queries (28d)
    let topQueries: { query: string; clicks: number; impressions: number; position: number }[] = [];
    if (queryRes.ok) {
      const queryData = await queryRes.json();
      const rows = queryData.rows ?? [];
      topQueries = rows
        .sort((a: { clicks: number }, b: { clicks: number }) => b.clicks - a.clicks)
        .slice(0, 10)
        .map((r: { keys: string[]; clicks: number; impressions: number; position: number }) => ({
          query: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        }));
    }

    let pagesIndexed: number | null = null;
    let pagesSubmitted: number | null = null;
    if (sitemapRes.ok) {
      const sitemapData = await sitemapRes.json();
      const sitemaps = sitemapData.sitemap ?? [];
      pagesSubmitted = 0;
      pagesIndexed = 0;
      for (const sm of sitemaps) {
        for (const content of sm.contents ?? []) {
          pagesSubmitted += Number(content.submitted) || 0;
          pagesIndexed += Number(content.indexed) || 0;
        }
      }
    } else {
      console.error(`GSC sitemap error for ${siteId}: ${sitemapRes.status}`);
    }

    const result: GscData = { clicks, impressions, ctr, position, pagesIndexed, pagesSubmitted, pagesInSearch, topPages, topQueries };
    return NextResponse.json(result);
  } catch (err) {
    console.error(`GSC error for ${siteId}:`, err);
    return NextResponse.json({ error: 'Failed to fetch GSC data' }, { status: 500 });
  }
}

function getDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}
