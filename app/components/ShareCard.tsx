"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2,
  X,
  Copy,
  Download,
  Check,
  Link2,
  Zap,
  FileText,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import type { NodeInfo } from "../types/ergo";

interface ShareCardProps {
  nodeInfo: NodeInfo | null | undefined;
  avgBlockTime: number | null;
  isOnline: boolean;
  publicMode: boolean;
  mempoolSize?: number;
  /** Notify parent when modal opens/closes (hide viz floating controls) */
  onOpenChange?: (open: boolean) => void;
  /** Hide default trigger (mobile shared menu) */
  hideTrigger?: boolean;
  /** Bump to open modal from parent */
  openKey?: number;
}

export default function ShareCard({
  nodeInfo,
  avgBlockTime,
  isOnline,
  publicMode,
  mempoolSize = 0,
  onOpenChange,
  hideTrigger = false,
  openKey = 0,
}: ShareCardProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastOpenKey = useRef(0);

  const setModalOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!openKey || openKey === lastOpenKey.current) return;
    lastOpenKey.current = openKey;
    setModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";

  const nodeName = nodeInfo?.name || "Ergo Node";
  const height = nodeInfo?.fullHeight || nodeInfo?.headersHeight || 0;
  const peers = nodeInfo?.peersCount ?? 0;
  const network = (nodeInfo?.network || "mainnet").toUpperCase();
  const appVersion = nodeInfo?.appVersion || null;
  // Prefer mempool prop; fall back to node unconfirmedCount when available
  const mempool =
    mempoolSize > 0
      ? mempoolSize
      : (nodeInfo?.unconfirmedCount ?? mempoolSize);
  const avgLabel =
    avgBlockTime != null && avgBlockTime > 0
      ? `${Math.round(avgBlockTime)}s`
      : "—";
  const avgNum =
    avgBlockTime != null && avgBlockTime > 0
      ? Math.round(avgBlockTime)
      : null;

  const shareText = [
    `My Ergo node is live 🔥`,
    ``,
    `${nodeName}${appVersion ? ` · v${appVersion}` : ""} · ${network}`,
    `Height: ${height ? height.toLocaleString() : "—"} | Peers: ${peers} | Avg block: ${avgNum != null ? `${avgNum}s` : "—"} | Mempool: ${mempool}`,
    ``,
    `Watch it live: ${origin}`,
    ``,
    `#Ergo #lumen`,
  ].join("\n");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopiedLink(true);
      toast.success("Public link copied", {
        description: publicMode
          ? "Recipients need the public password (Basic Auth or ?password=)"
          : "Public Mode is off — link only works via SSH tunnel / localhost",
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const copyAsText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedText(true);
      toast.success("Post text copied", {
        description: "Ready for X / Telegram",
      });
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      toast.error("Could not copy text");
    }
  };

  const downloadCard = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      // High-res export for social posts
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#0A0A0F",
        // Skip external fonts failures silently
        skipFonts: true,
      });
      const a = document.createElement("a");
      const safeName = nodeName.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
      a.download = `lumen-${safeName || "node"}-card.png`;
      a.href = dataUrl;
      a.click();
      toast.success("Card downloaded", {
        description: "High-resolution PNG ready to share",
      });
    } catch (e) {
      console.error(e);
      toast.error("Could not export image", {
        description: "Try again or take a screenshot of the card",
      });
    } finally {
      setDownloading(false);
    }
  };

  const metric = (
    label: string,
    value: string | number,
    accent: string
  ) => (
    <div
      className="rounded-2xl px-3 py-3 border border-white/[0.08]"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.35) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="text-[9px] font-mono tracking-[0.14em] text-[#A0A0B0] mb-1.5">
        {label}
      </div>
      <div
        className="font-mono text-base sm:text-lg tabular-nums tracking-tight font-semibold"
        style={{ color: accent }}
      >
        {value}
      </div>
    </div>
  );

  const modal =
    open &&
    mounted &&
    createPortal(
      <AnimatePresence>
        {open && (
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Share my node"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/88 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ ease: [0.23, 1, 0.32, 1] }}
              className="relative z-10 w-full max-w-xl max-h-[min(94dvh,860px)] overflow-y-auto rounded-t-[24px] sm:rounded-[28px] border border-white/10 p-4 sm:p-6 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
              style={{
                background:
                  "linear-gradient(165deg, rgba(22,22,30,0.98) 0%, rgba(10,10,15,0.99) 100%)",
                boxShadow:
                  "0 0 0 1px rgba(255,122,61,0.08), 0 40px 80px rgba(0,0,0,0.65)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal chrome */}
              <div className="flex justify-between items-start mb-4 sm:mb-5">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.28em] text-[#FF7A3D]">
                    SHARE
                  </div>
                  <div className="text-2xl sm:text-[1.7rem] font-semibold tracking-tighter mt-0.5">
                    My Node Card
                  </div>
                  <p className="text-[11px] text-[#A0A0B0] mt-1 max-w-sm">
                    Premium card for X, Telegram, or your status page.
                  </p>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-[#A0A0B0] hover:text-white p-2 -mr-1 rounded-xl hover:bg-white/5"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* ═══════════ Premium export card ═══════════ */}
              <div
                ref={cardRef}
                className="relative overflow-hidden rounded-[24px] border border-white/[0.09]"
                style={{
                  background:
                    "linear-gradient(145deg, #14141c 0%, #0A0A0F 42%, #0a1218 78%, #0A0A0F 100%)",
                }}
              >
                {/* Layered glows */}
                <div
                  className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full opacity-50"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(255,122,61,0.42) 0%, transparent 68%)",
                  }}
                />
                <div
                  className="pointer-events-none absolute -bottom-28 -left-16 w-80 h-80 rounded-full opacity-40"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(0,229,255,0.28) 0%, transparent 70%)",
                  }}
                />
                <div
                  className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.07]"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, transparent 55%)",
                  }}
                />
                {/* Top accent line */}
                <div
                  className="absolute top-0 inset-x-0 h-[2px]"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, #FF7A3D 30%, #00E5FF 70%, transparent 100%)",
                  }}
                />

                <div className="relative p-6 sm:p-8">
                  {/* Header brand */}
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background:
                            "linear-gradient(135deg, #FF7A3D 0%, #ff9a5c 45%, #00E5FF 100%)",
                          boxShadow:
                            "0 8px 24px rgba(255,122,61,0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
                        }}
                      >
                        <Zap className="w-6 h-6 text-black" strokeWidth={2.4} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-2xl tracking-tight text-white leading-none">
                          lumen
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-[#A0A0B0] mt-1.5 leading-snug">
                          Ergo Node Dashboard · The living pulse of your Ergo node
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <div
                        className={`text-[10px] font-mono tracking-widest px-2.5 py-1 rounded-full border ${
                          isOnline
                            ? "border-[#10B981]/45 text-[#10B981] bg-[#10B981]/12"
                            : "border-white/20 text-[#A0A0B0] bg-white/5"
                        }`}
                      >
                        {isOnline ? "● LIVE" : "○ OFFLINE"}
                      </div>
                      {publicMode && (
                        <div className="text-[9px] font-mono tracking-[0.18em] px-2.5 py-1 rounded-full border border-[#00E5FF]/40 text-[#00E5FF] bg-[#00E5FF]/10">
                          PUBLIC
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Node identity */}
                  <div className="mb-5">
                    <div className="text-[10px] font-mono tracking-[0.22em] text-[#00E5FF] mb-1.5">
                      NODE
                    </div>
                    <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white truncate">
                      {nodeName}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <span className="text-[10px] font-mono tracking-wider px-2.5 py-1 rounded-lg border border-[#FF7A3D]/30 text-[#FF7A3D] bg-[#FF7A3D]/10">
                        ERGO {network}
                      </span>
                      {appVersion && (
                        <span className="text-[10px] font-mono tracking-wider px-2.5 py-1 rounded-lg border border-white/10 text-[#A0A0B0] bg-white/[0.04]">
                          v{appVersion}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metrics grid 2×2 */}
                  <div className="grid grid-cols-2 gap-2.5 mb-6">
                    {metric(
                      "HEIGHT",
                      height ? height.toLocaleString() : "—",
                      "#FF7A3D"
                    )}
                    {metric("MY P2P SESSIONS", peers, "#E8E8F0")}
                    {metric("AVG BLOCK TIME", avgLabel, "#00E5FF")}
                    {metric("MEMPOOL", mempool, "#E8E8F0")}
                  </div>

                  {/* Bottom: QR + footer */}
                  <div
                    className="flex items-end justify-between gap-4 pt-5 border-t border-white/[0.08]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-mono tracking-[0.2em] text-[#A0A0B0]/85 mb-1">
                        powered by lumen
                      </div>
                      <div className="text-[11px] text-[#A0A0B0]/70 leading-snug max-w-[200px]">
                        Scan QR or open the link to watch this node live.
                      </div>
                      <div
                        className="mt-3 text-[10px] font-mono tracking-wider truncate max-w-[220px]"
                        style={{ color: "rgba(0,229,255,0.75)" }}
                      >
                        {origin.replace(/^https?:\/\//, "")}
                      </div>
                    </div>

                    {/* QR — white plate for scannability */}
                    <div
                      className="flex-shrink-0 rounded-2xl p-2.5"
                      style={{
                        background: "#FFFFFF",
                        boxShadow:
                          "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
                      }}
                    >
                      <QRCodeSVG
                        value={origin}
                        size={96}
                        level="M"
                        bgColor="#FFFFFF"
                        fgColor="#0A0A0F"
                        marginSize={0}
                        title="lumen public URL QR"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Link row */}
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 font-mono text-[11px] text-[#A0A0B0] break-all">
                  <Link2 size={14} className="flex-shrink-0 text-[#00E5FF]" />
                  {origin}
                </div>

                {!publicMode && (
                  <p className="text-[11px] text-[#F59E0B]/90 px-1">
                    Public Mode is off — this origin is only reachable via
                    localhost / SSH tunnel until a public password is set in
                    NODE SETTINGS.
                  </p>
                )}

                {/* Action buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
                  <button
                    onClick={copyLink}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#FF7A3D] text-black font-semibold text-[11px] sm:text-xs tracking-wider active:scale-[0.985] transition-all hover:brightness-110"
                  >
                    {copiedLink ? <Check size={15} /> : <Copy size={15} />}
                    {copiedLink ? "COPIED" : "COPY LINK"}
                  </button>
                  <button
                    onClick={copyAsText}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-[#00E5FF]/35 bg-[#00E5FF]/10 text-[#00E5FF] text-[11px] sm:text-xs font-mono tracking-widest active:scale-[0.985] hover:bg-[#00E5FF]/15 transition-all"
                  >
                    {copiedText ? <Check size={15} /> : <FileText size={15} />}
                    {copiedText ? "COPIED" : "COPY AS TEXT"}
                  </button>
                  <button
                    onClick={downloadCard}
                    disabled={downloading}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-white/20 hover:bg-white/5 text-[11px] sm:text-xs font-mono tracking-widest active:scale-[0.985] disabled:opacity-60 transition-all"
                  >
                    <Download size={15} />
                    {downloading ? "EXPORTING…" : "DOWNLOAD PNG"}
                  </button>
                </div>

                {/* Text preview (collapsed look) */}
                <details className="group rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
                  <summary className="cursor-pointer list-none px-4 py-2.5 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white flex items-center justify-between">
                    PREVIEW POST TEXT
                    <span className="text-[#A0A0B0]/50 group-open:rotate-180 transition-transform">
                      ▾
                    </span>
                  </summary>
                  <pre className="px-4 pb-4 text-[11px] text-[#E8E8F0]/85 whitespace-pre-wrap font-mono leading-relaxed border-t border-white/5 pt-3">
                    {shareText}
                  </pre>
                </details>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 h-11 sm:h-auto rounded-2xl border border-[#FF7A3D]/40 bg-[#FF7A3D]/10 text-[#FF7A3D] text-[10px] sm:text-xs font-mono tracking-wider sm:tracking-widest hover:bg-[#FF7A3D]/20 hover:border-[#FF7A3D]/60 transition-all active:scale-[0.985] box-border"
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden truncate">SHARE</span>
          <span className="hidden sm:inline">SHARE MY NODE</span>
        </button>
      )}
      {modal}
    </>
  );
}
