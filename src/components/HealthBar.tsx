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
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-28 bg-gray-800 rounded-lg animate-pulse flex-shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {results.map((r) => {
        const project = getProject(r.siteId);
        const colors = {
          up: 'bg-green-500/10 text-green-400 border-green-500/20',
          slow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
          down: 'bg-red-500/10 text-red-400 border-red-500/20',
        };

        return (
          <div
            key={r.siteId}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium flex-shrink-0 ${colors[r.status]}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              r.status === 'up' ? 'bg-green-400' :
              r.status === 'slow' ? 'bg-yellow-400' : 'bg-red-400'
            }`} />
            <span>{project?.name || r.siteId}</span>
            {r.responseTime !== null && (
              <span className="opacity-60">{r.responseTime}ms</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
