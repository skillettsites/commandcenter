'use client';

import { useState, useEffect, useCallback } from 'react';
import NetWorthChart from './NetWorthChart';
import ShareDetail from './ShareDetail';

interface StockData {
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  account: string;
  currency: string;
  livePrice: number | null;
  livePriceGBP: number | null;
  currentValue: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
  dailyChangePercent: number | null;
  dailyChangeGBP: number | null;
}

interface FundData {
  id: string;
  name: string;
  currentValue: number;
  costBasis: number;
  account: string;
  liveUnitPrice: number | null;
  units: number;
  gainLoss: number;
  gainLossPercent: number;
  isLive: boolean;
}

interface CashAccount {
  account: string;
  balance: number;
}

interface PropertyData {
  id: string;
  name: string;
  value: number;
  mortgage: number;
  type: 'keeping' | 'selling';
  rentalIncome?: number;
  mortgagePayment?: number;
  serviceCharge?: number;
}

interface PropertyValuationData {
  property_id: string;
  name: string;
  address: string;
  user_value: number;
  zoopla_estimate: number | null;
  zoopla_low: number | null;
  zoopla_high: number | null;
  land_registry_comparables: Array<{
    address: string;
    price: number;
    date: string;
    propertyType: string;
  }>;
  fetched_at: string | null;
  source: 'fresh' | 'cached' | 'unavailable';
}

interface DividendPayment {
  date: string;
  month: number;
  year: number;
  source: string;
  amount: number;
  status: 'received' | 'forecast';
  expectedDay?: number;
}

interface DividendData {
  payments: DividendPayment[];
  monthlyTotals: Record<string, { received: number; forecast: number }>;
  thisMonthReceived: number;
  thisMonthExpected: number;
  annualReceived: number;
  monthlyAverage: number;
  jepqTarget: {
    name: string;
    capital: number;
    yield: number;
    monthlyIncome: number;
  };
}

interface FinancesData {
  stocks: StockData[];
  funds: FundData[];
  cashInvestmentAccounts: CashAccount[];
  etrade: {
    symbol: string;
    name: string;
    vestedShares: number;
    unvestedShares: number;
    totalShares: number;
    livePrice: number | null;
    livePriceGBP: number | null;
    vestedValue: number;
    unvestedValue: number;
    totalValue: number;
    isLive: boolean;
    dailyChangePercent: number | null;
    dailyChangeGBP: number | null;
  };
  properties: PropertyData[];
  cash: CashAccount[];
  forexRate: number;
  dividends: DividendData;
  pokemon: {
    cards: { id: string; name: string; number: string; set: string; grade: string; value: number; cost: number }[];
    totalUSD: number;
    totalGBP: number;
    costUSD: number;
  };
  totals: {
    stocks: number;
    funds: number;
    investmentCash: number;
    etrade: number;
    etradeUnvested: number;
    investments: number;
    propertyEquity: number;
    cash: number;
    pokemon: number;
    netWorth: number;
  };
  timestamp: string;
}

type Section = 'investments' | 'properties' | 'cash' | 'dividends' | 'pokemon';
type DividendRange = 'month' | 'year' | 'all';

function formatGBP(amount: number, compact = false): string {
  if (compact) {
    if (Math.abs(amount) >= 1000000) {
      return '£' + (amount / 1000000).toFixed(2) + 'm';
    }
    if (Math.abs(amount) >= 1000) {
      return '£' + Math.round(amount / 1000).toLocaleString() + 'k';
    }
  }
  return '£' + amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPercent(value: number | null): string {
  if (value === null) return '--';
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

function formatGainLoss(value: number | null): string {
  if (value === null) return '--';
  const sign = value >= 0 ? '+' : '';
  return sign + formatGBP(value);
}

function GainLossText({ value, size = 'sm' }: { value: number | null; size?: 'sm' | 'xs' }) {
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[10px]';
  if (value === null) return <span className={`${textSize} text-[var(--text-tertiary)]`}>--</span>;
  const color = value >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]';
  return <span className={`${textSize} font-medium ${color}`}>{formatGainLoss(value)}</span>;
}

function PercentBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const color = value >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]';
  const bg = value >= 0 ? 'bg-[var(--green)]/10' : 'bg-[var(--red)]/10';
  return (
    <span className={`${color} ${bg} text-[10px] font-medium px-1.5 py-0.5 rounded-full`}>
      {formatPercent(value)}
    </span>
  );
}

