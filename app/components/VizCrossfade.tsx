"use client";

/**
 * Premium Orbit ↔ Map crossfade with **keep-alive**.
 * Fixed-height slot so mode switches never reflow the page.
 * Craft: opacity-only, sub-300ms on desktop (no heavy blur over WebGL).
 */

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { isMobileUi } from "./soft-nav";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

export type OrbitMapMode = "constellation" | "map";

function Layer({
  on,
  reduce,
  mobile,
  children,
}: {
  on: boolean;
  reduce: boolean | null;
  mobile: boolean;
  children: ReactNode;
}) {
  // All platforms: snappy opacity crossfade (Emil: UI < 300ms)
  const ms = reduce ? 100 : mobile ? 180 : 240;

  return (
    <div
      className={`
        absolute inset-0 w-full h-full
        will-change-[opacity]
        transition-[opacity]
        ${on ? "z-[2] opacity-100" : "z-[1] opacity-0 pointer-events-none"}
        overflow-hidden
      `}
      style={{
        transitionDuration: `${ms}ms`,
        transitionTimingFunction: EASE,
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
}: {
  mode: OrbitMapMode;
  orbit: ReactNode;
  map: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [mobile] = useState(() => isMobileUi());
  const [mapMounted, setMapMounted] = useState(mode === "map");

  useEffect(() => {
    if (mode === "map") setMapMounted(true);
  }, [mode]);

  useEffect(() => {
    if (mode !== "map") return;
    const kick = () => window.dispatchEvent(new Event("resize"));
    const t0 = window.setTimeout(kick, 40);
    const t1 = window.setTimeout(kick, mobile ? 200 : 280);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [mode, mobile]);

  return (
    <div
      className="
        mb-3 md:mb-8 relative w-full
        h-[min(52dvh,420px)] min-h-[280px] max-h-[780px]
        sm:h-[min(72vh,780px)] sm:min-h-[480px]
        lg:min-h-[520px]
      "
    >
      {/* Soft accent wash — short, no blur on layers */}
      {!reduce && !mobile && (
        <div
          aria-hidden
          key={mode}
          className="pointer-events-none absolute inset-0 z-[3] rounded-[1.25rem] sm:rounded-2xl animate-[lumen-viz-wash_0.28s_ease-out_forwards]"
          style={{
            background:
              mode === "map"
                ? "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(0,229,255,0.10), transparent 70%)"
                : "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,122,61,0.12), transparent 70%)",
          }}
        />
      )}

      <Layer on={mode === "constellation"} reduce={reduce} mobile={mobile}>
        {orbit}
      </Layer>

      {mapMounted && (
        <Layer on={mode === "map"} reduce={reduce} mobile={mobile}>
          {map}
        </Layer>
      )}
    </div>
  );
}
