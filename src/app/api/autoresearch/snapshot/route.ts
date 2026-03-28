import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

// Sites that have GSC configured
const GSC_SITES = projects.filter(p => p.gscSiteUrl);
// Sites that have GA configured
const GA_SITES = projects.filter(p => p.gaPropertyId && p.id !== 'personal' && p.id !== 'dashboard' && p.id !== 'general');

// POST /api/autoresearch/snapshot
// Takes a daily snapshot of all sites' current metrics and upserts into site_metrics
export async function POST() {
  const supabase = getServiceClient();
  const today = new Date().toISOString().split('T')[0];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const results: { siteId: string; status: string; error?: string }[] = [];

  // Step 1: Fetch GA4 data for all sites
  let gaData: Record<string, { visitors: number; pageviews: number }> = {};
  try {
    const gaRes = await fetch(`${baseUrl}/api/analytics`, { cache: 'no-store' });
    if (gaRes.ok) {
      const gaJson = await gaRes.json();
      for (const item of gaJson.data || []) {
        gaData[item.siteId] = {
          visitors: item.activeUsers || 0,
          pageviews: item.pageViews || 0,
        };
      }
    }
  } catch (err) {
    console.error('Failed to fetch GA4 data for snapshot:', err);
  }

  // Step 2: Fetch pageview counts from Supabase tracking
  let trackedPageviews: Record<string, number> = {};
  try {
    const pvRes = await fetch(`${baseUrl}/api/pageviews?view=summary&range=today`, { cache: 'no-store' });
    if (pvRes.ok) {
      const pvJson = await pvRes.json();
      for (const [siteId, counts] of Object.entries(pvJson as Record<string, { today: number }>)) {
        trackedPageviews[siteId] = (counts as { today: number }).today || 0;
      }
    }
  } catch (err) {
    console.error('Failed to fetch tracked pageviews for snapshot:', err);
  }

  // Step 3: Fetch search counts from Supabase tracking
  let trackedSearches: Record<string, number> = {};
  try {
    const srchRes = await fetch(`${baseUrl}/api/searches?range=today`, { cache: 'no-store' });
    if (srchRes.ok) {
      const srchJson = await srchRes.json();
      // The searches API returns per-site counts
      if (typeof srchJson === 'object') {
        for (const [siteId, data] of Object.entries(srchJson as Record<string, { count?: number; today?: number }>)) {
          const d = data as { count?: number; today?: number };
          trackedSearches[siteId] = d.count || d.today || 0;
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch tracked searches for snapshot:', err);
  }

  // Step 4: Fetch GSC data per site and upsert metrics
  for (const site of GA_SITES) {
    try {
      let gscClicks = 0;
      let gscImpressions = 0;
      let gscCtr = 0;
      let gscPosition = 0;
      let gscPagesIndexed = 0;

      // Only fetch GSC if the site has a GSC URL configured
      const hasGsc = GSC_SITES.some(s => s.id === site.id);
      if (hasGsc) {
        try {
          const gscRes = await fetch(`${baseUrl}/api/gsc/${site.id}`, { cache: 'no-store' });
          if (gscRes.ok) {
            const gscJson = await gscRes.json();
            gscClicks = gscJson.clicks || 0;
            gscImpressions = gscJson.impressions || 0;
            gscCtr = gscJson.ctr || 0;
            gscPosition = gscJson.position || 0;
            gscPagesIndexed = gscJson.pagesIndexed || 0;
          }
        } catch (err) {
          console.error(`GSC fetch failed for ${site.id}:`, err);
        }
      }

      const row = {
        site_id: site.id,
        date: today,
        gsc_clicks: gscClicks,
        gsc_impressions: gscImpressions,
        gsc_ctr: gscCtr,
        gsc_position: gscPosition,
        gsc_pages_indexed: gscPagesIndexed,
        ga_visitors: gaData[site.id]?.visitors || 0,
        ga_pageviews: gaData[site.id]?.pageviews || 0,
        tracked_pageviews: trackedPageviews[site.id] || 0,
        tracked_searches: trackedSearches[site.id] || 0,
      };

      const { error } = await supabase
        .from('site_metrics')
        .upsert(row, { onConflict: 'site_id,date' });

      if (error) {
        console.error(`Upsert failed for ${site.id}:`, error);
        results.push({ siteId: site.id, status: 'error', error: error.message });
      } else {
        results.push({ siteId: site.id, status: 'ok' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Snapshot failed for ${site.id}:`, msg);
      results.push({ siteId: site.id, status: 'error', error: msg });
    }
  }

  const succeeded = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;

  return NextResponse.json({
    date: today,
    total: results.length,
    succeeded,
    failed,
    results,
  });
}
