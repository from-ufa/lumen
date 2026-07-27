"use client";

/**
 * Premium Orbit ↔ Map ↔ Oracles crossfade with **keep-alive**.
 * Fixed-height slot (same as .lumen-viz) so mode switches never reflow the page.
 * Layers are absolute; inactive = opacity 0 + pointer-events none.
 */

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import type { VizMode } from "./VizModeToggle";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function washColor(mode: VizMode): string {
  if (mode === "map")
    return "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(0,229,255,0.12), transparent 70%)";
  if (mode === "oracles")
    return "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(232,197,71,0.14), transparent 70%)";
  return "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,122,61,0.14), transparent 70%)";
}

function Layer({
  on,
  reduce,
  children,
  scroll,
}: {
  on: boolean;
  reduce: boolean | null;
  children: ReactNode;
  /** Oracles dual panels may need internal scroll inside fixed slot */
  scroll?: boolean;
}) {
  const styleTransition = reduce
    ? { transitionDuration: "150ms", transitionTimingFunction: "ease" }
    : {
        transitionDuration: "480ms",
        transitionTimingFunction: EASE,
      };

  return (
    <div
      className={`
        absolute inset-0 w-full h-full
        will-change-[opacity,filter]
        transition-[opacity,filter]
        ${reduce ? "duration-150" : "duration-500"}
        ${on ? "z-[2] opacity-100" : "z-[1] opacity-0 pointer-events-none"}
        ${scroll ? "overflow-y-auto overflow-x-hidden lumen-glow-scroll" : "overflow-hidden"}
      `}
      style={{
        ...styleTransition,
        filter: on || reduce ? "none" : "blur(10px)",
      }}
      aria-hidden={!on}
    >
      {children}
    </div>
  );
}

export default function VizCrossfade({
  mode,
  orbit,
  map,
  oracles,
}: {
  mode: VizMode;
  orbit: ReactNode;
  map: ReactNode;
  oracles: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [mapMounted, setMapMounted] = useState(mode === "map");
  const [oraclesMounted, setOraclesMounted] = useState(mode === "oracles");

  useEffect(() => {
    if (mode === "map") setMapMounted(true);
    if (mode === "oracles") setOraclesMounted(true);
  }, [mode]);

  // Leaflet needs size tick when the keep-alive layer becomes visible again
  useEffect(() => {
    if (mode !== "map") return;
    const kick = () => window.dispatchEvent(new Event("resize"));
    const t0 = window.setTimeout(kick, 40);
    const t1 = window.setTimeout(kick, 520);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [mode]);

  return (
    <div
      className="
        mb-3 md:mb-8 relative w-full
        h-[min(52dvh,420px)] min-h-[280px] max-h-[780px]
        sm:h-[min(72vh,780px)] sm:min-h-[480px]
        lg:min-h-[520px]
      "
    >
      {/* Accent wash on mode change */}
      {!reduce && (
        <div
          aria-hidden
          key={mode}
          className="pointer-events-none absolute inset-0 z-[3] rounded-[1.25rem] sm:rounded-2xl animate-[lumen-viz-wash_0.55s_ease-out_forwards]"
          style={{ background: washColor(mode) }}
        />
      )}

      <Layer on={mode === "constellation"} reduce={reduce}>
        {orbit}
      </Layer>

      {mapMounted && (
        <Layer on={mode === "map"} reduce={reduce}>
          {map}
        </Layer>
      )}

      {oraclesMounted && (
        <Layer on={mode === "oracles"} reduce={reduce} scroll>
          {oracles}
        </Layer>
      )}
    </div>
  );
}
