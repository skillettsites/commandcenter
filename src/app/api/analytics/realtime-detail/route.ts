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
    credentials: { client_email: email, private_key: key.replace(/\\n/g, '\n') },
  });
  return _client;
}

// GA4 realtime breakdown for one site: who's on it right now, which pages,
// where from, what device. GET /api/analytics/realtime-detail?siteId=findyourstay
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId') || '';
  const project = projects.find((p) => p.id === siteId);
  if (!project?.gaPropertyId) {
    return NextResponse.json({ error: 'No GA property for this site' }, { status: 404 });
  }
  const client = getClient();
  if (!client) return NextResponse.json({ error: 'GA not configured' }, { status: 503 });

  const property = `properties/${project.gaPropertyId}`;
  const rows = (r: { rows?: Array<{ dimensionValues?: Array<{ value?: string | null }>; metricValues?: Array<{ value?: string | null }> }> }, dims: number) =>
    (r.rows ?? []).map((row) => ({
      dims: Array.from({ length: dims }, (_, i) => row.dimensionValues?.[i]?.value ?? ''),
      users: parseInt(row.metricValues?.[0]?.value ?? '0'),
    }));

  try {
    const [total, pages, geo, device] = await Promise.all([
      client.runRealtimeReport({ property, metrics: [{ name: 'activeUsers' }] }),
      client.runRealtimeReport({ property, dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 30 }),
      client.runRealtimeReport({ property, dimensions: [{ name: 'city' }, { name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 30 }),
      client.runRealtimeReport({ property, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }] }),
    ]);
    return NextResponse.json({
      siteId,
      activeUsers: parseInt(total[0].rows?.[0]?.metricValues?.[0]?.value ?? '0'),
      pages: rows(pages[0], 1).map((r) => ({ page: r.dims[0], users: r.users })),
      locations: rows(geo[0], 2).map((r) => ({ city: r.dims[0], country: r.dims[1], users: r.users })),
      devices: rows(device[0], 1).map((r) => ({ device: r.dims[0], users: r.users })),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 150) }, { status: 500 });
  }
}
