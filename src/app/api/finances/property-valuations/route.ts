import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase';
import { propertyHoldings } from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

// 7-day cache TTL
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Properties that have automated valuations enabled
const AUTO_VALUE_PROPERTIES = propertyHoldings.filter((p) => p.autoValue && p.address);

// Zoopla URL patterns for property estimates
function buildZooplaUrl(address: string): string {
  // Zoopla uses slugified addresses
  // e.g. https://www.zoopla.co.uk/house-prices/london/cobblestone-square/
  // For specific properties, the property page is more useful
  // We use a search-based approach via Jina reader
  const slug = address
    .toLowerCase()
    .replace(/[,\.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `https://www.zoopla.co.uk/house-prices/${slug}/`;
}

interface LandRegistryTransaction {
  address: string;
  price: number;
  date: string;
  propertyType: string;
  newBuild: boolean;
}

interface PropertyValuation {
  property_id: string;
  address: string;
  zoopla_estimate: number | null;
  zoopla_low: number | null;
  zoopla_high: number | null;
  land_registry_comparables: LandRegistryTransaction[];
  fetched_at: string;
}

// Fetch Zoopla estimate page via Jina reader
async function fetchZooplaPage(address: string): Promise<string | null> {
  // Try multiple URL patterns since Zoopla URL structure varies
  const urls = [
    // Direct property search
    `https://www.zoopla.co.uk/house-prices/e1w/?q=${encodeURIComponent(address)}`,
    // General house prices for the postcode area
    buildZooplaUrl(address),
  ];

  for (const url of urls) {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const res = await fetch(jinaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/plain',
        },
      });
      if (res.ok) {
        const text = await res.text();
        if (text.length > 500 && !text.includes('404') && !text.includes('Page not found')) {
          return text;
        }
      }
    } catch (err) {
      console.error(`Zoopla/Jina fetch error for ${address}:`, err);
    }
  }

  return null;
}

// Fetch Land Registry Price Paid data for a postcode
async function fetchLandRegistryData(postcode: string): Promise<LandRegistryTransaction[]> {
  try {
    // Land Registry Linked Data API: Price Paid data
    const encodedPostcode = encodeURIComponent(postcode.replace(/\s+/g, ' ').trim());
    const sparqlQuery = `
      PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
      PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>

      SELECT ?paon ?saon ?street ?town ?price ?date ?propertyType ?newBuild
      WHERE {
        ?transx lrppi:pricePaid ?price ;
               lrppi:transactionDate ?date ;
               lrppi:propertyAddress ?addr ;
               lrppi:propertyType ?propertyType .

        OPTIONAL { ?transx lrppi:newBuild ?newBuild }

        ?addr lrcommon:postcode "${postcode}" .
        OPTIONAL { ?addr lrcommon:paon ?paon }
        OPTIONAL { ?addr lrcommon:saon ?saon }
        OPTIONAL { ?addr lrcommon:street ?street }
        OPTIONAL { ?addr lrcommon:town ?town }

        FILTER (?date >= "${new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}"^^xsd:date)
      }
      ORDER BY DESC(?date)
      LIMIT 20
    `;

    const res = await fetch('https://landregistry.data.gov.uk/app/root/qonsole/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: `output=json&q=${encodeURIComponent(sparqlQuery)}`,
    });

    if (!res.ok) {
      // Try the simpler PPD API endpoint
      return await fetchLandRegistrySimple(postcode);
    }

    const data = await res.json();
    if (!data?.results?.bindings) {
      return await fetchLandRegistrySimple(postcode);
    }

    return data.results.bindings.map((b: Record<string, { value: string }>) => {
      const parts = [b.saon?.value, b.paon?.value, b.street?.value, b.town?.value]
        .filter(Boolean)
        .join(', ');
      return {
        address: parts || 'Unknown',
        price: parseInt(b.price?.value || '0'),
        date: b.date?.value || '',
        propertyType: b.propertyType?.value?.replace('http://landregistry.data.gov.uk/def/common/', '') || 'unknown',
        newBuild: b.newBuild?.value === 'true',
      };
    });
  } catch (err) {
    console.error(`Land Registry fetch error for ${postcode}:`, err);
    return await fetchLandRegistrySimple(postcode);
  }
}

