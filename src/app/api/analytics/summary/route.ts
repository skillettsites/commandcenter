import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

interface SearchSummary {
  carcostcheck: { today: number; month: number };
  postcodecheck: { today: number; month: number };
}

interface StripeData {
  totalRevenue: number;
  totalCharges: number;
  thisMonthRevenue: number;
  thisMonthCharges: number;
  accounts: Array<{
    name: string;
    totalRevenue: number;
    chargeCount: number;
  }>;
}

interface ConversionData {
  counts: Record<string, number>;
  total: number;
}

interface GscSiteData {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  pagesIndexed: number | null;
  pagesInSearch: number | null;
}

interface BingSiteData {
  clicks: number;
  impressions: number;
}

interface PageviewSummary {
  [siteId: string]: { today: number; week: number; month: number; total: number };
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  // Fetch all data sources in parallel
  const [
    searches,
    stripe,
    conversions,
    pageviews,
    gscCcc,
    gscPcc,
    bingCcc,
    bingPcc,
  ] = await Promise.all([
    safeFetch<SearchSummary>(`${baseUrl}/api/searches`),
    safeFetch<StripeData>(`${baseUrl}/api/stripe-revenue`),
    safeFetch<ConversionData>(`${baseUrl}/api/conversions?range=1m`),
    safeFetch<PageviewSummary>(`${baseUrl}/api/pageviews?view=summary`),
    safeFetch<GscSiteData>(`${baseUrl}/api/gsc/carcostcheck`),
    safeFetch<GscSiteData>(`${baseUrl}/api/gsc/postcodecheck`),
    safeFetch<BingSiteData>(`${baseUrl}/api/bing/carcostcheck`),
    safeFetch<BingSiteData>(`${baseUrl}/api/bing/postcodecheck`),
  ]);

  // Build a data snapshot for the AI
  const totalPageviews = pageviews
    ? Object.values(pageviews).reduce((sum, s) => sum + (s.month || 0), 0)
    : 0;

  const topSites = pageviews
    ? Object.entries(pageviews)
        .map(([id, d]) => ({ id, month: d.month, total: d.total }))
        .sort((a, b) => b.month - a.month)
        .slice(0, 5)
    : [];

  const dataSnapshot = `
PORTFOLIO ANALYTICS SNAPSHOT (as of ${new Date().toISOString().split('T')[0]})

PAGEVIEWS:
- Total pageviews this month: ${totalPageviews.toLocaleString()}
- Top sites by monthly pageviews: ${topSites.map(s => `${s.id}: ${s.month.toLocaleString()}`).join(', ')}

SEARCHES:
- CarCostCheck: ${searches?.carcostcheck?.today ?? 'N/A'} today, ${searches?.carcostcheck?.month ?? 'N/A'} this month
- PostcodeCheck: ${searches?.postcodecheck?.today ?? 'N/A'} today, ${searches?.postcodecheck?.month ?? 'N/A'} this month

REVENUE (Stripe):
- Total revenue all time: £${stripe ? (stripe.totalRevenue / 100).toFixed(2) : 'N/A'}
- This month revenue: £${stripe ? (stripe.thisMonthRevenue / 100).toFixed(2) : 'N/A'}
- This month sales: ${stripe?.thisMonthCharges ?? 'N/A'}
- Total sales all time: ${stripe?.totalCharges ?? 'N/A'}
- Per account: ${stripe?.accounts?.map(a => `${a.name}: £${(a.totalRevenue / 100).toFixed(2)} (${a.chargeCount} sales)`).join(', ') ?? 'N/A'}
- Average order value: £${stripe && stripe.totalCharges > 0 ? (stripe.totalRevenue / stripe.totalCharges / 100).toFixed(2) : 'N/A'}

CONVERSIONS (this month):
- Total conversion events: ${conversions?.total ?? 'N/A'}
- Event types: ${conversions?.counts ? Object.entries(conversions.counts).map(([k, v]) => `${k}: ${v}`).join(', ') : 'N/A'}

GOOGLE SEARCH CONSOLE (7-day):
- CarCostCheck: ${gscCcc ? `${gscCcc.clicks} clicks, ${gscCcc.impressions} impressions, CTR ${(gscCcc.ctr * 100).toFixed(1)}%, position ${gscCcc.position?.toFixed(1)}, ${gscCcc.pagesIndexed ?? 'unknown'} indexed` : 'N/A'}
- PostcodeCheck: ${gscPcc ? `${gscPcc.clicks} clicks, ${gscPcc.impressions} impressions, CTR ${(gscPcc.ctr * 100).toFixed(1)}%, position ${gscPcc.position?.toFixed(1)}, ${gscPcc.pagesIndexed ?? 'unknown'} indexed` : 'N/A'}

BING (7-day):
- CarCostCheck: ${bingCcc ? `${bingCcc.clicks} clicks, ${bingCcc.impressions} impressions` : 'N/A'}
- PostcodeCheck: ${bingPcc ? `${bingPcc.clicks} clicks, ${bingPcc.impressions} impressions` : 'N/A'}
`.trim();

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are analysing a portfolio of UK websites. Given the data below, provide a concise growth analysis. Be specific with numbers. Use UK English. Do not use em dashes; use commas, semicolons or separate sentences instead.

${dataSnapshot}

Respond in JSON with these keys:
- "working": array of 2-3 strings about what is going well (traffic, conversions, trends)
- "not_working": array of 2-3 strings about what needs attention (declining metrics, gaps, missed opportunities)
- "suggestions": array of 3 strings with specific, actionable next steps
- "revenue_analysis": a single string summarising revenue performance and what to focus on

Keep each item to 1-2 sentences. Be direct and practical.`,
        },
      ],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    const rawText = textBlock?.text ?? '{}';

    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      working: parsed.working ?? [],
      not_working: parsed.not_working ?? [],
      suggestions: parsed.suggestions ?? [],
      revenue_analysis: parsed.revenue_analysis ?? '',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[analytics/summary]', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
