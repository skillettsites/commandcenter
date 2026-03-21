import { NextResponse } from 'next/server';
import {
  stockHoldings,
  fundHoldings,
  cashInvestmentAccounts,
  etradeValue,
  propertyHoldings,
  cashHoldings,
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

async function fetchStockPrice(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
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
    // Fetch GBP/USD rate (how many USD per 1 GBP), then invert
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/GBPUSD=X?interval=1d&range=1d';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) return 0.79; // fallback rate

    const data: YahooChartResult = await res.json();
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!rate) return 0.79;

    // rate is USD per 1 GBP, we need GBP per 1 USD
    return 1 / rate;
  } catch {
    return 0.79; // fallback
  }
}

export async function GET() {
  const [forexRate, ...stockPrices] = await Promise.all([
    fetchForexRate(),
    ...stockHoldings.map((s) => fetchStockPrice(s.symbol)),
  ]);

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

  const funds = fundHoldings.map((f) => {
    const gainLoss = f.currentValue - f.costBasis;
    const gainLossPercent = f.costBasis > 0 ? (gainLoss / f.costBasis) * 100 : 0;
    return { ...f, gainLoss, gainLossPercent };
  });

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
