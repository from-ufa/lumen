"use client";

/**
 * App Router template — remounts on navigation.
 * Intentionally NO motion here: sticky headers live inside pages and must
 * stay solid. Soft dissolves: CSS on `.lumen-page-body-soft` (globals.css)
 * + VizCrossfade for Orbit/Map.
 */

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col min-h-0">{children}</div>;
}
