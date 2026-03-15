'use client';

import { useState, useEffect } from 'react';

interface PlacedBet {
  id: string;
  selectionName: string;
  marketName: string;
  type: 'back' | 'lay';
  stake: number;
  liability: number;
  potentialProfit: number;
  price: number;
  odds: number;
  aiProbability: number;
  marketProbability: number;
  placedAt: string;
  status: 'active' | 'won' | 'lost';
  pnl?: number;
}

interface BetsResponse {
  bets: PlacedBet[];
  summary: {
    active: number;
    resolved: number;
    totalPnl: number;
    totalRisk: number;
    totalPotential: number;
  };
}

export default function BetPositions() {
  const [data, setData] = useState<BetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchBets() {
      try {
        const res = await fetch('https://aibetfinder.com/api/bets');
        if (res.ok) {
          setData(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
      setLoading(false);
    }
    fetchBets();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Betting Positions
          </h2>
          <span className="text-[13px] text-[var(--text-tertiary)]">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !data || data.bets.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Betting Positions
          </h2>
          <span className="text-[13px] text-[var(--text-tertiary)]">
            {error ? 'Unavailable' : 'No bets'}
          </span>
        </div>
      </div>
    );
  }

  const { bets, summary } = data;
  const activeBets = bets.filter(b => b.status === 'active');
  const resolvedBets = bets.filter(b => b.status !== 'active');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Betting Positions
        </h2>
        <div className="flex items-center gap-3">
          {summary.totalPnl !== 0 && (
            <span className={`text-[13px] font-medium ${summary.totalPnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              P/L: {summary.totalPnl >= 0 ? '+' : ''}{summary.totalPnl.toFixed(2)}
            </span>
          )}
          <span className="text-[13px] font-medium text-white">
            {summary.active} active
          </span>
        </div>
      </div>

      {/* Summary bar */}
      <div className="card p-3.5" style={{ borderLeft: '3px solid #F43F5E' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[14px] font-semibold text-white">AI Bet Finder</span>
          <a
            href="https://aibetfinder.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[var(--accent)]"
          >
            Open
          </a>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-tertiary)]">At risk</span>
            <span className="text-[13px] font-medium text-[var(--yellow)]">
              {summary.totalRisk.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-tertiary)]">Potential</span>
            <span className="text-[13px] font-medium text-[var(--green)]">
              +{summary.totalPotential.toFixed(2)}
            </span>
          </div>
          {resolvedBets.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-tertiary)]">Realised P/L</span>
              <span className={`text-[13px] font-medium ${summary.totalPnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                {summary.totalPnl >= 0 ? '+' : ''}{summary.totalPnl.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Individual bets */}
      <div className="space-y-2">
        {activeBets.map(bet => (
          <BetCard key={bet.id} bet={bet} />
        ))}
        {resolvedBets.map(bet => (
          <BetCard key={bet.id} bet={bet} />
        ))}
      </div>
    </div>
  );
}

function BetCard({ bet }: { bet: PlacedBet }) {
  const isLay = bet.type === 'lay';
  const edge = Math.round(Math.abs(bet.aiProbability - bet.marketProbability) * 100);
  const isResolved = bet.status !== 'active';

  return (
    <div className={`card p-3 ${isResolved ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isLay
              ? 'bg-red-500/20 text-red-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {isLay ? 'SELL' : 'BUY'}
          </span>
          <span className="text-[13px] font-semibold text-white">{bet.selectionName}</span>
        </div>
        {isResolved && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            bet.status === 'won'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {bet.status === 'won' ? 'WON' : 'LOST'}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[var(--text-tertiary)] mb-2 truncate">
        {bet.marketName}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {isLay ? 'Risk' : 'Stake'}: <span className="text-white">{bet.liability.toFixed(2)}</span>
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Profit: <span className="text-[var(--green)]">+{bet.potentialProfit.toFixed(2)}</span>
          </span>
        </div>
        <span className="text-[11px] font-medium text-[var(--accent)]">
          {edge}pp edge
        </span>
      </div>
      {isResolved && bet.pnl !== undefined && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--border-light)]">
          <span className={`text-[12px] font-medium ${(bet.pnl || 0) >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {(bet.pnl || 0) >= 0 ? '+' : ''}{bet.pnl?.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
