'use client';

import { useState, useEffect } from 'react';

interface DownloadData {
  today: number;
  week: number;
  month: number;
  total: number;
  sites: Record<string, { today: number; week: number; month: number; total: number }>;
  topPages: Array<{ page: string; count: number }>;
  recent: Array<{
    site: string;
    time: string;
    from: string;
    city: string | null;
    country: string | null;
    device: string | null;
  }>;
}

const SITE_COLORS: Record<string, string> = {
  helpafterloss: '#EC4899',
  helpafterlife: '#D946EF',
};

const SITE_NAMES: Record<string, string> = {
  helpafterloss: 'HelpAfterLoss',
  helpafterlife: 'HelpAfterLife',
};

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export default function ChecklistDownloads() {
  const [data, setData] = useState<DownloadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/checklist-downloads')
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">&#9745;</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Checklist Downloads</span>
        </div>
        <div className="text-xs text-[var(--text-secondary)] mt-2">Loading...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-[var(--bg-secondary)] rounded-2xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">&#9745;</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Checklist Downloads</span>
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

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mt-3">
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="font-bold text-pink-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">{data.today}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">Today</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="font-bold text-pink-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">{data.week}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">This Week</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="font-bold text-pink-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">{data.month}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">This Month</div>
        </div>
        <div className="bg-[var(--bg-primary)] rounded-xl p-2.5 text-center">
          <div className="font-bold text-pink-400 whitespace-nowrap text-[clamp(0.7rem,3.2vw,1.125rem)]">{data.total}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">All Time</div>
        </div>
      </div>

      {/* Per-site pills */}
      <div className="flex gap-2 mt-2">
        {Object.entries(data.sites).map(([siteId, stats]) => (
          <div
            key={siteId}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
            style={{ backgroundColor: `${SITE_COLORS[siteId]}20`, color: SITE_COLORS[siteId] }}
          >
            <span className="font-medium">{SITE_NAMES[siteId]}</span>
            <span className="font-bold">{stats.total}</span>
          </div>
        ))}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-3 fade-in">
          {/* Top source pages */}
          {data.topPages.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Top Source Pages</div>
              <div className="space-y-1">
                {data.topPages.map((p) => {
                  const max = data.topPages[0].count;
                  return (
                    <div key={p.page} className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--text-secondary)] w-40 truncate">{p.page}</span>
                      <div className="flex-1 h-1.5 bg-[var(--bg-primary)] rounded-full">
                        <div
                          className="h-1.5 bg-pink-500 rounded-full"
                          style={{ width: `${(p.count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[var(--text-primary)] w-6 text-right">{p.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent downloads */}
          {data.recent.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Recent Downloads</div>
              <div className="space-y-1">
                {data.recent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: SITE_COLORS[r.site] }}
                      />
                      <span className="text-[var(--text-secondary)]">{SITE_NAMES[r.site]}</span>
                      <span className="text-[var(--text-tertiary)]">{r.from}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.city && (
                        <span className="text-[var(--text-tertiary)]">{r.city}</span>
                      )}
                      <span className="text-[var(--text-tertiary)]">{timeAgo(r.time)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.total === 0 && (
            <div className="text-[11px] text-[var(--text-tertiary)] text-center py-2">
              No downloads yet. Banners are live, waiting for first clicks.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
