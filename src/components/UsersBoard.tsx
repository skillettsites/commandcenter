'use client';

import { useEffect, useState } from 'react';
import { projects } from '@/lib/projects';
import { Module, AreaChart, BarList, fmtNum, timeAgo } from './DashKit';

interface SignupsData {
  total: number;
  today: number;
  week: number;
  month: number;
  byDate: { date: string; count: number }[];
  bySite: { site: string; count: number }[];
  recent: { email: string; created_at: string; site: string; detail: string }[];
  error?: string;
}

const PALETTE = ['var(--accent)', 'var(--green)', 'var(--cyan)', 'var(--purple)', 'var(--orange)', 'var(--yellow)', 'var(--red)'];

function siteColor(name: string, i: number): string {
  const p = projects.find((x) => x.name.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(x.name.toLowerCase()));
  if (p) return p.color;
  if (name === 'Other') return 'var(--text-tertiary)';
  return PALETTE[i % PALETTE.length];
}

export default function UsersBoard() {
  const [data, setData] = useState<SignupsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/signups')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <Module eyebrow="Audience" title="Users" accent="var(--purple)" icon={<span>👤</span>}>
      {loading ? (
        <div className="skeleton h-56 w-full" />
      ) : !data || data.error ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">Signups unavailable{data?.error ? ` (${data.error})` : ''}.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Stat label="Total" value={fmtNum(data.total)} accent="var(--purple)" />
            <Stat label="Today" value={fmtNum(data.today)} />
            <Stat label="7 days" value={fmtNum(data.week)} />
            <Stat label="30 days" value={fmtNum(data.month)} />
          </div>

          <AreaChart
            height={170}
            labels={data.byDate.map((d) => { const [, m, dd] = d.date.split('-'); return `${+dd}/${+m}`; })}
            series={[{ name: 'New signups', color: 'var(--purple)', data: data.byDate.map((d) => d.count), type: 'area' }]}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <div>
              <div className="section-eyebrow mb-2.5">By site</div>
              <BarList items={data.bySite.slice(0, 7).map((s, i) => ({ label: s.site, value: s.count, color: siteColor(s.site, i) }))} />
            </div>
            <div>
              <div className="section-eyebrow mb-2.5">Recent signups</div>
              <div className="space-y-1.5">
                {data.recent.length === 0 && <p className="text-[12px] text-[var(--text-tertiary)]">No signups yet.</p>}
                {data.recent.slice(0, 8).map((u, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-[12px] py-1 border-b border-[var(--hairline)] last:border-0">
                    <div className="min-w-0">
                      <div className="text-[var(--text-primary)] font-medium truncate">{u.email || 'unknown'}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] truncate">{u.site}{u.detail && u.detail !== 'no signal' ? ` · ${u.detail}` : ''}</div>
                    </div>
                    <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0">{timeAgo(u.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Module>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color: accent || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
