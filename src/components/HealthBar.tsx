'use client';

import { useState, useEffect } from 'react';
import { HealthResult } from '@/lib/types';
import { getProject } from '@/lib/projects';

export default function HealthBar() {
  const [results, setResults] = useState<HealthResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setResults(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 bg-[var(--bg-card)] rounded-full animate-pulse flex-shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {results.map((r) => {
        const project = getProject(r.siteId);
        const dotColor = r.status === 'up' ? 'bg-[var(--green)]' :
                         r.status === 'slow' ? 'bg-[var(--yellow)]' : 'bg-[var(--red)]';

        return (
          <div
            key={r.siteId}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[var(--bg-card)] flex-shrink-0"
          >
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-[13px] font-medium text-white">
              {project?.name || r.siteId}
            </span>
            {r.responseTime !== null && (
              <span className="text-[11px] text-[var(--text-tertiary)]">{r.responseTime}ms</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
