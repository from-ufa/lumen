"use client";

import { motion } from "framer-motion";
import { ExternalLink, Activity } from "lucide-react";
import Sparkline from "./Sparkline";

export type FeedStatus = "live" | "stale" | "offline";

export interface OracleFeedView {
  id: string;
  pair: string;
  title: string;
  subtitle: string;
  accent: string;
  accentSoft: string;
  status: FeedStatus;
  priceLabel: string | null;
  priceAlt: string | null;
  unitLabel: string;
  epoch: number | null;
  epochLength: number;
  settlementHeight: number | null;
  ageBlocks: number | null;
  ageMs: number | null;
  lastUpdatedAt: number | null;
  boxId: string | null;
  explorerUrl: string | null;
  activeOracles: number | null;
  totalOracles: number | null;
  history: { t: number; price: number }[];
  error?: string;
}

function statusMeta(s: FeedStatus) {
  switch (s) {
    case "live":
      return {
        label: "LIVE",
        color: "#10B981",
        bg: "rgba(16,185,129,0.12)",
        border: "rgba(16,185,129,0.35)",
        pulse: true,
      };
    case "stale":
      return {
        label: "STALE",
        color: "#F59E0B",
        bg: "rgba(245,158,11,0.12)",
        border: "rgba(245,158,11,0.35)",
        pulse: false,
      };
    default:
      return {
        label: "OFFLINE",
        color: "#EF4444",
        bg: "rgba(239,68,68,0.1)",
        border: "rgba(239,68,68,0.3)",
        pulse: false,
      };
  }
}

function relativeAge(ageMs: number | null, lastUpdatedAt: number | null, now: number) {
  const ms =
    ageMs != null
      ? ageMs
      : lastUpdatedAt != null
        ? Math.max(0, now - lastUpdatedAt)
        : null;
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function healthScore(f: OracleFeedView): { label: string; pct: number } {
  if (f.status === "offline") return { label: "Unreachable", pct: 8 };
  if (f.status === "stale") return { label: "Degraded", pct: 45 };
  // Live — blend active oracles if known
  if (f.activeOracles != null && f.totalOracles != null && f.totalOracles > 0) {
    const ratio = f.activeOracles / f.totalOracles;
    const pct = Math.round(55 + ratio * 45);
    return {
      label: ratio >= 0.75 ? "Strong" : ratio >= 0.5 ? "Healthy" : "Thin",
      pct: Math.min(100, pct),
    };
  }
  return { label: "Healthy", pct: 88 };
}

export default function OracleFeedCard({
  feed,
  now,
  index = 0,
}: {
  feed: OracleFeedView;
  now: number;
  index?: number;
}) {
  const st = statusMeta(feed.status);
  const health = healthScore(feed);
  const age = relativeAge(feed.ageMs, feed.lastUpdatedAt, now);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="oracle-card group relative overflow-hidden rounded-[1.35rem] sm:rounded-[1.75rem] border border-white/[0.08] bg-[#0E0E14]/90"
      style={{
        boxShadow: `0 0 0 1px ${feed.accent}14, 0 24px 64px rgba(0,0,0,0.45)`,
      }}
    >
      {/* soft ambient glow */}
      <div
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl opacity-50 transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: feed.accentSoft }}
      />
      <div
        className="pointer-events-none absolute -bottom-28 -left-20 h-48 w-48 rounded-full blur-3xl opacity-30"
        style={{ background: feed.accentSoft }}
      />

      <div className="relative p-5 sm:p-7 flex flex-col min-h-[320px] sm:min-h-[360px]">
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-5 sm:mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: feed.accent, boxShadow: `0 0 10px ${feed.accent}` }}
              />
              <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.22em] text-[#A0A0B0]">
                {feed.pair}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {feed.title}
            </h2>
            <p className="mt-1 text-[11px] sm:text-xs font-mono tracking-wide text-[#A0A0B0]/85">
              {feed.subtitle}
            </p>
          </div>

          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border shrink-0"
            style={{
              color: st.color,
              background: st.bg,
              borderColor: st.border,
            }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${st.pulse ? "status-dot" : ""}`}
              style={{ background: st.color }}
            />
            <span className="font-mono text-[10px] tracking-[0.18em]">{st.label}</span>
          </div>
        </div>

        {/* price */}
        <div className="mb-1">
          <div
            className="metric-value text-[2.65rem] sm:text-6xl font-semibold tracking-[-0.04em] leading-none tabular-nums"
            style={{
              color: feed.status === "offline" ? "#A0A0B0" : "#F5F5FA",
              textShadow:
                feed.status === "live"
                  ? `0 0 40px ${feed.accent}33`
                  : undefined,
            }}
          >
            {feed.priceLabel || "—"}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.16em] text-[#A0A0B0]">
              {feed.unitLabel}
            </span>
            {feed.priceAlt && (
              <span className="font-mono text-[10px] sm:text-[11px] text-[#A0A0B0]/70 tracking-wide">
                {feed.priceAlt}
              </span>
            )}
          </div>
        </div>

        {/* sparkline */}
        <div className="mt-5 mb-5 sm:mt-6 sm:mb-6">
          <Sparkline
            points={feed.history}
            accent={feed.accent}
            height={64}
          />
        </div>

        {/* meta grid */}
        <div className="mt-auto grid grid-cols-2 gap-3">
          <MetaCell label="LAST UPDATE" value={age} />
          <MetaCell
            label="EPOCH"
            value={
              feed.epoch != null
                ? `${feed.epoch.toLocaleString()}`
                : "—"
            }
            sub={
              feed.epochLength
                ? `every ~${feed.epochLength} blocks`
                : undefined
            }
          />
          <MetaCell
            label="POOL HEIGHT"
            value={
              feed.settlementHeight != null
                ? feed.settlementHeight.toLocaleString()
                : "—"
            }
            sub={
              feed.ageBlocks != null
                ? `${feed.ageBlocks} blk behind tip`
                : undefined
            }
          />
          <MetaCell
            label="ORACLES"
            value={
              feed.activeOracles != null && feed.totalOracles != null
                ? `${feed.activeOracles}/${feed.totalOracles}`
                : feed.activeOracles != null
                  ? String(feed.activeOracles)
                  : "—"
            }
            sub="posted · network"
          />
        </div>

        {/* health bar */}
        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-[0.18em] text-[#A0A0B0]">
              <Activity className="w-3 h-3" style={{ color: feed.accent }} />
              HEALTH · {health.label.toUpperCase()}
            </div>
            {feed.explorerUrl && (
              <a
                href={feed.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-[#E8E8F0] transition-colors"
              >
                EXPLORER
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${feed.accent}88, ${feed.accent})`,
                boxShadow: `0 0 12px ${feed.accent}66`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${health.pct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 + index * 0.05 }}
            />
          </div>
          {feed.error && (
            <p className="mt-2 text-[10px] font-mono text-[#EF4444]/90 tracking-wide">
              {feed.error}
            </p>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function MetaCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
      <div className="text-[9px] font-mono tracking-[0.16em] text-[#A0A0B0]/80 mb-1">
        {label}
      </div>
      <div className="font-mono text-sm sm:text-[15px] tabular-nums text-[#E8E8F0] tracking-tight">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[9px] font-mono text-[#A0A0B0]/55 tracking-wide">
          {sub}
        </div>
      )}
    </div>
  );
}