// Simpler Land Registry API fallback using the JSON-LD endpoint
async function fetchLandRegistrySimple(postcode: string): Promise<LandRegistryTransaction[]> {
  try {
    const encoded = encodeURIComponent(postcode.replace(/\s+/g, '+'));
    const url = `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode=${encoded}&_pageSize=20&_sort=-transactionDate`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.result?.items || [];

    return items.map((item: Record<string, unknown>) => {
      const addr = item.propertyAddress as Record<string, string> | undefined;
      const parts = [addr?.saon, addr?.paon, addr?.street, addr?.town]
        .filter(Boolean)
        .join(', ');
      return {
        address: parts || 'Unknown',
        price: parseInt(String(item.pricePaid || '0')),
        date: String(item.transactionDate || ''),
        propertyType: String(addr?.propertyType || 'unknown').replace('http://landregistry.data.gov.uk/def/common/', ''),
        newBuild: item.newBuild === true,
      };
    });
  } catch (err) {
    console.error(`Land Registry simple fetch error for ${postcode}:`, err);
    return [];
  }
}

// Use Claude Haiku to extract property estimate from Zoopla page content
async function parseZooplaWithClaude(
  pageContent: string,
  propertyAddress: string,
  premiumNotes: string
): Promise<{ estimate: number | null; low: number | null; high: number | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return { estimate: null, low: null, high: null };
  }

  const client = new Anthropic({ apiKey });

  // Trim content to save tokens
  let trimmed = pageContent;
  if (trimmed.length > 60000) {
    trimmed = trimmed.substring(0, 60000);
  }

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Extract the Zoopla property value estimate from this page content. The property is: ${propertyAddress}

Notes about this property: ${premiumNotes}. This property is at the UPPER end of comparables for the building.

Return a JSON object with these fields:
{
  "estimate": 450000,
  "low": 420000,
  "high": 480000
}

Rules:
- "estimate" is the main Zoopla estimated value in GBP (whole number, no commas)
- "low" and "high" are the range if shown (e.g. "Estimated value: between X and Y")
- If a range is shown but no single estimate, use the midpoint as "estimate"
- If only comparable sale prices are shown (no Zoopla estimate), calculate an average and use that as the estimate, with the lowest as "low" and highest as "high"
- If no estimate data can be found at all, return all null values
- Return ONLY valid JSON, no markdown fences, no explanation

Page content:
${trimmed}`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return { estimate: null, low: null, high: null };

    let jsonStr = textContent.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    return {
      estimate: parsed.estimate ?? null,
      low: parsed.low ?? null,
      high: parsed.high ?? null,
    };
  } catch (err) {
    console.error('Claude parsing error for Zoopla estimate:', err);
    return { estimate: null, low: null, high: null };
  }
}

// Estimate property value from Land Registry comparables using Claude Haiku
async function estimateFromComparables(
  comparables: LandRegistryTransaction[],
  propertyAddress: string,
  premiumNotes: string,
  propertyName: string
): Promise<{ estimate: number | null; low: number | null; high: number | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || comparables.length === 0) return { estimate: null, low: null, high: null };

  const client = new Anthropic({ apiKey });

  const salesList = comparables
    .slice(0, 15)
    .map(c => `${c.address}: £${c.price.toLocaleString()} (${c.date})`)
    .join('\n');

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Based on these recent comparable sales in the same building/postcode, estimate the current market value for: ${propertyAddress}

Property notes: ${premiumNotes || 'Standard unit'}

Recent comparable sales:
${salesList}

Return ONLY a JSON object with three numbers (no text, no markdown):
{"estimate": NUMBER, "low": NUMBER, "high": NUMBER}

The estimate should reflect the premium notes (e.g. if it says top floor, terrace, south-facing, estimate at the upper end of comparables). Give a realistic range.`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return { estimate: null, low: null, high: null };

    let jsonStr = textContent.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    return {
      estimate: parsed.estimate ?? null,
      low: parsed.low ?? null,
      high: parsed.high ?? null,
    };
  } catch (err) {
    console.error('Claude estimation from comparables error:', err);
    return { estimate: null, low: null, high: null };
  }
}

// Get cached valuations from Supabase
async function getCachedValuations(): Promise<PropertyValuation[]> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('property_valuations')
      .select('*')
      .order('property_id');

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }

    return (data || []).map((row) => ({
      property_id: row.property_id,
      address: row.address,
      zoopla_estimate: row.zoopla_estimate ? Number(row.zoopla_estimate) : null,
      zoopla_low: row.zoopla_low ? Number(row.zoopla_low) : null,
      zoopla_high: row.zoopla_high ? Number(row.zoopla_high) : null,
      land_registry_comparables: (row.land_registry_comparables as LandRegistryTransaction[]) || [],
      fetched_at: row.fetched_at,
    }));
  } catch (err) {
    console.error('Cache read error:', err);
    return [];
  }
}

