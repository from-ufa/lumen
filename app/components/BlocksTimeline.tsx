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
      <div className="lumen-glow-panel lumen-glow-panel--orange rounded-2xl sm:rounded-3xl p-5 sm:p-6 h-full min-h-[320px] flex flex-col items-center justify-center text-center">
        <span className="lumen-glow-orb lumen-glow-orb--a" aria-hidden />
        <span className="lumen-glow-orb lumen-glow-orb--b" aria-hidden />
        <div className="lumen-glow-icon w-11 h-11 mb-3">
          <Pickaxe className="w-4 h-4" />
        </div>
        <div className="lumen-glow-kicker">No blocks yet</div>
        <div className="text-xs mt-2 text-[#6B6B78]">
          Waiting for node data…
        </div>
      </div>
    );
  }

  return (
    <div className="lumen-glow-panel lumen-glow-panel--orange rounded-2xl sm:rounded-3xl p-4 sm:p-5 h-full flex flex-col overflow-hidden">
      <span className="lumen-glow-orb lumen-glow-orb--a" aria-hidden />
      <span className="lumen-glow-orb lumen-glow-orb--b" aria-hidden />

      {/* Header — same rhythm as Mempool Flow */}
      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4 px-0.5 flex-shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className="lumen-glow-icon w-9 h-9 sm:w-10 sm:h-10 shrink-0">
            <Pickaxe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="lumen-glow-kicker flex items-center gap-2">
              <span className="lumen-glow-pulse" />
              Recent blocks
            </div>
            <div className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5 text-white">
              Last {blocks.length} blocks
            </div>
            <div className="text-[10px] font-mono text-[#6B6B78] mt-1 tracking-wide">
              Miner via Explorer · SigmaSpace
            </div>
          </div>
        </div>
        <div
          className="text-right flex-shrink-0 rounded-xl border px-2.5 py-1.5"
          style={{
            borderColor:
              "color-mix(in srgb, var(--lumen-accent) 28%, transparent)",
            background:
              "color-mix(in srgb, var(--lumen-accent) 8%, rgba(0,0,0,0.35))",
            boxShadow:
              "0 0 20px color-mix(in srgb, var(--lumen-glow) 30%, transparent)",
          }}
        >
          <div
            className="lumen-glow-value--accent font-mono text-xl sm:text-2xl font-semibold tracking-tighter tabular-nums leading-none"
            style={{
              color: "var(--lumen-accent)",
              textShadow:
                "0 0 18px color-mix(in srgb, var(--lumen-glow) 85%, transparent)",
            }}
          >
            {blocks.length}
          </div>
          <div className="text-[9px] font-mono tracking-widest text-[#8B8B9A] mt-1 uppercase">
            Shown
          </div>
        </div>
      </div>

      {/* Exactly 6 rows visible; scroll for the rest */}
      <div
        className="flex flex-col overflow-y-auto overflow-x-hidden pr-0.5 lumen-glow-scroll flex-shrink-0"
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
              className={`group relative shrink-0 overflow-hidden lumen-glow-row cursor-pointer active:scale-[0.995] ${
                isNewest ? "lumen-glow-row--hot" : ""
              }`}
              style={{ height: ROW_H }}
            >
              {isNewest && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{
                    background: "var(--lumen-accent)",
                    boxShadow: "0 0 12px var(--lumen-glow)",
                  }}
                />
              )}

              <div className="h-full grid grid-cols-[minmax(4.75rem,auto)_1fr_1.25rem] items-center gap-x-2.5 sm:gap-x-3 pl-3 pr-2 sm:pl-3.5 sm:pr-2.5">
                <div
                  className={`font-mono text-[0.95rem] sm:text-lg font-semibold tracking-tighter tabular-nums leading-none whitespace-nowrap ${
                    isNewest
                      ? "lumen-glow-value--accent"
                      : "text-white"
                  }`}
                  style={
                    isNewest
                      ? {
                          color: "var(--lumen-accent)",
                          textShadow:
                            "0 0 16px color-mix(in srgb, var(--lumen-glow) 80%, transparent)",
                        }
                      : undefined
                  }
                >
                  {block.height.toLocaleString()}
                </div>

                <div className="min-w-0 flex flex-col justify-center gap-0.5 py-1">
                  <div className="flex items-center gap-1.5 min-w-0 text-[10px] sm:text-[11px] text-[#8B8B9A]">
                    <span className="truncate shrink min-w-0">{timeAgo}</span>
                    <span className="text-[#5C5C6A] shrink-0">·</span>
                    <span className="font-mono tabular-nums shrink-0 text-[#A0A0B0]/80">
                      {block.txCount} TX
                    </span>
                    {isNewest && (
                      <>
                        <span className="text-[#5C5C6A] shrink-0">·</span>
                        <span
                          className="shrink-0 font-mono text-[9px] tracking-wider uppercase"
                          style={{ color: "var(--lumen-accent)" }}
                        >
                          Latest
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

                <ChevronRight className="w-3.5 h-3.5 text-[#5C5C6A] group-hover:text-[#E8E8F0] transition-colors justify-self-end" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-[10px] text-center text-[#5C5C6A] mt-3 font-mono tracking-[0.12em] flex-shrink-0 uppercase">
        Tap · details · confirm · SigmaSpace
      </div>
    </div>
  );
}