function BreakdownBar({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return null;

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden">
        {data.map((d, i) => {
          const pct = (d.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={i}
              style={{ width: `${pct}%`, backgroundColor: d.color }}
              className="transition-all duration-300"
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {data.map((d, i) => {
          const pct = (d.value / total) * 100;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-[11px] text-[var(--text-secondary)]">{d.label}</span>
              <span className="text-[11px] font-medium text-[var(--text-primary)]">{formatGBP(d.value, true)}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">({pct.toFixed(0)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function DividendChart({ dividends, range, rentalNet = 0 }: { dividends: DividendData; range: DividendRange; rentalNet?: number }) {
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Reset selection when range changes
  useEffect(() => { setSelectedBar(null); }, [range]);

  // Build bars based on range
  let bars: { date: string; label: string; received: number; forecast: number; rental: number; total: number; details: string[] }[];

  if (range === 'month') {
    const currentDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const monthPayments = dividends.payments.filter(p => p.date === currentDateStr);

    if (monthPayments.length === 0) return (
      <div className="py-6 text-center text-[11px] text-[var(--text-tertiary)]">No payments this month</div>
    );

    bars = monthPayments.map(p => ({
      date: p.date,
      label: p.source.split(' ').slice(0, 2).join(' '),
      received: p.status === 'received' ? p.amount : 0,
      forecast: p.status === 'forecast' ? p.amount : 0,
      rental: 0,
      total: p.amount,
      details: [`${p.source}`, `£${p.amount.toFixed(2)}`, p.status === 'received' ? 'Received' : 'Expected'],
    }));
    // Add rental as a separate bar in month view
    if (rentalNet > 0) {
      bars.push({
        date: currentDateStr,
        label: 'Rental Net',
        received: rentalNet,
        forecast: 0,
        rental: rentalNet,
        total: rentalNet,
        details: ['Property rental income', `£${rentalNet.toFixed(0)}/mo net`],
      });
    }
  } else {
    const sortedDates = Object.keys(dividends.monthlyTotals).sort();
    const filteredDates = range === 'year'
      ? sortedDates.filter(d => d.startsWith(String(currentYear)))
      : sortedDates;

    if (filteredDates.length === 0) return null;

    bars = filteredDates.map(date => {
      const totals = dividends.monthlyTotals[date] || { received: 0, forecast: 0 };
      const month = parseInt(date.split('-')[1]);
      const year = parseInt(date.split('-')[0]);
      const monthPayments = dividends.payments.filter(p => p.date === date);
      const rental = rentalNet > 0 ? rentalNet : 0;
      const details = monthPayments.map(p => `${p.source.split(' ').slice(0, 2).join(' ')}: £${p.amount.toFixed(2)}`);
      if (rental > 0) details.push(`Rental net: £${rental.toFixed(0)}`);
      return {
        date,
        label: MONTH_LABELS[month - 1] + (range === 'all' ? ` '${String(year).slice(2)}` : ''),
        received: totals.received,
        forecast: totals.forecast,
        rental,
        total: totals.received + totals.forecast + rental,
        details,
      };
    });
  }

  const maxValue = Math.max(...bars.map(b => b.total), 1);
  const svgWidth = 500;
  const svgHeight = 140;
  const barGap = range === 'month' ? 6 : 2;
  const barWidth = Math.max(range === 'month' ? 20 : 8, (svgWidth - 40) / bars.length - barGap);
  const startX = 20;
  const sel = selectedBar !== null ? bars[selectedBar] : null;

  return (
    <div>
      {/* Selected bar detail popup */}
      {sel && (
        <div className="mb-2 p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-light)] fade-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">{sel.label}</span>
            <span className="text-[13px] font-bold text-[var(--green)]">£{sel.total.toFixed(2)}</span>
          </div>
          {sel.received > 0 && sel.forecast > 0 && (
            <div className="flex gap-3 text-[10px] mb-1">
              <span className="text-[var(--green)]">£{sel.received.toFixed(2)} received</span>
              <span className="text-[var(--text-tertiary)]">£{sel.forecast.toFixed(2)} expected</span>
            </div>
          )}
          {sel.details.length > 0 && (
            <div className="space-y-0.5 mt-1 border-t border-[var(--border-light)] pt-1">
              {sel.details.map((d, i) => (
                <div key={i} className="text-[11px] text-[var(--text-secondary)]">{d}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight + 24}`}
          className="w-full cursor-pointer"
          style={{ minWidth: bars.length > 8 ? `${bars.length * 45}px` : '100%' }}
          preserveAspectRatio="xMinYMid meet"
          onClick={(e) => {
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const clickX = ((e.clientX - rect.left) / rect.width) * svgWidth;
            let closest = 0;
            let minDist = Infinity;
            bars.forEach((_, i) => {
              const barCenterX = startX + i * (barWidth + barGap) + barWidth / 2;
              const dist = Math.abs(barCenterX - clickX);
              if (dist < minDist) { minDist = dist; closest = i; }
            });
            setSelectedBar(selectedBar === closest ? null : closest);
          }}
        >
          {/* Y-axis guide lines */}
          {[0.25, 0.5, 0.75, 1].map((frac) => {
            const y = svgHeight - (frac * svgHeight);
            return (
              <g key={frac}>
                <line x1={startX} y1={y} x2={svgWidth - 10} y2={y} stroke="var(--border-light)" strokeWidth={0.5} strokeDasharray="3,3" />
                <text x={startX - 4} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-tertiary)">
                  £{Math.round(maxValue * frac).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {bars.map((bar, i) => {
          const x = startX + i * (barWidth + barGap);
          const receivedH = (bar.received / maxValue) * svgHeight;
          const forecastH = (bar.forecast / maxValue) * svgHeight;
          const rentalH = ((bar.rental || 0) / maxValue) * svgHeight;
          const totalH = receivedH + forecastH + rentalH;
          const isSelected = selectedBar === i;
          const dimmed = selectedBar !== null && !isSelected;

          return (
            <g key={i} style={{ opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.2s' }}>
              {/* Selection highlight */}
              {isSelected && (
                <rect x={x - 2} y={0} width={barWidth + 4} height={svgHeight + 20} rx={4} fill="var(--accent)" opacity={0.08} />
              )}
              {/* Rental portion (orange, on top) */}
              {rentalH > 0 && (
                <rect
                  x={x}
                  y={svgHeight - totalH}
                  width={barWidth}
                  height={rentalH}
                  rx={2}
                  fill={isSelected ? '#fb923c' : '#f97316'}
                  opacity={0.85}
                />
              )}
              {/* Forecast portion (lighter) */}
              {forecastH > 0 && (
                <rect
                  x={x}
                  y={svgHeight - (receivedH + forecastH)}
                  width={barWidth}
                  height={forecastH}
                  rx={rentalH > 0 ? 0 : 2}
                  fill={isSelected ? '#34d399' : '#30d158'}
                  opacity={0.3}
                />
              )}
              {/* Received portion (solid, bottom) */}
              {receivedH > 0 && (
                <rect
                  x={x}
                  y={svgHeight - receivedH}
                  width={barWidth}
                  height={receivedH}
                  rx={forecastH > 0 ? 0 : 2}
                  fill={isSelected ? '#34d399' : '#30d158'}
                  opacity={0.85}
                />
              )}
              {/* Amount label on top (only show for selected or if not too crowded) */}
              {bar.total > 0 && (isSelected || bars.length <= 6) && (
                <text
                  x={x + barWidth / 2}
                  y={svgHeight - totalH - 4}
                  textAnchor="middle"
                  fontSize={isSelected ? 9 : 7}
                  fill={isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}
                  fontWeight={isSelected ? 700 : 500}
                >
                  £{Math.round(bar.total).toLocaleString()}
                </text>
              )}
              {/* Month label */}
              <text
                x={x + barWidth / 2}
                y={svgHeight + 14}
                textAnchor="middle"
                fontSize={isSelected ? 9 : 8}
                fill={isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)'}
                fontWeight={isSelected ? 600 : 400}
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
    </div>
  );
}

function DividendSection({ dividends, properties = [] }: { dividends: DividendData; properties?: PropertyData[] }) {
  const [range, setRange] = useState<DividendRange>('year');
  const [showBreakdown, setShowBreakdown] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // Rental income calculations
  const totalRent = properties.reduce((s, p) => s + (p.rentalIncome || 0), 0);
  const totalMortgagePay = properties.reduce((s, p) => s + (p.mortgagePayment || 0), 0);
  const totalService = properties.reduce((s, p) => s + (p.serviceCharge || 0), 0);
  const netRental = totalRent - totalMortgagePay - totalService;

  // Filter payments for breakdown based on range
  let filteredPayments = dividends.payments;
  if (range === 'month') {
    filteredPayments = dividends.payments.filter(p => p.date === currentDateStr);
  } else if (range === 'year') {
    filteredPayments = dividends.payments.filter(p => p.year === currentYear);
  }

  // Combined totals (dividends + rental)
  const combinedMonthly = dividends.monthlyAverage + Math.round(netRental);
  const combinedAnnual = dividends.annualReceived + Math.round(netRental * 12);
  const combinedThisMonth = dividends.thisMonthReceived + Math.round(netRental);

  return (
    <div className="px-3.5 pb-3 fade-in">
      {/* Monthly income summary (dividends + rental combined) */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">This month (total)</div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--green)]">
              £{combinedThisMonth.toLocaleString()}
            </span>
            {dividends.thisMonthExpected > 0 && (
              <span className="text-[12px] text-[var(--text-tertiary)]">
                + £{dividends.thisMonthExpected.toFixed(0)} expected
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">Est. annual</div>
          <div className="text-[13px] font-medium text-[var(--text-primary)]">
            £{combinedAnnual.toLocaleString()}/yr
          </div>
          <div className="text-[10px] text-[var(--text-tertiary)]">
            ~£{combinedMonthly.toLocaleString()}/mo
          </div>
        </div>
      </div>

      {/* Breakdown: dividends vs rental */}
      <div className="space-y-0.5 mb-3 text-[10px]">
        <div className="flex items-center justify-between text-[var(--text-tertiary)]">
          <span>Dividends</span>
          <span>£{dividends.monthlyAverage.toLocaleString()}/mo</span>
        </div>
        {netRental !== 0 && (
          <div className="flex items-center justify-between text-[var(--text-tertiary)]">
            <span>Rental net (£{totalRent.toLocaleString()} - £{(totalMortgagePay + totalService).toLocaleString()} costs)</span>
            <span className={netRental >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
              {netRental >= 0 ? '+' : ''}£{netRental.toFixed(0)}/mo
            </span>
          </div>
        )}
      </div>

      {/* Range toggle */}
      <div className="flex gap-1 mb-3">
        {([['month', 'This Month'], ['year', 'Year'], ['all', 'All Time']] as [DividendRange, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
              range === key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <DividendChart dividends={dividends} range={range} rentalNet={netRental} />

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#30d158', opacity: 0.85 }} />
          <span className="text-[10px] text-[var(--text-tertiary)]">Received</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#30d158', opacity: 0.3 }} />
          <span className="text-[10px] text-[var(--text-tertiary)]">Forecast</span>
        </div>
      </div>

      {/* JEPQ target note */}
      <div className="p-2 rounded-lg bg-[var(--bg-elevated)] mb-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-[var(--orange)]">Target: {dividends.jepqTarget.name}</span>
            <span className="text-[10px] text-[var(--text-tertiary)] ml-2">
              {dividends.jepqTarget.yield}% yield, monthly
            </span>
          </div>
          <div className="text-right">
            <span className="text-[12px] font-medium text-[var(--orange)]">
              ~£{dividends.jepqTarget.monthlyIncome.toLocaleString()}/mo
            </span>
          </div>
        </div>
        <div className="text-[9px] text-[var(--text-tertiary)] mt-0.5">
          Deploying ~£{(dividends.jepqTarget.capital / 1000).toFixed(0)}k after property sales + stock consolidation
        </div>
      </div>

      {/* Expandable breakdown */}
      <div>
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${showBreakdown ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Payment breakdown ({filteredPayments.length} payments)
        </button>

        {showBreakdown && (
          <div className="mt-2 space-y-0.5 max-h-[300px] overflow-y-auto fade-in">
            {filteredPayments.map((p, i) => (
              <div key={`${p.date}-${p.source}-${i}`} className="flex items-center justify-between py-1 px-2 rounded hover:bg-[var(--bg-elevated)]">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    p.status === 'received' ? 'bg-[var(--green)]' : 'bg-[var(--green)]/30'
                  }`} />
                  <span className="text-[10px] text-[var(--text-tertiary)] w-[72px] flex-shrink-0">
                    {p.expectedDay ? `~${p.expectedDay}` : ''} {MONTH_LABELS[p.month - 1]} {String(p.year).slice(2)}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] truncate">{p.source}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-[11px] font-medium text-[var(--text-primary)]">£{p.amount.toFixed(2)}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    p.status === 'received'
                      ? 'bg-[var(--green)]/10 text-[var(--green)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)]'
                  }`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Finances({ startExpanded = false }: { startExpanded?: boolean }) {
  const [data, setData] = useState<FinancesData | null>(null);
  const [collapsed, setCollapsed] = useState(!startExpanded);
  const [expandedSection, setExpandedSection] = useState<Section | null>(null);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [investmentView, setInvestmentView] = useState<'today' | 'alltime'>('today');
  const [expandedShare, setExpandedShare] = useState<string | null>(null);
  const [valuations, setValuations] = useState<PropertyValuationData[]>([]);
  const [valuationsLoading, setValuationsLoading] = useState(false);

  const fetchValuations = useCallback(async () => {
    setValuationsLoading(true);
    try {
      const res = await fetch('/api/finances/property-valuations');
      if (res.ok) {
        const json = await res.json();
        setValuations(json.valuations || []);
      }
    } catch {
      // Silently fail; valuations are supplementary
    } finally {
      setValuationsLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/finances');
      if (res.ok) {
        const json: FinancesData = await res.json();
        setData(json);
        setLastUpdated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchValuations();
    const interval = setInterval(fetchData, 120000); // 2 minutes
    return () => clearInterval(interval);
  }, [fetchData, fetchValuations]);

  const toggleSection = (section: Section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const keepingProperties = data?.properties.filter((p) => p.type === 'keeping') ?? [];
  const sellingProperties = data?.properties.filter((p) => p.type === 'selling') ?? [];

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Finances
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              {formatGBP(data.totals.netWorth, true)} net worth
            </span>
          )}
          {!data && !error && (
            <span className="text-[13px] text-[var(--text-tertiary)]">Loading...</span>
          )}
          {error && !data && (
            <span className="text-[13px] text-[var(--text-tertiary)]">Error</span>
          )}
        </div>
      </div>

      {/* Collapsed: summary pills */}
      {collapsed && data && (
        <div className="flex flex-wrap gap-1.5 px-1 fade-in">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#3b82f6]" />
            <span className="text-[11px] text-[var(--text-secondary)]">Investments</span>
            <span className="text-[10px] font-medium text-[var(--text-primary)]">{formatGBP(data.totals.investments, true)}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#a855f7]" />
            <span className="text-[11px] text-[var(--text-secondary)]">Property</span>
            <span className="text-[10px] font-medium text-[var(--text-primary)]">{formatGBP(data.totals.propertyEquity, true)}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#22c55e]" />
            <span className="text-[11px] text-[var(--text-secondary)]">Cash</span>
            <span className="text-[10px] font-medium text-[var(--text-primary)]">{formatGBP(data.totals.cash, true)}</span>
          </div>
        </div>
      )}

      {/* Expanded view */}
      {!collapsed && data && (
        <div className="card overflow-hidden fade-in">
          {/* Last updated + forex */}
          <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-tertiary)]">
              Live prices updated {lastUpdated || '--'}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              1 USD = £{data.forexRate.toFixed(4)}
            </span>
          </div>

          {/* Net worth banner */}
          <div className="px-3.5 pb-3">
            <div className="text-center py-3 rounded-lg bg-[var(--bg-elevated)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">Total Net Worth</div>
              <div className="text-[24px] font-bold text-[var(--text-primary)]">{formatGBP(data.totals.netWorth)}</div>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className="w-4 border-t border-dashed border-[var(--orange)]" />
                <span className="text-[11px] text-[var(--orange)]">
                  {formatGBP(data.totals.netWorth + 540000)} inc. pending £540k
                </span>
              </div>
            </div>
          </div>

          {/* Net worth history chart */}
          <NetWorthChart />

          {/* Breakdown bar */}
          <div className="px-3.5 pb-3">
            <BreakdownBar
              data={[
                { label: 'Investments', value: data.totals.investments, color: '#3b82f6' },
                { label: 'Property Equity', value: data.totals.propertyEquity, color: '#a855f7' },
                { label: 'Cash', value: data.totals.cash, color: '#22c55e' },
                { label: 'Pokemon', value: data.totals.pokemon, color: '#f59e0b' },
              ]}
            />
          </div>

          <div className="divide-y divide-[var(--border-light)]">
            {/* INVESTMENTS SECTION */}
            <div>
              <div
                onClick={() => toggleSection('investments')}
                className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-6 rounded-full flex-shrink-0 bg-[#3b82f6]" />
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">Investments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">{formatGBP(data.totals.investments)}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expandedSection === 'investments' ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>

              {expandedSection === 'investments' && (
                <div className="px-3.5 pb-3 fade-in">
                  {/* Today / All Time toggle */}
                  <div className="flex gap-1 mb-3 ml-3">
                    <button
                      onClick={() => setInvestmentView('today')}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                        investmentView === 'today'
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setInvestmentView('alltime')}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                        investmentView === 'alltime'
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      All Time
                    </button>
                  </div>

                  {/* Stocks */}
                  <div className="mb-3">
                    <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 ml-3">
                      Stocks (live, updates every 2 min)
                    </h4>
                    <div className="space-y-1.5 ml-3">
                      {data.stocks.map((stock) => (
                        <div key={stock.symbol}>
                          <div
                            className="flex items-center justify-between py-1 cursor-pointer rounded-lg hover:bg-[var(--bg-card)] px-1 -mx-1 transition-colors"
                            onClick={() => setExpandedShare(expandedShare === stock.symbol ? null : stock.symbol)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-mono font-medium text-[var(--accent)]">{stock.symbol}</span>
                                <span className="text-[11px] text-[var(--text-secondary)] truncate">{stock.name}</span>
                                <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">{stock.account}</span>
                                <svg
                                  className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform duration-200 ${expandedShare === stock.symbol ? 'rotate-90' : ''}`}
                                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-[var(--text-tertiary)]">{stock.shares} shares</span>
                                {stock.livePriceGBP !== null && (
                                  <span className="text-[10px] text-[var(--text-tertiary)]">@ £{stock.livePriceGBP.toFixed(2)}</span>
                                )}
                                <span className="text-[10px] text-[var(--text-tertiary)]">cost £{stock.costBasis.toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                                {stock.currentValue !== null ? formatGBP(stock.currentValue) : '--'}
                              </div>
                              <div className="flex items-center gap-1 justify-end">
                                {investmentView === 'today' ? (
                                  <>
                                    <GainLossText value={stock.dailyChangeGBP ?? null} size="xs" />
                                    <PercentBadge value={stock.dailyChangePercent ?? null} />
                                  </>
                                ) : (
                                  <>
                                    <GainLossText value={stock.gainLoss} size="xs" />
                                    <PercentBadge value={stock.gainLossPercent} />
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          {expandedShare === stock.symbol && (
                            <ShareDetail
                              symbol={stock.symbol}
                              name={stock.name}
                              shares={stock.shares}
                              costBasis={stock.costBasis}
                              currentValue={stock.currentValue}
                              livePrice={stock.livePrice}
                              livePriceGBP={stock.livePriceGBP}
                              dailyChangeGBP={stock.dailyChangeGBP}
                              dailyChangePercent={stock.dailyChangePercent}
                              gainLoss={stock.gainLoss}
                              gainLossPercent={stock.gainLossPercent}
                              account={stock.account}
                              currency={stock.currency || 'USD'}
                              forexRate={data.forexRate}
                              onClose={() => setExpandedShare(null)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Funds */}
                  <div className="mb-3">
                    <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 ml-3">
                      Funds {data.funds.some(f => f.isLive) ? '(live prices)' : '(manual values)'}
                    </h4>
                    <div className="space-y-1.5 ml-3">
                      {data.funds.map((fund) => (
                        <div key={fund.id} className="flex items-center justify-between py-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">{fund.name}</span>
                              <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">{fund.account}</span>
                              {fund.isLive && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--green)]/10 text-[var(--green)]">LIVE</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[var(--text-tertiary)]">{fund.units.toLocaleString()} units</span>
                              {fund.liveUnitPrice !== null && (
                                <span className="text-[10px] text-[var(--text-tertiary)]">@ £{fund.liveUnitPrice.toFixed(4)}</span>
                              )}
                              <span className="text-[10px] text-[var(--text-tertiary)]">cost £{fund.costBasis.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <div className="text-[13px] font-medium text-[var(--text-primary)]">{formatGBP(fund.currentValue)}</div>
                            {investmentView === 'alltime' ? (
                              <div className="flex items-center gap-1 justify-end">
                                <GainLossText value={fund.gainLoss} size="xs" />
                                <PercentBadge value={fund.gainLossPercent} />
                              </div>
                            ) : (
                              <div className="text-[10px] text-[var(--text-tertiary)]">no daily data</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* E*Trade ICE Holdings */}
                  <div className="ml-3 space-y-1">
                    <div className="flex items-center justify-between py-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-[var(--text-primary)]">{data.etrade.name}</span>
                          {data.etrade.isLive && <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--green)] text-black font-bold">LIVE</span>}
                        </div>
                        <div className="flex gap-2 text-[10px] text-[var(--text-tertiary)]">
                          {data.etrade.livePriceGBP && <span>£{data.etrade.livePriceGBP.toFixed(2)}/share</span>}
                          <span>{data.etrade.vestedShares} vested</span>
                          <span>{data.etrade.unvestedShares} unvested</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-[13px] font-medium text-[var(--text-primary)]">{formatGBP(data.etrade.vestedValue)}</div>
                        {investmentView === 'today' && data.etrade.dailyChangeGBP !== null ? (
                          <div className="flex items-center gap-1 justify-end">
                            <GainLossText value={data.etrade.dailyChangeGBP} size="xs" />
                            <PercentBadge value={data.etrade.dailyChangePercent} />
                          </div>
                        ) : (
                          data.etrade.unvestedValue > 0 && (
                            <div className="text-[10px] text-[var(--text-tertiary)]">+{formatGBP(data.etrade.unvestedValue)} unvested</div>
                          )
                        )}
                      </div>
                    </div>
                    {data.cashInvestmentAccounts.map((c) => (
                      <div key={c.account} className="flex items-center justify-between py-1">
                        <span className="text-[12px] text-[var(--text-secondary)]">{c.account}</span>
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">{formatGBP(c.balance)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* DIVIDENDS & INCOME SECTION */}
            <div>
              <div
                onClick={() => toggleSection('dividends')}
                className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-6 rounded-full flex-shrink-0 bg-[#30d158]" />
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">Dividends &amp; Income</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">
                      ~£{(data.dividends.monthlyAverage + Math.round(
                        keepingProperties.reduce((s, p) => s + (p.rentalIncome || 0), 0) -
                        keepingProperties.reduce((s, p) => s + (p.mortgagePayment || 0), 0) -
                        keepingProperties.reduce((s, p) => s + (p.serviceCharge || 0), 0)
                      )).toLocaleString()}/mo
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expandedSection === 'dividends' ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>

              {expandedSection === 'dividends' && data.dividends && (
                <DividendSection dividends={data.dividends} properties={keepingProperties} />
              )}
            </div>

            {/* PROPERTIES SECTION */}
            <div>
              <div
                onClick={() => toggleSection('properties')}
                className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-6 rounded-full flex-shrink-0 bg-[#a855f7]" />
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">Properties</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">{formatGBP(data.totals.propertyEquity)}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expandedSection === 'properties' ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>

              {expandedSection === 'properties' && (
                <div className="px-3.5 pb-3 fade-in">
                  {/* Keeping */}
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 ml-3">
                    Keeping
                  </h4>
                  <div className="space-y-2 ml-3 mb-3">
                    {keepingProperties.map((p) => {
                      const equity = p.value - p.mortgage;
                      const ltv = p.mortgage > 0 ? (p.mortgage / p.value) * 100 : 0;
                      const valuation = valuations.find((v) => v.property_id === p.id);
                      return (
                        <div key={p.id} className="p-2 rounded-lg bg-[var(--bg-elevated)]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-medium text-[var(--text-primary)]">{p.name}</span>
                            <span className="text-[13px] font-medium text-[var(--text-primary)]">{formatGBP(equity)} equity</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-[var(--text-tertiary)]">Value: {formatGBP(p.value)}</span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">Mortgage: {formatGBP(p.mortgage)}</span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">LTV: {ltv.toFixed(0)}%</span>
                          </div>
                          {/* Zoopla estimate */}
                          {valuation && valuation.zoopla_estimate && (
                            <div className="mt-1.5 pt-1.5 border-t border-[var(--border-light)]">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-[var(--text-tertiary)]">Zoopla estimate</span>
                                <span className="text-[11px] font-medium text-[var(--accent)]">
                                  {formatGBP(valuation.zoopla_estimate)}
                                </span>
                              </div>
                              {valuation.zoopla_low && valuation.zoopla_high && (
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-[var(--text-tertiary)]">Range</span>
                                  <span className="text-[9px] text-[var(--text-tertiary)]">
                                    {formatGBP(valuation.zoopla_low)} - {formatGBP(valuation.zoopla_high)}
                                  </span>
                                </div>
                              )}
                              {valuation.fetched_at && (
                                <div className="text-[8px] text-[var(--text-tertiary)] mt-0.5">
                                  Zoopla estimate, updated {new Date(valuation.fetched_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Land Registry comparables */}
                          {valuation && valuation.land_registry_comparables.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-[var(--border-light)]">
                              <div className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                                Recent sales nearby
                              </div>
                              <div className="space-y-0.5">
                                {valuation.land_registry_comparables.slice(0, 5).map((comp, i) => (
                                  <div key={i} className="flex items-center justify-between">
                                    <span className="text-[9px] text-[var(--text-tertiary)] truncate max-w-[60%]">
                                      {comp.address}
                                    </span>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-[9px] text-[var(--text-tertiary)]">
                                        {new Date(comp.date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                                      </span>
                                      <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                                        {formatGBP(comp.price)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Loading state */}
                          {valuationsLoading && !valuation && (
                            <div className="mt-1.5 pt-1.5 border-t border-[var(--border-light)]">
                              <span className="text-[9px] text-[var(--text-tertiary)]">Loading estimates...</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Selling */}
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 ml-3">
                    Selling (net proceeds after mortgage)
                  </h4>
                  <div className="space-y-1 ml-3">
                    {sellingProperties.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-1">
                        <div>
                          <span className="text-[12px] text-[var(--text-secondary)]">{p.name}</span>
                          <span className="text-[9px] text-[var(--text-tertiary)] ml-1.5">
                            {formatGBP(p.value)} - {formatGBP(p.mortgage)} mtg
                          </span>
                        </div>
                        <span className="text-[13px] font-medium text-[var(--orange)]">{formatGBP(p.value - p.mortgage)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-1 border-t border-[var(--border-light)]">
                      <span className="text-[12px] font-medium text-[var(--text-secondary)]">Total net proceeds</span>
                      <span className="text-[13px] font-medium text-[var(--orange)]">
                        {formatGBP(sellingProperties.reduce((s, p) => s + (p.value - p.mortgage), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CASH SECTION */}
            <div>
              <div
                onClick={() => toggleSection('cash')}
                className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-6 rounded-full flex-shrink-0 bg-[#22c55e]" />
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">Cash</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">{formatGBP(data.totals.cash)}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expandedSection === 'cash' ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>

              {expandedSection === 'cash' && (
                <div className="px-3.5 pb-3 fade-in ml-3">
                  <div className="space-y-1">
                    {data.cash.map((c) => (
                      <div key={c.account} className="flex items-center justify-between py-1">
                        <span className="text-[12px] text-[var(--text-secondary)]">{c.account}</span>
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">{formatGBP(c.balance)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Upcoming money */}
                  <div className="mt-3 pt-3 border-t border-[var(--border-light)]">
                    <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                      Upcoming (£{(40000 + 100000 + 300000 + 100000).toLocaleString()})
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { source: 'Sister (loan repayment)', amount: 40000, status: 'confirmed' },
                        { source: 'Mum (probate)', amount: 100000, status: 'expected' },
                        { source: 'House sale (my share)', amount: 300000, status: 'pending' },
                        { source: 'Sister (from house sale)', amount: 100000, status: 'pending' },
                      ].map((item) => (
                        <div key={item.source} className="flex items-center justify-between py-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              item.status === 'confirmed' ? 'bg-[var(--green)]' :
                              item.status === 'expected' ? 'bg-[var(--orange)]' : 'bg-[var(--text-tertiary)]'
                            }`} />
                            <span className="text-[11px] text-[var(--text-secondary)]">{item.source}</span>
                          </div>
                          <span className="text-[12px] font-medium text-[var(--text-primary)]">{formatGBP(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-2 text-[9px] text-[var(--text-tertiary)]">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />Confirmed</span>
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--orange)]" />Expected</span>
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />Pending</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CRYPTO SECTION */}
          <div>
            <div
              onClick={() => toggleSection('crypto' as Section)}
              className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-6 rounded-full flex-shrink-0 bg-[#f7931a]" />
                  <span className="text-[14px] font-medium text-[var(--text-primary)]">Crypto</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text-tertiary)]">TBC</span>
                  <svg
                    className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expandedSection === ('crypto' as Section) ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            {expandedSection === ('crypto' as Section) && (
              <div className="px-3.5 pb-3 fade-in ml-3">
                <p className="text-[12px] text-[var(--text-tertiary)]">
                  Holdings on OKX. To be confirmed.
                </p>
              </div>
            )}
          </div>

          {/* POKEMON SECTION */}
          {data.pokemon && data.pokemon.cards.length > 0 && (
            <div>
              <div
                onClick={() => toggleSection('pokemon')}
                className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-6 rounded-full flex-shrink-0 bg-[#f59e0b]" />
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">Pokemon Cards</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">{formatGBP(data.pokemon.totalGBP)}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${expandedSection === 'pokemon' ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>

              {expandedSection === 'pokemon' && (
                <div className="px-3.5 pb-3 fade-in ml-3">
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-2">
                    ${data.pokemon.totalUSD.toLocaleString()} USD | Cost: ${data.pokemon.costUSD.toLocaleString()} | P&L: ${(data.pokemon.totalUSD - data.pokemon.costUSD).toLocaleString()}
                  </div>
                  <div className="space-y-1">
                    {data.pokemon.cards.map((card) => (
                      <div key={card.id} className="flex items-center justify-between py-1">
                        <div>
                          <span className="text-[12px] text-[var(--text-secondary)]">{card.name} {card.number}</span>
                          <span className="text-[10px] text-[var(--text-tertiary)] ml-1.5">{card.grade}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[12px] font-medium text-[var(--text-primary)]">${card.value.toLocaleString()}</span>
                          {card.cost > 0 && (
                            <span className={`text-[10px] ml-1.5 ${card.value > card.cost ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                              {card.value > card.cost ? '+' : ''}{Math.round(((card.value - card.cost) / card.cost) * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {!collapsed && error && !data && (
        <div className="card px-3.5 py-3 fade-in">
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Could not load financial data. Check the API route.
          </p>
        </div>
      )}
    </div>
  );
}
