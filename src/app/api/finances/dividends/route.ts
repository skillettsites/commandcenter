import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Fund configuration: the 3 funds to track
const FUND_CONFIGS = [
  {
    id: 'fidelity-enhanced',
    sedol: 'BYSYZP1',
    hlUrl: 'https://www.hl.co.uk/funds/fund-discounts,-prices--and--factsheets/search-results/f/fidelity-enhanced-income-class-w-income',
    trustnetUrl: 'https://www.trustnet.com/factsheets/O/gmtr/fidelity-enhanced-income/',
  },
  {
    id: 'ubs-global',
    sedol: 'BL0RSP8',
    hlUrl: 'https://www.hl.co.uk/funds/fund-discounts,-prices--and--factsheets/search-results/u/ubs-global-enhanced-equity-income-c-income',
    trustnetUrl: 'https://www.trustnet.com/factsheets/o/kyxy/ubs-global-enhanced-equity-income-c-inc',
  },
  {
    id: 'aegon-high-yield',
    sedol: 'B1N9DY5',
    hlUrl: 'https://www.hl.co.uk/funds/fund-discounts,-prices--and--factsheets/search-results/a/aegon-high-yield-bond-class-b-income',
    trustnetUrl: 'https://www.trustnet.com/factsheets/o/cws6/kames-high-yield-bond-b-inc',
  },
];

// Cache validity: 1 day in milliseconds (fund prices update daily)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Distribution {
  date: string;
  amount: number;
  type: string;
}

interface FundDividendData {
  fund_id: string;
  fund_name: string;
  yield_percent: number | null;
  unit_price: number | null;
  distributions: Distribution[];
  ex_dividend_dates: string[];
  fetched_at: string;
}

