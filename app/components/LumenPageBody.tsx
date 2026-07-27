"use client";

/**
 * Page content shell under sticky header.
 * - view-transition-name: lumen-body (CSS dissolve on SoftLink nav)
 * - Framer enter as reliable fallback when VT doesn't fire
 */

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function LumenPageBody({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="lumen-page-body flex-1 min-w-0"
      initial={
        reduce
          ? false
          : { opacity: 0, y: 12, filter: "blur(10px)" }
      }
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration: reduce ? 0.12 : 0.4,
        ease: EASE,
        opacity: { duration: reduce ? 0.1 : 0.34 },
        filter: { duration: reduce ? 0.1 : 0.38 },
      }}
    >
      {children}
    </motion.div>
  );
}
