import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/autoresearch/metrics?site_id=postcodecheck&range=7d|1m|3m|all
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('site_id');
  const range = searchParams.get('range') || '7d';

  const supabase = getServiceClient();
  const now = new Date();

  // Calculate date range
  let fromDate: string;
  switch (range) {
    case '7d':
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case '1m':
      fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case '3m':
      fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    default:
      fromDate = '2020-01-01';
  }

  try {
    // Fetch metrics
    let metricsQuery = supabase
      .from('site_metrics')
      .select('*')
      .gte('date', fromDate)
      .order('date', { ascending: true });

    if (siteId) {
      metricsQuery = metricsQuery.eq('site_id', siteId);
    }

    const { data: metrics, error: metricsError } = await metricsQuery;

    if (metricsError) {
      console.error('Error fetching site_metrics:', metricsError);
      return NextResponse.json({ error: metricsError.message }, { status: 500 });
    }

    // Fetch changes for the same period
    let changesQuery = supabase
      .from('site_changes')
      .select('*')
      .gte('created_at', `${fromDate}T00:00:00Z`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (siteId) {
      changesQuery = changesQuery.eq('site_id', siteId);
    }

    const { data: changes, error: changesError } = await changesQuery;

    if (changesError) {
      console.error('Error fetching site_changes:', changesError);
      return NextResponse.json({ error: changesError.message }, { status: 500 });
    }

    // Compute summary stats
    const latestBysite: Record<string, typeof metrics[0]> = {};
    for (const row of metrics || []) {
      if (!latestBysite[row.site_id] || row.date > latestBysite[row.site_id].date) {
        latestBysite[row.site_id] = row;
      }
    }

    const totalChanges = (changes || []).length;
    const confirmedChanges = (changes || []).filter(c => c.status === 'confirmed').length;

    return NextResponse.json({
      metrics: metrics || [],
      changes: changes || [],
      summary: {
        latestBySite: latestBysite,
        totalChanges,
        confirmedChanges,
      },
    });
  } catch (err) {
    console.error('AutoResearch metrics error:', err);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