// Fetch fund page content. Try Trustnet via Jina reader first (renders JS), fall back to HL direct
async function fetchFundPage(config: typeof FUND_CONFIGS[0]): Promise<string | null> {
  // Try Trustnet via Jina reader (renders JavaScript, gets yield data)
  if (config.trustnetUrl) {
    try {
      const jinaUrl = `https://r.jina.ai/${config.trustnetUrl}`;
      const res = await fetch(jinaUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (res.ok) {
        const text = await res.text();
        if (text.length > 500 && !text.includes('404')) return text;
      }
    } catch (err) {
      console.error(`Trustnet/Jina fetch error for ${config.id}:`, err);
    }
  }

  // Fallback: fetch HL page directly
  try {
    const res = await fetch(config.hlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.error(`HL fetch error for ${config.id}:`, err);
    return null;
  }
}

// Quick regex extraction of sell price and yield from HL HTML (no AI needed)
function extractFromHL(html: string, fundId: string): { unit_price: number | null; yield_percent: number | null } {
  let unit_price: number | null = null;
  let yield_percent: number | null = null;

  // Sell price: look for bid price pattern like "33.55p" or "83.29p"
  const bidMatch = html.match(/class="bid[^"]*"[^>]*>(\d+\.?\d*)p/);
  if (bidMatch) {
    unit_price = parseFloat(bidMatch[1]) / 100; // pence to pounds
  }

  // Yield: look for distribution yield percentage
  const yieldMatch = html.match(/(?:Historic|Distribution)\s*[Yy]ield[^<]*<[^>]*>(\d+\.?\d*)%/);
  if (yieldMatch) {
    yield_percent = parseFloat(yieldMatch[1]);
  }

  return { unit_price, yield_percent };
}

// Use Claude Haiku to parse dividend data from the HTML
async function parseWithClaude(html: string, fundId: string): Promise<FundDividendData | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return null;
  }

  const client = new Anthropic({ apiKey });

  // Trim the HTML to reduce token usage: keep only the main content
  // HL pages have a lot of nav/footer cruft
  let trimmedHtml = html;

  // Try to extract just the fund content section
  const mainStart = html.indexOf('<div class="content-columns-outer">');
  const mainEnd = html.lastIndexOf('</main>');
  if (mainStart > -1 && mainEnd > mainStart) {
    trimmedHtml = html.substring(mainStart, mainEnd);
  } else {
    // Fallback: take the middle portion of the page where fund data typically lives
    const bodyStart = html.indexOf('<body');
    const bodyEnd = html.indexOf('</body>');
    if (bodyStart > -1 && bodyEnd > bodyStart) {
      trimmedHtml = html.substring(bodyStart, bodyEnd);
    }
  }

  // Further trim: remove script and style tags to save tokens
  trimmedHtml = trimmedHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
  trimmedHtml = trimmedHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
  trimmedHtml = trimmedHtml.replace(/<!--[\s\S]*?-->/g, '');

  // Limit to 80k chars to stay within context limits
  if (trimmedHtml.length > 80000) {
    trimmedHtml = trimmedHtml.substring(0, 80000);
  }

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Extract dividend and distribution data from this Hargreaves Lansdown fund factsheet HTML. Return a JSON object with these exact fields:

{
  "fund_name": "Full fund name as shown on the page",
  "yield_percent": 5.5,
  "unit_price": 1.10,
  "distributions": [
    {"date": "2025-12-15", "amount": 0.0045, "type": "income"},
    {"date": "2025-11-15", "amount": 0.0043, "type": "income"}
  ],
  "ex_dividend_dates": ["2025-12-01", "2025-11-01"]
}

Rules:
- yield_percent: the annual yield or distribution yield shown as a percentage number (e.g. 5.5 not "5.5%")
- unit_price: the current sell/bid price per unit in pounds (e.g. 1.10 for 110p or 1.10)
- distributions: array of the last 12 months of distributions/dividends. amount is per unit in pounds (convert from pence if needed). type is "income", "interim", "final", or "distribution". Include the ex-dividend or payment date.
- ex_dividend_dates: array of ex-dividend date strings if shown
- If data is not available, use null for yield_percent/unit_price and empty arrays for distributions/ex_dividend_dates
- Return ONLY valid JSON, no markdown fences, no explanation

HTML:
${trimmedHtml}`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return null;

    let jsonStr = textContent.text.trim();
    // Remove markdown code fences if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    return {
      fund_id: fundId,
      fund_name: parsed.fund_name || fundId,
      yield_percent: parsed.yield_percent ?? null,
      unit_price: parsed.unit_price ?? null,
      distributions: Array.isArray(parsed.distributions) ? parsed.distributions : [],
      ex_dividend_dates: Array.isArray(parsed.ex_dividend_dates) ? parsed.ex_dividend_dates : [],
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`Claude parsing error for ${fundId}:`, err);
    return null;
  }
}

// Get cached data from Supabase
async function getCachedData(): Promise<FundDividendData[]> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('fund_dividends')
      .select('*')
      .order('fund_id');

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }

    return (data || []).map((row) => ({
      fund_id: row.fund_id,
      fund_name: row.fund_name,
      yield_percent: row.yield_percent ? Number(row.yield_percent) : null,
      unit_price: row.unit_price ? Number(row.unit_price) : null,
      distributions: (row.distributions as Distribution[]) || [],
      ex_dividend_dates: (row.ex_dividend_dates as string[]) || [],
      fetched_at: row.fetched_at,
    }));
  } catch (err) {
    console.error('Cache read error:', err);
    return [];
  }
}

// Store/update fund data in Supabase
async function storeFundData(fund: FundDividendData): Promise<void> {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from('fund_dividends').upsert(
      {
        fund_id: fund.fund_id,
        fund_name: fund.fund_name,
        yield_percent: fund.yield_percent,
        unit_price: fund.unit_price,
        distributions: fund.distributions,
        ex_dividend_dates: fund.ex_dividend_dates,
        fetched_at: fund.fetched_at,
      },
      { onConflict: 'fund_id' }
    );

    if (error) {
      console.error(`Supabase upsert error for ${fund.fund_id}:`, error);
    }
  } catch (err) {
    console.error(`Cache write error for ${fund.fund_id}:`, err);
  }
}

// Check if cached data is still fresh (within 7 days)
function isCacheFresh(fetchedAt: string): boolean {
  const fetchedDate = new Date(fetchedAt).getTime();
  const now = Date.now();
  return now - fetchedDate < CACHE_TTL_MS;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === '1';

  // Step 1: Check cache
  const cached = await getCachedData();
  const cachedMap = new Map<string, FundDividendData>();
  for (const item of cached) {
    cachedMap.set(item.fund_id, item);
  }

  // Step 2: Determine which funds need refreshing
  const fundsToFetch = forceRefresh
    ? FUND_CONFIGS
    : FUND_CONFIGS.filter((config) => {
        const cachedItem = cachedMap.get(config.id);
        if (!cachedItem) return true;
        return !isCacheFresh(cachedItem.fetched_at);
      });

  // Step 3: Fetch and parse stale/missing funds
  if (fundsToFetch.length > 0) {
    const fetchResults = await Promise.all(
      fundsToFetch.map(async (config) => {
        // Always fetch HL page directly for reliable price/yield extraction
        let hlHtml: string | null = null;
        try {
          const res = await fetch(config.hlUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              Accept: 'text/html',
              'Accept-Language': 'en-GB,en;q=0.9',
            },
          });
          if (res.ok) hlHtml = await res.text();
        } catch { /* ignore */ }

        // Try the full page (Trustnet then HL) for Claude AI parsing
        const html = await fetchFundPage(config);

        // Try Claude AI parse first
        let parsed = html ? await parseWithClaude(html, config.id) : null;

        // If Claude failed or returned nulls, use regex extraction from HL HTML
        if (hlHtml) {
          const extracted = extractFromHL(hlHtml, config.id);
          if (!parsed) {
            parsed = {
              fund_id: config.id,
              fund_name: config.id,
              yield_percent: extracted.yield_percent,
              unit_price: extracted.unit_price,
              distributions: [],
              ex_dividend_dates: [],
              fetched_at: new Date().toISOString(),
            };
          } else {
            // Fill in any gaps from the regex extraction
            if (parsed.unit_price === null && extracted.unit_price !== null) {
              parsed.unit_price = extracted.unit_price;
            }
            if (parsed.yield_percent === null && extracted.yield_percent !== null) {
              parsed.yield_percent = extracted.yield_percent;
            }
          }
        }

        if (!parsed) {
          return cachedMap.get(config.id) || null;
        }

        // Store the fresh data
        await storeFundData(parsed);
        return parsed;
      })
    );

    // Update the map with fresh results
    for (const result of fetchResults) {
      if (result) {
        cachedMap.set(result.fund_id, result);
      }
    }
  }

  // Step 4: Build response
  const results = FUND_CONFIGS.map((config) => {
    const data = cachedMap.get(config.id);
    if (!data) {
      return {
        fund_id: config.id,
        fund_name: config.id,
        sedol: config.sedol,
        yield_percent: null,
        unit_price: null,
        distributions: [],
        ex_dividend_dates: [],
        fetched_at: null,
        source: 'unavailable',
      };
    }

    return {
      ...data,
      sedol: config.sedol,
      source: fundsToFetch.some((f) => f.id === config.id) ? 'fresh' : 'cached',
    };
  });

  return NextResponse.json({
    funds: results,
    cache_status: fundsToFetch.length > 0 ? 'refreshed' : 'all_cached',
    fetched_count: fundsToFetch.length,
    timestamp: new Date().toISOString(),
  });
}
