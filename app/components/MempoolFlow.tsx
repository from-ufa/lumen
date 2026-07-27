"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Activity } from "lucide-react";
import { UnconfirmedTx } from "../types/ergo";
import { openTxOnSigmaSpace } from "../lib/explorer";
import ExternalOpenConfirm from "./ExternalOpenConfirm";

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

function shortTxId(id: string): { head: string; tail: string; full: string } {
  if (!id || id.length < 16) return { head: id || "—", tail: "", full: id || "—" };
  return { head: id.slice(0, 14), tail: id.slice(-6), full: id };
}

export default function MempoolFlow({ txs, size }: MempoolFlowProps) {
  const displayTxs = txs.slice(0, 12);
  const [pendingTx, setPendingTx] = useState<string | null>(null);

  const requestOpen = useCallback((id: string) => {
    setPendingTx(id);
  }, []);

  const cancelOpen = useCallback(() => setPendingTx(null), []);

  const confirmOpen = useCallback(() => {
    if (!pendingTx) return;
    openTxOnSigmaSpace(pendingTx);
    setPendingTx(null);
  }, [pendingTx]);

  return (
    <div className="lumen-glow-panel lumen-glow-panel--cyan rounded-2xl sm:rounded-3xl p-4 sm:p-5 h-full flex flex-col overflow-hidden">
      <span className="lumen-glow-orb lumen-glow-orb--a" aria-hidden />
      <span className="lumen-glow-orb lumen-glow-orb--b" aria-hidden />

      {/* Header — same rhythm as Recent Blocks */}
      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4 px-0.5 flex-shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className="lumen-glow-icon w-9 h-9 sm:w-10 sm:h-10 shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="lumen-glow-kicker flex items-center gap-2">
              <span className="lumen-glow-pulse" />
              Mempool flow
            </div>
            <div className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5 text-white">
              Pending Transactions
            </div>
            <div className="text-[10px] font-mono text-[#6B6B78] mt-1 tracking-wide">
              Live unconfirmed · SigmaSpace
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
            {size.toLocaleString()}
          </div>
          <div className="text-[9px] font-mono tracking-widest text-[#8B8B9A] mt-1 uppercase">
            Pending
          </div>
        </div>
      </div>

      {displayTxs.length > 0 ? (
        <div
          className="flex flex-col overflow-y-auto overflow-x-hidden pr-0.5 lumen-glow-scroll flex-shrink-0"
          style={{ height: LIST_H, gap: GAP }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {displayTxs.map((tx, index) => {
              const dot = colorForTx(tx.id, index);
              const { head, tail } = shortTxId(tx.id);
              return (
                <motion.button
                  key={tx.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{
                    delay: Math.min(index * 0.015, 0.12),
                    ease: [0.23, 1, 0.32, 1],
                  }}
                  onClick={() => requestOpen(tx.id)}
                  className="group relative shrink-0 overflow-hidden lumen-glow-row cursor-pointer active:scale-[0.995] text-left w-full"
                  style={{ height: ROW_H }}
                >
                  <div className="h-full grid grid-cols-[0.75rem_1fr_auto] items-center gap-x-2.5 sm:gap-x-3 px-3 sm:px-3.5">
                    <div
                      className="w-2 h-2 rounded-full shrink-0 justify-self-center"
                      style={{
                        backgroundColor: dot,
                        boxShadow: `0 0 10px ${dot}88`,
                      }}
                    />

                    <div className="min-w-0 font-mono text-[11px] sm:text-xs tracking-tight text-[#E8E8F0] group-hover:text-white">
                      <span className="block truncate">
                        {head}
                        {tail ? (
                          <span className="text-[#A0A0B0]/70">…{tail}</span>
                        ) : null}
                      </span>
                      <span className="block text-[9px] font-mono text-[#5C5C6A] tracking-wider mt-0.5 uppercase">
                        Unconfirmed
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-[#5C5C6A]">
                      <span className="text-[9px] font-mono tracking-widest hidden sm:inline group-hover:text-[var(--lumen-accent)] transition-colors">
                        SIGMA
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 group-hover:text-[var(--lumen-accent)] transition-colors" />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center text-center flex-shrink-0 lumen-glow-inset"
          style={{ height: LIST_H }}
        >
          <div className="lumen-glow-icon w-10 h-10 mb-2.5">
            <Activity className="w-4 h-4" />
          </div>
          <div className="text-[#A0A0B0] text-sm">Mempool is empty</div>
          <div className="text-[11px] text-[#5C5C6A] mt-1 max-w-[16rem]">
            New transactions appear here in real time
          </div>
        </div>
      )}

      <div className="text-[10px] text-center text-[#5C5C6A] mt-3 font-mono tracking-[0.12em] flex-shrink-0 uppercase">
        Tap · confirm · SigmaSpace
      </div>

      <ExternalOpenConfirm
        open={!!pendingTx}
        accent="cyan"
        title="Open on SigmaSpace?"
        subtitle="Leaves lumen · opens a new tab"
        badge="TX"
        badgeColor="#00E5FF"
        meta="unconfirmed"
        detail={pendingTx || ""}
        hostLabel="sigmaspace.io"
        onCancel={cancelOpen}
        onConfirm={confirmOpen}
      />
    </div>
  );
}
