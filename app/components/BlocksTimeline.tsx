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
  currentHeight,
  onBlockClick,
}: BlocksTimelineProps) {
  if (blocks.length === 0) {
    return (
      <div className="card glass rounded-2xl sm:rounded-3xl p-5 sm:p-6 h-full min-h-[380px] flex flex-col items-center justify-center text-center border border-white/[0.06]">
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
    <div className="card glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 h-full min-h-[380px] flex flex-col border border-white/[0.06] shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-between mb-4 sm:mb-5 px-0.5 flex-shrink-0 gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] sm:text-xs tracking-[3px] text-[#FF7A3D]">
            RECENT BLOCKS
          </div>
          <div className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5">
            Last {blocks.length} blocks
          </div>
          <div className="text-[10px] font-mono text-[#A0A0B0]/55 mt-1 tracking-wide">
            Miner via Explorer · honest attribution
          </div>
        </div>
        <div className="text-right flex-shrink-0 rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2">
          <div className="text-[9px] font-mono tracking-widest text-[#A0A0B0]">
            TIP
          </div>
          <div className="text-[#FF7A3D] text-lg sm:text-xl font-semibold tracking-tighter tabular-nums font-mono leading-none mt-0.5">
            {currentHeight.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-0.5 sm:pr-1.5 custom-scroll max-h-[min(400px,52vh)]">
        {blocks.map((block, index) => {
          const isNewest = index === 0;
          const timeAgo = formatDistanceToNow(new Date(block.timestamp), {
            addSuffix: true,
          });
          const hasMiner = !!block.minerLabel;

          return (
            <motion.div
              key={`${block.height}-${block.id || block.timestamp}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02, ease: [0.23, 1, 0.32, 1] }}
              onClick={() => onBlockClick?.(block)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBlockClick?.(block);
                }
              }}
              className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all active:scale-[0.995]
                ${
                  isNewest
                    ? "border-[#FF7A3D]/35 bg-gradient-to-r from-[#FF7A3D]/[0.1] to-transparent"
                    : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                }`}
            >
              {isNewest && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FF7A3D] shadow-[0_0_12px_rgba(255,122,61,0.5)]" />
              )}

              <div className="flex items-center justify-between gap-3 px-3.5 sm:px-4 py-3 sm:py-3.5">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`font-mono text-lg sm:text-xl font-semibold tracking-tighter tabular-nums flex-shrink-0 w-[4.5rem] sm:w-[5.25rem] ${
                      isNewest ? "text-[#FF7A3D]" : "text-white"
                    }`}
                  >
                    {block.height.toLocaleString()}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[11px] sm:text-xs text-[#A0A0B0] truncate">
                        {timeAgo}
                      </span>
                      <span className="text-[10px] font-mono text-[#A0A0B0]/55 tabular-nums">
                        {block.txCount} TX
                      </span>
                      {isNewest && (
                        <span className="text-[9px] font-mono tracking-wider text-[#FF7A3D]/90 px-1.5 py-0.5 rounded-md bg-[#FF7A3D]/10 border border-[#FF7A3D]/20">
                          LATEST
                        </span>
                      )}
                    </div>

                    {/* Miner always has a row — label or resolving */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Pickaxe
                        className={`w-3 h-3 shrink-0 ${
                          hasMiner ? minerTone(block.minerLabel) : "text-[#A0A0B0]/40"
                        }`}
                      />
                      {hasMiner ? (
                        <span
                          className={`text-[11px] sm:text-xs font-medium truncate ${minerTone(
                            block.minerLabel
                          )}`}
                        >
                          {block.minerLabel}
                          {block.minerShort ? (
                            <span className="text-[#A0A0B0]/70 font-mono font-normal">
                              {" "}
                              · {block.minerShort}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-[#A0A0B0]/45 tracking-wide animate-pulse">
                          resolving miner…
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-[#A0A0B0]/35 group-hover:text-[#E8E8F0] transition-colors flex-shrink-0" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-[10px] text-center text-[#A0A0B0]/45 mt-4 font-mono tracking-[1px] flex-shrink-0">
        TAP FOR DETAILS · SIGMASPACE IN MODAL
      </div>
    </div>
  );
}
