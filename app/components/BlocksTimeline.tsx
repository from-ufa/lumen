"use client";

import { motion } from "framer-motion";
import { RecentBlock } from "../types/ergo";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";

interface BlocksTimelineProps {
  blocks: RecentBlock[];
  currentHeight: number;
  onBlockClick?: (block: RecentBlock) => void;
}

export default function BlocksTimeline({
  blocks,
  currentHeight,
  onBlockClick,
}: BlocksTimelineProps) {
  if (blocks.length === 0) {
    return (
      <div className="card glass rounded-2xl sm:rounded-3xl p-5 sm:p-6 h-full min-h-[380px] flex flex-col items-center justify-center text-center">
        <div className="text-[#A0A0B0] text-sm tracking-widest">NO BLOCKS YET</div>
        <div className="text-xs mt-1 text-[#A0A0B0]/60">
          Waiting for node data...
        </div>
      </div>
    );
  }

  return (
    <div className="card glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 h-full min-h-[380px] flex flex-col">
      <div className="flex items-center justify-between mb-4 sm:mb-5 px-1 flex-shrink-0">
        <div>
          <div className="font-mono text-[10px] sm:text-xs tracking-[3px] text-[#FF7A3D]">
            RECENT BLOCKS
          </div>
          <div className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5">
            Last {blocks.length} blocks
          </div>
        </div>
        <div className="text-right text-xs font-mono text-[#A0A0B0]">
          CURRENT
          <br />
          <span className="text-[#FF7A3D] text-lg font-semibold tracking-tighter">
            {currentHeight.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1 sm:pr-2 custom-scroll max-h-[min(360px,48vh)]">
        {blocks.map((block, index) => {
          const isNewest = index === 0;
          const timeAgo = formatDistanceToNow(new Date(block.timestamp), {
            addSuffix: true,
          });

          return (
            <motion.div
              key={`${block.height}-${block.timestamp}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.025, ease: [0.23, 1, 0.32, 1] }}
              onClick={() => onBlockClick?.(block)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBlockClick?.(block);
                }
              }}
              className={`block-card group flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 rounded-2xl border-l-4 cursor-pointer
                ${
                  isNewest
                    ? "border-[#FF7A3D] bg-[#FF7A3D]/5"
                    : "border-white/10 hover:border-white/30 bg-white/[0.015]"
                }`}
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <div
                  className={`font-mono text-xl sm:text-2xl font-semibold tracking-tighter tabular-nums flex-shrink-0 ${
                    isNewest ? "text-[#FF7A3D]" : "text-white"
                  }`}
                >
                  {block.height}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-[#A0A0B0] truncate">{timeAgo}</div>
                  <div className="text-[10px] font-mono text-[#A0A0B0]/70 mt-px truncate">
                    {block.txCount} TXS
                    {block.minerLabel
                      ? ` · ${block.minerLabel}${
                          block.minerShort ? ` · ${block.minerShort}` : ""
                        }`
                      : ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <span className="text-[10px] font-mono tracking-widest hidden sm:inline">
                  DETAILS
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-[10px] text-center text-[#A0A0B0]/50 mt-4 font-mono tracking-[1px] flex-shrink-0">
        TAP A BLOCK FOR PREVIEW · SIGMASPACE IN MODAL
      </div>
    </div>
  );
}
