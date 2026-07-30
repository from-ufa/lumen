"use client";

/**
 * Page content shell under sticky header.
 * Soft enter: opacity only (same calm feel as Mini App — no View Transition body).
 */

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.25, 0.1, 0.25, 1] as const;

export default function LumenPageBody({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className="lumen-page-body flex-1 min-w-0">{children}</div>
    );
  }

  return (
    <motion.div
      className="lumen-page-body flex-1 min-w-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
