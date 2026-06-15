'use client';

import { useState } from 'react';

/* ============================ helpers ============================ */
export function fmtNum(n: number): string {
  return n.toLocaleString('en-GB');
}
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
export function gbp(n: number, dp = 0): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
export function gbpCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `£${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `£${Math.round(n)}`;
}
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* ============================ Module shell ============================ */
export function Module({
  title,
  eyebrow,
  accent = 'var(--accent)',
  icon,
  right,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  accent?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass card-hl rise-in p-5 lg:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
          <div className="min-w-0">
            {eyebrow && <div className="section-eyebrow">{eyebrow}</div>}
            <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
              {icon}
              {title}
            </h2>
          </div>
        </div>
        {right && <div className="flex-shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/* ============================ Segmented range toggle ============================ */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-full bg-[var(--bg-elevated)] gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            value === o.value ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ============================ MiniSpark ============================ */
export function MiniSpark({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  const w = 100;
  const h = height;
  // Always render a line: fall back to a flat baseline when there's no trend data.
  const series = data && data.length >= 2 ? data : [0, 0];
  const max = Math.max(...series);
  const min = Math.min(...series);
  const flat = max === min;
  const range = max - min || 1;
  const pts = series.map((v, i) => [
    (i / (series.length - 1)) * w,
    flat ? h * 0.6 : h - ((v - min) / range) * (h - 3) - 1.5,
  ] as const);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `ms-${color.replace(/[^a-z0-9]/gi, '')}-${data.length}-${Math.round(max)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {!flat && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={flat ? '3,3' : undefined} opacity={flat ? 0.4 : 1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ============================ Multi-series area chart ============================ */
export interface ChartSeries {
  name: string;
  color: string;
  data: number[];
  dashed?: boolean;
  type?: 'area' | 'line' | 'bar';
}

export function AreaChart({
  series,
  labels,
  height = 200,
  formatValue = (v) => fmtNum(Math.round(v)),
  yTicks = true,
  onPointClick,
  selected = null,
}: {
  series: ChartSeries[];
  labels: string[];
  height?: number;
  formatValue?: (v: number) => string;
  yTicks?: boolean;
  onPointClick?: (i: number) => void;
  selected?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  if (n < 2 || series.length === 0) return <div className="flex items-center justify-center text-[12px] text-[var(--text-tertiary)]" style={{ height }}>No data yet</div>;

  const W = 600, H = height;
  const pad = { t: 12, r: 10, b: 22, l: 36 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  // Adaptive Y domain: pure line/area charts hug the data (no forced 0
  // baseline, so movement fills the panel); charts that include bars keep a
  // 0 baseline so bar heights stay truthful.
  const hasBars = series.some((s) => s.type === 'bar');
  const allVals = series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
  const rawMax = allVals.length ? Math.max(...allVals) : 1;
  const rawMin = allVals.length ? Math.min(...allVals) : 0;
  const span = (rawMax - rawMin) || Math.abs(rawMax) || 1;
  const maxV = hasBars ? Math.max(1, rawMax * 1.08) : rawMax + span * 0.08;
  const minV = hasBars ? 0 : rawMin - span * 0.08;
  const denom = (maxV - minV) || 1;

  const x = (i: number) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - ((v - minV) / denom) * innerH;
  const nearest = (clientX: number, rect: DOMRect) => {
    const mx = ((clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - mx); if (d < bd) { bd = d; best = i; } }
    return best;
  };

  const barSeries = series.filter((s) => s.type === 'bar');
  const lineSeries = series.filter((s) => s.type !== 'bar');
  const labelStep = Math.max(1, Math.ceil(n / 6));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full h-auto ${onPointClick ? 'cursor-pointer' : ''}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)}
        onClick={onPointClick ? (e) => onPointClick(nearest(e.clientX, e.currentTarget.getBoundingClientRect())) : undefined}
      >
        <defs>
          {lineSeries.map((s, si) => (
            <linearGradient key={si} id={`ac-${si}-${s.color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* y grid */}
        {yTicks && [0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={pad.l + innerW} y1={pad.t + innerH * (1 - g)} y2={pad.t + innerH * (1 - g)} stroke="currentColor" opacity={0.07} strokeWidth={0.5} />
            <text x={pad.l - 5} y={pad.t + innerH * (1 - g) + 3} textAnchor="end" fontSize="8" fill="currentColor" opacity={0.4} fontFamily="system-ui">{fmtCompact(minV + (maxV - minV) * g)}</text>
          </g>
        ))}

        {/* bars (e.g. purchases) */}
        {barSeries.map((s) =>
          s.data.map((v, i) => {
            if (v <= 0) return null;
            const bw = Math.max(2, (innerW / n) * 0.5);
            return <rect key={`${s.name}-${i}`} x={x(i) - bw / 2} y={y(v)} width={bw} height={pad.t + innerH - y(v)} rx={1} fill={s.color} opacity={0.85} />;
          })
        )}

        {/* line/area series */}
        {lineSeries.map((s, si) => {
          const pts = s.data.map((v, i) => [x(i), y(v)] as const);
          const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
          const area = `${line} L${x(n - 1)},${pad.t + innerH} L${x(0)},${pad.t + innerH} Z`;
          return (
            <g key={si}>
              {!s.dashed && s.type !== 'line' && <path d={area} fill={`url(#ac-${si}-${s.color.replace(/[^a-z0-9]/gi, '')})`} />}
              <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5,4' : undefined} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}

        {/* x labels */}
        {labels.map((l, i) => (i % labelStep === 0 || i === n - 1) ? (
          <text key={i} x={x(i)} y={H - 5} textAnchor="middle" fontSize="8" fill="currentColor" opacity={0.4} fontFamily="system-ui">{l}</text>
        ) : null)}

        {/* hover */}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + innerH} stroke="currentColor" opacity={0.25} strokeWidth={1} strokeDasharray="3,3" />
        )}
        {hover != null && lineSeries.map((s, si) => (
          <circle key={si} cx={x(hover)} cy={y(s.data[hover] ?? 0)} r={3} fill="#fff" stroke={s.color} strokeWidth={2} />
        ))}

        {/* persistent selected marker (click) */}
        {selected != null && selected !== hover && selected >= 0 && selected < n && (
          <line x1={x(selected)} x2={x(selected)} y1={pad.t} y2={pad.t + innerH} stroke="var(--accent)" opacity={0.55} strokeWidth={1.2} />
        )}
        {selected != null && selected >= 0 && selected < n && lineSeries.map((s, si) => (
          <circle key={`sel-${si}`} cx={x(selected)} cy={y(s.data[selected] ?? 0)} r={3.5} fill="var(--accent)" stroke="#fff" strokeWidth={1.5} />
        ))}
      </svg>

      {/* legend + readout */}
      <div className="flex items-center justify-between mt-1 flex-wrap gap-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }} />
              {s.name}
              {hover != null && <b className="text-[var(--text-secondary)] tabular-nums">{formatValue(s.data[hover] ?? 0)}</b>}
            </span>
          ))}
        </div>
        {hover != null && <span className="text-[10px] text-[var(--text-tertiary)]">{labels[hover]}</span>}
      </div>
    </div>
  );
}

/* ============================ Horizontal bar list ============================ */
export function BarList({
  items,
  formatValue = (v) => fmtNum(v),
  onItemClick,
  activeLabel,
}: {
  items: { label: string; value: number; color?: string; sub?: string }[];
  formatValue?: (v: number) => string;
  onItemClick?: (label: string) => void;
  activeLabel?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div
          key={it.label}
          onClick={onItemClick ? () => onItemClick(it.label) : undefined}
          className={onItemClick ? `cursor-pointer rounded-lg -mx-1.5 px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-elevated)] ${activeLabel === it.label ? 'bg-[var(--bg-elevated)]' : ''}` : ''}
        >
          <div className="flex items-center justify-between text-[12px] mb-1">
            <span className="text-[var(--text-secondary)] truncate flex items-center gap-1.5">
              {it.color && <span className="w-2 h-2 rounded-full" style={{ background: it.color }} />}
              {it.label}
            </span>
            <span className="text-[var(--text-primary)] font-medium tabular-nums flex-shrink-0 ml-2">
              {formatValue(it.value)}
              {it.sub && <span className="text-[var(--text-tertiary)] font-normal ml-1">{it.sub}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max((it.value / max) * 100, 2)}%`, background: it.color || 'var(--accent)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
