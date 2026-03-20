import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/searches?site_id=carcostcheck
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteFilter = searchParams.get('site_id');

  const supabase = getServiceClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const sites = siteFilter ? [siteFilter] : ['carcostcheck', 'postcodecheck'];

  const results: Record<string, {
    today: number;
    month: number;
    recent: Array<{ search_query: string; result_found: boolean; created_at: string }>;
  }> = {};

  for (const siteId of sites) {
    // Today's count
    const { count: todayCount } = await supabase
      .from('searches')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .gte('created_at', todayStart);

    // This month's count
    const { count: monthCount } = await supabase
      .from('searches')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .gte('created_at', monthStart);

    // Recent searches (last 10)
    const { data: recent } = await supabase
      .from('searches')
      .select('search_query, result_found, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(10);

    results[siteId] = {
      today: todayCount ?? 0,
      month: monthCount ?? 0,
      recent: recent ?? [],
    };
  }

  return NextResponse.json(results);
}
