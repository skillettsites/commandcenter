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
      .filter(p => p.url && p.id !== 'dashboard')
      .map(p => ({
        ...p,
        status: 'checking' as const,
        responseTime: null,
        visitors: null,
        pageViews: null,
      }))
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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
        // Analytics not configured yet
      }
    }

    fetchHealth();
    fetchAnalytics();
  }, []);

  const allUp = sites.every(s => s.status === 'up');
  const anyDown = sites.some(s => s.status === 'down');
  const checking = sites.some(s => s.status === 'checking');
  const totalVisitors = sites.reduce((sum, s) => sum + (s.visitors ?? 0), 0);
  const totalPageViews = sites.reduce((sum, s) => sum + (s.pageViews ?? 0), 0);

  return (
    <div className="space-y-2">
      {/* Header row - tappable to collapse */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Sites
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          {totalVisitors > 0 && (
            <span className="text-[13px] font-medium text-white">
              {totalVisitors} visitors
            </span>
          )}
          {totalPageViews > 0 && (
            <span className="text-[13px] text-[var(--text-tertiary)]">
              {totalPageViews} views
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

      {/* Compact status dots row (always visible) */}
      {collapsed && (
        <div className="flex flex-wrap gap-1.5 px-1 fade-in">
          {sites.map(site => {
            const dotColor = site.status === 'up' ? 'var(--green)' : site.status === 'slow' ? 'var(--yellow)' : site.status === 'checking' ? 'var(--text-tertiary)' : 'var(--red)';
            return (
              <div
                key={site.id}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-card)]"
                title={site.name}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                <span className="text-[11px] text-[var(--text-secondary)]">{site.name.replace('Check', '').replace('Score', '')}</span>
                {(site.visitors ?? 0) > 0 && (
                  <span className="text-[10px] font-medium text-[var(--green)]">{site.visitors}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compact list view (default, not collapsed) */}
      {!collapsed && (
        <div className="card overflow-hidden divide-y divide-[var(--border-light)] fade-in">
          {sites.map(site => (
            <SiteRow
              key={site.id}
              site={site}
              expanded={expanded === site.id}
              onToggle={() => setExpanded(expanded === site.id ? null : site.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteRow({
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
      className="px-3.5 py-2.5 cursor-pointer active:bg-[var(--bg-elevated)] transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Color bar + status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: site.color }} />
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
        </div>

        {/* Name */}
        <span className="text-[14px] font-medium text-white flex-1 min-w-0 truncate">
          {site.name}
        </span>

        {/* Stats */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <span className={`text-[13px] font-medium ${
              site.visitors === null ? 'text-[var(--text-tertiary)]' :
              site.visitors > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'
            }`}>
              {site.visitors === null ? '-' : site.visitors}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">vis</span>
          </div>
          <div className="text-right">
            <span className={`text-[13px] font-medium ${
              site.pageViews === null ? 'text-[var(--text-tertiary)]' :
              site.pageViews > 0 ? 'text-white' : 'text-[var(--text-secondary)]'
            }`}>
              {site.pageViews === null ? '-' : site.pageViews}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)] ml-0.5">pv</span>
          </div>
          {site.responseTime !== null && (
            <span className={`text-[12px] font-medium w-12 text-right ${
              site.responseTime < 1000 ? 'text-[var(--green)]' :
              site.responseTime < 3000 ? 'text-[var(--yellow)]' : 'text-[var(--red)]'
            }`}>
              {site.responseTime}ms
            </span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 ml-7 flex items-center gap-3 fade-in">
          <span className="text-[11px] text-[var(--text-tertiary)] truncate">{domain}</span>
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[12px] text-[var(--accent)] font-medium flex-shrink-0"
          >
            Visit
          </a>
        </div>
      )}
    </div>
  );
}
