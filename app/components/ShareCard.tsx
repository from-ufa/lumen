"use client";

/**
 * Share my node / Share my oracle — premium social card + post to X.
 * Best shot: the branded export card (not a full-page screenshot) —
 * clean 1080-ready PNG with metrics, QR, and lumen identity.
 */

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
  Gem,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import type { NodeInfo } from "../types/ergo";
import type { OracleFeedData } from "../oracles/components/types";

export type ShareVariant = "node" | "oracle";

interface ShareCardProps {
  variant?: ShareVariant;
  /** Node mode */
  nodeInfo?: NodeInfo | null;
  avgBlockTime?: number | null;
  isOnline: boolean;
  publicMode?: boolean;
  mempoolSize?: number;
  /** Oracle mode */
  oracleFeeds?: OracleFeedData[];
  oracleView?: "network" | "my";
  bridgeOnline?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  openKey?: number;
  /** Optional label on trigger */
  triggerLabel?: string;
}

function metric(
  label: string,
  value: string | number,
  accent: string
) {
  return (
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
}

function buildNodeShareText(opts: {
  origin: string;
  nodeName: string;
  appVersion: string | null;
  network: string;
  height: number;
  peers: number;
  avgNum: number | null;
  mempool: number;
}): string {
  const {
    origin,
    nodeName,
    appVersion,
    network,
    height,
    peers,
    avgNum,
    mempool,
  } = opts;
  return [
    `My Ergo node is live on lumen ⚡`,
    ``,
    `${nodeName}${appVersion ? ` · v${appVersion}` : ""} · ${network}`,
    `⬡ Height ${height ? height.toLocaleString() : "—"}`,
    `◇ Peers ${peers} · Mempool ${mempool}`,
    `◈ Avg block ${avgNum != null ? `${avgNum}s` : "—"}`,
    ``,
    `Watch the living pulse:`,
    origin,
    ``,
    `#Ergo #lumen #ErgoNode #ProofOfWork`,
  ].join("\n");
}

function buildOracleShareText(opts: {
  origin: string;
  feeds: OracleFeedData[];
  view: "network" | "my";
  bridgeOnline: boolean;
}): string {
  const { origin, feeds, view, bridgeOnline } = opts;
  const mine = feeds.filter((f) => f.scope === "mine" || f.myOperator?.address);
  const focus = mine.length ? mine : feeds;
  const lines: string[] = [];

  if (view === "my" && bridgeOnline && mine.length) {
    lines.push(`Running my Ergo oracle on lumen 🔶`);
  } else {
    lines.push(`Ergo oracle pools — live on lumen 🔶`);
  }
  lines.push(``);

  for (const f of focus.slice(0, 2)) {
    const pair = f.pair || f.id;
    const price = f.priceLabel || "—";
    const status = (f.status || "—").toUpperCase();
    const lag = f.ageBlocks != null ? `${f.ageBlocks} blk lag` : null;
    const rewards = f.myOperator?.claimableRewards;
    const post = f.myOperator?.postAgeBlocks;
    lines.push(`${pair} · ${price} · ${status}`);
    if (f.scope === "mine" || f.myOperator) {
      const bits = [
        post != null ? `last post ${post} blk` : null,
        rewards != null ? `rewards ${rewards}` : null,
        f.myOperator?.inLastRefresh === true
          ? "in last refresh ✓"
          : f.myOperator?.inLastRefresh === false
            ? "awaiting refresh"
            : null,
      ].filter(Boolean);
      if (bits.length) lines.push(`  → ${bits.join(" · ")}`);
    } else if (lag) {
      lines.push(`  → ${lag}`);
    }
  }

  lines.push(``);
  if (view === "my" && mine.length) {
    lines.push(`My agent · private bridge · zero open ports`);
  } else {
    lines.push(`Consensus, visualized.`);
  }
  lines.push(`${origin}/oracles`);
  lines.push(``);
  lines.push(`#Ergo #Oracle #lumen #DeFi #ERG`);

  return lines.join("\n");
}

export default function ShareCard({
  variant = "node",
  nodeInfo,
  avgBlockTime = null,
  isOnline,
  publicMode = true,
  mempoolSize = 0,
  oracleFeeds = [],
  oracleView = "network",
  bridgeOnline = false,
  onOpenChange,
  hideTrigger = false,
  openKey = 0,
  triggerLabel,
}: ShareCardProps) {
  const isOracle = variant === "oracle";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [postingX, setPostingX] = useState(false);
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
      : "https://ergolumen.net";

  const shareUrl = isOracle ? `${origin}/oracles` : origin;

  // ── Node fields ──
  const nodeName = nodeInfo?.name || "Ergo Node";
  const height = nodeInfo?.fullHeight || nodeInfo?.headersHeight || 0;
  const peers = nodeInfo?.peersCount ?? 0;
  const network = (nodeInfo?.network || "mainnet").toUpperCase();
  const appVersion = nodeInfo?.appVersion || null;
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

  // ── Oracle fields ──
  const feeds = oracleFeeds || [];
  const mineFeeds = feeds.filter(
    (f) => f.scope === "mine" || f.myOperator?.address
  );
  const primaryOracle = mineFeeds[0] || feeds[0];
  const secondaryOracle =
    mineFeeds[1] || (feeds.length > 1 ? feeds[1] : null);

  const shareText = isOracle
    ? buildOracleShareText({
        origin: shareUrl,
        feeds,
        view: oracleView,
        bridgeOnline,
      })
    : buildNodeShareText({
        origin: shareUrl,
        nodeName,
        appVersion,
        network,
        height,
        peers,
        avgNum,
        mempool,
      });

  const exportCard = async (): Promise<{
    dataUrl: string;
    blob: Blob;
    file: File;
  } | null> => {
    if (!cardRef.current) return null;
    const { toPng, toBlob } = await import("html-to-image");
    const opts = {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: "#0A0A0F",
      skipFonts: true,
    } as const;
    const dataUrl = await toPng(cardRef.current, opts);
    let blob = await toBlob(cardRef.current, opts);
    if (!blob) {
      const res = await fetch(dataUrl);
      blob = await res.blob();
    }
    const file = new File(
      [blob],
      isOracle ? "lumen-oracle-card.png" : "lumen-node-card.png",
      { type: "image/png" }
    );
    return { dataUrl, blob, file };
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast.success("Link copied", {
        description: isOracle
          ? "Oracle page URL ready"
          : publicMode
            ? "Public dashboard URL ready"
            : "Link may only work via tunnel until Public Mode is on",
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
    setDownloading(true);
    try {
      const out = await exportCard();
      if (!out) throw new Error("no card");
      const a = document.createElement("a");
      const safe = isOracle
        ? `oracle-${primaryOracle?.id || "pool"}`
        : nodeName.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
      a.download = `lumen-${safe || "card"}.png`;
      a.href = out.dataUrl;
      a.click();
      toast.success("Card downloaded", {
        description: "Premium PNG · attach it when you post on X",
      });
    } catch (e) {
      console.error(e);
      toast.error("Could not export image");
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Best path for X:
   * 1) Web Share API with file (mobile / some desktop) — image + text
   * 2) Download PNG + open X intent with text + copy text (desktop)
   * X intent cannot attach images; card PNG is the shareable asset.
   */
  const postToX = async () => {
    setPostingX(true);
    try {
      const out = await exportCard();
      if (!out) throw new Error("export failed");

      // Prefer native share with image when available
      const canFileShare =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [out.file] });

      if (canFileShare) {
        await navigator.share({
          files: [out.file],
          text: shareText,
          title: isOracle ? "My Ergo oracle · lumen" : "My Ergo node · lumen",
        });
        toast.success("Shared", {
          description: "Pick X / Twitter in the share sheet",
        });
        return;
      }

      // Desktop fallback: download image + open compose with text
      const a = document.createElement("a");
      a.download = out.file.name;
      a.href = out.dataUrl;
      a.click();
      try {
        await navigator.clipboard.writeText(shareText);
      } catch {
        /* ignore */
      }
      const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
      window.open(intent, "_blank", "noopener,noreferrer");
      toast.success("PNG saved · X compose opened", {
        description:
          "Paste is ready — attach the downloaded card image to your post",
        duration: 5000,
      });
    } catch (e) {
      console.error(e);
      // Still open text intent
      const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
      window.open(intent, "_blank", "noopener,noreferrer");
      toast.message("Opened X with text", {
        description: "Download the PNG first, then attach it to the post",
      });
    } finally {
      setPostingX(false);
    }
  };

  const btnLabel =
    triggerLabel ||
    (isOracle ? "SHARE MY ORACLE" : "SHARE MY NODE");

  // ── Card body (the “best shot”) ──
  const exportCardBody = isOracle ? (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background:
                "linear-gradient(135deg, #C9A84C 0%, #FF7A3D 50%, #00E5FF 100%)",
              boxShadow:
                "0 8px 24px rgba(201,168,76,0.3), inset 0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            <Gem className="w-6 h-6 text-black" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-2xl tracking-tight text-white leading-none">
              lumen
            </div>
            <div className="text-[10px] sm:text-[11px] text-[#A0A0B0] mt-1.5 leading-snug">
              Ergo Oracle Pools · Consensus, visualized
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
          {oracleView === "my" && bridgeOnline && (
            <div className="text-[9px] font-mono tracking-[0.14em] px-2.5 py-1 rounded-full border border-[#FF7A3D]/40 text-[#FF7A3D] bg-[#FF7A3D]/10">
              MY BRIDGE
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] font-mono tracking-[0.22em] text-[#E8C547] mb-1.5">
        {oracleView === "my" && mineFeeds.length
          ? "MY ORACLE"
          : "ORACLE POOLS"}
      </div>
      <div className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-4">
        {primaryOracle?.pair || "ERG/USD · ERG/XAU"}
        {secondaryOracle ? (
          <span className="text-[#A0A0B0] font-normal text-lg">
            {" "}
            · {secondaryOracle.pair}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {metric(
          "ON-CHAIN PRICE",
          primaryOracle?.priceLabel || "—",
          primaryOracle?.id === "erg-xau" ? "#C9A84C" : "#2DD4BF"
        )}
        {metric(
          "STATUS",
          (primaryOracle?.status || "—").toUpperCase(),
          primaryOracle?.status === "live"
            ? "#10B981"
            : primaryOracle?.status === "stale"
              ? "#F59E0B"
              : "#EF4444"
        )}
        {metric(
          oracleView === "my" && primaryOracle?.myOperator
            ? "LAST POST"
            : "POOL LAG",
          primaryOracle?.myOperator?.postAgeBlocks != null
            ? `${primaryOracle.myOperator.postAgeBlocks} blk`
            : primaryOracle?.ageBlocks != null
              ? `${primaryOracle.ageBlocks} blk`
              : "—",
          "#FF7A3D"
        )}
        {metric(
          oracleView === "my" && primaryOracle?.myOperator
            ? "REWARDS"
            : "QUORUM",
          primaryOracle?.myOperator?.claimableRewards != null
            ? primaryOracle.myOperator.claimableRewards.toLocaleString()
            : primaryOracle?.activeOracles != null &&
                primaryOracle?.requiredOracles != null
              ? `${primaryOracle.activeOracles}/${primaryOracle.requiredOracles}`
              : "—",
          "#E8C547"
        )}
      </div>

      {primaryOracle?.myOperator && (
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          {metric(
            "WALLET",
            primaryOracle.myOperator.walletErg != null
              ? `${primaryOracle.myOperator.walletErg.toFixed(2)} ERG`
              : "—",
            "#E8E8F0"
          )}
          {metric(
            "IN REFRESH",
            primaryOracle.myOperator.inLastRefresh === true
              ? "YES"
              : primaryOracle.myOperator.inLastRefresh === false
                ? "NO"
                : "—",
            primaryOracle.myOperator.inLastRefresh === true
              ? "#10B981"
              : "#F59E0B"
          )}
        </div>
      )}

      {!primaryOracle?.myOperator && <div className="mb-5" />}

      <div className="flex items-end justify-between gap-4 pt-5 border-t border-white/[0.08]">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono tracking-[0.2em] text-[#A0A0B0]/85 mb-1">
            powered by lumen
          </div>
          <div className="text-[11px] text-[#A0A0B0]/70 leading-snug max-w-[200px]">
            {oracleView === "my"
              ? "Private bridge · zero open ports · your agent."
              : "Live pool consensus from on-chain boxes."}
          </div>
          <div
            className="mt-3 text-[10px] font-mono tracking-wider truncate max-w-[220px]"
            style={{ color: "rgba(232,197,71,0.85)" }}
          >
            {shareUrl.replace(/^https?:\/\//, "")}
          </div>
        </div>
        <div
          className="flex-shrink-0 rounded-2xl p-2.5"
          style={{
            background: "#FFFFFF",
            boxShadow:
              "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          <QRCodeSVG
            value={shareUrl}
            size={96}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#0A0A0F"
            marginSize={0}
            title="lumen oracles QR"
          />
        </div>
      </div>
    </>
  ) : (
    <>
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

      <div className="flex items-end justify-between gap-4 pt-5 border-t border-white/[0.08]">
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
            {shareUrl.replace(/^https?:\/\//, "")}
          </div>
        </div>
        <div
          className="flex-shrink-0 rounded-2xl p-2.5"
          style={{
            background: "#FFFFFF",
            boxShadow:
              "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          <QRCodeSVG
            value={shareUrl}
            size={96}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#0A0A0F"
            marginSize={0}
            title="lumen public URL QR"
          />
        </div>
      </div>
    </>
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
            aria-label={isOracle ? "Share my oracle" : "Share my node"}
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
              className="relative z-10 w-full max-w-xl max-h-[min(94dvh,900px)] overflow-y-auto rounded-t-[24px] sm:rounded-[28px] border border-white/10 p-4 sm:p-6 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
              style={{
                background:
                  "linear-gradient(165deg, rgba(22,22,30,0.98) 0%, rgba(10,10,15,0.99) 100%)",
                boxShadow: isOracle
                  ? "0 0 0 1px rgba(201,168,76,0.1), 0 40px 80px rgba(0,0,0,0.65)"
                  : "0 0 0 1px rgba(255,122,61,0.08), 0 40px 80px rgba(0,0,0,0.65)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4 sm:mb-5">
                <div>
                  <div
                    className="font-mono text-[10px] tracking-[0.28em]"
                    style={{ color: isOracle ? "#E8C547" : "#FF7A3D" }}
                  >
                    SHARE
                  </div>
                  <div className="text-2xl sm:text-[1.7rem] font-semibold tracking-tighter mt-0.5">
                    {isOracle ? "My Oracle Card" : "My Node Card"}
                  </div>
                  <p className="text-[11px] text-[#A0A0B0] mt-1 max-w-sm">
                    Best shot: this branded card (not a page capture). Download
                    PNG → attach on X with the post text.
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

              {/* Premium export card — the screenshot */}
              <div
                ref={cardRef}
                className="relative overflow-hidden rounded-[24px] border border-white/[0.09]"
                style={{
                  background: isOracle
                    ? "linear-gradient(145deg, #16140e 0%, #0A0A0F 40%, #0c1210 75%, #0A0A0F 100%)"
                    : "linear-gradient(145deg, #14141c 0%, #0A0A0F 42%, #0a1218 78%, #0A0A0F 100%)",
                }}
              >
                <div
                  className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full opacity-50"
                  style={{
                    background: isOracle
                      ? "radial-gradient(circle, rgba(201,168,76,0.4) 0%, transparent 68%)"
                      : "radial-gradient(circle, rgba(255,122,61,0.42) 0%, transparent 68%)",
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
                  className="absolute top-0 inset-x-0 h-[2px]"
                  style={{
                    background: isOracle
                      ? "linear-gradient(90deg, transparent 0%, #C9A84C 30%, #00E5FF 70%, transparent 100%)"
                      : "linear-gradient(90deg, transparent 0%, #FF7A3D 30%, #00E5FF 70%, transparent 100%)",
                  }}
                />
                <div className="relative p-6 sm:p-8">{exportCardBody}</div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 font-mono text-[11px] text-[#A0A0B0] break-all">
                  <Link2 size={14} className="flex-shrink-0 text-[#00E5FF]" />
                  {shareUrl}
                </div>

                {!publicMode && !isOracle && (
                  <p className="text-[11px] text-[#F59E0B]/90 px-1">
                    Public Mode is off — link may only work via tunnel until a
                    public password is set.
                  </p>
                )}

                {/* Primary: Post on X */}
                <button
                  type="button"
                  onClick={() => void postToX()}
                  disabled={postingX}
                  className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-black font-semibold text-[12px] sm:text-sm tracking-wider active:scale-[0.985] transition-all hover:brightness-110 disabled:opacity-60"
                  style={{
                    background: isOracle
                      ? "linear-gradient(90deg, #C9A84C 0%, #E8C547 50%, #00E5FF 100%)"
                      : "linear-gradient(90deg, #FF7A3D 0%, #ff9a5c 55%, #00E5FF 100%)",
                  }}
                >
                  {postingX ? (
                    "PREPARING…"
                  ) : (
                    <>
                      <span className="text-[15px] font-black tracking-tight">
                        𝕏
                      </span>
                      POST ON X · WITH CARD
                    </>
                  )}
                </button>
                <p className="text-[10px] text-center text-[#6B6B78] px-2 leading-snug">
                  Saves the premium card PNG and opens X with the post text.
                  Attach the image to the compose window (X can&apos;t take
                  uploads via link).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#FF7A3D] text-black font-semibold text-[11px] sm:text-xs tracking-wider active:scale-[0.985] transition-all hover:brightness-110"
                  >
                    {copiedLink ? <Check size={15} /> : <Copy size={15} />}
                    {copiedLink ? "COPIED" : "COPY LINK"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyAsText()}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-[#00E5FF]/35 bg-[#00E5FF]/10 text-[#00E5FF] text-[11px] sm:text-xs font-mono tracking-widest active:scale-[0.985] hover:bg-[#00E5FF]/15 transition-all"
                  >
                    {copiedText ? <Check size={15} /> : <FileText size={15} />}
                    {copiedText ? "COPIED" : "COPY TEXT"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadCard()}
                    disabled={downloading}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-white/20 hover:bg-white/5 text-[11px] sm:text-xs font-mono tracking-widest active:scale-[0.985] disabled:opacity-60 transition-all"
                  >
                    <Download size={15} />
                    {downloading ? "EXPORTING…" : "PNG"}
                  </button>
                </div>

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
          className="lumen-header-pill inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full border border-[#FF7A3D]/40 bg-[#FF7A3D]/[0.12] text-[#FF7A3D] text-[10px] font-mono font-medium tracking-[0.16em] uppercase hover:bg-[#FF7A3D]/[0.18] hover:border-[#FF7A3D]/55 transition-all duration-200 active:scale-[0.98] box-border"
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden truncate">SHARE</span>
          <span className="hidden sm:inline">{btnLabel}</span>
        </button>
      )}
      {modal}
    </>
  );
}
