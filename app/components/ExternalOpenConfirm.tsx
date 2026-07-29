"use client";

/**
 * Shared “leave lumen → open external” confirm dialog.
 * Used by oracle operators, mempool txs, and block explorers.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";

export type ExternalOpenConfirmProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  /** Small mono badge (LIVE, TX, BLOCK…) */
  badge?: string;
  badgeColor?: string;
  /** Optional muted meta after badge */
  meta?: string;
  /** Main mono body (address / tx id / block id) */
  detail: string;
  /** Full string for title attr */
  detailTitle?: string;
  hostLabel?: string;
  /** Accent for glow + primary button */
  accent?: "teal" | "cyan" | "orange";
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const ACCENT = {
  teal: {
    glow: "rgba(45,212,191,0.22)",
    btnBorder: "border-[#2DD4BF]/35",
    btnBg: "bg-[#2DD4BF]/[0.12] hover:bg-[#2DD4BF]/[0.18] hover:border-[#2DD4BF]/50",
    btnText: "text-[#A7F3E8]",
    btnShadow: "shadow-[0_0_20px_rgba(45,212,191,0.15)]",
    iconVar: "#2DD4BF",
  },
  cyan: {
    glow: "rgba(0,229,255,0.22)",
    btnBorder: "border-[#00E5FF]/35",
    btnBg: "bg-[#00E5FF]/[0.12] hover:bg-[#00E5FF]/[0.18] hover:border-[#00E5FF]/50",
    btnText: "text-[#A5F3FC]",
    btnShadow: "shadow-[0_0_20px_rgba(0,229,255,0.15)]",
    iconVar: "#00E5FF",
  },
  orange: {
    glow: "rgba(255,122,61,0.22)",
    btnBorder: "border-[#FF7A3D]/35",
    btnBg: "bg-[#FF7A3D]/[0.12] hover:bg-[#FF7A3D]/[0.18] hover:border-[#FF7A3D]/50",
    btnText: "text-[#FFD4BE]",
    btnShadow: "shadow-[0_0_20px_rgba(255,122,61,0.15)]",
    iconVar: "#FF7A3D",
  },
} as const;

export default function ExternalOpenConfirm({
  open,
  title = "Open on SigmaSpace?",
  subtitle = "Leaves lumen · opens a new tab",
  badge,
  badgeColor = "#A0A0B0",
  meta,
  detail,
  detailTitle,
  hostLabel = "sigmaspace.io",
  accent = "teal",
  confirmLabel = "Open",
  cancelLabel = "Stay",
  busy = false,
  onCancel,
  onConfirm,
}: ExternalOpenConfirmProps) {
  const reduceMotion = useReducedMotion();
  const a = ACCENT[accent];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !busy) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm, busy]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      key="external-open-backdrop"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/70 backdrop-blur-[6px]"
        onClick={onCancel}
        disabled={busy}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-open-title"
        initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[22rem] rounded-2xl border border-white/[0.1] overflow-hidden"
        style={{
          background:
            "linear-gradient(165deg, rgba(22,26,34,0.98) 0%, rgba(10,12,16,0.99) 100%)",
          boxShadow: `0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 48px ${a.glow}`,
        }}
      >
        <div
          className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full blur-3xl opacity-50"
          style={{
            background: `radial-gradient(circle, ${a.glow} 0%, transparent 70%)`,
          }}
        />

        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10"
                style={{
                  color: a.iconVar,
                  background: `color-mix(in srgb, ${a.iconVar} 12%, transparent)`,
                  boxShadow: `0 0 18px ${a.glow}`,
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div
                  id="external-open-title"
                  className="text-[13px] sm:text-sm font-medium text-white tracking-tight"
                >
                  {title}
                </div>
                <div className="text-[11px] text-[#6B6B78] mt-0.5">
                  {subtitle}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-xl border border-white/[0.08] text-[#7A7A88] hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-40"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/35 px-3.5 py-3 mb-5">
            {(badge || meta) && (
              <div className="flex items-center gap-2 mb-2 min-w-0">
                {badge && (
                  <>
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{
                        background: badgeColor,
                        boxShadow: `0 0 8px ${badgeColor}`,
                      }}
                    />
                    <span
                      className="text-[9px] font-mono tracking-[0.16em] uppercase shrink-0"
                      style={{ color: badgeColor }}
                    >
                      {badge}
                    </span>
                  </>
                )}
                {meta && (
                  <span className="text-[9px] font-mono text-[#5C5C6A] tracking-wide truncate">
                    {badge ? `· ${meta}` : meta}
                  </span>
                )}
              </div>
            )}
            <div
              className="font-mono text-[12px] sm:text-[13px] text-[#E8E8F0] break-all leading-relaxed"
              title={detailTitle || detail}
            >
              {detail}
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 h-11 rounded-xl border border-white/[0.1] bg-white/[0.03] text-[11px] font-mono tracking-[0.14em] uppercase text-[#A0A0B0] hover:text-white hover:border-white/20 transition-colors active:scale-[0.98] disabled:opacity-40"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  void import("../lib/telegram").then((m) =>
                    m.hapticImpact("medium")
                  );
                } catch {
                  /* */
                }
                onConfirm();
              }}
              disabled={busy}
              className={`flex-1 h-11 rounded-xl border ${a.btnBorder} ${a.btnBg} text-[11px] font-mono tracking-[0.14em] uppercase ${a.btnText} transition-all active:scale-[0.98] ${a.btnShadow} disabled:opacity-50`}
            >
              {busy ? "Opening…" : confirmLabel}
            </button>
          </div>

          <p className="mt-3 text-center text-[10px] font-mono text-[#4A4A56] tracking-wide">
            {hostLabel}
          </p>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
