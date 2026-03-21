'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

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

interface TimelineEvent {
  type: string;
  minute: number;
  side: string;
  player?: string;
}

interface LiveScore {
  eventId: string;
  matchName: string;
  competition: string;
  kickoff: string;
  state: 'upcoming' | 'live' | 'ended';
  score: [number, number] | null;
  matchMinute: string | null;
  period: string | null;
  stats: {
    home: { shots_on_target?: number; corners?: number; red_cards?: number; yellow_cards?: number };
    away: { shots_on_target?: number; corners?: number; red_cards?: number; yellow_cards?: number };
    timeline: TimelineEvent[];
  } | null;
  linkedBetIds: string[];
}

type BetOutlook = 'winning' | 'losing' | 'draw' | 'pending';

function getBetOutlook(bet: PlacedBet, liveScores: LiveScore[]): { outlook: BetOutlook; score: LiveScore | null; projectedPnl: number } {
  // Find matching live score
  const score = liveScores.find(s => s.linkedBetIds.includes(bet.id));

  if (!score || score.state === 'upcoming' || !score.score) {
    return { outlook: 'pending', score: score || null, projectedPnl: 0 };
  }

  const [homeGoals, awayGoals] = score.score;
  const mn = bet.marketName.toLowerCase();
  const isLay = bet.type === 'lay';

  // Extract team names from match
  const teams = score.matchName.split(' vs ').map(t => t.trim());
  const homeName = teams[0] || '';
  const awayName = teams[1] || '';

  // Determine if the selection is home or away
  const selLower = bet.selectionName.toLowerCase();
  const isHome = homeName.toLowerCase().includes(selLower) || selLower.includes(homeName.toLowerCase());
  const isAway = awayName.toLowerCase().includes(selLower) || selLower.includes(awayName.toLowerCase());

  let betWinning = false;
  let betLosing = false;
  let isDraw = false;

  if (mn.includes('full-time result') || mn.includes('draw no bet')) {
    if (isHome) {
      betWinning = homeGoals > awayGoals;
      betLosing = homeGoals < awayGoals;
      isDraw = homeGoals === awayGoals;
    } else if (isAway) {
      betWinning = awayGoals > homeGoals;
      betLosing = awayGoals < homeGoals;
      isDraw = homeGoals === awayGoals;
    }
  } else if (mn.includes('over/under 2.5') || mn.includes('over/under')) {
    const totalGoals = homeGoals + awayGoals;
    const isOver = selLower.includes('over');
    const isUnder = selLower.includes('under');
    if (isOver) {
      betWinning = totalGoals > 2;
      betLosing = totalGoals <= 2; // Could still change
      // If 2 goals and match ongoing, it's close
      if (totalGoals === 2 && score.state === 'live') { betLosing = false; isDraw = true; }
    } else if (isUnder) {
      betWinning = totalGoals < 3 && score.state !== 'live';
      betLosing = totalGoals > 2;
      if (totalGoals <= 2 && score.state === 'live') { betWinning = false; isDraw = true; }
    }
  } else if (mn.includes('both teams to score')) {
    const bttsYes = selLower.includes('yes') || selLower === 'btts yes';
    if (bttsYes) {
      betWinning = homeGoals > 0 && awayGoals > 0;
      betLosing = score.state !== 'live' && (homeGoals === 0 || awayGoals === 0);
      if (!betWinning && score.state === 'live') isDraw = true;
    } else {
      betWinning = score.state !== 'live' && (homeGoals === 0 || awayGoals === 0);
      betLosing = homeGoals > 0 && awayGoals > 0;
      if (!betLosing && score.state === 'live') isDraw = true;
    }
  }

  // For lay bets, invert the outcome
  if (isLay) {
    const tmp = betWinning;
    betWinning = betLosing;
    betLosing = tmp;
  }

  const outlook: BetOutlook = betWinning ? 'winning' : betLosing ? 'losing' : isDraw ? 'draw' : 'pending';
  const projectedPnl = betWinning ? bet.potentialProfit : betLosing ? -bet.liability : 0;

  return { outlook, score, projectedPnl };
}

