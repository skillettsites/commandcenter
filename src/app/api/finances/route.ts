import { NextResponse } from 'next/server';
import {
  stockHoldings,
  fundHoldings,
  cashInvestmentAccounts,
  etradeValue,
  propertyHoldings,
  cashHoldings,
  dividendSchedules,
  jepqTarget,
} from '@/lib/portfolio';

export const dynamic = 'force-dynamic';

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
      };
    }>;
  };
}

async function fetchPrice(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 }, // cache for 5 minutes
    });

    if (!res.ok) return null;

    const data: YahooChartResult = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    return {
      price: meta.regularMarketPrice,
      currency: meta.currency || 'USD',
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

function generateDividendForecast(holdingValues: Record<string, number>) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  interface DividendPayment {
    date: string; // YYYY-MM
    month: number;
    year: number;
    source: string;
    amount: number;
    status: 'received' | 'forecast';
  }

  const payments: DividendPayment[] = [];

  // Generate 12 months of data: 3 months back + current + 8 months forward
  for (let offset = -3; offset <= 8; offset++) {
    let month = currentMonth + offset;
    let year = currentYear;
    if (month < 1) { month += 12; year -= 1; }
    if (month > 12) { month -= 12; year += 1; }

    const dateStr = `${year}-${String(month).padStart(2, '0')}`;

    for (const schedule of dividendSchedules) {
      if (!schedule.paysDividend) continue;
      if (!schedule.paymentMonths.includes(month)) continue;

      const holdingValue = holdingValues[schedule.holdingId] || 0;
      if (holdingValue <= 0) continue;

      const paymentsPerYear = schedule.paymentMonths.length;
      const annualIncome = holdingValue * (schedule.annualYieldPercent / 100);
      const paymentAmount = annualIncome / paymentsPerYear;

      // Past months and current month before the 15th are "received"
      const isPast = year < currentYear || (year === currentYear && month < currentMonth);
      const isCurrentEarly = year === currentYear && month === currentMonth && now.getDate() >= 15;

      payments.push({
        date: dateStr,
        month,
        year,
        source: schedule.holdingName,
        amount: Math.round(paymentAmount * 100) / 100,
        status: isPast || isCurrentEarly ? 'received' : 'forecast',
      });
    }
  }

  // Sort by date then source
  payments.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));

  // Monthly totals
  const monthlyTotals: Record<string, { received: number; forecast: number }> = {};
  for (const p of payments) {
    if (!monthlyTotals[p.date]) monthlyTotals[p.date] = { received: 0, forecast: 0 };
    monthlyTotals[p.date][p.status] += p.amount;
  }

  // Current month summary
  const currentDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const thisMonth = monthlyTotals[currentDateStr] || { received: 0, forecast: 0 };

  // Annual estimated income
  let annualEstimate = 0;
  for (const schedule of dividendSchedules) {
    if (!schedule.paysDividend) continue;
    const holdingValue = holdingValues[schedule.holdingId] || 0;
    annualEstimate += holdingValue * (schedule.annualYieldPercent / 100);
  }

  return {
    payments,
    monthlyTotals,
    thisMonthReceived: Math.round(thisMonth.received * 100) / 100,
    thisMonthExpected: Math.round(thisMonth.forecast * 100) / 100,
    annualEstimate: Math.round(annualEstimate),
    monthlyEstimate: Math.round(annualEstimate / 12),
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
    const livePriceGBP = livePrice !== null ? livePrice * forexRate : null;
    const currentValue = livePriceGBP !== null ? livePriceGBP * holding.shares : null;
    const gainLoss = currentValue !== null ? currentValue - holding.costBasis : null;
    const gainLossPercent = gainLoss !== null && holding.costBasis > 0
      ? (gainLoss / holding.costBasis) * 100
      : null;

    return {
      ...holding,
      livePrice,
      livePriceGBP,
      currentValue,
      gainLoss,
      gainLossPercent,
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

  // Generate dividend forecast
  const dividends = generateDividendForecast(holdingValues);

  // Totals
  const stocksTotal = stocks.reduce((sum, s) => sum + (s.currentValue ?? 0), 0);
  const fundsTotal = funds.reduce((sum, f) => sum + f.currentValue, 0);
  const investmentCashTotal = cashInvestmentAccounts.reduce((sum, c) => sum + c.balance, 0);
  const investmentsTotal = stocksTotal + fundsTotal + investmentCashTotal + etradeValue;

  const propertyEquity = propertyHoldings.reduce((sum, p) => sum + (p.value - p.mortgage), 0);

  const cashTotal = cashHoldings.reduce((sum, c) => sum + c.balance, 0);

  const netWorth = investmentsTotal + propertyEquity + cashTotal;

  return NextResponse.json({
    stocks,
    funds,
    cashInvestmentAccounts,
    etradeValue,
    properties: propertyHoldings,
    cash: cashHoldings,
    forexRate,
    dividends,
    totals: {
      stocks: stocksTotal,
      funds: fundsTotal,
      investmentCash: investmentCashTotal,
      etrade: etradeValue,
      investments: investmentsTotal,
      propertyEquity,
      cash: cashTotal,
      netWorth,
    },
    timestamp: new Date().toISOString(),
  });
}
