"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { UnconfirmedTx } from "../types/ergo";
import { sigmaTxUrl } from "../lib/explorer";

interface MempoolFlowProps {
  txs: UnconfirmedTx[];
  size: number;
}

/** Palette for pending TX dots — dark-theme friendly, distinct from each other */
const TX_DOT_COLORS = [
  "#00E5FF", // cyan
  "#FF7A3D", // ergo orange
  "#10B981", // emerald
  "#A78BFA", // soft violet
  "#F59E0B", // amber
  "#F472B6", // pink
  "#38BDF8", // sky
  "#34D399", // mint
] as const;

function colorForTx(id: string, index: number): string {
  // Prefer stable color from tx id hash; fall back to index
  if (id && id.length > 2) {
    let h = 0;
    for (let i = 0; i < Math.min(id.length, 16); i++) {
      h = (h * 31 + id.charCodeAt(i)) >>> 0;
    }
    return TX_DOT_COLORS[h % TX_DOT_COLORS.length];
  }
  return TX_DOT_COLORS[index % TX_DOT_COLORS.length];
}

export default function MempoolFlow({ txs, size }: MempoolFlowProps) {
  const displayTxs = txs.slice(0, 12);

  return (
    <div className="card glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 h-full min-h-[380px] flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-4 sm:mb-5 flex-shrink-0">
        <div className="min-w-0">
          <div className="font-mono text-[10px] sm:text-xs tracking-[3px] text-[#00E5FF]">
            MEMPOOL FLOW
          </div>
          <div className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5">
            Pending Transactions
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl sm:text-4xl font-semibold tracking-tighter tabular-nums text-[#00E5FF]">
            {size}
          </div>
          <div className="text-[10px] font-mono -mt-0.5 text-[#A0A0B0]">
            IN MEMPOOL
          </div>
        </div>
      </div>

      {displayTxs.length > 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 sm:pr-2 custom-scroll max-h-[min(360px,48vh)] space-y-2">
          <AnimatePresence>
            {displayTxs.map((tx, index) => {
              const dot = colorForTx(tx.id, index);
              return (
                <motion.a
                  key={tx.id}
                  href={sigmaTxUrl(tx.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open on SigmaSpace"
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="mempool-particle group flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-white/25 hover:bg-white/[0.07] transition-all cursor-pointer"
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-black/40"
                    style={{
                      backgroundColor: dot,
                      boxShadow: `0 0 10px ${dot}88`,
                    }}
                  />
                  <div className="font-mono text-xs text-[#E8E8F0] truncate flex-1 tracking-tight group-hover:text-white">
                    {tx.id.slice(0, 18)}…{tx.id.slice(-6)}
                  </div>
                  <ExternalLink className="w-3 h-3 text-[#A0A0B0] opacity-0 group-hover:opacity-100 flex-shrink-0" />
                  <div className="text-[9px] font-mono text-[#A0A0B0] opacity-60 group-hover:opacity-100">
                    SIGMA
                  </div>
                </motion.a>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex-1 min-h-[120px] flex items-center justify-center text-center max-h-[min(360px,48vh)]">
          <div>
            <div className="text-[#A0A0B0] text-sm">Mempool is empty</div>
            <div className="text-xs text-[#A0A0B0]/50 mt-1">
              New transactions will appear here in real time
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 text-[10px] text-center text-[#A0A0B0]/50 font-mono tracking-[1px] flex-shrink-0">
        CLICK TX → SIGMASPACE.IO · UPDATED EVERY 8 SECONDS
      </div>
    </div>
  );
}
