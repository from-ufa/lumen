"use client";

/**
 * Page content shell under sticky header.
 * - view-transition-name: lumen-body (CSS dissolve on SoftLink nav — desktop)
 * - Framer enter only when View Transitions won't cover it (mobile / no VT)
 * - Calm craft: opacity only — no y/scale (avoids double-jerk with VT)
 */

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { isMobileUi } from "./soft-nav";

const EASE = [0.25, 0.1, 0.25, 1] as const;

function supportsViewTransition(): boolean {
  if (typeof document === "undefined") return false;
  return (
    typeof (document as Document & { startViewTransition?: unknown })
      .startViewTransition === "function"
  );
}

export default function LumenPageBody({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [mobile] = useState(() => isMobileUi());
  // Desktop + VT: skip Framer enter (VT already fades body)
  const [skipEnter] = useState(
    () => !reduce && !isMobileUi() && supportsViewTransition()
  );

  if (reduce || skipEnter) {
    return (
      <div className="lumen-page-body flex-1 min-w-0">{children}</div>
    );
  }

  return (
    <motion.div
      className="lumen-page-body flex-1 min-w-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: mobile ? 0.15 : 0.18,
        ease: EASE,
      }}
    >
      {children}
    </motion.div>
  );
}