// Store valuation data in Supabase
async function storeValuation(valuation: PropertyValuation): Promise<void> {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from('property_valuations').upsert(
      {
        property_id: valuation.property_id,
        address: valuation.address,
        zoopla_estimate: valuation.zoopla_estimate,
        zoopla_low: valuation.zoopla_low,
        zoopla_high: valuation.zoopla_high,
        land_registry_comparables: valuation.land_registry_comparables,
        fetched_at: valuation.fetched_at,
      },
      { onConflict: 'property_id' }
    );

    if (error) {
      console.error(`Supabase upsert error for ${valuation.property_id}:`, error);
    }
  } catch (err) {
    console.error(`Cache write error for ${valuation.property_id}:`, err);
  }
}

// Check if cached data is still fresh (within 7 days)
function isCacheFresh(fetchedAt: string): boolean {
  const fetchedDate = new Date(fetchedAt).getTime();
  return Date.now() - fetchedDate < CACHE_TTL_MS;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === '1';

  // Step 1: Check cache
  const cached = await getCachedValuations();
  const cachedMap = new Map<string, PropertyValuation>();
  for (const item of cached) {
    cachedMap.set(item.property_id, item);
  }

  // Step 2: Determine which properties need refreshing
  const propertiesToFetch = forceRefresh
    ? AUTO_VALUE_PROPERTIES
    : AUTO_VALUE_PROPERTIES.filter((p) => {
        const cachedItem = cachedMap.get(p.id);
        if (!cachedItem) return true;
        return !isCacheFresh(cachedItem.fetched_at);
      });

  // Step 3: Fetch and parse stale/missing properties
  if (propertiesToFetch.length > 0) {
    const fetchResults = await Promise.all(
      propertiesToFetch.map(async (property) => {
        // Fetch Zoopla page and Land Registry data in parallel
        const [zooplaContent, landRegistryData] = await Promise.all([
          fetchZooplaPage(property.address!),
          fetchLandRegistryData(property.postcode || 'E1W'),
        ]);

        // Parse Zoopla estimate with Claude, or estimate from Land Registry if Zoopla blocked
        let zooplaResult = { estimate: null as number | null, low: null as number | null, high: null as number | null };
        if (zooplaContent) {
          zooplaResult = await parseZooplaWithClaude(
            zooplaContent,
            property.address!,
            property.premiumNotes || ''
          );
        }

        // If Zoopla failed, estimate from Land Registry comparable sales using Claude
        if (!zooplaResult.estimate && landRegistryData.length > 0) {
          zooplaResult = await estimateFromComparables(
            landRegistryData,
            property.address!,
            property.premiumNotes || '',
            property.name
          );
        }

        const valuation: PropertyValuation = {
          property_id: property.id,
          address: property.address!,
          zoopla_estimate: zooplaResult.estimate,
          zoopla_low: zooplaResult.low,
          zoopla_high: zooplaResult.high,
          land_registry_comparables: landRegistryData,
          fetched_at: new Date().toISOString(),
        };

        // Store in cache
        await storeValuation(valuation);
        return valuation;
      })
    );

    // Update the map with fresh results
    for (const result of fetchResults) {
      cachedMap.set(result.property_id, result);
    }
  }

  // Step 4: Build response
  const results = AUTO_VALUE_PROPERTIES.map((property) => {
    const data = cachedMap.get(property.id);
    const holding = propertyHoldings.find((p) => p.id === property.id);

    if (!data) {
      return {
        property_id: property.id,
        name: property.name,
        address: property.address,
        user_value: holding?.value ?? 0,
        zoopla_estimate: null,
        zoopla_low: null,
        zoopla_high: null,
        land_registry_comparables: [],
        fetched_at: null,
        source: 'unavailable' as const,
      };
    }

    return {
      property_id: data.property_id,
      name: property.name,
      address: data.address,
      user_value: holding?.value ?? 0,
      zoopla_estimate: data.zoopla_estimate,
      zoopla_low: data.zoopla_low,
      zoopla_high: data.zoopla_high,
      land_registry_comparables: data.land_registry_comparables,
      fetched_at: data.fetched_at,
      source: propertiesToFetch.some((p) => p.id === property.id) ? ('fresh' as const) : ('cached' as const),
    };
  });

  return NextResponse.json({
    valuations: results,
    cache_status: propertiesToFetch.length > 0 ? 'refreshed' : 'all_cached',
    fetched_count: propertiesToFetch.length,
    timestamp: new Date().toISOString(),
  });
}
