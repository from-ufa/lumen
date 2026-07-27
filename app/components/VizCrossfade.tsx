"use client";

/**
 * Premium Orbit ↔ Map crossfade with **keep-alive**.
 * Both views stay mounted after first use so WebGL Earth never remounts
 * (no texture reload gap). Soft opacity/blur dissolve; inactive layer
 * is pointer-events none.
 */

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE =
  "cubic-bezier(0.22, 1, 0.36, 1)";

export default function VizCrossfade({
  mode,
  orbit,
  map,
}: {
  mode: "constellation" | "map";
  orbit: ReactNode;
  map: ReactNode;
}) {
  const reduce = useReducedMotion();
  /** Mount map on first visit only — then keep forever */
  const [mapMounted, setMapMounted] = useState(mode === "map");

  useEffect(() => {
    if (mode === "map") setMapMounted(true);
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

  const orbitOn = mode === "constellation";
  const mapOn = mode === "map";

  const layerBase =
    "w-full will-change-[opacity,filter] transition-[opacity,filter]";
  const dur = reduce ? "duration-150" : "duration-500";
  const styleTransition = reduce
    ? { transitionDuration: "150ms", transitionTimingFunction: "ease" }
    : {
        transitionDuration: "480ms",
        transitionTimingFunction: EASE,
      };

  return (
    <div
      className="
        mb-3 md:mb-8 relative
        min-h-[min(52dvh,420px)] sm:min-h-[min(72vh,780px)]
      "
    >
      {/* Accent wash on mode change */}
      {!reduce && (
        <div
          aria-hidden
          key={mode}
          className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-[min(52dvh,420px)] sm:h-[min(72vh,780px)] rounded-[1.25rem] sm:rounded-2xl animate-[lumen-viz-wash_0.55s_ease-out_forwards]"
          style={{
            background:
              mode === "map"
                ? "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(0,229,255,0.12), transparent 70%)"
                : "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,122,61,0.14), transparent 70%)",
          }}
        />
      )}

      {/* Orbit — always mounted (default view) */}
      <div
        className={`${layerBase} ${dur} ${
          orbitOn
            ? "relative z-[2] opacity-100"
            : "absolute inset-0 z-[1] opacity-0 pointer-events-none"
        }`}
        style={{
          ...styleTransition,
          filter: orbitOn || reduce ? "none" : "blur(10px)",
        }}
        aria-hidden={!orbitOn}
      >
        {orbit}
      </div>

      {/* Map — keep-alive after first open */}
      {mapMounted && (
        <div
          className={`${layerBase} ${dur} ${
            mapOn
              ? "relative z-[2] opacity-100"
              : "absolute inset-0 z-[1] opacity-0 pointer-events-none"
          }`}
          style={{
            ...styleTransition,
            filter: mapOn || reduce ? "none" : "blur(10px)",
          }}
          aria-hidden={!mapOn}
        >
          {map}
        </div>
      )}
    </div>
  );
}
