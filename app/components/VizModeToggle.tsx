"use client";

/**
 * Orbit / Map / Oracles mode switcher with morphing active pill (layoutId).
 * Order: NETWORK ORBIT → WORLD MAP → ORACLES
 */

import { motion, useReducedMotion } from "framer-motion";
import { Globe2, Orbit, Gem } from "lucide-react";

export type VizMode = "constellation" | "map" | "oracles";

const EASE = [0.22, 1, 0.36, 1] as const;

const MODES = [
  {
    id: "constellation" as const,
    label: "NETWORK ORBIT",
    short: "ORBIT",
    Icon: Orbit,
    active: "text-[#FF7A3D]",
    pill: "bg-[#FF7A3D]/15 border border-[#FF7A3D]/30",
    compactActive:
      "bg-[#FF7A3D]/15 text-[#FF7A3D] border-[#FF7A3D]/30",
  },
  {
    id: "map" as const,
    label: "WORLD MAP",
    short: "WORLD MAP",
    Icon: Globe2,
    active: "text-[#00E5FF]",
    pill: "bg-[#00E5FF]/15 border border-[#00E5FF]/30",
    compactActive:
      "bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/30",
  },
  {
    id: "oracles" as const,
    label: "ORACLES",
    short: "ORACLES",
    Icon: Gem,
    active: "text-[#E8C547]",
    pill: "bg-[#E8C547]/15 border border-[#E8C547]/30",
    compactActive:
      "bg-[#E8C547]/15 text-[#E8C547] border-[#E8C547]/30",
  },
] as const;

export default function VizModeToggle({
  mode,
  onChange,
  onPrefetchMode,
  layoutId = "lumen-viz-mode-pill",
  compact = false,
}: {
  mode: VizMode;
  onChange: (m: VizMode) => void;
  /** Warm route/chunks before tap (map leaflet, /oracles page) */
  onPrefetchMode?: (m: VizMode) => void;
  layoutId?: string;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();

  if (compact) {
    return (
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl lumen-glow-panel lumen-glow-panel--cyan border border-white/10 relative hover:!translate-y-0">
        {MODES.map((t) => {
          const on = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              onPointerEnter={() => onPrefetchMode?.(t.id)}
              onTouchStart={() => onPrefetchMode?.(t.id)}
              className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-1.5 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-[11px] font-mono tracking-wider transition-colors ${
                on
                  ? t.compactActive + " border"
                  : "text-[#A0A0B0] border border-transparent"
              }`}
            >
              {on && !reduce && (
                <motion.span
                  layoutId={`${layoutId}-mobile`}
                  className="absolute inset-0 rounded-xl bg-white/[0.04]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <t.Icon className="w-3.5 h-3.5 relative z-[1] shrink-0" />
              <span className="relative z-[1] text-center leading-tight">
                {t.short}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex p-1 rounded-2xl lumen-glow-panel lumen-glow-panel--cyan border border-white/10 relative hover:!translate-y-0">
      {MODES.map((t) => {
        const on = mode === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            onPointerEnter={() => onPrefetchMode?.(t.id)}
            className={`relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-[10px] sm:text-xs font-mono tracking-widest transition-colors ${
              on ? t.active : "text-[#A0A0B0] hover:text-white"
            }`}
          >
            {on && (
              <motion.span
                layoutId={layoutId}
                className={`absolute inset-0 rounded-xl ${t.pill}`}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 380, damping: 32, mass: 0.7 }
                }
              />
            )}
            <t.Icon className="w-3.5 h-3.5 relative z-[1] shrink-0" />
            <span className="relative z-[1] whitespace-nowrap">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Soft viewMode setter — View Transitions on desktop only (not mobile). */
export function softSetViewMode(
  next: VizMode,
  setMode: (m: VizMode) => void
) {
  if (typeof document === "undefined") {
    setMode(next);
    return;
  }
  // Mobile: instant mode switch — VT freezes with WebGL/Leaflet snapshots
  try {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 767px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      setMode(next);
      return;
    }
  } catch {
    setMode(next);
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === "function") {
    try {
      doc.startViewTransition(() => {
        setMode(next);
      });
      return;
    } catch {
      /* fall through */
    }
  }
  setMode(next);
}
