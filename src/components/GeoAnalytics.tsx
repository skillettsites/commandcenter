'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { projects } from '@/lib/projects';

interface CountryData {
  country: string;
  count: number;
  percentage: number;
}

interface CityData {
  city: string;
  region: string;
  country: string;
  count: number;
}

interface CityPair {
  visitorCity: string;
  searchedArea: string;
  count: number;
}

interface GeoDetailData {
  topCountries: CountryData[];
  topCities: CityData[];
  cityPairs: CityPair[];
  deviceBreakdown: Record<string, number>;
}

type TimeRange = '7d' | '1m' | 'all';
type Tab = 'countries' | 'cities' | 'origins' | 'devices';

// Sites that have pageview tracking
const TRACKED_SITES = projects.filter(
  (p) => p.gaPropertyId && p.id !== 'personal' && p.id !== 'dashboard' && p.id !== 'general'
);

const RANGE_LABELS: Record<TimeRange, string> = {
  '7d': '7 Days',
  '1m': '1 Month',
  'all': 'All Time',
};

function countryFlag(code: string): string {
  try {
    return String.fromCodePoint(
      ...[...code.toUpperCase()].map((c) => c.charCodeAt(0) + 127397)
    );
  } catch {
    return '';
  }
}

// Map common country names to ISO codes for flags
const COUNTRY_CODE_MAP: Record<string, string> = {
  'United States': 'US', 'United Kingdom': 'GB', 'Canada': 'CA', 'Australia': 'AU',
  'Germany': 'DE', 'France': 'FR', 'India': 'IN', 'Brazil': 'BR', 'Japan': 'JP',
  'Netherlands': 'NL', 'Spain': 'ES', 'Italy': 'IT', 'Sweden': 'SE', 'Norway': 'NO',
  'Denmark': 'DK', 'Finland': 'FI', 'Poland': 'PL', 'Ireland': 'IE', 'Belgium': 'BE',
  'Switzerland': 'CH', 'Austria': 'AT', 'Portugal': 'PT', 'Greece': 'GR',
  'New Zealand': 'NZ', 'South Africa': 'ZA', 'Mexico': 'MX', 'Argentina': 'AR',
  'Colombia': 'CO', 'Chile': 'CL', 'Turkey': 'TR', 'Russia': 'RU', 'China': 'CN',
  'South Korea': 'KR', 'Singapore': 'SG', 'Malaysia': 'MY', 'Thailand': 'TH',
  'Indonesia': 'ID', 'Philippines': 'PH', 'Vietnam': 'VN', 'Pakistan': 'PK',
  'Bangladesh': 'BD', 'Nigeria': 'NG', 'Kenya': 'KE', 'Egypt': 'EG', 'Israel': 'IL',
  'UAE': 'AE', 'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', 'Romania': 'RO',
  'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Hungary': 'HU', 'Croatia': 'HR',
  'Bulgaria': 'BG', 'Slovakia': 'SK', 'Slovenia': 'SI', 'Latvia': 'LV', 'Lithuania': 'LT',
  'Estonia': 'EE', 'Cyprus': 'CY', 'Malta': 'MT', 'Luxembourg': 'LU', 'Iceland': 'IS',
  'Taiwan': 'TW', 'Hong Kong': 'HK', 'Ukraine': 'UA', 'Peru': 'PE',
};

function getFlagForCountry(country: string): string {
  // If already a 2-letter code, use directly
  if (country.length === 2) return countryFlag(country);
  const code = COUNTRY_CODE_MAP[country];
  if (code) return countryFlag(code);
  return '';
}

const DEVICE_ICONS: Record<string, string> = {
  mobile: 'M9 2h6a2 2 0 012 2v16a2 2 0 01-2 2H9a2 2 0 01-2-2V4a2 2 0 012-2zm3 18h.01',
  desktop: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  tablet: 'M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
};