export default function BetPositions() {
  const [data, setData] = useState<BetsResponse | null>(null);
  const [liveScores, setLiveScores] = useState<LiveScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

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

  const fetchLiveScores = useCallback(async () => {
    try {
      const res = await fetch('https://aibetfinder.com/api/live-scores');
      if (res.ok) {
        const json = await res.json();
        setLiveScores(json.scores || []);
      }
    } catch {
      // Live scores unavailable
    }
  }, []);

  // Fetch live scores on mount and refresh every 60s (always, not just when expanded)
  useEffect(() => {
    fetchLiveScores();
    const interval = setInterval(fetchLiveScores, 60000);
    return () => clearInterval(interval);
  }, [fetchLiveScores]);

  // Refresh faster when expanded (every 30s)
  useEffect(() => {
    if (collapsed) return;
    const interval = setInterval(fetchLiveScores, 30000);
    return () => clearInterval(interval);
  }, [collapsed, fetchLiveScores]);

  const syncFromSmarkets = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('https://aibetfinder.com/api/sync-positions');
      const json = await res.json();
      if (res.ok) {
        setSyncMsg(json.message);
        const betsRes = await fetch('https://aibetfinder.com/api/bets');
        if (betsRes.ok) setData(await betsRes.json());
      } else {
        setSyncMsg(json.error || 'Sync failed');
      }
    } catch {
      setSyncMsg('Could not reach Smarkets sync');
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(null), 5000);
  };

  // Compute active bet outlooks
  const activeBets = useMemo(() => data?.bets.filter(b => b.status === 'active') || [], [data]);
  const betOutlooks = useMemo(() =>
    activeBets.map(bet => ({ bet, ...getBetOutlook(bet, liveScores) })),
    [activeBets, liveScores]
  );

  const hasLive = liveScores.some(s => s.state === 'live');
  const projectedPnl = betOutlooks.reduce((sum, b) => sum + b.projectedPnl, 0);
  const totalPnlWithProjected = (data?.summary.totalPnl ?? 0) + projectedPnl;

  // Extract short match name from marketName (e.g. "Scottish Premiership: Kilmarnock vs Livingston - Full-time result" -> "Kilmarnock vs Livingston")
  function shortMatch(marketName: string): string {
    const match = marketName.match(/:\s*(.+?)\s*-/);
    return match ? match[1].trim() : marketName;
  }

  function outlookColor(outlook: BetOutlook): string {
    switch (outlook) {
      case 'winning': return 'text-[var(--green)]';
      case 'losing': return 'text-[var(--red)]';
      case 'draw': return 'text-[var(--yellow)]';
      default: return 'text-[var(--text-tertiary)]';
    }
  }

  function outlookLabel(outlook: BetOutlook): string {
    switch (outlook) {
      case 'winning': return 'W';
      case 'losing': return 'L';
      case 'draw': return 'D';
      default: return '-';
    }
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Betting
          </h2>
          {hasLive && (
            <span className="w-2 h-2 rounded-full bg-[var(--red)] animate-pulse" title="Live matches" />
          )}
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        {loading ? (
          <span className="text-[13px] text-[var(--text-tertiary)]">Loading...</span>
        ) : error || !data || data.bets.length === 0 ? (
          <span className="text-[13px] text-[var(--text-tertiary)]">{error ? 'Unavailable' : 'No bets'}</span>
        ) : (
          <div className="flex items-center gap-3">
            <span className={`text-[13px] font-medium ${totalPnlWithProjected >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {totalPnlWithProjected >= 0 ? '+' : ''}{totalPnlWithProjected.toFixed(2)}
            </span>
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              {activeBets.length} active
            </span>
          </div>
        )}
      </div>

      {/* Collapsed: show active bet summaries */}
      {collapsed && data && activeBets.length > 0 && (
        <div className="card overflow-hidden divide-y divide-[var(--border-light)] fade-in">
          {betOutlooks.map(({ bet, outlook, score, projectedPnl: pnl }) => (
            <div key={bet.id} className="px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[11px] font-bold w-4 ${outlookColor(outlook)}`}>
                  {outlookLabel(outlook)}
                </span>
                <span className="text-[12px] text-[var(--text-primary)] truncate">
                  {bet.selectionName}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] truncate hidden sm:inline">
                  {shortMatch(bet.marketName)}
                </span>
                {score?.state === 'live' && score.score && (
                  <span className="text-[10px] font-medium text-[var(--text-secondary)] tabular-nums">
                    ({score.score[0]}-{score.score[1]})
                  </span>
                )}
              </div>
              <span className={`text-[11px] font-medium shrink-0 ml-2 tabular-nums ${pnl > 0 ? 'text-[var(--green)]' : pnl < 0 ? 'text-[var(--red)]' : 'text-[var(--text-tertiary)]'}`}>
                {pnl > 0 ? '+' : ''}{pnl !== 0 ? `£${pnl.toFixed(2)}` : `£${bet.stake.toFixed(2)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded view */}
      {!collapsed && data && data.bets.length > 0 && (
        <div className="space-y-2 fade-in">
          {/* Summary */}
          <div className="card p-3" style={{ borderLeft: '3px solid #F43F5E' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">AI Bet Finder</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); syncFromSmarkets(); }}
                  disabled={syncing}
                  className="text-[11px] text-[var(--accent)] hover:underline cursor-pointer disabled:opacity-50"
                >
                  {syncing ? 'Syncing...' : 'Sync'}
                </button>
                <a href="https://aibetfinder.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)]">Open</a>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] block">At risk</span>
                <span className="text-[13px] font-medium text-[var(--yellow)]">£{data.summary.totalRisk.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-tertiary)] block">Potential</span>
                <span className="text-[13px] font-medium text-[var(--green)]">+£{data.summary.totalPotential.toFixed(2)}</span>
              </div>
              {data.bets.some(b => b.status !== 'active') && (
                <div>
                  <span className="text-[10px] text-[var(--text-tertiary)] block">Realised</span>
                  <span className={`text-[13px] font-medium ${data.summary.totalPnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {data.summary.totalPnl >= 0 ? '+' : ''}£{data.summary.totalPnl.toFixed(2)}
                  </span>
                </div>
              )}
              {projectedPnl !== 0 && (
                <div>
                  <span className="text-[10px] text-[var(--text-tertiary)] block">Projected</span>
                  <span className={`text-[13px] font-medium ${projectedPnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {projectedPnl >= 0 ? '+' : ''}£{projectedPnl.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sync message */}
          {syncMsg && (
            <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] text-[11px] text-[var(--text-secondary)]">
              {syncMsg}
            </div>
          )}

          {/* Live Scores */}
          {liveScores.length > 0 && (
            <div className="space-y-1.5">
              {liveScores.map(score => (
                <LiveScoreCard key={score.eventId} score={score} />
              ))}
            </div>
          )}

          {/* Active Bets */}
          {activeBets
            .filter(b => !liveScores.some(s => s.linkedBetIds.includes(b.id) && s.state === 'live'))
            .map(bet => <BetCard key={bet.id} bet={bet} />)
          }

          {/* Settled Bets Summary */}
          {data.bets.some(b => b.status !== 'active') && (
            <SettledSummary bets={data.bets.filter(b => b.status !== 'active')} />
          )}
        </div>
      )}
    </div>
  );
}

function LiveScoreCard({ score }: { score: LiveScore }) {
  const teams = score.matchName.split(' vs ').map(t => t.trim());
  const home = teams[0] || score.matchName;
  const away = teams[1] || '';
  const isLive = score.state === 'live';

  const formatPeriod = (period: string | null) => {
    if (!period) return '';
    switch (period) {
      case 'first_half': return '1st Half';
      case 'second_half': return '2nd Half';
      case 'half_time': return 'Half Time';
      case 'full_time': return 'Full Time';
      default: return period.replace(/_/g, ' ');
    }
  };

  const formatKickoff = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="card p-3" style={{ borderLeft: `3px solid ${isLive ? 'var(--green)' : 'var(--text-tertiary)'}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{score.competition}</span>
        {isLive ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-[10px] font-bold text-[var(--green)] uppercase">
              {score.matchMinute ? `${score.matchMinute}` : formatPeriod(score.period)}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {formatKickoff(score.kickoff)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{home}</span>
            <span className="text-[18px] font-bold text-[var(--text-primary)] tabular-nums">
              {score.score ? score.score[0] : '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{away}</span>
            <span className="text-[18px] font-bold text-[var(--text-primary)] tabular-nums">
              {score.score ? score.score[1] : '-'}
            </span>
          </div>
        </div>
      </div>
      {score.stats && isLive && (
        <div className="mt-2 pt-2 border-t border-[var(--border-light)]">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
            <div className="flex items-center gap-3">
              {(score.stats.home.shots_on_target != null || score.stats.away.shots_on_target != null) && (
                <span>Shots: {score.stats.home.shots_on_target ?? 0} - {score.stats.away.shots_on_target ?? 0}</span>
              )}
              {(score.stats.home.corners != null || score.stats.away.corners != null) && (
                <span>Corners: {score.stats.home.corners ?? 0} - {score.stats.away.corners ?? 0}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {((score.stats.home.red_cards ?? 0) > 0 || (score.stats.away.red_cards ?? 0) > 0) && (
                <span className="text-[var(--red)] font-bold">
                  Red: {score.stats.home.red_cards ?? 0} - {score.stats.away.red_cards ?? 0}
                </span>
              )}
            </div>
          </div>
          {score.stats.timeline.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {score.stats.timeline.slice(-5).map((evt, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-[var(--text-tertiary)] tabular-nums w-5">{evt.minute}&apos;</span>
                  <span>
                    {evt.type === 'goal' && <span className="text-[var(--green)]">Goal</span>}
                    {evt.type === 'red_card' && <span className="text-[var(--red)]">Red Card</span>}
                    {evt.type === 'yellow_card' && <span className="text-[var(--yellow)]">Yellow</span>}
                    {evt.type === 'penalty' && <span className="text-[var(--accent)]">Penalty</span>}
                    {!['goal', 'red_card', 'yellow_card', 'penalty'].includes(evt.type) && (
                      <span className="text-[var(--text-tertiary)]">{evt.type}</span>
                    )}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {evt.player || evt.side}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BetCard({ bet }: { bet: PlacedBet }) {
  const isLay = bet.type === 'lay';
  const edge = Math.round(Math.abs(bet.aiProbability - bet.marketProbability) * 100);

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLay ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
            {isLay ? 'SELL' : 'BUY'}
          </span>
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{bet.selectionName}</span>
        </div>
      </div>
      <div className="text-[11px] text-[var(--text-tertiary)] mb-1.5 truncate">{bet.marketName}</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {isLay ? 'Risk' : 'Stake'}: <span className="text-[var(--text-primary)]">£{bet.liability.toFixed(2)}</span>
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Profit: <span className="text-[var(--green)]">+£{bet.potentialProfit.toFixed(2)}</span>
          </span>
        </div>
        <span className="text-[11px] font-medium text-[var(--accent)]">{edge}pp edge</span>
      </div>
    </div>
  );
}

function SettledSummary({ bets }: { bets: PlacedBet[] }) {
  const [expanded, setExpanded] = useState(false);
  const wins = bets.filter(b => b.status === 'won').length;
  const losses = bets.filter(b => b.status === 'lost').length;
  const totalStaked = bets.reduce((sum, b) => sum + (b.type === 'lay' ? b.liability : b.stake), 0);
  const totalPnl = bets.reduce((sum, b) => sum + (b.pnl || 0), 0);

  return (
    <div className="card p-3 opacity-70">
      <div
        className="flex items-center justify-between cursor-pointer active:opacity-70"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--text-secondary)]">
            Settled ({bets.length})
          </span>
          <span className="text-[11px] text-green-400">{wins}W</span>
          <span className="text-[11px] text-red-400">{losses}L</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Staked: <span className="text-[var(--text-primary)]">£{totalStaked.toFixed(2)}</span>
          </span>
          <span className={`text-[12px] font-medium ${totalPnl >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {totalPnl >= 0 ? '+' : ''}£{totalPnl.toFixed(2)}
          </span>
          <svg
            className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-[var(--border-light)] space-y-1.5">
          {bets.map(bet => (
            <div key={bet.id} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`font-bold ${bet.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                  {bet.status === 'won' ? 'W' : 'L'}
                </span>
                <span className="text-[var(--text-primary)] truncate">{bet.selectionName}</span>
                <span className="text-[var(--text-tertiary)] truncate hidden sm:inline">{bet.marketName}</span>
              </div>
              <span className={`font-medium shrink-0 ml-2 ${(bet.pnl || 0) >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                {(bet.pnl || 0) >= 0 ? '+' : ''}£{bet.pnl?.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
