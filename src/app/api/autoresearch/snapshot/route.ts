import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

// Sites that have GSC configured
const GSC_SITES = projects.filter(p => p.gscSiteUrl);
// Sites that have GA configured
const GA_SITES = projects.filter(p => p.gaPropertyId && p.id !== 'personal' && p.id !== 'dashboard' && p.id !== 'general');

// GET handler for Vercel Cron (crons send GET requests)
export async function GET() {
  return takeSnapshot();
}

// POST handler for manual triggers
export async function POST() {
  return takeSnapshot();
}

// Takes a daily snapshot of all sites' current metrics and upserts into site_metrics
async function takeSnapshot() {
  const supabase = getServiceClient();
  const today = new Date().toISOString().split('T')[0];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

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

  // Step 2: Fetch pageview counts directly from Supabase (avoids fragile internal API calls)
  let trackedPageviews: Record<string, number> = {};
  try {
    const todayStart = `${today}T00:00:00Z`;
    const { data: pvRows } = await supabase
      .from('pageviews')
      .select('site_id')
      .gte('created_at', todayStart);

    for (const row of pvRows ?? []) {
      trackedPageviews[row.site_id] = (trackedPageviews[row.site_id] || 0) + 1;
    }
  } catch (err) {
    console.error('Failed to fetch tracked pageviews for snapshot:', err);
  }

  // Step 3: Fetch search counts directly from Supabase (avoids fragile internal API calls)
  let trackedSearches: Record<string, number> = {};
  try {
    const todayStart = `${today}T00:00:00Z`;
    const { data: srchRows } = await supabase
      .from('searches')
      .select('site_id')
      .gte('created_at', todayStart);

    for (const row of srchRows ?? []) {
      trackedSearches[row.site_id] = (trackedSearches[row.site_id] || 0) + 1;
    }
  } catch (err) {
    console.error('Failed to fetch tracked searches for snapshot:', err);
  }

  // Step 4: Fetch conversion event counts from Supabase
  let trackedConversions: Record<string, { checkouts: number; purchases: number }> = {};
  try {
    const { data: convRows } = await supabase
      .from('conversion_events')
      .select('site_id, event_type')
      .gte('created_at', `${today}T00:00:00Z`);

    for (const row of convRows ?? []) {
      if (!trackedConversions[row.site_id]) {
        trackedConversions[row.site_id] = { checkouts: 0, purchases: 0 };
      }
      if (row.event_type === 'checkout_started') {
        trackedConversions[row.site_id].checkouts++;
      } else if (row.event_type === 'premium_purchased') {
        trackedConversions[row.site_id].purchases++;
      }
    }
  } catch (err) {
    console.error('Failed to fetch conversion events for snapshot:', err);
  }

  // Step 4b: Fetch affiliate click counts from Supabase (grouped by site)
  let trackedAffiliateClicks: Record<string, number> = {};
  try {
    const todayStart = `${today}T00:00:00Z`;
    const { data: affRows } = await supabase
      .from('affiliate_clicks')
      .select('site')
      .gte('created_at', todayStart);

    for (const row of affRows ?? []) {
      const s = row.site || 'unknown';
      trackedAffiliateClicks[s] = (trackedAffiliateClicks[s] || 0) + 1;
    }
  } catch (err) {
    console.error('Failed to fetch affiliate clicks for snapshot:', err);
  }

  // Step 4c: Fetch unique countries per site from pageviews (international reach)
  let uniqueCountries: Record<string, number> = {};
  try {
    const todayStart = `${today}T00:00:00Z`;
    const { data: geoRows } = await supabase
      .from('pageviews')
      .select('site_id, geo_country')
      .gte('created_at', todayStart)
      .not('geo_country', 'is', null);

    const siteCountryMap: Record<string, Set<string>> = {};
    for (const row of geoRows ?? []) {
      if (!siteCountryMap[row.site_id]) {
        siteCountryMap[row.site_id] = new Set();
      }
      if (row.geo_country) {
        siteCountryMap[row.site_id].add(row.geo_country);
      }
    }
    for (const [siteId, countries] of Object.entries(siteCountryMap)) {
      uniqueCountries[siteId] = countries.size;
    }
  } catch (err) {
    console.error('Failed to fetch unique countries for snapshot:', err);
  }

  // Step 4d: Fetch top referrers per site from pageviews
  let topReferrers: Record<string, string> = {};
  try {
    const todayStart = `${today}T00:00:00Z`;
    const { data: refRows } = await supabase
      .from('pageviews')
      .select('site_id, referrer')
      .gte('created_at', todayStart)
      .not('referrer', 'is', null);

    const siteRefMap: Record<string, Record<string, number>> = {};
    for (const row of refRows ?? []) {
      if (!row.referrer) continue;
      try {
        const host = new URL(row.referrer).hostname;
        if (!siteRefMap[row.site_id]) {
          siteRefMap[row.site_id] = {};
        }
        siteRefMap[row.site_id][host] = (siteRefMap[row.site_id][host] || 0) + 1;
      } catch {
        // Skip invalid referrer URLs
      }
    }
    for (const [siteId, refCounts] of Object.entries(siteRefMap)) {
      // Store top 5 referrers as a JSON string for the column
      const sorted = Object.entries(refCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([host, count]) => `${host}:${count}`);
      topReferrers[siteId] = sorted.join(',');
    }
  } catch (err) {
    console.error('Failed to fetch top referrers for snapshot:', err);
  }

  // Step 5: Fetch GSC data per site and upsert metrics
  for (const site of GA_SITES) {
    try {
      let gscClicks = 0;
      let gscImpressions = 0;
      let gscCtr = 0;
      let gscPosition = 0;
      let gscPagesIndexed = 0;
      let gscPagesSubmitted = 0;

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
            gscPagesSubmitted = gscJson.pagesSubmitted || 0;
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
        gsc_pages_submitted: gscPagesSubmitted,
        ga_visitors: gaData[site.id]?.visitors || 0,
        ga_pageviews: gaData[site.id]?.pageviews || 0,
        tracked_pageviews: trackedPageviews[site.id] || 0,
        tracked_searches: trackedSearches[site.id] || 0,
        tracked_checkouts: trackedConversions[site.id]?.checkouts || 0,
        tracked_purchases: trackedConversions[site.id]?.purchases || 0,
        tracked_affiliate_clicks: trackedAffiliateClicks[site.id] || 0,
        unique_countries: uniqueCountries[site.id] || 0,
        top_referrers: topReferrers[site.id] || null,
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

  // Step 6: Check indexing ratios and log warnings for underindexed sites
  const indexingWarnings: string[] = [];
  for (const site of GA_SITES) {
    const hasGsc = GSC_SITES.some(s => s.id === site.id);
    if (!hasGsc) continue;
    try {
      const { data: latest } = await supabase
        .from('site_metrics')
        .select('gsc_pages_indexed, gsc_pages_submitted')
        .eq('site_id', site.id)
        .eq('date', today)
        .single();

      if (latest && latest.gsc_pages_submitted > 0) {
        const ratio = latest.gsc_pages_indexed / latest.gsc_pages_submitted;
        if (ratio < 0.5) {
          const pct = Math.round(ratio * 100);
          const msg = `${site.id}: ${pct}% indexed (${latest.gsc_pages_indexed}/${latest.gsc_pages_submitted})`;
          indexingWarnings.push(msg);
          console.warn(`[Indexing Warning] ${msg}`);
        }
      }
    } catch {
      // Non-critical, skip
    }
  }

  // Step 7: Re-submit sitemaps to nudge Google to re-crawl
  let sitemapResult: { submitted?: number; failed?: number } = {};
  try {
    const sitemapRes = await fetch(`${baseUrl}/api/gsc/submit-sitemaps`, { method: 'POST', cache: 'no-store' });
    if (sitemapRes.ok) {
      sitemapResult = await sitemapRes.json();
    }
  } catch (err) {
    console.error('Sitemap re-submission failed:', err);
  }

  return NextResponse.json({
    date: today,
    total: results.length,
    succeeded,
    failed,
    results,
    indexingWarnings,
    sitemapResubmission: sitemapResult,
  });
}
