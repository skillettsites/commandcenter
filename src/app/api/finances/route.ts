import { NextResponse } from 'next/server';
import {
  stockHoldings,
  fundHoldings,
  cashInvestmentAccounts,
  etradeValue,
  etradeHoldings,
  propertyHoldings,
  cashHoldings,
  dividendSchedules,
  jepqTarget,
  pokemonCards,
} from '@/lib/portfolio';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Cached HL dividend data from Supabase
interface HLDistribution {
  date: string;
  amount: number;
  type: string;
}

interface HLFundDividendCache {
  fund_id: string;
  fund_name: string;
  yield_percent: number | null;
  unit_price: number | null;
  distributions: HLDistribution[];
}

async function fetchHLDividendCache(): Promise<Map<string, HLFundDividendCache>> {
  const map = new Map<string, HLFundDividendCache>();
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('fund_dividends')
      .select('fund_id, fund_name, yield_percent, unit_price, distributions');

    if (error || !data) return map;

    for (const row of data) {
      map.set(row.fund_id, {
        fund_id: row.fund_id,
        fund_name: row.fund_name,
        yield_percent: row.yield_percent ? Number(row.yield_percent) : null,
        unit_price: row.unit_price ? Number(row.unit_price) : null,
        distributions: (row.distributions as HLDistribution[]) || [],
      });
    }
  } catch {
    // If Supabase is unavailable, return empty map; Yahoo/schedule fallback will be used
  }
  return map;
}

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
        chartPreviousClose?: number;
        previousClose?: number;
      };
    }>;
  };
}

async function fetchPrice(symbol: string): Promise<{ price: number; currency: string; previousClose: number | null } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 120 }, // cache for 2 minutes (was 5)
    });

    if (!res.ok) return null;

    const data: YahooChartResult = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    return {
      price: meta.regularMarketPrice,
      currency: meta.currency || 'USD',
      previousClose: meta.chartPreviousClose || meta.previousClose || null,
    };
  } catch {
    return null;
  }
}

async function fetchForexRate(): Promise<number> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/GBPUSD=X?interval=1d&range=1d';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) return 0.79;

    const data: YahooChartResult = await res.json();
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!rate) return 0.79;

    return 1 / rate;
  } catch {
    return 0.79;
  }
}

interface YahooDividendEvent {
  amount: number;
  date: number; // unix timestamp
}

interface YahooDividendResult {
  chart?: {
    result?: Array<{
      events?: {
        dividends?: Record<string, YahooDividendEvent>;
      };
    }>;
  };
}

