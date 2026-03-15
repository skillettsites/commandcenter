'use client';

import { useState, useEffect } from 'react';
import { HealthResult, AnalyticsResult } from '@/lib/types';
import { projects } from '@/lib/projects';

interface SiteData {
  id: string;
  name: string;
  url: string;
  color: string;
  status: 'up' | 'slow' | 'down' | 'checking';
  responseTime: number | null;
  visitors: number | null;
  pageViews: number | null;
}

export default function SiteGrid() {
  const [sites, setSites] = useState<SiteData[]>(
    projects
      .filter(p => p.url && p.id !== 'commandcenter')
      .map(p => ({
        ...p,
        status: 'checking' as const,
        responseTime: null,
        visitors: null,
        pageViews: null,
      }))
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const results: HealthResult[] = await res.json();
          setSites(prev =>
            prev.map(site => {
              const result = results.find(r => r.siteId === site.id);
              if (result) {
                return { ...site, status: result.status, responseTime: result.responseTime };
              }
              return { ...site, status: 'down' };
            })
          );
        }
      } catch {
        setSites(prev => prev.map(s => ({ ...s, status: 'down' })));
      }
    }

    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics');
        if (res.ok) {
          const { data }: { data: AnalyticsResult[] } = await res.json();
          setSites(prev =>
            prev.map(site => {
              const stats = data.find(d => d.siteId === site.id);
              if (stats) {
                return { ...site, visitors: stats.activeUsers, pageViews: stats.pageViews };
              }
              return site;
            })
          );
        }
      } catch {
        // Analytics not configured yet, leave as null
      }
    }

    fetchHealth();
    fetchAnalytics();
  }, []);

  const allUp = sites.every(s => s.status === 'up');
  const anyDown = sites.some(s => s.status === 'down');
  const checking = sites.some(s => s.status === 'checking');

  const totalVisitors = sites.reduce((sum, s) => sum + (s.visitors ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Sites
        </h2>
        <div className="flex items-center gap-3">
          {totalVisitors > 0 && (
            <span className="text-[13px] font-medium text-white">
              {totalVisitors} today
            </span>
          )}
          {checking ? (
            <span className="text-[13px] text-[var(--text-tertiary)]">Checking...</span>
          ) : (
            <span className={`text-[13px] font-medium ${allUp ? 'text-[var(--green)]' : anyDown ? 'text-[var(--red)]' : 'text-[var(--yellow)]'}`}>
              {allUp ? 'All up' : anyDown ? 'Issues' : 'Slow'}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {sites.map(site => (
          <SiteCard
            key={site.id}
            site={site}
            expanded={expanded === site.id}
            onToggle={() => setExpanded(expanded === site.id ? null : site.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SiteCard({
  site,
  expanded,
  onToggle,
}: {
  site: SiteData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusDot =
    site.status === 'up'
      ? 'bg-[var(--green)]'
      : site.status === 'slow'
      ? 'bg-[var(--yellow)]'
      : site.status === 'checking'
      ? 'bg-[var(--text-tertiary)] animate-pulse'
      : 'bg-[var(--red)]';

  const domain = site.url
    .replace('https://', '')
    .replace('http://', '')
    .replace(/\/$/, '');

  return (
    <div
      onClick={onToggle}
      className="card p-3.5 cursor-pointer transition-all active:scale-[0.98]"
      style={{ borderLeft: `3px solid ${site.color}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] font-semibold text-white truncate pr-2">
          {site.name}
        </span>
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot}`} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-tertiary)]">Visitors</span>
          <span className={`text-[13px] font-medium ${
            site.visitors === null ? 'text-[var(--text-tertiary)]' :
            site.visitors > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'
          }`}>
            {site.visitors === null ? '...' : site.visitors}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-tertiary)]">Page views</span>
          <span className={`text-[13px] font-medium ${
            site.pageViews === null ? 'text-[var(--text-tertiary)]' :
            site.pageViews > 0 ? 'text-white' : 'text-[var(--text-secondary)]'
          }`}>
            {site.pageViews === null ? '...' : site.pageViews}
          </span>
        </div>
        {site.responseTime !== null && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-tertiary)]">Response</span>
            <span className={`text-[13px] font-medium ${
              site.responseTime < 1000 ? 'text-[var(--green)]' :
              site.responseTime < 3000 ? 'text-[var(--yellow)]' : 'text-[var(--red)]'
            }`}>
              {site.responseTime}ms
            </span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border-light)] space-y-2 fade-in">
          <div className="text-[11px] text-[var(--text-tertiary)] truncate">{domain}</div>
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="block w-full text-center py-2 rounded-lg bg-[var(--bg-elevated)] text-[13px] font-medium text-[var(--accent)] active:opacity-70"
          >
            Visit Site
          </a>
        </div>
      )}
    </div>
  );
}
