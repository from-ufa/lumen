"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Activity } from "lucide-react";
import { UnconfirmedTx } from "../types/ergo";
import { sigmaTxUrl } from "../lib/explorer";

interface MempoolFlowProps {
  txs: UnconfirmedTx[];
  size: number;
}

/** Same rhythm as Recent Blocks — exact visible rows, no half-cut items */
const ROW_H = "3.75rem"; // 60px
const GAP = "0.5rem"; // 8px
const VISIBLE = 6;
const LIST_H = `calc(${VISIBLE} * ${ROW_H} + ${VISIBLE - 1} * ${GAP})`;

/** Soft palette — premium, not neon chaos */
const TX_DOT_COLORS = [
  "#00E5FF",
  "#FF7A3D",
  "#10B981",
  "#A78BFA",
  "#F59E0B",
  "#38BDF8",
  "#F472B6",
  "#34D399",
] as const;

function colorForTx(id: string, index: number): string {
  if (id && id.length > 2) {
    let h = 0;
    for (let i = 0; i < Math.min(id.length, 16); i++) {
      h = (h * 31 + id.charCodeAt(i)) >>> 0;
    }
    return TX_DOT_COLORS[h % TX_DOT_COLORS.length];
  }
  return TX_DOT_COLORS[index % TX_DOT_COLORS.length];
}

function shortTxId(id: string): { head: string; tail: string } {
  if (!id || id.length < 16) return { head: id || "—", tail: "" };
  return { head: id.slice(0, 14), tail: id.slice(-6) };
}

export default function MempoolFlow({ txs, size }: MempoolFlowProps) {
  // Keep a few extra for scroll; viewport shows exactly 6
  const displayTxs = txs.slice(0, 12);

  return (
    <div className="card glass rounded-2xl sm:rounded-3xl p-4 sm:p-5 h-full flex flex-col border border-white/[0.06] shadow-[0_12px_40px_rgba(0,0,0,0.25)] overflow-hidden">
      {/* Header — aligned with Recent Blocks */}
      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4 px-0.5 flex-shrink-0">
        <div className="min-w-0">
          <div className="font-mono text-[10px] sm:text-xs tracking-[3px] text-[#00E5FF]">
            MEMPOOL FLOW
          </div>
          <div className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5">
            Pending Transactions
          </div>
          <div className="text-[10px] font-mono text-[#A0A0B0]/50 mt-1 tracking-wide">
            Live unconfirmed · SigmaSpace
          </div>
        </div>
        <div className="text-right flex-shrink-0 rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-1.5">
          <div className="font-mono text-xl sm:text-2xl font-semibold tracking-tighter tabular-nums text-[#00E5FF] leading-none">
            {size.toLocaleString()}
          </div>
          <div className="text-[9px] font-mono tracking-widest text-[#A0A0B0] mt-1">
            PENDING
          </div>
        </div>
      </div>

      {displayTxs.length > 0 ? (
        <div
          className="flex flex-col overflow-y-auto overflow-x-hidden pr-0.5 custom-scroll flex-shrink-0"
          style={{ height: LIST_H, gap: GAP }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {displayTxs.map((tx, index) => {
              const dot = colorForTx(tx.id, index);
              const { head, tail } = shortTxId(tx.id);
              return (
                <motion.a
                  key={tx.id}
                  href={sigmaTxUrl(tx.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open on SigmaSpace"
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{
                    delay: Math.min(index * 0.015, 0.12),
                    ease: [0.23, 1, 0.32, 1],
                  }}
                  className="group relative shrink-0 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-[#00E5FF]/25 hover:bg-white/[0.04] transition-colors cursor-pointer active:scale-[0.995]"
                  style={{ height: ROW_H }}
                >
                  <div className="h-full grid grid-cols-[0.75rem_1fr_auto] items-center gap-x-2.5 sm:gap-x-3 px-3 sm:px-3.5">
                    {/* Status dot */}
                    <div
                      className="w-2 h-2 rounded-full shrink-0 justify-self-center"
                      style={{
                        backgroundColor: dot,
                        boxShadow: `0 0 8px ${dot}66`,
                      }}
                    />

                    {/* TX id — single clean line, no overflow */}
                    <div className="min-w-0 font-mono text-[11px] sm:text-xs tracking-tight text-[#E8E8F0] group-hover:text-white">
                      <span className="block truncate">
                        {head}
                        {tail ? (
                          <span className="text-[#A0A0B0]/70">…{tail}</span>
                        ) : null}
                      </span>
                      <span className="block text-[9px] font-mono text-[#A0A0B0]/45 tracking-wider mt-0.5">
                        UNCONFIRMED
                      </span>
                    </div>

                    {/* Action */}
                    <div className="flex items-center gap-1.5 shrink-0 text-[#A0A0B0]/50 group-hover:text-[#00E5FF] transition-colors">
                      <span className="text-[9px] font-mono tracking-widest hidden sm:inline">
                        SIGMA
                      </span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </motion.a>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center text-center flex-shrink-0 rounded-xl border border-white/[0.05] bg-black/15"
          style={{ height: LIST_H }}
        >
          <div className="w-9 h-9 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-2.5">
            <Activity className="w-4 h-4 text-[#00E5FF]/60" />
          </div>
          <div className="text-[#A0A0B0] text-sm">Mempool is empty</div>
          <div className="text-[11px] text-[#A0A0B0]/50 mt-1 max-w-[16rem]">
            New transactions appear here in real time
          </div>
        </div>
      )}

      <div className="text-[10px] text-center text-[#A0A0B0]/40 mt-3 font-mono tracking-[1px] flex-shrink-0">
        TAP TX → SIGMASPACE · EVERY 8S
      </div>
    </div>
  );
}