async function fetchDividendHistory(symbol: string): Promise<YahooDividendEvent[]> {
  try {
    // Fetch 2 years of dividend history
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=2y&events=div`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      next: { revalidate: 3600 }, // cache 1 hour
    });
    if (!res.ok) return [];
    const data: YahooDividendResult = await res.json();
    const divs = data.chart?.result?.[0]?.events?.dividends;
    if (!divs) return [];
    return Object.values(divs).sort((a, b) => a.date - b.date);
  } catch {
    return [];
  }
}

async function generateDividendData(
  holdingValues: Record<string, number>,
  forexRate: number
) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  interface DividendPayment {
    date: string;
    month: number;
    year: number;
    source: string;
    amount: number;
    status: 'received' | 'forecast';
    dataSource: 'hl_scraped' | 'yahoo' | 'estimated';
    expectedDay?: number; // approximate day of month payment arrives
  }

  // Build a map of holding name to expected pay day
  const payDayMap: Record<string, number> = {};
  for (const sched of dividendSchedules) {
    if (sched.expectedPayDay) {
      payDayMap[sched.holdingName] = sched.expectedPayDay;
    }
  }

  const payments: DividendPayment[] = [];

  // Step 1: Fetch real HL dividend data from Supabase cache
  const hlCache = await fetchHLDividendCache();

  // Step 2: Process fund dividends from HL scraped data first (preferred source)
  const fundsWithHLData = new Set<string>();

  for (const fund of fundHoldings) {
    const hlData = hlCache.get(fund.id);
    if (!hlData || hlData.distributions.length === 0) continue;

    fundsWithHLData.add(fund.id);

    for (const dist of hlData.distributions) {
      const d = new Date(dist.date);
      if (isNaN(d.getTime())) continue;

      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const dateStr = `${year}-${String(month).padStart(2, '0')}`;
      const isPast = year < currentYear || (year === currentYear && month <= currentMonth);

      // Calculate actual payment: distribution amount per unit * units held
      const totalGBP = dist.amount * fund.units;

      payments.push({
        date: dateStr,
        month,
        year,
        source: fund.name,
        amount: Math.round(totalGBP * 100) / 100,
        status: isPast ? 'received' : 'forecast',
        dataSource: 'hl_scraped',
      });
    }
  }

  // Step 3: Fetch Yahoo Finance dividend history for stocks (and funds without HL data)
  const stockSymbols = stockHoldings.filter(s => s.shares > 0).map(s => s.symbol);
  const fundSymbolMap = fundHoldings
    .filter(f => f.yahooSymbol && !fundsWithHLData.has(f.id))
    .map(f => ({ id: f.id, name: f.name, symbol: f.yahooSymbol, units: f.units }));

  const allSymbols = [
    ...stockSymbols.map(s => ({ symbol: s, type: 'stock' as const })),
    ...fundSymbolMap.map(f => ({ symbol: f.symbol, type: 'fund' as const })),
  ];

  const divHistories = await Promise.all(allSymbols.map(s => fetchDividendHistory(s.symbol)));

  // Process stock dividends (reported per share, multiply by shares held)
  for (let i = 0; i < stockSymbols.length; i++) {
    const symbol = stockSymbols[i];
    const holding = stockHoldings.find(s => s.symbol === symbol);
    if (!holding) continue;
    const divs = divHistories[i];

    for (const div of divs) {
      const d = new Date(div.date * 1000);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const dateStr = `${year}-${String(month).padStart(2, '0')}`;

      // Convert USD dividend to GBP
      const totalGBP = div.amount * holding.shares * forexRate;

      payments.push({
        date: dateStr,
        month,
        year,
        source: holding.name,
        amount: Math.round(totalGBP * 100) / 100,
        status: 'received',
        dataSource: 'yahoo',
      });
    }
  }

  // Process fund dividends from Yahoo (only for funds without HL data)
  for (let i = 0; i < fundSymbolMap.length; i++) {
    const fund = fundSymbolMap[i];
    const divs = divHistories[stockSymbols.length + i];

    for (const div of divs) {
      const d = new Date(div.date * 1000);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const dateStr = `${year}-${String(month).padStart(2, '0')}`;

      // Fund divs are already in GBP (pence per unit from Yahoo for .L funds)
      const totalGBP = div.amount * fund.units;

      payments.push({
        date: dateStr,
        month,
        year,
        source: fund.name,
        amount: Math.round(totalGBP * 100) / 100,
        status: 'received',
        dataSource: 'yahoo',
      });
    }
  }

  // Step 4: Build forecast data from most recent real distribution amounts
  const latestBySource: Record<string, number> = {};
  const freqBySource: Record<string, number[]> = {};
  for (const p of payments) {
    latestBySource[p.source] = p.amount;
    if (!freqBySource[p.source]) freqBySource[p.source] = [];
    if (!freqBySource[p.source].includes(p.month)) freqBySource[p.source].push(p.month);
  }

  // Step 5: Schedule-based forecasts for holdings with no real data at all
  for (const schedule of dividendSchedules) {
    if (!schedule.paysDividend) continue;
    if (latestBySource[schedule.holdingName]) continue; // already have real data

    const holdingValue = holdingValues[schedule.holdingId] || 0;
    if (holdingValue <= 0) continue;

    const paymentsPerYear = schedule.paymentMonths.length;
    const annualIncome = holdingValue * (schedule.annualYieldPercent / 100);
    const paymentAmount = annualIncome / paymentsPerYear;

    for (let offset = -3; offset <= 8; offset++) {
      let month = currentMonth + offset;
      let year = currentYear;
      if (month < 1) { month += 12; year -= 1; }
      if (month > 12) { month -= 12; year += 1; }
      if (!schedule.paymentMonths.includes(month)) continue;

      const dateStr = `${year}-${String(month).padStart(2, '0')}`;
      const isPast = year < currentYear || (year === currentYear && month < currentMonth);

      payments.push({
        date: dateStr,
        month,
        year,
        source: schedule.holdingName,
        amount: Math.round(paymentAmount * 100) / 100,
        status: isPast ? 'received' : 'forecast',
        dataSource: 'estimated',
      });
    }
  }

  // Step 6: Add forecasts for the next 9 months based on latest known dividend
  for (const [source, lastAmount] of Object.entries(latestBySource)) {
    const months = freqBySource[source] || [];
    if (months.length === 0) continue;

    for (let offset = 0; offset <= 9; offset++) {
      let month = currentMonth + offset;
      let year = currentYear;
      if (month > 12) { month -= 12; year += 1; }

      if (!months.includes(month)) continue;
      const dateStr = `${year}-${String(month).padStart(2, '0')}`;

      // Skip if we already have a real payment for this month+source
      const exists = payments.some(p => p.date === dateStr && p.source === source);
      if (exists) continue;

      payments.push({
        date: dateStr,
        month,
        year,
        source,
        amount: lastAmount,
        status: 'forecast',
        dataSource: 'estimated',
      });
    }
  }

  // Sort by date then source
  // Add expected pay day to each payment
  for (const p of payments) {
    p.expectedDay = payDayMap[p.source];
  }

  payments.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));

  // Monthly totals
  const monthlyTotals: Record<string, { received: number; forecast: number }> = {};
  for (const p of payments) {
    if (!monthlyTotals[p.date]) monthlyTotals[p.date] = { received: 0, forecast: 0 };
    monthlyTotals[p.date][p.status] += p.amount;
  }

  const currentDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const thisMonth = monthlyTotals[currentDateStr] || { received: 0, forecast: 0 };

  // Annual estimate based on all holding yields (more accurate than summing sparse received data)
  let annualReceived = 0;
  for (const schedule of dividendSchedules) {
    if (!schedule.paysDividend) continue;
    const holdingValue = holdingValues[schedule.holdingId] || 0;
    annualReceived += holdingValue * (schedule.annualYieldPercent / 100);
  }
  annualReceived = Math.round(annualReceived);

  // Include HL yield data in the response for transparency
  const hlYields: Record<string, { yield_percent: number | null; unit_price: number | null }> = {};
  for (const [fundId, hlData] of hlCache) {
    hlYields[fundId] = {
      yield_percent: hlData.yield_percent,
      unit_price: hlData.unit_price,
    };
  }

  return {
    payments,
    monthlyTotals,
    thisMonthReceived: Math.round(thisMonth.received * 100) / 100,
    thisMonthExpected: Math.round(thisMonth.forecast * 100) / 100,
    annualReceived: Math.round(annualReceived),
    monthlyAverage: Math.round(annualReceived / 12),
    hlYields,
    jepqTarget: {
      name: jepqTarget.name,
      capital: jepqTarget.estimatedDeployableCapital,
      yield: jepqTarget.annualYieldPercent,
      monthlyIncome: Math.round(jepqTarget.estimatedMonthlyIncome),
    },
  };
}

export async function GET() {
  // Fetch forex rate, stock prices, and fund prices in parallel
  const [forexRate, ...allPrices] = await Promise.all([
    fetchForexRate(),
    ...stockHoldings.map((s) => fetchPrice(s.symbol)),
    ...fundHoldings.map((f) => fetchPrice(f.yahooSymbol)),
  ]);

  const stockPrices = allPrices.slice(0, stockHoldings.length);
  const fundPrices = allPrices.slice(stockHoldings.length);

  const stocks = stockHoldings.map((holding, i) => {
    const priceData = stockPrices[i];
    const livePrice = priceData?.price ?? null;
    const previousClose = priceData?.previousClose ?? null;
    const priceCurrency = priceData?.currency ?? 'USD';

    // Convert live price to GBP based on the price currency from Yahoo
    let livePriceGBP: number | null = null;
    if (livePrice !== null) {
      if (priceCurrency === 'GBp') {
        // London-listed stocks: Yahoo returns price in pence, convert to pounds
        livePriceGBP = livePrice / 100;
      } else if (holding.currency === 'GBP') {
        livePriceGBP = livePrice;
      } else {
        // USD stocks: convert to GBP
        livePriceGBP = livePrice * forexRate;
      }
    }

    const currentValue = livePriceGBP !== null ? livePriceGBP * holding.shares : null;
    const gainLoss = currentValue !== null ? currentValue - holding.costBasis : null;
    const gainLossPercent = gainLoss !== null && holding.costBasis > 0
      ? (gainLoss / holding.costBasis) * 100
      : null;

    // Daily change
    const dailyChangePercent = livePrice !== null && previousClose !== null && previousClose > 0
      ? ((livePrice - previousClose) / previousClose) * 100
      : null;
    let dailyChangeGBP: number | null = null;
    if (livePrice !== null && previousClose !== null) {
      const priceChangePerShare = livePrice - previousClose;
      if (priceCurrency === 'GBp') {
        dailyChangeGBP = (priceChangePerShare / 100) * holding.shares;
      } else if (holding.currency === 'GBP') {
        dailyChangeGBP = priceChangePerShare * holding.shares;
      } else {
        dailyChangeGBP = priceChangePerShare * forexRate * holding.shares;
      }
    }

    return {
      ...holding,
      livePrice,
      livePriceGBP,
      currentValue,
      gainLoss,
      gainLossPercent,
      dailyChangePercent,
      dailyChangeGBP,
    };
  });

  const funds = fundHoldings.map((f, i) => {
    const priceData = fundPrices[i];
    // Yahoo Finance UK fund prices are in GBp (pence), convert to pounds
    const liveUnitPrice = priceData?.price ?? null;
    const currency = priceData?.currency ?? null;
    const unitPriceGBP = liveUnitPrice !== null
      ? (currency === 'GBp' ? liveUnitPrice / 100 : liveUnitPrice)
      : null;
    const liveValue = unitPriceGBP !== null ? unitPriceGBP * f.units : null;
    const currentValue = liveValue !== null ? liveValue : f.currentValue;
    const gainLoss = currentValue - f.costBasis;
    const gainLossPercent = f.costBasis > 0 ? (gainLoss / f.costBasis) * 100 : 0;
    const isLive = liveValue !== null;

    return {
      ...f,
      liveUnitPrice: unitPriceGBP,
      currentValue,
      gainLoss,
      gainLossPercent,
      isLive,
    };
  });

  // Build holding values map for dividend calculation
  const holdingValues: Record<string, number> = {};
  for (const s of stocks) {
    holdingValues[s.symbol] = s.currentValue ?? 0;
  }
  for (const f of funds) {
    holdingValues[f.id] = f.currentValue;
  }

  // Generate dividend data from real Yahoo Finance dividend history
  const dividends = await generateDividendData(holdingValues, forexRate);

  // Fetch ICE live price for E*Trade holdings
  // Use USD values from E*Trade converted at live forex, with live ICE price for % change tracking
  const icePrice = await fetchPrice(etradeHoldings.symbol);
  const icePriceGBP = icePrice ? icePrice.price * forexRate : null;
  // Use LIVE ICE price x shares for accurate valuation (fallback to static USD values)
  const etradeVestedValue = icePriceGBP
    ? Math.round(icePriceGBP * etradeHoldings.vestedShares)
    : Math.round(etradeHoldings.esppValueUSD * forexRate);
  const etradeUnvestedValue = icePriceGBP
    ? Math.round(icePriceGBP * etradeHoldings.unvestedShares)
    : Math.round(etradeHoldings.rsValueUSD * forexRate);
  const etradeTotalValue = etradeVestedValue + etradeUnvestedValue;

  // ICE daily change
  const iceDailyChangePercent = icePrice?.previousClose
    ? ((icePrice.price - icePrice.previousClose) / icePrice.previousClose) * 100
    : null;
  const iceDailyChangeGBP = icePrice?.previousClose && icePriceGBP
    ? (icePrice.price - icePrice.previousClose) * forexRate * etradeHoldings.vestedShares
    : null;

  // Totals
  const stocksTotal = stocks.reduce((sum, s) => sum + (s.currentValue ?? 0), 0);
  const fundsTotal = funds.reduce((sum, f) => sum + f.currentValue, 0);
  const investmentCashTotal = cashInvestmentAccounts.reduce((sum, c) => sum + c.balance, 0);
  const investmentsTotal = stocksTotal + fundsTotal + investmentCashTotal + etradeVestedValue;

  const propertyEquity = propertyHoldings.reduce((sum, p) => sum + (p.value - p.mortgage), 0);

  const cashTotal = cashHoldings.reduce((sum, c) => sum + c.balance, 0);

  // Pokemon cards value (USD to GBP)
  const pokemonTotalUSD = pokemonCards.reduce((sum, c) => sum + c.value, 0);
  const pokemonTotalGBP = Math.round(pokemonTotalUSD / (forexRate || 1.27));
  const pokemonCostUSD = pokemonCards.reduce((sum, c) => sum + c.cost, 0);

  const netWorth = investmentsTotal + propertyEquity + cashTotal + pokemonTotalGBP;

  return NextResponse.json({
    stocks,
    funds,
    cashInvestmentAccounts,
    etrade: {
      symbol: etradeHoldings.symbol,
      name: etradeHoldings.name,
      vestedShares: etradeHoldings.vestedShares,
      unvestedShares: etradeHoldings.unvestedShares,
      totalShares: etradeHoldings.totalShares,
      livePrice: icePrice?.price ?? null,
      livePriceGBP: icePriceGBP,
      vestedValue: etradeVestedValue,
      unvestedValue: etradeUnvestedValue,
      totalValue: etradeTotalValue,
      isLive: icePrice !== null,
      dailyChangePercent: iceDailyChangePercent,
      dailyChangeGBP: iceDailyChangeGBP,
    },
    properties: propertyHoldings,
    cash: cashHoldings,
    pokemon: {
      cards: pokemonCards,
      totalUSD: pokemonTotalUSD,
      totalGBP: pokemonTotalGBP,
      costUSD: pokemonCostUSD,
    },
    forexRate,
    dividends,
    totals: {
      stocks: stocksTotal,
      funds: fundsTotal,
      investmentCash: investmentCashTotal,
      etrade: etradeVestedValue,
      etradeUnvested: etradeUnvestedValue,
      investments: investmentsTotal,
      propertyEquity,
      cash: cashTotal,
      pokemon: pokemonTotalGBP,
      netWorth,
    },
    timestamp: new Date().toISOString(),
  });
}
