'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

interface ChartPoint {
  date: string;
  price: number;
  displayDate: string;
}

interface ChartResponse {
  symbol: string;
  period: string;
  currency: string;
  currentPrice: number | null;
  previousClose: number | null;
  chartData: { date: string; price: number }[];
}

type Period = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

interface ShareDetailProps {
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  currentValue: number | null;
  livePrice: number | null;
  livePriceGBP: number | null;
  dailyChangeGBP: number | null;
  dailyChangePercent: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
  account: string;
  currency: string;
  forexRate: number;
  onClose: () => void;
}

function formatDateLabel(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === '1W') {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  }
  if (period === '1M' || period === '3M') {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  if (period === '6M' || period === '1Y') {
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as ChartPoint;
  return (
    <div className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-light)] shadow-lg">
      <div className="text-[10px] text-[var(--text-tertiary)]">{data.displayDate}</div>
      <div className="text-[13px] font-semibold text-[var(--text-primary)]">
        {payload[0].value !== undefined ? Number(payload[0].value).toFixed(2) : '--'}
      </div>
    </div>
  );
}

export default function ShareDetail({
  symbol,
  name,
  shares,
  costBasis,
  currentValue,
  livePrice,
  livePriceGBP,
  dailyChangeGBP,
  dailyChangePercent,
  gainLoss,
  gainLossPercent,
  account,
  currency,
  forexRate,
  onClose,
}: ShareDetailProps) {
  const [period, setPeriod] = useState<Period>('1M');
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const cache = useRef<Record<string, ChartPoint[]>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchChart = useCallback(async (p: Period) => {
    const cacheKey = `${symbol}-${p}`;
    if (cache.current[cacheKey]) {
      setChartData(cache.current[cacheKey]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/api/finances/chart?symbol=${encodeURIComponent(symbol)}&period=${p}`);
      if (!res.ok) throw new Error('Failed');
      const data: ChartResponse = await res.json();

      const formatted: ChartPoint[] = data.chartData.map((point) => ({
        date: point.date,
        price: point.price,
        displayDate: new Date(point.date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: p === '1W' ? '2-digit' : undefined,
          minute: p === '1W' ? '2-digit' : undefined,
        }),
      }));

      cache.current[cacheKey] = formatted;
      setChartData(formatted);
      setError(false);
    } catch {
      setError(true);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchChart(period);
  }, [period, fetchChart]);

  // Scroll into view on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const periods: Period[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

  // Determine chart color based on price movement
  const firstPrice = chartData.length > 0 ? chartData[0].price : 0;
  const lastPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : 0;
  const isPositive = lastPrice >= firstPrice;
  const chartColor = isPositive ? '#30d158' : '#ff453a';

  // Calculate chart price change for the selected period
  const periodChange = lastPrice - firstPrice;
  const periodChangePercent = firstPrice > 0 ? (periodChange / firstPrice) * 100 : 0;

  // Price per share in GBP
  const pricePerShareGBP = livePriceGBP !== null ? livePriceGBP : null;
  const costPerShare = shares > 0 ? costBasis / shares : 0;

  // Format X-axis ticks
  const getTickFormatter = (p: Period) => (dateStr: string) => formatDateLabel(dateStr, p);

  return (
    <div
      ref={containerRef}
      className="mt-1 mb-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-light)] overflow-hidden fade-in"
      style={{ animation: 'fadeIn 0.25s ease-out' }}
    >
      {/* Header with close button */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-mono font-bold text-[var(--accent)]">{symbol}</span>
          <span className="text-[12px] text-[var(--text-secondary)]">{name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-tertiary)]">
            {account}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--bg-card)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Live price + daily change */}
      <div className="px-3 pb-2">
        <div className="flex items-baseline gap-2">
          {livePrice !== null && (
            <span className="text-[20px] font-bold text-[var(--text-primary)]">
              {currency === 'GBP' ? '£' : '$'}{livePrice.toFixed(2)}
            </span>
          )}
          {dailyChangePercent !== null && (
            <span className={`text-[13px] font-medium ${dailyChangePercent >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {dailyChangePercent >= 0 ? '+' : ''}{dailyChangePercent.toFixed(2)}% today
            </span>
          )}
        </div>
        {livePriceGBP !== null && currency !== 'GBP' && (
          <div className="text-[11px] text-[var(--text-tertiary)]">
            £{livePriceGBP.toFixed(2)} per share
          </div>
        )}
      </div>

      {/* Period toggles */}
      <div className="px-3 pb-2 flex gap-1">
        {periods.map((p) => (
          <button
            key={p}
            onClick={(e) => { e.stopPropagation(); setPeriod(p); }}
            className={`px-2 py-1 rounded-full text-[10px] font-medium transition-colors ${
              period === p
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="px-1 pb-1" style={{ height: 180 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[11px] text-[var(--text-tertiary)]">Loading chart...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[11px] text-[var(--red)]">Chart unavailable</div>
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={getTickFormatter(period)}
                tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke={chartColor}
                strokeWidth={2}
                fill={`url(#gradient-${symbol})`}
                dot={false}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-[11px] text-[var(--text-tertiary)]">No data available</div>
          </div>
        )}
      </div>

      {/* Period change label */}
      {chartData.length > 1 && !loading && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <span className={`text-[11px] font-medium ${isPositive ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {isPositive ? '+' : ''}{periodChange.toFixed(2)} ({isPositive ? '+' : ''}{periodChangePercent.toFixed(1)}%)
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            over {period === '1W' ? '1 week' : period === '1M' ? '1 month' : period === '3M' ? '3 months' : period === '6M' ? '6 months' : period === '1Y' ? '1 year' : 'all time'}
          </span>
        </div>
      )}

      {/* Key stats grid */}
      <div className="px-3 pb-3 grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-[var(--bg-card)]">
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Shares</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{shares.toLocaleString()}</div>
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-card)]">
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Cost Basis</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">£{costBasis.toLocaleString()}</div>
          <div className="text-[9px] text-[var(--text-tertiary)]">£{costPerShare.toFixed(2)}/share</div>
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-card)]">
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Value</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">
            {currentValue !== null ? `£${Math.round(currentValue).toLocaleString()}` : '--'}
          </div>
          {pricePerShareGBP !== null && (
            <div className="text-[9px] text-[var(--text-tertiary)]">£{pricePerShareGBP.toFixed(2)}/share</div>
          )}
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-card)]">
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Today</div>
          <div className={`text-[13px] font-semibold ${
            dailyChangeGBP !== null && dailyChangeGBP >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'
          }`}>
            {dailyChangeGBP !== null ? `${dailyChangeGBP >= 0 ? '+' : ''}£${Math.round(dailyChangeGBP).toLocaleString()}` : '--'}
          </div>
          {dailyChangePercent !== null && (
            <div className={`text-[9px] ${dailyChangePercent >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {dailyChangePercent >= 0 ? '+' : ''}{dailyChangePercent.toFixed(2)}%
            </div>
          )}
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-card)]">
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">Total P&L</div>
          <div className={`text-[13px] font-semibold ${
            gainLoss !== null && gainLoss >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'
          }`}>
            {gainLoss !== null ? `${gainLoss >= 0 ? '+' : ''}£${Math.round(gainLoss).toLocaleString()}` : '--'}
          </div>
          {gainLossPercent !== null && (
            <div className={`text-[9px] ${gainLossPercent >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(1)}%
            </div>
          )}
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-card)]">
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">FX Rate</div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">
            {currency === 'GBP' ? 'N/A' : `£${forexRate.toFixed(4)}`}
          </div>
          {currency !== 'GBP' && (
            <div className="text-[9px] text-[var(--text-tertiary)]">per $1 USD</div>
          )}
        </div>
      </div>
    </div>
  );
}
