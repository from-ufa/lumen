"use client";

/**
 * Page content shell under sticky header.
 *
 * Soft enter like Mini App: pure CSS opacity fade only.
 * No Framer Motion here — initial={{ opacity: 0 }} can stick on client
 * navigation and leave only the lumen header visible.
 */

import type { ReactNode } from "react";

export default function LumenPageBody({ children }: { children: ReactNode }) {
  return (
    <div className="lumen-page-body lumen-page-body-soft flex-1 min-w-0">
      {children}
    </div>
  );
}
