"use client";

/**
 * Shared mode bar above viz / oracle dual view.
 * Identical height + layout on dashboard and /oracles so SoftLink switches
 * do not reflow the page (toggle + caption + TIP/HEADERS numbers).
 */

import VizModeToggle, { type VizMode } from "./VizModeToggle";

const CAPTION: Record<VizMode, string> = {
  constellation: "NETWORK ORBIT · EARTH CORE · ORBITAL PEERS",
  map: "PEERS BY GEOIP · CITY-LEVEL ACCURACY",
  oracles: "ERG/USD · ERG/XAU · CONSENSUS · LIVE POOLS",
};

export default function VizModeChrome({
  mode,
  onSelectMode,
  onPrefetchMode,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  rightAccentClass = "text-[#FF7A3D]",
}: {
  mode: VizMode;
  onSelectMode: (m: VizMode) => void;
  onPrefetchMode?: (m: VizMode) => void;
  leftLabel: string;
  leftValue: string | number;
  rightLabel: string;
  rightValue: string | number;
  /** e.g. text-[#FF7A3D] node · text-[#E8C547] oracles */
  rightAccentClass?: string;
}) {
  return (
    <>
      <div className="mb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-6">
        <div className="hidden md:flex items-center gap-2 min-w-0 flex-1">
          <VizModeToggle
            mode={mode}
            onChange={onSelectMode}
            onPrefetchMode={onPrefetchMode}
          />
          <span className="text-[10px] font-mono text-[#A0A0B0]/60 tracking-widest min-h-[1.25rem] leading-tight truncate">
            {CAPTION[mode]}
          </span>
        </div>

        <div className="flex items-end justify-end gap-3 sm:gap-6 text-sm shrink-0 self-end md:self-auto min-h-[3.5rem] sm:min-h-[4.25rem]">
          <div className="text-right">
            <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest font-mono">
              {leftLabel}
            </div>
            <div className="font-mono text-3xl sm:text-5xl tracking-[-1.5px] tabular-nums text-white mt-0.5 leading-none">
              {typeof leftValue === "number"
                ? leftValue.toLocaleString()
                : leftValue}
            </div>
          </div>
          <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest self-end pb-1.5 sm:pb-2 font-mono">
            /
          </div>
          <div className="text-right">
            <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest font-mono">
              {rightLabel}
            </div>
            <div
              className={`font-mono text-3xl sm:text-5xl tracking-[-1.5px] tabular-nums mt-0.5 leading-none ${rightAccentClass}`}
            >
              {typeof rightValue === "number"
                ? rightValue.toLocaleString()
                : rightValue}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: same toggle under-slot pattern as dashboard */}
      <div className="md:hidden mb-4 space-y-2">
        <VizModeToggle
          compact
          mode={mode}
          onChange={onSelectMode}
          onPrefetchMode={onPrefetchMode}
        />
        <p className="text-[10px] font-mono text-[#A0A0B0]/55 tracking-widest text-center min-h-[1.25rem]">
          {CAPTION[mode]}
        </p>
      </div>
    </>
  );
}
