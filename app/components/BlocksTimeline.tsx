"use client";

import { motion } from "framer-motion";
import { RecentBlock } from "../types/ergo";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Pickaxe } from "lucide-react";

interface BlocksTimelineProps {
  blocks: RecentBlock[];
  currentHeight: number;
  onBlockClick?: (block: RecentBlock) => void;
}

/** Fixed row + gap so the list viewport fits exactly 6 items (no half-row) */
const ROW_H = "3.75rem"; // 60px
const GAP = "0.5rem"; // 8px
const VISIBLE = 6;
/** 6 rows + 5 gaps */
const LIST_H = `calc(${VISIBLE} * ${ROW_H} + ${VISIBLE - 1} * ${GAP})`;

function minerTone(label?: string): string {
  if (!label) return "text-[#A0A0B0]";
  const l = label.toLowerCase();
  if (l.includes("2miners")) return "text-[#F59E0B]";
  if (l.includes("herominers")) return "text-[#A78BFA]";
  if (l.includes("wooly")) return "text-[#38BDF8]";
  if (l.includes("kryptex")) return "text-[#34D399]";
  if (l === "solo") return "text-[#00E5FF]";
  if (l.includes("unknown")) return "text-[#A0A0B0]";
  return "text-[#E8C48A]";
}

export default function BlocksTimeline({
  blocks,
  currentHeight: _currentHeight,
  onBlockClick,
}: BlocksTimelineProps) {
  void _currentHeight; // tip shown in page hero; keep prop for API compat

  if (blocks.length === 0) {
    return (
      <div className="card glass rounded-2xl sm:rounded-3xl p-5 sm:p-6 h-full min-h-[320px] flex flex-col items-center justify-center text-center border border-white/[0.06]">
        <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3">
          <Pickaxe className="w-4 h-4 text-[#A0A0B0]" />
        </div>
        <div className="text-[#A0A0B0] text-sm tracking-widest font-mono">
          NO BLOCKS YET
        </div>
        <div className="text-xs mt-1 text-[#A0A0B0]/60">
          Waiting for node data…
        </div>
      </div>
    );
  }

  return (
    <div className="card glass rounded-2xl sm:rounded-3xl p-4 sm:p-5 h-full flex flex-col border border-white/[0.06] shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      {/* Header — no TIP badge */}
      <div className="flex-shrink-0 mb-3 sm:mb-4 px-0.5">
        <div className="font-mono text-[10px] sm:text-xs tracking-[3px] text-[#FF7A3D]">
          RECENT BLOCKS
        </div>
        <div className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5">
          Last {blocks.length} blocks
        </div>
        <div className="text-[10px] font-mono text-[#A0A0B0]/50 mt-1 tracking-wide">
          Miner via Explorer
        </div>
      </div>

      {/* Exactly 6 rows visible; scroll for the rest */}
      <div
        className="flex flex-col overflow-y-auto overflow-x-hidden pr-0.5 custom-scroll flex-shrink-0"
        style={{
          height: LIST_H,
          gap: GAP,
        }}
      >
        {blocks.map((block, index) => {
          const isNewest = index === 0;
          const timeAgo = formatDistanceToNow(new Date(block.timestamp), {
            addSuffix: true,
          });
          const hasMiner = !!block.minerLabel;

          return (
            <motion.div
              key={`${block.height}-${block.id || block.timestamp}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.015, ease: [0.23, 1, 0.32, 1] }}
              onClick={() => onBlockClick?.(block)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBlockClick?.(block);
                }
              }}
              className={`group relative shrink-0 overflow-hidden rounded-xl border cursor-pointer transition-colors active:scale-[0.995]
                ${
                  isNewest
                    ? "border-[#FF7A3D]/30 bg-[#FF7A3D]/[0.07]"
                    : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                }`}
              style={{ height: ROW_H }}
            >
              {isNewest && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF7A3D]" />
              )}

              {/*
                Clean grid — no overlap:
                [ height ] [ time · txs · latest ] [ chevron ]
                           [ miner row           ]
              */}
              <div className="h-full grid grid-cols-[minmax(4.75rem,auto)_1fr_1.25rem] items-center gap-x-2.5 sm:gap-x-3 pl-3 pr-2 sm:pl-3.5 sm:pr-2.5">
                {/* Height — fixed column */}
                <div
                  className={`font-mono text-[0.95rem] sm:text-lg font-semibold tracking-tighter tabular-nums leading-none whitespace-nowrap ${
                    isNewest ? "text-[#FF7A3D]" : "text-white"
                  }`}
                >
                  {block.height.toLocaleString()}
                </div>

                {/* Meta + miner */}
                <div className="min-w-0 flex flex-col justify-center gap-0.5 py-1">
                  <div className="flex items-center gap-1.5 min-w-0 text-[10px] sm:text-[11px] text-[#A0A0B0]">
                    <span className="truncate shrink min-w-0">{timeAgo}</span>
                    <span className="text-[#A0A0B0]/35 shrink-0">·</span>
                    <span className="font-mono tabular-nums shrink-0 text-[#A0A0B0]/70">
                      {block.txCount} TX
                    </span>
                    {isNewest && (
                      <>
                        <span className="text-[#A0A0B0]/35 shrink-0">·</span>
                        <span className="shrink-0 font-mono text-[9px] tracking-wider text-[#FF7A3D]/90">
                          LATEST
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <Pickaxe
                      className={`w-3 h-3 shrink-0 ${
                        hasMiner
                          ? minerTone(block.minerLabel)
                          : "text-[#A0A0B0]/35"
                      }`}
                    />
                    {hasMiner ? (
                      <span
                        className={`text-[11px] sm:text-xs font-medium truncate leading-tight ${minerTone(
                          block.minerLabel
                        )}`}
                      >
                        {block.minerLabel}
                        {block.minerShort ? (
                          <span className="text-[#A0A0B0]/65 font-mono font-normal">
                            {" · "}
                            {block.minerShort}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#A0A0B0]/40 tracking-wide animate-pulse truncate">
                        resolving miner…
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-3.5 h-3.5 text-[#A0A0B0]/30 group-hover:text-[#E8E8F0] transition-colors justify-self-end" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-[10px] text-center text-[#A0A0B0]/40 mt-3 font-mono tracking-[1px] flex-shrink-0">
        TAP FOR DETAILS
      </div>
    </div>
  );
}
