'use client';

import { useState, useEffect } from 'react';

interface MmsStats {
  totalAssessments: number;
  totalLeads: number;
  totalClicks: number;
  totalSearches: number;
  clicksBySource: Record<string, number>;
  popularMatches: Array<{ title: string; count: number }>;
}

export default function MatchMySkillsetStats() {
  const [stats, setStats] = useState<MmsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('https://matchmyskillset.vercel.app/api/admin')
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🎯</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">MatchMySkillset</span>
        </div>
        <div className="text-xs text-[var(--text-secondary)]">Loading...</div>
      </div>
    );
  }

  if (!stats) return null;

  const totalClicksAllSources = Object.values(stats.clicksBySource || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-[var(--bg-secondary)] rounded-2xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">MatchMySkillset</span>
          <a
            href="https://matchmyskillset.com/employers"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-indigo-400 hover:text-indigo-300"
          >
            Admin
          </a>
        </div>
        <svg
          className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Summary row - always visible */}
      <div className="grid grid-cols-4 gap-2 mt-3">
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="text-lg font-bold text-indigo-400">{stats.totalLeads}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">CVs Loaded</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="text-lg font-bold text-green-400">{stats.totalAssessments}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">Assessments</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="text-lg font-bold text-amber-400">{totalClicksAllSources}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">Job Clicks</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="text-lg font-bold text-purple-400">{stats.totalSearches}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">Searches</div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Click sources */}
          {Object.keys(stats.clicksBySource || {}).length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Click Sources</div>
              <div className="space-y-1">
                {Object.entries(stats.clicksBySource).map(([source, count]) => {
                  const max = Math.max(...Object.values(stats.clicksBySource));
                  return (
                    <div key={source} className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--text-secondary)] w-16 capitalize">{source}</span>
                      <div className="flex-1 h-1.5 bg-[var(--bg-primary)] rounded-full">
                        <div
                          className="h-1.5 bg-indigo-500 rounded-full"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[var(--text-primary)] w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Popular matches */}
          {stats.popularMatches.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Popular Career Matches</div>
              <div className="space-y-1">
                {stats.popularMatches.slice(0, 5).map((m) => (
                  <div key={m.title} className="flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-secondary)]">{m.title}</span>
                    <span className="text-[11px] font-medium text-indigo-400">{m.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
