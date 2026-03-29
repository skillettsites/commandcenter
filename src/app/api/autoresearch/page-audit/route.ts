import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

// Known affiliate link patterns
const AFFILIATE_PATTERNS = [
  'sovrn.co',
  'utm_medium=affiliate',
  'partner_id=',
  'camref=',
  'tag=', // Amazon Associates
  'getyourguide.com',
  'booking.com/hotel',
  'expedia.com',
  'viator.com',
  'betterhelp.com',
  'confused.com',
  'awin1.com',
  'shareasale.com',
  'cj.com',
  'impact.com',
  'ref=', // generic referral
];

interface AuditResult {
  url: string;
  site_id: string;
  monthly_clicks: number;
  monthly_impressions: number;
  has_affiliate_cta: boolean;
  has_structured_data: boolean;
  has_images: boolean;
  data_table_position: string;
  internal_link_count: number;
  external_link_count: number;
  word_count: number;
  has_h1: boolean;
  heading_count: number;
  issues: string[];
  suggestions: string[];
  score: number;
}

// GET /api/autoresearch/page-audit?site_id=postcodecheck&status=pending
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('site_id');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const supabase = getServiceClient();

  try {
    let query = supabase
      .from('page_audits')
      .select('*')
      .order('audited_at', { ascending: false })
      .limit(limit);

    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching page_audits:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute summary stats
    const audits = data || [];
    const totalIssues = audits.reduce((sum, a) => {
      const issues = Array.isArray(a.issues) ? a.issues : [];
      return sum + issues.length;
    }, 0);
    const avgScore = audits.length > 0
      ? Math.round(audits.reduce((sum, a) => sum + (a.score || 0), 0) / audits.length)
      : 0;
    const needsWork = audits.filter(a => a.status === 'pending' && Array.isArray(a.issues) && a.issues.length > 0).length;

    return NextResponse.json({
      audits,
      summary: {
        total: audits.length,
        totalIssues,
        avgScore,
        needsWork,
        optimized: audits.filter(a => a.status === 'optimized').length,
        skipped: audits.filter(a => a.status === 'skipped').length,
      },
    });
  } catch (err) {
    console.error('Page audit GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch page audits' }, { status: 500 });
  }
}

// POST /api/autoresearch/page-audit
// Body: { siteUrl?: string } - if not provided, audits all sites
export async function POST(request: NextRequest) {
  const supabase = getServiceClient();
  const body = await request.json().catch(() => ({}));
  const targetSiteUrl = body.siteUrl as string | undefined;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  // Determine which sites to audit
  const sitesToAudit = targetSiteUrl
    ? projects.filter(p => p.url === targetSiteUrl || p.id === targetSiteUrl)
    : projects.filter(p => p.gscSiteUrl && p.id !== 'personal' && p.id !== 'dashboard' && p.id !== 'general');

  if (sitesToAudit.length === 0) {
    return NextResponse.json({ error: 'No matching site found' }, { status: 404 });
  }

  const allResults: AuditResult[] = [];
  const errors: { siteId: string; error: string }[] = [];

  for (const site of sitesToAudit) {
    try {
      // Step 1: Get top pages from GSC (28d data)
      let topPages: { page: string; clicks: number; impressions: number }[] = [];

      if (site.gscSiteUrl) {
        try {
          const gscRes = await fetch(`${baseUrl}/api/gsc/${site.id}`, { cache: 'no-store' });
          if (gscRes.ok) {
            const gscData = await gscRes.json();
            topPages = (gscData.topPages || []).slice(0, 20);
          }
        } catch (err) {
          console.error(`GSC fetch failed for ${site.id}:`, err);
        }
      }

      // If no GSC data, audit the homepage at minimum
      if (topPages.length === 0) {
        topPages = [{ page: '/', clicks: 0, impressions: 0 }];
      }

      // Step 2: Audit each page
      for (const pageInfo of topPages) {
        const fullUrl = pageInfo.page.startsWith('http')
          ? pageInfo.page
          : `${site.url}${pageInfo.page}`;

        try {
          const result = await auditPage(
            fullUrl,
            site.id,
            site.url,
            pageInfo.clicks,
            pageInfo.impressions
          );
          allResults.push(result);
        } catch (err) {
          console.error(`Audit failed for ${fullUrl}:`, err);
          errors.push({ siteId: site.id, error: `Failed to audit ${fullUrl}` });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ siteId: site.id, error: msg });
    }
  }

  // Step 3: Store results in Supabase (upsert by site_id + url, keeping latest)
  let stored = 0;
  let storeFailed = 0;

  for (const result of allResults) {
    // Delete any existing audit for this URL (keep only latest)
    await supabase
      .from('page_audits')
      .delete()
      .eq('site_id', result.site_id)
      .eq('url', result.url);

    const { error } = await supabase.from('page_audits').insert({
      site_id: result.site_id,
      url: result.url,
      monthly_clicks: result.monthly_clicks,
      monthly_impressions: result.monthly_impressions,
      has_affiliate_cta: result.has_affiliate_cta,
      has_structured_data: result.has_structured_data,
      has_images: result.has_images,
      data_table_position: result.data_table_position,
      internal_link_count: result.internal_link_count,
      external_link_count: result.external_link_count,
      word_count: result.word_count,
      has_h1: result.has_h1,
      heading_count: result.heading_count,
      issues: result.issues,
      suggestions: result.suggestions,
      score: result.score,
      status: result.issues.length === 0 ? 'optimized' : 'pending',
    });

    if (error) {
      console.error(`Failed to store audit for ${result.url}:`, error);
      storeFailed++;
    } else {
      stored++;
    }
  }

  // Step 4: Build summary
  const issuesByType: Record<string, number> = {};
  for (const r of allResults) {
    for (const issue of r.issues) {
      const type = issue.split(':')[0] || issue;
      issuesByType[type] = (issuesByType[type] || 0) + 1;
    }
  }

  return NextResponse.json({
    pagesAudited: allResults.length,
    stored,
    storeFailed,
    errors,
    issuesByType,
    results: allResults.map(r => ({
      url: r.url,
      site_id: r.site_id,
      score: r.score,
      issues: r.issues,
      suggestions: r.suggestions,
    })),
  });
}

