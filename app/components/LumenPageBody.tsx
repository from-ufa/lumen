"use client";

/**
 * Page content shell under sticky header.
 * - view-transition-name: lumen-body (CSS dissolve on SoftLink nav — desktop)
 * - Framer enter as reliable fallback when VT doesn't fire
 * - Craft: opacity + slight y only (no blur — GPU cost)
 */

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { isMobileUi } from "./soft-nav";

const EASE = [0.23, 1, 0.32, 1] as const;

export default function LumenPageBody({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [mobile] = useState(() => isMobileUi());

  const softMobile = !!mobile && !reduce;

  return (
    <motion.div
      className="lumen-page-body flex-1 min-w-0"
      initial={
        reduce
          ? false
          : softMobile
            ? { opacity: 0, y: 4 }
            : { opacity: 0, y: 8 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0.1 : softMobile ? 0.18 : 0.24,
        ease: EASE,
      }}
    >
      {children}
    </motion.div>
  );
}
