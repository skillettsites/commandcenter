import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ChartDataPoint {
  date: string;
  price: number;
}

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  '1W': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1wk' },
  'ALL': { range: 'max', interval: '1mo' },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const period = searchParams.get('period') || '1M';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  const config = RANGE_MAP[period] || RANGE_MAP['1M'];

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Yahoo Finance unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: 'No data returned' }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const meta = result.meta || {};

    const chartData: ChartDataPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close !== null && close !== undefined) {
        const date = new Date(timestamps[i] * 1000);
        chartData.push({
          date: date.toISOString(),
          price: close,
        });
      }
    }

    return NextResponse.json({
      symbol,
      period,
      currency: meta.currency || 'USD',
      currentPrice: meta.regularMarketPrice || null,
      previousClose: meta.chartPreviousClose || meta.previousClose || null,
      chartData,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
  }
}