async function auditPage(
  url: string,
  siteId: string,
  siteBaseUrl: string,
  clicks: number,
  impressions: number
): Promise<AuditResult> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Fetch the page HTML
  let html = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CommandCenter-PageAudit/1.0',
        'Accept': 'text/html',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      issues.push(`HTTP error: page returned status ${res.status}`);
      return {
        url, site_id: siteId, monthly_clicks: clicks, monthly_impressions: impressions,
        has_affiliate_cta: false, has_structured_data: false, has_images: false,
        data_table_position: 'none', internal_link_count: 0, external_link_count: 0,
        word_count: 0, has_h1: false, heading_count: 0,
        issues, suggestions, score: 0,
      };
    }

    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push(`Fetch failed: ${msg}`);
    return {
      url, site_id: siteId, monthly_clicks: clicks, monthly_impressions: impressions,
      has_affiliate_cta: false, has_structured_data: false, has_images: false,
      data_table_position: 'none', internal_link_count: 0, external_link_count: 0,
      word_count: 0, has_h1: false, heading_count: 0,
      issues, suggestions, score: 0,
    };
  }

  const htmlLower = html.toLowerCase();

  // Check 1: Affiliate CTAs
  const hasAffiliateCta = AFFILIATE_PATTERNS.some(pattern =>
    htmlLower.includes(pattern.toLowerCase())
  );
  if (!hasAffiliateCta) {
    // Only flag as an issue for sites that should have affiliate links
    const affiliateSites = [
      'carcostcheck', 'bestlondontours', 'thebesttours', 'findyourstay',
      'helpafterloss', 'helpafterlife',
    ];
    if (affiliateSites.includes(siteId)) {
      issues.push('Missing affiliate CTA: no affiliate links detected on this page');
      suggestions.push('Add relevant affiliate CTAs (GetYourGuide, Booking.com, Amazon, etc.) to monetize this traffic');
    }
  }

  // Check 2: Structured data (JSON-LD)
  const hasStructuredData = htmlLower.includes('application/ld+json');
  if (!hasStructuredData) {
    issues.push('Missing structured data: no JSON-LD schema found');
    suggestions.push('Add JSON-LD structured data (Article, FAQPage, BreadcrumbList, Product, etc.) to improve rich results');
  }

  // Check 3: Images
  const imgMatches = html.match(/<img\s/gi) || [];
  const hasImages = imgMatches.length > 0;
  if (!hasImages) {
    issues.push('No images: page has zero img tags');
    suggestions.push('Add at least one relevant image with descriptive alt text to improve engagement');
  }

  // Check 4: Data table position
  const tablePosition = findTablePosition(htmlLower);
  if (tablePosition === 'bottom' || tablePosition === 'none') {
    // Only flag for data-heavy sites
    const dataSites = ['carcostcheck', 'postcodecheck', 'tapwaterscore', 'medcostcheck'];
    if (dataSites.includes(siteId) && tablePosition === 'bottom') {
      issues.push('Data table buried: key data table is in the bottom third of the page');
      suggestions.push('Move the primary data table higher on the page so users see key information without excessive scrolling');
    }
  }

  // Check 5: Internal links
  const siteDomain = extractDomain(siteBaseUrl);
  const { internalCount, externalCount } = countLinks(html, siteDomain);
  if (internalCount < 3) {
    issues.push(`Low internal links: only ${internalCount} internal links found`);
    suggestions.push('Add more internal links to related pages to improve crawlability and user navigation (aim for 5+)');
  }

  // Check 6: Word count (body text approximation)
  const wordCount = estimateWordCount(html);
  if (wordCount < 300) {
    issues.push(`Thin content: approximately ${wordCount} words detected`);
    suggestions.push('Expand page content to at least 500 words for better search visibility');
  }

  // Check 7: H1 tag
  const h1Match = html.match(/<h1[\s>]/gi);
  const hasH1 = h1Match !== null && h1Match.length > 0;
  if (!hasH1) {
    issues.push('Missing H1: no H1 heading tag found on the page');
    suggestions.push('Add a clear, keyword-rich H1 heading to the page');
  }
  if (h1Match && h1Match.length > 1) {
    issues.push(`Multiple H1 tags: ${h1Match.length} H1 elements found`);
    suggestions.push('Use only one H1 per page; convert extras to H2 or H3');
  }

  // Check 8: Heading structure
  const headingMatches = html.match(/<h[1-6][\s>]/gi) || [];
  const headingCount = headingMatches.length;

  // Check 9: Meta description
  const hasMetaDesc = htmlLower.includes('name="description"') || htmlLower.includes("name='description'");
  if (!hasMetaDesc) {
    issues.push('Missing meta description');
    suggestions.push('Add a compelling meta description (120-160 characters) to improve click-through rate from search results');
  }

  // Check 10: Open Graph tags
  const hasOg = htmlLower.includes('property="og:') || htmlLower.includes("property='og:");
  if (!hasOg) {
    issues.push('Missing Open Graph tags: no og: meta tags found');
    suggestions.push('Add Open Graph tags (og:title, og:description, og:image) for better social media sharing');
  }

  // Calculate score (0-100)
  let score = 100;
  const deductions: Record<string, number> = {
    'Missing affiliate CTA': 10,
    'Missing structured data': 15,
    'No images': 10,
    'Data table buried': 8,
    'Low internal links': 10,
    'Thin content': 15,
    'Missing H1': 10,
    'Multiple H1': 5,
    'Missing meta description': 10,
    'Missing Open Graph': 5,
    'HTTP error': 20,
    'Fetch failed': 20,
  };

  for (const issue of issues) {
    for (const [pattern, deduction] of Object.entries(deductions)) {
      if (issue.startsWith(pattern) || issue.includes(pattern.toLowerCase())) {
        score = Math.max(0, score - deduction);
        break;
      }
    }
  }

  return {
    url,
    site_id: siteId,
    monthly_clicks: clicks,
    monthly_impressions: impressions,
    has_affiliate_cta: hasAffiliateCta,
    has_structured_data: hasStructuredData,
    has_images: hasImages,
    data_table_position: tablePosition,
    internal_link_count: internalCount,
    external_link_count: externalCount,
    word_count: wordCount,
    has_h1: hasH1,
    heading_count: headingCount,
    issues,
    suggestions,
    score,
  };
}

