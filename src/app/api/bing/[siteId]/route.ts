import { NextResponse } from 'next/server';
import { projects } from '@/lib/projects';
import { BingData } from '@/lib/types';

export const dynamic = 'force-dynamic';

const BING_API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Bing API key not configured' }, { status: 503 });
  }

  const project = projects.find(p => p.id === siteId);
  if (!project?.bingSiteUrl) {
    return NextResponse.json({ error: 'No Bing site URL for this site' }, { status: 404 });
  }

  const encodedSiteUrl = encodeURIComponent(project.bingSiteUrl);

  try {
    const [trafficRes, queryRes, pageRes, indexRes] = await Promise.all([
      fetch(`${BING_API_BASE}/GetRankAndTrafficStats?siteUrl=${encodedSiteUrl}&apikey=${apiKey}`),
      fetch(`${BING_API_BASE}/GetQueryStats?siteUrl=${encodedSiteUrl}&apikey=${apiKey}`),
      fetch(`${BING_API_BASE}/GetPageStats?siteUrl=${encodedSiteUrl}&apikey=${apiKey}`),
      fetch(`${BING_API_BASE}/GetCrawlStats?siteUrl=${encodedSiteUrl}&apikey=${apiKey}`).catch(() => null),
    ]);

    if (!trafficRes.ok) {
      const errBody = await trafficRes.text();
      console.error(`Bing traffic error for ${siteId}: ${trafficRes.status}`, errBody.slice(0, 300));
      if (trafficRes.status === 401 || trafficRes.status === 403) {
        return NextResponse.json({ error: 'Bing API key invalid or no access' }, { status: 503 });
      }
      return NextResponse.json({ error: 'Failed to fetch Bing data' }, { status: 500 });
    }

    // Parse traffic stats (last 7 days)
    let clicks = 0, impressions = 0;
    const trafficData = await trafficRes.json();
    const trafficRows = trafficData.d ?? trafficData ?? [];
    const recentTraffic = Array.isArray(trafficRows) ? trafficRows.slice(-7) : [];
    for (const row of recentTraffic) {
      clicks += row.Clicks ?? 0;
      impressions += row.Impressions ?? 0;
    }
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const avgPosition = recentTraffic.length > 0
      ? recentTraffic.reduce((sum: number, r: { AvgImpressionPosition?: number }) => sum + (r.AvgImpressionPosition ?? 0), 0) / recentTraffic.length
      : 0;

    // Parse query stats (last 28 days, top 10)
    let topQueries: BingData['topQueries'] = [];
    if (queryRes.ok) {
      const queryData = await queryRes.json();
      const queryRows = queryData.d ?? queryData ?? [];
      if (Array.isArray(queryRows)) {
        // Aggregate by query (data comes as daily rows)
        const queryMap = new Map<string, { clicks: number; impressions: number; positions: number[]; }>();
        for (const row of queryRows) {
          const q = row.Query ?? '';
          if (!q) continue;
          const existing = queryMap.get(q) || { clicks: 0, impressions: 0, positions: [] };
          existing.clicks += row.Clicks ?? 0;
          existing.impressions += row.Impressions ?? 0;
          if (row.AvgImpressionPosition) existing.positions.push(row.AvgImpressionPosition);
          queryMap.set(q, existing);
        }
        topQueries = Array.from(queryMap.entries())
          .map(([query, data]) => ({
            query,
            clicks: data.clicks,
            impressions: data.impressions,
            position: data.positions.length > 0
              ? data.positions.reduce((a, b) => a + b, 0) / data.positions.length
              : 0,
          }))
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 10);
      }
    }

    // Parse page stats (top 10)
    let topPages: BingData['topPages'] = [];
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      const pageRows = pageData.d ?? pageData ?? [];
      if (Array.isArray(pageRows)) {
        // Aggregate by page URL
        const pageMap = new Map<string, { clicks: number; impressions: number }>();
        for (const row of pageRows) {
          const url = row.Query ?? row.Url ?? row.Page ?? '';
          if (!url) continue;
          const existing = pageMap.get(url) || { clicks: 0, impressions: 0 };
          existing.clicks += row.Clicks ?? 0;
          existing.impressions += row.Impressions ?? 0;
          pageMap.set(url, existing);
        }
        topPages = Array.from(pageMap.entries())
          .map(([page, data]) => ({
            page: page.replace(project.url, '').replace(/^https?:\/\/[^/]+/, '') || '/',
            clicks: data.clicks,
            impressions: data.impressions,
          }))
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 10);
      }
    }

    // Parse crawl/index stats
    let pagesInIndex: number | null = null;
    if (indexRes && indexRes.ok) {
      try {
        const indexData = await indexRes.json();
        const rows = indexData.d ?? indexData ?? [];
        if (Array.isArray(rows) && rows.length > 0) {
          // Sum InIndex from crawl stats, or take the latest
          const latest = rows[rows.length - 1];
          pagesInIndex = latest.InIndex ?? latest.CrawledPages ?? null;
        }
      } catch {
        // silently fail
      }
    }
    // Fallback: count unique pages in page stats as a proxy for indexed pages
    if (pagesInIndex == null && topPages.length > 0) {
      pagesInIndex = topPages.length;
    }

    const result: BingData = { clicks, impressions, ctr, position: avgPosition, pagesInIndex, topPages, topQueries };
    return NextResponse.json(result);
  } catch (err) {
    console.error(`Bing error for ${siteId}:`, err);
    return NextResponse.json({ error: 'Failed to fetch Bing data' }, { status: 500 });
  }
}
