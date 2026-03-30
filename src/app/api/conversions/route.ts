import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { ukTodayStart, ukMonthStart } from '@/lib/uk-time';

export const dynamic = 'force-dynamic';

// GET /api/conversions?site_id=carcostcheck&range=today|1m|all
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteFilter = searchParams.get('site_id') || 'carcostcheck';
  const range = searchParams.get('range') || 'today';

  const supabase = getServiceClient();

  const now = new Date();
  const todayStart = ukTodayStart();
  const monthStart = ukMonthStart();

  let fromDate: string;
  if (range === 'today') {
    fromDate = todayStart;
  } else if (range === '1m') {
    fromDate = monthStart;
  } else {
    fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  // Get counts by event type
  const { data: rows } = await supabase
    .from('conversion_events')
    .select('event_type, metadata, created_at')
    .eq('site_id', siteFilter)
    .gte('created_at', fromDate)
    .order('created_at', { ascending: false });

  const counts: Record<string, number> = {};
  for (const row of rows ?? []) {
    counts[row.event_type] = (counts[row.event_type] || 0) + 1;
  }

  return NextResponse.json({
    site_id: siteFilter,
    range,
    counts,
    total: rows?.length ?? 0,
    recent: (rows ?? []).slice(0, 20),
  });
}
