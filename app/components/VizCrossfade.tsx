"use client";

/**
 * Premium Orbit ↔ Map crossfade.
 * mode="wait" so exit completes before enter — soft dissolve, no layout thrash.
 * Outer min-height matches .lumen-viz so the page never jumps mid-switch.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

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

  return (
    <div
      className="
        mb-3 md:mb-8 relative
        min-h-[min(52dvh,420px)] sm:min-h-[min(72vh,780px)]
      "
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: 14, scale: 0.985, filter: "blur(12px)" }
          }
          animate={
            reduce
              ? { opacity: 1 }
              : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
          }
          exit={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: -10, scale: 1.01, filter: "blur(10px)" }
          }
          transition={{
            duration: reduce ? 0.14 : 0.4,
            ease: EASE,
            opacity: { duration: reduce ? 0.12 : 0.34 },
            filter: { duration: reduce ? 0.12 : 0.36 },
          }}
          className="w-full will-change-[opacity,transform,filter]"
        >
          {/* Cinematic accent wash (fades with content) */}
          {!reduce && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[min(52dvh,420px)] sm:h-[min(72vh,780px)] rounded-[1.25rem] sm:rounded-2xl"
              initial={{ opacity: 0.35 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0.25 }}
              transition={{ duration: 0.5, ease: EASE }}
              style={{
                background:
                  mode === "map"
                    ? "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(0,229,255,0.12), transparent 70%)"
                    : "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,122,61,0.14), transparent 70%)",
              }}
            />
          )}
          <div className="relative z-[1]">{mode === "constellation" ? orbit : map}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
