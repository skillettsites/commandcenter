import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface YahooChartResult {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
        previousClose?: number;
      };
      indicators?: {
        adjclose?: Array<{
          adjclose?: (number | null)[];
        }>;
        quote?: Array<{
          close?: (number | null)[];
        }>;
      };
    }>;
  };
}

interface HistoryPoint {
  date: string;
  value: number;
}

type TimeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';

// Map our range to Yahoo Finance params
function getYahooParams(range: TimeRange): { range: string; interval: string } {
  switch (range) {
    case '1D': return { range: '1d', interval: '15m' };
    case '1W': return { range: '5d', interval: '1h' };
    case '1M': return { range: '1mo', interval: '1d' };
    case '1Y': return { range: '1y', interval: '1wk' };
    case 'ALL': return { range: '5y', interval: '1mo' };
    default: return { range: '1mo', interval: '1d' };
  }
}

async function fetchSymbolHistory(
  symbol: string,
  range: string,
  interval: string
): Promise<{ timestamps: number[]; prices: (number | null)[] } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data: YahooChartResult = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp) return null;

    const prices =
      result.indicators?.adjclose?.[0]?.adjclose ||
      result.indicators?.quote?.[0]?.close ||
      [];

    return {
      timestamps: result.timestamp,
      prices,
    };
  } catch {
    return null;
  }
}

async function fetchForexHistory(
  range: string,
  interval: string
): Promise<Map<number, number>> {
  const result = await fetchSymbolHistory('GBPUSD=X', range, interval);
  const rateMap = new Map<number, number>();
  if (!result) return rateMap;

  for (let i = 0; i < result.timestamps.length; i++) {
    const rate = result.prices[i];
    if (rate !== null && rate !== undefined && rate > 0) {
      rateMap.set(result.timestamps[i], 1 / rate);
    }
  }
  return rateMap;
}

function findClosestRate(rateMap: Map<number, number>, timestamp: number): number {
  if (rateMap.size === 0) return 0.79; // fallback
  let closestTs = 0;
  let minDiff = Infinity;
  for (const ts of rateMap.keys()) {
    const diff = Math.abs(ts - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closestTs = ts;
    }
  }
  return rateMap.get(closestTs) || 0.79;
}

// Store today's snapshot if it doesn't exist yet
async function storeTodaySnapshot(
  total: number,
  investments: number,
  propertyEquity: number,
  cash: number
): Promise<void> {
  try {
    const supabase = getServiceClient();
    const today = new Date().toISOString().split('T')[0];

    // Check if today's snapshot exists
    const { data: existing } = await supabase
      .from('net_worth_snapshots')
      .select('id')
      .eq('date', today)
      .maybeSingle();

    if (!existing) {
      await supabase.from('net_worth_snapshots').insert({
        date: today,
        total,
        investments,
        property_equity: propertyEquity,
        cash,
      });
    }
  } catch {
    // Don't fail the request if snapshot storage fails
  }
}

// Fetch stored snapshots from Supabase
async function fetchStoredSnapshots(): Promise<
  Array<{ date: string; total: number; investments: number; property_equity: number; cash: number }>
> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('net_worth_snapshots')
      .select('date, total, investments, property_equity, cash')
      .order('date', { ascending: true });
    return data || [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const range = (request.nextUrl.searchParams.get('range') || '1M') as TimeRange;

  // We need the current net worth from the main finances endpoint
  let currentNetWorth = 0;
  let currentInvestments = 0;
  let currentPropertyEquity = 0;
  let currentCash = 0;

  try {
    const baseUrl = request.nextUrl.origin;
    const finRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'User-Agent': 'internal' },
    });
    if (finRes.ok) {
      const finData = await finRes.json();
      currentNetWorth = finData.totals.netWorth;
      currentInvestments = finData.totals.investments;
      currentPropertyEquity = finData.totals.propertyEquity;
      currentCash = finData.totals.cash;
    }
  } catch {
    // Fall back to 0 if finances API unavailable
  }

  // Store today's snapshot
  if (currentNetWorth > 0) {
    storeTodaySnapshot(currentNetWorth, currentInvestments, currentPropertyEquity, currentCash);
  }

  // Fetch stored snapshots
  const storedSnapshots = await fetchStoredSnapshots();

  // For 1D range, we generate intraday from stock movement
  // For longer ranges, generate synthetic history based on a blended stock index
  const yahooParams = getYahooParams(range);

  // We use a blend of the user's stock holdings as a proxy for portfolio movement
  // Weights approximate each holding's share of total net worth (~£1.3M)
  const symbols = [
    { symbol: 'NVDA', weight: 0.03 },
    { symbol: 'GOOGL', weight: 0.03 },
    { symbol: 'AMZN', weight: 0.02 },
    { symbol: 'ICE', weight: 0.10 },   // E*Trade (largest single stock)
    { symbol: 'PLTR', weight: 0.02 },
    { symbol: 'TSLA', weight: 0.02 },
  ];
  // The rest (~78%) is property equity, funds, cash - roughly stable

  const stableWeight = 0.78; // portion that doesn't move with stocks

  // Fetch stock histories and forex in parallel
  const [forexRates, ...stockHistories] = await Promise.all([
    fetchForexHistory(yahooParams.range, yahooParams.interval),
    ...symbols.map((s) => fetchSymbolHistory(s.symbol, yahooParams.range, yahooParams.interval)),
  ]);

  // Build a blended return index
  // Find the common set of timestamps (use the first available stock's timestamps)
  let baseTimestamps: number[] = [];
  for (const hist of stockHistories) {
    if (hist && hist.timestamps.length > 0) {
      if (hist.timestamps.length > baseTimestamps.length) {
        baseTimestamps = hist.timestamps;
      }
    }
  }

  if (baseTimestamps.length === 0) {
    // No stock data available; return stored snapshots or a flat line
    const history: HistoryPoint[] = storedSnapshots.length > 0
      ? storedSnapshots.map((s) => ({ date: s.date, value: Number(s.total) }))
      : [{ date: new Date().toISOString(), value: currentNetWorth }];

    return NextResponse.json({
      history,
      currentValue: currentNetWorth,
      range,
    });
  }

  // For each timestamp, compute the blended index value
  // We work backwards from the current net worth
  const history: HistoryPoint[] = [];

  // First, compute the relative return of each stock at each timestamp
  // relative to the last data point
  const stockReturns: Map<string, Map<number, number>> = new Map();
  for (let si = 0; si < symbols.length; si++) {
    const hist = stockHistories[si];
    if (!hist || hist.prices.length === 0) continue;

    const returnsMap = new Map<number, number>();
    // Find the last valid price
    let lastPrice: number | null = null;
    for (let i = hist.prices.length - 1; i >= 0; i--) {
      if (hist.prices[i] !== null && hist.prices[i] !== undefined) {
        lastPrice = hist.prices[i]!;
        break;
      }
    }
    if (lastPrice === null) continue;

    for (let i = 0; i < hist.timestamps.length; i++) {
      const price = hist.prices[i];
      if (price !== null && price !== undefined && price > 0) {
        returnsMap.set(hist.timestamps[i], price / lastPrice);
      }
    }
    stockReturns.set(symbols[si].symbol, returnsMap);
  }

  // Now for each base timestamp, compute the blended historical value
  for (const ts of baseTimestamps) {
    let blendedReturn = stableWeight; // stable portion stays at 1.0x

    for (const sym of symbols) {
      const returnsMap = stockReturns.get(sym.symbol);
      if (!returnsMap) {
        blendedReturn += sym.weight; // no data, assume flat
        continue;
      }

      // Find closest timestamp in this stock's data
      let closestReturn = 1.0;
      let minDiff = Infinity;
      for (const [rts, ret] of returnsMap) {
        const diff = Math.abs(rts - ts);
        if (diff < minDiff) {
          minDiff = diff;
          closestReturn = ret;
        }
      }
      blendedReturn += sym.weight * closestReturn;
    }

    // Apply forex adjustment for USD-denominated stocks
    const currentForex = findClosestRate(forexRates, baseTimestamps[baseTimestamps.length - 1]);
    const historicalForex = findClosestRate(forexRates, ts);
    // The forex effect only applies to the stock portion (35%)
    const forexAdjustment = currentForex > 0 ? historicalForex / currentForex : 1;
    const stockPortion = blendedReturn - stableWeight;
    const adjustedReturn = stableWeight + stockPortion * forexAdjustment;

    const historicalValue = Math.round(currentNetWorth * adjustedReturn);

    const dateObj = new Date(ts * 1000);
    const dateStr = range === '1D'
      ? dateObj.toISOString()
      : dateObj.toISOString().split('T')[0];

    history.push({
      date: dateStr,
      value: historicalValue,
    });
  }

  // Ensure the last point is the current value
  if (history.length > 0) {
    history[history.length - 1].value = currentNetWorth;
  }

  // For longer ranges, merge in stored snapshots where they exist
  // Stored snapshots override synthetic data for the same date
  if (range !== '1D' && storedSnapshots.length > 0) {
    const snapshotMap = new Map<string, number>();
    for (const snap of storedSnapshots) {
      snapshotMap.set(snap.date, Number(snap.total));
    }

    for (let i = 0; i < history.length; i++) {
      const dateKey = history[i].date.split('T')[0];
      if (snapshotMap.has(dateKey)) {
        history[i].value = snapshotMap.get(dateKey)!;
      }
    }
  }

  // Deduplicate by date (keep last occurrence)
  const seen = new Map<string, number>();
  for (const point of history) {
    seen.set(point.date, point.value);
  }
  const deduped = Array.from(seen.entries()).map(([date, value]) => ({ date, value }));
  deduped.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    history: deduped,
    currentValue: currentNetWorth,
    range,
  });
}
