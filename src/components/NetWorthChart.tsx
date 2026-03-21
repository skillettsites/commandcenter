'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type TimeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';

interface HistoryPoint {
  date: string;
  value: number;
}

interface HistoryData {
  history: HistoryPoint[];
  currentValue: number;
  range: TimeRange;
}

function formatGBP(amount: number): string {
  return '\u00A3' + amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCompact(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return '\u00A3' + (amount / 1000).toFixed(amount >= 10000 ? 0 : 1) + 'k';
  }
  return formatGBP(amount);
}

function formatDateLabel(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr);
  if (range === '1D') {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1W') {
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  if (range === '1M') {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  if (range === '1Y') {
    return d.toLocaleDateString('en-GB', { month: 'short' });
  }
  // ALL
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function formatTooltipDate(dateStr: string, range: TimeRange): string {
  const d = new Date(dateStr);
  if (range === '1D') {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const RANGES: TimeRange[] = ['1D', '1W', '1M', '1Y', 'ALL'];

export default function NetWorthChart() {
  const [range, setRange] = useState<TimeRange>('1M');
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedIdx(null);
    fetch(`/api/finances/history?range=${range}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: HistoryData | null) => {
        if (json) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range]);

  const handleInteraction = useCallback(
    (clientX: number) => {
      if (!svgRef.current || !data || data.history.length < 2) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = (clientX - rect.left) / rect.width;
      const idx = Math.round(relX * (data.history.length - 1));
      const clamped = Math.max(0, Math.min(data.history.length - 1, idx));
      setSelectedIdx(clamped);
    },
    [data]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => handleInteraction(e.clientX),
    [handleInteraction]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) handleInteraction(e.touches[0].clientX);
    },
    [handleInteraction]
  );

  if (loading && !data) {
    return (
      <div className="px-3.5 pb-3">
        <div className="rounded-lg bg-[var(--bg-elevated)] p-3" style={{ height: 220 }}>
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-[var(--text-tertiary)]">Loading chart...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.history.length === 0) return null;

  const points = data.history;
  const startValue = points[0].value;
  const endValue = points[points.length - 1].value;
  const isGain = endValue >= startValue;
  const changeAmount = endValue - startValue;
  const changePercent = startValue > 0 ? (changeAmount / startValue) * 100 : 0;
  const lineColor = isGain ? '#22c55e' : '#ef4444';

  // Selected point values
  const selectedPoint = selectedIdx !== null ? points[selectedIdx] : null;
  const displayValue = selectedPoint ? selectedPoint.value : endValue;
  const displayChange = selectedPoint ? selectedPoint.value - startValue : changeAmount;
  const displayPercent = startValue > 0 ? (displayChange / startValue) * 100 : 0;
  const displayIsGain = displayChange >= 0;

  // SVG chart dimensions
  const chartWidth = 340;
  const chartHeight = 140;
  const pad = { top: 8, right: 4, bottom: 4, left: 4 };
  const innerW = chartWidth - pad.left - pad.right;
  const innerH = chartHeight - pad.top - pad.bottom;

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal - minVal || 1;

  const chartPoints = points.map((p, i) => ({
    x: pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
    y: pad.top + innerH - ((p.value - minVal) / valRange) * innerH,
    value: p.value,
    date: p.date,
  }));

  // Build smooth line path
  const linePath = chartPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');

  // Area fill path
  const areaPath =
    chartPoints.length > 1
      ? `M${chartPoints[0].x.toFixed(2)},${(pad.top + innerH).toFixed(2)} ` +
        chartPoints.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') +
        ` L${chartPoints[chartPoints.length - 1].x.toFixed(2)},${(pad.top + innerH).toFixed(2)} Z`
      : '';

  // Selected point marker
  const selPt = selectedIdx !== null ? chartPoints[selectedIdx] : null;

  // Gradient ID unique to gain/loss
  const gradId = `nw-grad-${isGain ? 'g' : 'r'}`;

  return (
    <div className="px-3.5 pb-3">
      <div className="rounded-lg bg-[var(--bg-elevated)] p-3">
        {/* Value display */}
        <div className="flex items-center justify-between mb-1">
          <div>
            {selectedPoint && (
              <div className="text-[10px] text-[var(--text-tertiary)] mb-0.5">
                {formatTooltipDate(selectedPoint.date, range)}
              </div>
            )}
            <span className="text-[20px] font-bold text-[var(--text-primary)]">
              {formatGBP(displayValue)}
            </span>
          </div>
          <div className="text-right">
            <span
              className={`text-[13px] font-medium ${
                displayIsGain ? 'text-[#22c55e]' : 'text-[#ef4444]'
              }`}
            >
              {displayIsGain ? '+' : ''}
              {formatCompact(displayChange)}
            </span>
            <span
              className={`ml-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                displayIsGain
                  ? 'bg-[#22c55e]/10 text-[#22c55e]'
                  : 'bg-[#ef4444]/10 text-[#ef4444]'
              }`}
            >
              {displayIsGain ? '+' : ''}
              {displayPercent.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* SVG Chart */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full cursor-crosshair"
          style={{ height: 180 }}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setSelectedIdx(null)}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setSelectedIdx(null)}
          onClick={(e) => {
            e.stopPropagation();
            handleInteraction(e.clientX);
          }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Area fill */}
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Selected point indicator */}
          {selPt && (
            <>
              <line
                x1={selPt.x}
                y1={pad.top}
                x2={selPt.x}
                y2={pad.top + innerH}
                stroke={lineColor}
                strokeWidth={0.8}
                opacity={0.5}
                strokeDasharray="2,2"
              />
              <circle
                cx={selPt.x}
                cy={selPt.y}
                r={4}
                fill="white"
                stroke={lineColor}
                strokeWidth={2}
              />
            </>
          )}

          {/* Bottom line */}
          <line
            x1={pad.left}
            y1={pad.top + innerH}
            x2={pad.left + innerW}
            y2={pad.top + innerH}
            stroke="currentColor"
            opacity={0.08}
            strokeWidth={0.5}
          />
        </svg>

        {/* Range buttons */}
        <div className="flex gap-1 mt-2 justify-center">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={(e) => {
                e.stopPropagation();
                setRange(r);
              }}
              className={`px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide transition-colors ${
                range === r
                  ? `text-white ${isGain ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