export default function GeoAnalytics() {
  const [data, setData] = useState<GeoDetailData | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [tab, setTab] = useState<Tab>('countries');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: 'geo-detail', range: timeRange });
      if (selectedSite !== 'all') params.set('site_id', selectedSite);
      const res = await fetch(`/api/pageviews?${params}`);
      if (res.ok) {
        const json: GeoDetailData = await res.json();
        setData(json);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, timeRange]);

  useEffect(() => {
    if (!collapsed) {
      fetchData();
    }
  }, [collapsed, fetchData]);

  // Check if search origins tab should be available
  const showOrigins = selectedSite === 'all' || selectedSite === 'postcodecheck' || selectedSite === 'carcostcheck';

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'countries', label: 'Countries', show: true },
    { key: 'cities', label: 'Cities', show: true },
    { key: 'origins', label: 'Search Origins', show: showOrigins },
    { key: 'devices', label: 'Devices', show: true },
  ];

  // Summary stats for header
  const countryCount = data?.topCountries.length ?? 0;
  const totalVisits = data ? data.topCountries.reduce((s, c) => s + c.count, 0) : 0;

  // Accent color based on selected site
  const accentColor = useMemo(() => {
    if (selectedSite === 'all') return 'var(--accent)';
    const proj = projects.find((p) => p.id === selectedSite);
    return proj?.color || 'var(--accent)';
  }, [selectedSite]);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Geo Analytics
          </h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          {data && !collapsed && (
            <>
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                {totalVisits.toLocaleString()} visits
              </span>
              <span className="text-[13px] text-[var(--text-secondary)]">
                {countryCount} countries
              </span>
            </>
          )}
          {!data && !error && !collapsed && (
            <span className="text-[13px] text-[var(--text-tertiary)]">Loading...</span>
          )}
        </div>
      </div>

      {/* Collapsed: nothing extra, keep it clean */}

      {/* Expanded */}
      {!collapsed && (
        <div className="card overflow-hidden fade-in">
          {/* Site toggle pills */}
          <div className="px-3.5 pt-3 pb-1">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedSite('all')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  selectedSite === 'all'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                All Sites
              </button>
              {TRACKED_SITES.map((site) => (
                <button
                  key={site.id}
                  onClick={() => setSelectedSite(site.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                    selectedSite === site.id
                      ? 'text-white'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                  style={selectedSite === site.id ? { backgroundColor: site.color } : undefined}
                >
                  {site.name}
                </button>
              ))}
            </div>
          </div>

          {/* Time range toggle */}
          <div className="px-3.5 pt-2 pb-2 flex items-center gap-1">
            {(['7d', '1m', 'all'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={(e) => {
                  e.stopPropagation();
                  setTimeRange(r);
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  timeRange === r
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Tab bar */}
          <div className="px-3.5 pb-2 flex items-center gap-1 border-b border-[var(--border-light)]">
            {tabs.filter((t) => t.show).map((t) => (
              <button
                key={t.key}
                onClick={(e) => {
                  e.stopPropagation();
                  setTab(t.key);
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {loading && !data && (
            <div className="px-3.5 py-6 text-center">
              <span className="text-[12px] text-[var(--text-tertiary)]">Loading geo data...</span>
            </div>
          )}

          {/* Error state */}
          {error && !data && (
            <div className="px-3.5 py-4">
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Could not load geo analytics data.
              </p>
            </div>
          )}

          {/* Content */}
          {data && (
            <div>
              {/* Countries tab */}
              {tab === 'countries' && (
                <div className="px-3.5 py-2.5 fade-in">
                  {data.topCountries.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-tertiary)] py-4 text-center">
                      No geo data available for this period
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {data.topCountries.map((c, i) => {
                        const maxCount = data.topCountries[0]?.count || 1;
                        const pct = (c.count / maxCount) * 100;
                        const flag = getFlagForCountry(c.country);
                        return (
                          <div key={i} className="relative">
                            <div
                              className="absolute inset-y-0 left-0 rounded opacity-10"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: accentColor,
                              }}
                            />
                            <div className="relative flex items-center justify-between py-1.5 px-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {flag && (
                                  <span className="text-[14px] flex-shrink-0">{flag}</span>
                                )}
                                <span className="text-[12px] text-[var(--text-primary)] truncate">
                                  {c.country}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[12px] font-medium text-[var(--text-primary)]">
                                  {c.count.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-[var(--text-tertiary)] w-[38px] text-right">
                                  {c.percentage}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Cities tab */}
              {tab === 'cities' && (
                <div className="px-3.5 py-2.5 fade-in">
                  {data.topCities.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-tertiary)] py-4 text-center">
                      No city data available for this period
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {data.topCities.map((c, i) => {
                        const maxCount = data.topCities[0]?.count || 1;
                        const opacity = Math.max(0.05, (c.count / maxCount) * 0.3);
                        const flag = getFlagForCountry(c.country);
                        return (
                          <div
                            key={i}
                            className="rounded-lg px-2.5 py-2 relative overflow-hidden"
                            style={{ backgroundColor: `color-mix(in srgb, ${accentColor} ${Math.round(opacity * 100)}%, transparent)` }}
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              {flag && (
                                <span className="text-[10px]">{flag}</span>
                              )}
                              <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                                {c.city}
                              </span>
                            </div>
                            {c.region && (
                              <p className="text-[9px] text-[var(--text-tertiary)] truncate">
                                {c.region}
                              </p>
                            )}
                            <p className="font-semibold text-[var(--text-primary)] mt-0.5 whitespace-nowrap text-[clamp(0.7rem,3vw,0.8125rem)]">
                              {c.count.toLocaleString()}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Search Origins tab */}
              {tab === 'origins' && (
                <div className="px-3.5 py-2.5 fade-in">
                  {!showOrigins ? (
                    <p className="text-[11px] text-[var(--text-tertiary)] py-4 text-center">
                      Search origins are only available for PostcodeCheck and CarCostCheck
                    </p>
                  ) : data.cityPairs.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-tertiary)] py-4 text-center">
                      No search origin data available for this period
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mb-2">
                        Where visitors are vs what they search
                      </p>
                      {data.cityPairs.map((pair, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-[var(--bg-elevated)]"
                        >
                          {/* Visitor city */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                              From
                            </p>
                            <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                              {pair.visitorCity}
                            </p>
                          </div>

                          {/* Connecting arrow */}
                          <div className="flex-shrink-0 flex items-center">
                            <svg
                              width="24"
                              height="12"
                              viewBox="0 0 24 12"
                              fill="none"
                              className="text-[var(--text-tertiary)]"
                            >
                              <path
                                d="M0 6h20m0 0l-4-4m4 4l-4 4"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>

                          {/* Searched area */}
                          <div className="flex-1 min-w-0 text-right">
                            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                              Searched
                            </p>
                            <p className="text-[12px] font-mono font-medium truncate" style={{ color: accentColor }}>
                              {pair.searchedArea}
                            </p>
                          </div>

                          {/* Count */}
                          <div className="flex-shrink-0 ml-1">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--bg-card)] text-[11px] font-semibold text-[var(--text-primary)]">
                              {pair.count}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Devices tab */}
              {tab === 'devices' && (
                <div className="px-3.5 py-2.5 fade-in">
                  {Object.keys(data.deviceBreakdown).length === 0 ? (
                    <p className="text-[11px] text-[var(--text-tertiary)] py-4 text-center">
                      No device data available for this period
                    </p>
                  ) : (
                    <DeviceBreakdown
                      breakdown={data.deviceBreakdown}
                      accentColor={accentColor}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceBreakdown({
  breakdown,
  accentColor,
}: {
  breakdown: Record<string, number>;
  accentColor: string;
}) {
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(breakdown)
    .map(([device, count]) => ({
      device,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const colors: Record<string, string> = {
    mobile: '#10B981',
    desktop: '#3B82F6',
    tablet: '#F59E0B',
    unknown: '#6B7280',
  };

  return (
    <div className="space-y-3">
      {/* Visual bar */}
      <div className="h-6 rounded-full overflow-hidden flex bg-[var(--bg-elevated)]">
        {sorted.map((d) => (
          <div
            key={d.device}
            className="h-full transition-all duration-300"
            style={{
              width: `${d.percentage}%`,
              backgroundColor: colors[d.device] || accentColor,
              minWidth: d.percentage > 0 ? '4px' : '0',
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        {sorted.map((d) => {
          const iconPath = DEVICE_ICONS[d.device];
          const color = colors[d.device] || accentColor;
          return (
            <div key={d.device} className="flex items-center gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {iconPath ? (
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke={color}
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                  </svg>
                ) : (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span className="text-[12px] text-[var(--text-primary)] capitalize">
                  {d.device}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[12px] font-medium text-[var(--text-primary)]">
                  {d.count.toLocaleString()}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)] w-[38px] text-right">
                  {d.percentage}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
