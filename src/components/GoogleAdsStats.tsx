'use client';

import { useState, useEffect, useCallback } from 'react';

interface Period {
  spend: number;
  clicks: number;
  impressions: number;
  sales: number;
  revenue: number;
}
interface AdsData {
  today: Period;
  month: Period;
  updated: string;
}

export default function GoogleAdsStats() {
  const [data, setData] = useState<AdsData | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/google-ads');
      if (res.ok) {
        setData(await res.json());
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
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const t = data?.today;
  const m = data?.month;
  const roas = m && m.spend > 0 ? m.revenue / m.spend : null;

  const tiles = t
    ? [
        { label: 'Spend', value: `£${t.spend.toFixed(2)}`, hl: false },
        { label: 'Clicks', value: t.clicks.toLocaleString(), hl: false },
        { label: 'Ad Sales', value: String(t.sales), hl: t.sales > 0 },
        { label: 'Revenue', value: `£${t.revenue.toFixed(2)}`, hl: t.revenue > 0 },
      ]
    : [];

  return (
    <div className="card px-3.5 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#4285F4' }} />
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Google Ads
          </h2>
          <span className="text-[10px] text-[var(--text-tertiary)]">CarCostCheck</span>
        </div>
        {m && (
          <span className="text-[11px] text-[var(--text-tertiary)]">
            £{m.spend.toFixed(2)} spent this month
          </span>
        )}
      </div>

      {!data && !error && (
        <p className="text-[12px] text-[var(--text-tertiary)]">Loading…</p>
      )}
      {error && !data && (
        <p className="text-[12px] text-[var(--text-tertiary)]">Stats unavailable</p>
      )}

      {t && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {tiles.map((s) => (
              <div key={s.label} className="text-center py-1.5 rounded-lg bg-[var(--bg-elevated)]">
                <div
                  className={`font-semibold whitespace-nowrap text-[clamp(0.7rem,3.2vw,0.9375rem)] ${
                    s.hl ? 'text-[var(--green)]' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {s.value}
                </div>
                <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider text-center mt-1.5">
            Today
          </div>

          {/* Month summary */}
          {m && (
            <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-[var(--border-light)] text-[11px]">
              <span className="text-[var(--text-secondary)]">
                Month: <span className="font-medium text-[var(--text-primary)]">{m.clicks.toLocaleString()}</span> clicks
              </span>
              <span className={`${m.sales > 0 ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'}`}>
                <span className="font-medium">{m.sales}</span> ad sales
              </span>
              <span className="text-[var(--text-secondary)]">
                £{m.revenue.toFixed(2)} rev
              </span>
              {roas !== null && (
                <span className={`font-medium ${roas >= 1 ? 'text-[var(--green)]' : 'text-[var(--text-tertiary)]'}`}>
                  {roas.toFixed(1)}x ROAS
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