function findTablePosition(htmlLower: string): string {
  const bodyStart = htmlLower.indexOf('<body');
  const bodyEnd = htmlLower.indexOf('</body>');
  if (bodyStart === -1 || bodyEnd === -1) return 'none';

  const body = htmlLower.substring(bodyStart, bodyEnd);
  const tableIndex = body.indexOf('<table');
  if (tableIndex === -1) return 'none';

  const bodyLength = body.length;
  const relativePosition = tableIndex / bodyLength;

  if (relativePosition < 0.33) return 'top';
  if (relativePosition < 0.66) return 'middle';
  return 'bottom';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function countLinks(html: string, siteDomain: string): { internalCount: number; externalCount: number } {
  let internalCount = 0;
  let externalCount = 0;

  const linkRegex = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  const seen = new Set<string>();

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }

    // Deduplicate
    if (seen.has(href)) continue;
    seen.add(href);

    // Check if internal or external
    if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
      internalCount++;
    } else {
      try {
        const linkDomain = new URL(href).hostname;
        if (linkDomain === siteDomain || linkDomain === `www.${siteDomain}` || siteDomain === `www.${linkDomain}`) {
          internalCount++;
        } else {
          externalCount++;
        }
      } catch {
        // Relative link or malformed, count as internal
        internalCount++;
      }
    }
  }

  return { internalCount, externalCount };
}

function estimateWordCount(html: string): number {
  // Strip script and style tags first
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
}
