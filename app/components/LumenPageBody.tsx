"use client";

/**
 * Page content shell under sticky header.
 * - view-transition-name: lumen-body (CSS dissolve on SoftLink nav — desktop)
 * - Framer enter as reliable fallback when VT doesn't fire
 * - Mobile: light opacity fade only (no blur — GPU cost on WebGL pages)
 */

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { isMobileUi } from "./soft-nav";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function LumenPageBody({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  // Client-only; false on SSR so desktop markup stays stable
  const [mobile] = useState(() => isMobileUi());

  const softMobile = !!mobile && !reduce;

  return (
    <motion.div
      className="lumen-page-body flex-1 min-w-0"
      initial={
        reduce
          ? false
          : softMobile
            ? { opacity: 0, y: 6 }
            : { opacity: 0, y: 12, filter: "blur(10px)" }
      }
      animate={
        softMobile
          ? { opacity: 1, y: 0 }
          : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      transition={{
        duration: reduce ? 0.12 : softMobile ? 0.22 : 0.4,
        ease: EASE,
        opacity: { duration: reduce ? 0.1 : softMobile ? 0.18 : 0.34 },
        ...(softMobile
          ? {}
          : { filter: { duration: reduce ? 0.1 : 0.38 } }),
      }}
    >
      {children}
    </motion.div>
  );
}
