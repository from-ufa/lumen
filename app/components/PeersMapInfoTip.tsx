"use client";

import { Info } from "lucide-react";

/** Shared copy for mapped vs peers (Metrics + World Map). */
export const PEERS_MAP_TOOLTIP =
  "Mapped = пиры с публичным IPv4 + успешной GeoIP. Именно они отображаются на карте.\nPrivate/unmappable = входящие соединения без публичного IP или без геоданных.";

/** Hover / focus info chip used on Metrics + World Map */
export function PeersMapInfoTip({
  className = "",
  /** Prefer "bottom" inside overflow-hidden map HUD */
  side = "top",
}: {
  className?: string;
  side?: "top" | "bottom";
}) {
  const pos =
    side === "bottom"
      ? "left-0 top-full mt-2"
      : "left-1/2 -translate-x-1/2 bottom-full mb-2";

  return (
    <span
      className={`relative inline-flex group/tip ${className}`}
      tabIndex={0}
      aria-label="Mapped vs total peers"
    >
      <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#A0A0B0]/80 group-hover/tip:text-[#00E5FF] group-focus/tip:text-[#00E5FF] transition-colors cursor-help" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[80] ${pos} w-[min(280px,70vw)] sm:w-[300px]
          opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible
          group-focus/tip:opacity-100 group-focus/tip:visible
          transition-opacity duration-150
          glass rounded-xl px-3 py-2.5 border border-white/15
          text-[10px] sm:text-[11px] font-mono leading-relaxed text-[#E8E8F0] tracking-normal normal-case
          shadow-xl shadow-black/50 whitespace-pre-line text-left`}
      >
        {PEERS_MAP_TOOLTIP}
      </span>
    </span>
  );
}
