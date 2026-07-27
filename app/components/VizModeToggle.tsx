"use client";

/**
 * Orbit / Map mode switcher with morphing active pill (layoutId).
 */

import { motion, useReducedMotion } from "framer-motion";
import { Globe2, Orbit } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function VizModeToggle({
  mode,
  onChange,
  layoutId = "lumen-viz-mode-pill",
  compact = false,
}: {
  mode: "constellation" | "map";
  onChange: (m: "constellation" | "map") => void;
  layoutId?: string;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl glass border border-white/10 relative">
        {(
          [
            { id: "constellation" as const, label: "ORBIT", Icon: Orbit, active: "bg-[#FF7A3D]/15 text-[#FF7A3D] border-[#FF7A3D]/30" },
            { id: "map" as const, label: "WORLD MAP", Icon: Globe2, active: "bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/30" },
          ] as const
        ).map((t) => {
          const on = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`relative flex items-center justify-center gap-1.5 px-2 py-3 rounded-xl text-[11px] font-mono tracking-wider transition-colors ${
                on ? t.active + " border" : "text-[#A0A0B0] border border-transparent"
              }`}
            >
              {on && !reduce && (
                <motion.span
                  layoutId={`${layoutId}-mobile`}
                  className="absolute inset-0 rounded-xl bg-white/[0.04]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <t.Icon className="w-3.5 h-3.5 relative z-[1]" />
              <span className="relative z-[1]">{t.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex p-1 rounded-2xl glass border border-white/10 relative">
      {(
        [
          {
            id: "constellation" as const,
            label: "NETWORK ORBIT",
            Icon: Orbit,
            active: "text-[#FF7A3D]",
            pill: "bg-[#FF7A3D]/15 border border-[#FF7A3D]/30",
          },
          {
            id: "map" as const,
            label: "WORLD MAP",
            Icon: Globe2,
            active: "text-[#00E5FF]",
            pill: "bg-[#00E5FF]/15 border border-[#00E5FF]/30",
          },
        ] as const
      ).map((t) => {
        const on = mode === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono tracking-widest transition-colors ${
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
            <t.Icon className="w-3.5 h-3.5 relative z-[1]" />
            <span className="relative z-[1]">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Soft viewMode setter — uses View Transitions API when available */
export function softSetViewMode(
  next: "constellation" | "map",
  setMode: (m: "constellation" | "map") => void
) {
  if (typeof document === "undefined") {
    setMode(next);
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (
    typeof doc.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
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
