'use client';

import { useState, useEffect, useCallback } from 'react';

interface StockData {
  symbol: string;
  name: string;
  shares: number;
  costBasis: number;
  account: string;
  livePrice: number | null;
  livePriceGBP: number | null;
  currentValue: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
}

interface FundData {
  id: string;
  name: string;
  currentValue: number;
  costBasis: number;
  account: string;
  gainLoss: number;
  gainLossPercent: number;
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
}

interface FinancesData {
  stocks: StockData[];
  funds: FundData[];
  cashInvestmentAccounts: CashAccount[];
  etradeValue: number;
  properties: PropertyData[];
  cash: CashAccount[];
  forexRate: number;
  totals: {
    stocks: number;
    funds: number;
    investmentCash: number;
    etrade: number;
    investments: number;
    propertyEquity: number;
    cash: number;
    netWorth: number;
  };
  timestamp: string;
}

type Section = 'investments' | 'properties' | 'cash' | 'breakdown';

function formatGBP(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1000) {
    return '£' + (amount / 1000).toFixed(amount >= 10000 ? 0 : 1) + 'k';
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

export default function Finances() {
  const [data, setData] = useState<FinancesData | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [expandedSection, setExpandedSection] = useState<Section | null>(null);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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
    const interval = setInterval(fetchData, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [fetchData]);

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
            </div>
          </div>

          {/* Breakdown bar */}
          <div className="px-3.5 pb-3">
            <BreakdownBar
              data={[
                { label: 'Investments', value: data.totals.investments, color: '#3b82f6' },
                { label: 'Property Equity', value: data.totals.propertyEquity, color: '#a855f7' },
                { label: 'Cash', value: data.totals.cash, color: '#22c55e' },
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
                  {/* Stocks */}
                  <div className="mb-3">
                    <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 ml-3">
                      Stocks (live prices)
                    </h4>
                    <div className="space-y-1.5 ml-3">
                      {data.stocks.map((stock) => (
                        <div key={stock.symbol} className="flex items-center justify-between py-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-mono font-medium text-[var(--accent)]">{stock.symbol}</span>
                              <span className="text-[11px] text-[var(--text-secondary)] truncate">{stock.name}</span>
                              <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">{stock.account}</span>
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
                              <GainLossText value={stock.gainLoss} size="xs" />
                              <PercentBadge value={stock.gainLossPercent} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Funds */}
                  <div className="mb-3">
                    <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 ml-3">
                      Funds (manual values)
                    </h4>
                    <div className="space-y-1.5 ml-3">
                      {data.funds.map((fund) => (
                        <div key={fund.id} className="flex items-center justify-between py-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">{fund.name}</span>
                              <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">{fund.account}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[var(--text-tertiary)]">cost £{fund.costBasis.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <div className="text-[13px] font-medium text-[var(--text-primary)]">{formatGBP(fund.currentValue)}</div>
                            <div className="flex items-center gap-1 justify-end">
                              <GainLossText value={fund.gainLoss} size="xs" />
                              <PercentBadge value={fund.gainLossPercent} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* E*Trade + Investment Cash */}
                  <div className="ml-3 space-y-1">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-[12px] text-[var(--text-secondary)]">E*Trade RSUs</span>
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{formatGBP(data.etradeValue)}</span>
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
                        </div>
                      );
                    })}
                  </div>

                  {/* Selling */}
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 ml-3">
                    Selling (net proceeds)
                  </h4>
                  <div className="space-y-1 ml-3">
                    {sellingProperties.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-1">
                        <span className="text-[12px] text-[var(--text-secondary)]">{p.name}</span>
                        <span className="text-[13px] font-medium text-[var(--orange)]">{formatGBP(p.value)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-1 border-t border-[var(--border-light)]">
                      <span className="text-[12px] font-medium text-[var(--text-secondary)]">Total pending sales</span>
                      <span className="text-[13px] font-medium text-[var(--orange)]">
                        {formatGBP(sellingProperties.reduce((s, p) => s + p.value, 0))}
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
                </div>
              )}
            </div>
          </div>
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
