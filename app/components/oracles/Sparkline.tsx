"use client";

import { useMemo } from "react";

export interface SparkPoint {
  t: number;
  price: number;
}

/**
 * Minimal premium sparkline — soft area fill + glow stroke.
 */
export default function Sparkline({
  points,
  accent = "#10B981",
  className = "",
  height = 56,
}: {
  points: SparkPoint[];
  accent?: string;
  className?: string;
  height?: number;
}) {
  const geo = useMemo(() => {
    let vals = points
      .map((p) => p.price)
      .filter((v) => Number.isFinite(v) && v > 0);
    // Single sample → flat line so the card never looks empty
    if (vals.length === 1) vals = [vals[0], vals[0]];
    if (vals.length < 2) {
      return null;
    }
    const w = 240;
    const h = height;
    const padY = 6;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || max * 0.001 || 1e-12;
    const n = vals.length;
    const coords = vals.map((v, i) => {
      const x = (i / (n - 1)) * w;
      const y = padY + (1 - (v - min) / span) * (h - padY * 2);
      return [x, y] as const;
    });
    const line = coords
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");
    const area =
      line +
      ` L${w},${h} L0,${h} Z`;
    const last = coords[coords.length - 1];
    const first = vals[0];
    const end = vals[vals.length - 1];
    const deltaPct = first > 0 ? ((end - first) / first) * 100 : 0;
    return { w, h, line, area, last, deltaPct };
  }, [points, height]);

  if (!geo) {
    return (
      <div
        className={`flex items-center justify-center font-mono text-[10px] tracking-widest text-[#A0A0B0]/50 ${className}`}
        style={{ height }}
      >
        COLLECTING…
      </div>
    );
  }

  const up = geo.deltaPct >= 0;
  const deltaColor = up ? accent : "#EF4444";

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${geo.w} ${geo.h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        aria-hidden
      >
        <defs>
          <linearGradient id={`sg-${accent.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${accent.replace("#", "")}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={geo.area} fill={`url(#sg-${accent.replace("#", "")})`} />
        <path
          d={geo.line}
          fill="none"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow-${accent.replace("#", "")})`}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={geo.last[0]}
          cy={geo.last[1]}
          r="3.5"
          fill={accent}
          className="oracle-spark-dot"
        />
      </svg>
      <div
        className="absolute right-0 top-0 font-mono text-[10px] tracking-wider tabular-nums"
        style={{ color: deltaColor }}
      >
        {up ? "+" : ""}
        {geo.deltaPct.toFixed(2)}%
      </div>
    </div>
  );
}
