"use client";

/**
 * Premium Orbit ↔ Map crossfade with **keep-alive**.
 * Fixed-height slot (same as .lumen-viz) so mode switches never reflow the page.
 * Oracles is a separate route (/oracles) — not embedded here.
 */

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export type OrbitMapMode = "constellation" | "map";

function Layer({
  on,
  reduce,
  children,
}: {
  on: boolean;
  reduce: boolean | null;
  children: ReactNode;
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
        overflow-hidden
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
}: {
  mode: OrbitMapMode;
  orbit: ReactNode;
  map: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [mapMounted, setMapMounted] = useState(mode === "map");

  useEffect(() => {
    if (mode === "map") setMapMounted(true);
  }, [mode]);

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
      {!reduce && (
        <div
          aria-hidden
          key={mode}
          className="pointer-events-none absolute inset-0 z-[3] rounded-[1.25rem] sm:rounded-2xl animate-[lumen-viz-wash_0.55s_ease-out_forwards]"
          style={{
            background:
              mode === "map"
                ? "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(0,229,255,0.12), transparent 70%)"
                : "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,122,61,0.14), transparent 70%)",
          }}
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
    </div>
  );
}
