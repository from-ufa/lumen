"use client";

/**
 * Soft enter on every App Router navigation (Node ↔ Oracles, etc.).
 * Sticky headers live inside pages; this only eases content in.
 */

import { motion, useReducedMotion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className="flex-1 flex flex-col min-h-0">{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration: 0.42,
        ease: [0.22, 1, 0.36, 1],
        opacity: { duration: 0.36 },
        filter: { duration: 0.4 },
      }}
      className="flex-1 flex flex-col min-h-0 will-change-[opacity,transform,filter]"
    >
      {children}
    </motion.div>
  );
}
