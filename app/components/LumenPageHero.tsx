"use client";

/**
 * Shared page hero for node dashboard + oracles.
 * Single source of vertical rhythm — keep both pages pixel-identical.
 *
 * Spacing contract:
 *   kicker  → title     : mb-1 on kicker
 *   title   → subtitle  : mt-1 on subtitle
 *   subtitle→ badges    : mt-3 on badges row
 *   hero    → next      : mb-6 sm:mb-8
 * Invite floats absolute top-right (zero layout height).
 */

import type { ReactNode } from "react";

const PR = "sm:pr-[min(23rem,42%)]";

export default function LumenPageHero({
  kicker,
  kickerClassName = "text-[#FF7A3D]",
  title,
  subtitle,
  badges,
  invite,
  footer,
}: {
  kicker: string;
  /** Accent color for kicker line (node orange / oracle gold) */
  kickerClassName?: string;
  title: string;
  subtitle: ReactNode;
  badges?: ReactNode;
  /** Absolute overlay (ConnectNodeInvite / ConnectOracleInvite) */
  invite?: ReactNode;
  /** Optional extra under badges (warnings) — does not change title stack */
  footer?: ReactNode;
}) {
  return (
    <div className="relative mb-6 sm:mb-8 min-w-0">
      {invite ? (
        <div className="absolute top-0 right-0 z-20 w-[min(100%,22rem)] max-w-[22rem] pointer-events-none">
          <div className="pointer-events-auto w-full flex justify-end">
            {invite}
          </div>
        </div>
      ) : null}

      <div
        className={`font-mono text-[10px] sm:text-xs tracking-[3px] sm:tracking-[4px] mb-1 ${kickerClassName}`}
      >
        {kicker}
      </div>

      <h1
        className={`text-[2rem] sm:text-5xl lg:text-6xl font-semibold tracking-[-1px] sm:tracking-[-1.6px] leading-[1.05] ${PR}`}
      >
        {title}
      </h1>

      <p
        className={`text-base sm:text-2xl text-[#A0A0B0] tracking-tight mt-1 ${PR}`}
      >
        {subtitle}
      </p>

      {badges ? (
        <div
          className={`mt-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-mono tracking-wider ${PR}`}
        >
          {badges}
        </div>
      ) : null}

      {footer}
    </div>
  );
}
