"use client";

import { useState } from "react";
import OracleConstellation from "./OracleConstellation";
import type { OracleFeedData, OraclesApiResponse } from "./types";

interface Props {
  data: OraclesApiResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  onRetry: () => void;
}

type Theme = {
  accent: string;
  accentDim: string;
  border: string;
  surface: string;
  label: string;
};

function themeFor(feed: OracleFeedData): Theme {
  const gold = feed.id === "erg-xau" || feed.pair.includes("XAU");
  if (gold) {
    return {
      accent: "#C9A84C",
      accentDim: "rgba(201, 168, 76, 0.14)",
      border: "rgba(201, 168, 76, 0.2)",
      surface: "rgba(201, 168, 76, 0.035)",
      label: "#E8D5A3",
    };
  }
  return {
    accent: "#2DD4BF",
    accentDim: "rgba(45, 212, 191, 0.12)",
    border: "rgba(45, 212, 191, 0.18)",
    surface: "rgba(45, 212, 191, 0.03)",
    label: "#A7F3E8",
  };
}

/**
 * Price-age status only (LIVE / STALE / OFFLINE).
 * DOWN is a separate signal (local agent pool health) — never mixed into this blurb.
 */
function statusExplain(
  feed: OracleFeedData
): { color: string; label: string; blurb: string } {
  const lag = feed.ageBlocks;
  if (feed.status === "live") {
    return {
      color: "#34D399",
      label: "LIVE",
      blurb:
        lag != null
          ? `Shared price is fresh — last pool update about ${lag} block${lag === 1 ? "" : "s"} ago.`
          : "Shared price is fresh — the pool was refreshed recently.",
    };
  }
  if (feed.status === "stale") {
    return {
      color: "#D4A574",
      label: "STALE",
      blurb:
        lag != null
          ? `Shared price is still on-chain, but getting old (~${lag} blocks since last pool update).`
          : "Shared price is still on-chain, but the pool has not refreshed for a while.",
    };
  }
  return {
    color: "#F87171",
    label: "OFFLINE",
    blurb:
      "This feed cannot be trusted right now — missing pool box or extremely old data.",
  };
}

function healthExplain(poolHealthy: boolean | null | undefined): {
  label: string;
  color: string;
  blurb: string;
} {
  if (poolHealthy === true) {
    return {
      label: "HEALTHY",
      color: "#34D399",
      blurb: "Local oracle software says the pool protocol looks fine.",
    };
  }
  if (poolHealthy === false) {
    return {
      label: "DOWN",
      color: "#D4A574",
      blurb:
        "Local oracle software sees protocol trouble (not enough agreement or refresh issues). This is separate from how old the on-chain price is.",
    };
  }
  return {
    label: "—",
    color: "#8B8B9A",
    blurb: "Pool health from local metrics is not available.",
  };
}

/**
 * Compact epoch control: ring + human text to the RIGHT (not stacked under).
 */
function EpochAside({
  epoch,
  progress,
  color,
  ageBlocks,
  liveMax,
}: {
  epoch: number | null;
  progress: number;
  color: string;
  ageBlocks?: number | null;
  liveMax?: number | null;
}) {
  const size = 56;
  const cx = size / 2;
  const r = 22;
  const stroke = 2;
  const circ = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const gradId = `eg-${color.replace("#", "")}-${epoch ?? 0}`;
  const softId = `es-${color.replace("#", "")}`;

  const freshness =
    p < 0.35 ? "Fresh update window" : p < 0.75 ? "Getting older" : "Near stale";

  return (
    <div
      className="flex items-center gap-3.5 shrink-0"
      role="img"
      aria-label={
        epoch != null
          ? `Pool epoch ${epoch}. ${freshness}.`
          : "Pool epoch unavailable"
      }
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="55%" stopColor={color} stopOpacity="0.9" />
              <stop offset="100%" stopColor="#F3EDE0" stopOpacity="0.8" />
            </linearGradient>
            <filter
              id={softId}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
              <feColorMatrix
                in="b"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0"
                result="g"
              />
              <feMerge>
                <feMergeNode in="g" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={stroke}
            style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - p)}
            filter={`url(#${softId})`}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "center",
              transition:
                "stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono tabular-nums text-white tracking-tight"
            style={{
              fontSize: epoch != null && epoch >= 10000 ? 10 : 12,
              fontWeight: 500,
            }}
          >
            {epoch != null ? epoch.toLocaleString() : "—"}
          </span>
        </div>
      </div>

      {/* Text to the right of the ring — keeps header short */}
      <div className="min-w-0 max-w-[7.5rem] sm:max-w-[9rem]">
        <div className="text-[10px] sm:text-[11px] font-medium text-[#D8D8E0] tracking-tight leading-snug">
          Pool epoch
        </div>
        <div className="mt-0.5 text-[9px] sm:text-[10px] text-[#8B8B9A] leading-snug">
          {freshness}
        </div>
        {ageBlocks != null && liveMax != null && (
          <div className="mt-0.5 text-[9px] sm:text-[10px] font-mono text-[#6B6B78] tabular-nums">
            {ageBlocks} / {liveMax} blk
          </div>
        )}
      </div>
    </div>
  );
}

function CornerChip({
  label,
  value,
  sub,
  accent,
  corner,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  corner: "tl" | "tr" | "bl" | "br";
}) {
  const pos =
    corner === "tl"
      ? "top-3 left-3 sm:top-3.5 sm:left-3.5"
      : corner === "tr"
        ? "top-3 right-3 sm:top-3.5 sm:right-3.5 text-right"
        : corner === "bl"
          ? "bottom-3 left-3 sm:bottom-3.5 sm:left-3.5"
          : "bottom-3 right-3 sm:bottom-3.5 sm:right-3.5 text-right";

  return (
    <div className={`absolute z-20 pointer-events-none ${pos}`}>
      <div className="lumen-oracle-chip rounded-xl border border-white/[0.08] bg-[#06060A]/82 backdrop-blur-xl px-2.5 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.5)]">
        <div className="text-[8px] font-mono tracking-[0.14em] text-[#7A7A88] uppercase">
          {label}
        </div>
        <div
          className="mt-0.5 font-mono text-[13px] sm:text-sm tabular-nums tracking-tight leading-none"
          style={{ color: accent || "#F0F0F5" }}
        >
          {value}
        </div>
        {sub ? (
          <div className="mt-0.5 text-[8px] font-mono text-[#5C5C6A] tracking-wide">
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LegendItem({
  color,
  shape,
  label,
  hint,
}: {
  color: string;
  shape: "dot" | "hex" | "diamond" | "star";
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0 overflow-hidden">
      <div className="mt-0.5 shrink-0 flex items-center justify-center w-3.5 h-3.5">
        {shape === "dot" && (
          <span
            className="block w-2 h-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
          />
        )}
        {shape === "hex" && (
          <span
            className="block w-2.5 h-2.5"
            style={{
              background: color,
              clipPath:
                "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
            }}
          />
        )}
        {shape === "diamond" && (
          <span
            className="block w-2 h-2 rotate-45"
            style={{ background: color }}
          />
        )}
        {shape === "star" && (
          <span className="text-[10px] leading-none" style={{ color }}>
            ★
          </span>
        )}
      </div>
      <div className="min-w-0 overflow-hidden">
        <div className="text-[10px] sm:text-[11px] font-medium text-[#D0D0D8] leading-tight truncate">
          {label}
        </div>
        <div className="text-[9px] sm:text-[10px] text-[#6B6B78] leading-snug mt-0.5 line-clamp-1">
          {hint}
        </div>
      </div>
    </div>
  );
}

function OracleBlock({
  feed,
  tipHeight,
}: {
  feed: OracleFeedData;
  tipHeight: number | null;
}) {
  const [activity, setActivity] = useState<
    { id: string; t: number; kind: string; message: string }[]
  >([]);
  const [publishPulse, setPublishPulse] = useState(0);

  const theme = themeFor(feed);
  const st = statusExplain(feed);
  const health = healthExplain(feed.poolHealthy);
  const live =
    feed.activeOracles ??
    feed.nodes.filter((n) => n.status === "live").length;
  const total = feed.totalOracles ?? (feed.nodes.length || 0);
  const liveMax = feed.statusThresholds?.liveMax ?? 24;
  const epochProgress =
    feed.ageBlocks != null && liveMax > 0
      ? Math.min(1, Math.max(0, feed.ageBlocks / liveMax))
      : 0;
  const isMineScope = feed.scope === "mine";
  const isNetworkScope = feed.scope === "network";
  const mine = isMineScope ? feed.myOperator : null;
  const mineNode = feed.nodes.find((n) => n.isMine);
  const myActivity = activity.filter((a) => {
    if (!mine?.address) return a.kind === "datapoint";
    const addr = mine.address;
    return (
      a.message.includes(addr.slice(0, 8)) ||
      a.message.includes(addr.slice(-6)) ||
      a.message.includes(addr)
    );
  });
  const shortMine = mine?.address
    ? `${mine.address.slice(0, 6)}…${mine.address.slice(-4)}`
    : null;

  const liveMaxMine = feed.statusThresholds?.liveMax ?? 24;
  const activeN = feed.activeOracles;
  const needN = feed.requiredOracles;
  const missingN =
    activeN != null && needN != null ? Math.max(0, needN - activeN) : null;

  const walletErg =
    mine?.walletErg != null
      ? mine.walletErg
      : mine?.walletNanoErg != null
        ? mine.walletNanoErg / 1e9
        : null;

  /** Single priority alert for runners */
  const mineAlert = (() => {
    if (!isMineScope || !mine) return null;
    if (mine.isHealthy === false)
      return { tone: "bad" as const, text: "Oracle agent DOWN — not posting" };
    if (walletErg != null && walletErg < 0.5)
      return {
        tone: "warn" as const,
        text: `Low gas · ${walletErg.toFixed(2)} ERG in wallet`,
      };
    if (mine.postAgeBlocks != null && mine.postAgeBlocks > liveMaxMine)
      return {
        tone: "warn" as const,
        text: `YOU lag ${mine.postAgeBlocks} blk — post soon`,
      };
    if (mine.inLastRefresh === false)
      return {
        tone: "warn" as const,
        text: "Not in last pool refresh — wait for next epoch",
      };
    if (feed.poolHealthy === false && missingN != null && missingN > 0)
      return {
        tone: "info" as const,
        text: `Pool waiting · need ${missingN} more active`,
      };
    return {
      tone: "ok" as const,
      text: "All clear · you are in the game",
    };
  })();

  const networkAlert = (() => {
    if (!isNetworkScope) return null;
    if (feed.poolHealthy === false && missingN != null && missingN > 0)
      return {
        tone: "warn" as const,
        text: `Pool DOWN · missing ${missingN} of ${needN} active`,
      };
    if (feed.status === "stale")
      return {
        tone: "info" as const,
        text: `Pool lag ${feed.ageBlocks ?? "—"} blk · public host view`,
      };
    if (feed.status === "live")
      return {
        tone: "ok" as const,
        text: "Network live · lumen host metrics",
      };
    return {
      tone: "info" as const,
      text: "Public pool · not on your bridge",
    };
  })();

  const alertTone = (t: "ok" | "warn" | "bad" | "info") =>
    t === "ok"
      ? { c: "#34D399", b: "rgba(52,211,153,0.3)", bg: "rgba(52,211,153,0.08)" }
      : t === "warn"
        ? { c: "#D4A574", b: "rgba(212,165,116,0.35)", bg: "rgba(212,165,116,0.1)" }
        : t === "bad"
          ? { c: "#F87171", b: "rgba(248,113,113,0.4)", bg: "rgba(248,113,113,0.1)" }
          : { c: "#00E5FF", b: "rgba(0,229,255,0.3)", bg: "rgba(0,229,255,0.08)" };

  const scopeBorder = isMineScope
    ? "rgba(255,122,61,0.4)"
    : isNetworkScope
      ? "rgba(0,229,255,0.28)"
      : theme.border;

  return (
    <section
      className="lumen-oracle-block h-full w-full min-w-0 max-w-full flex flex-col rounded-2xl sm:rounded-[1.35rem] border overflow-hidden"
      style={{
        borderColor: scopeBorder,
        background: `linear-gradient(180deg, ${theme.surface} 0%, rgba(9,9,12,0.98) 45%)`,
        boxShadow: isMineScope
          ? "0 20px 56px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,122,61,0.12)"
          : "0 20px 56px rgba(0,0,0,0.42)",
        ["--oracle-accent" as string]: theme.accent,
      }}
    >
      {/* Compact header: title left · epoch ring+copy right */}
      <header
        className={`shrink-0 flex items-center justify-between gap-2.5 sm:gap-3 px-3.5 sm:px-4 lg:px-5 py-3 border-b border-white/[0.06] ${
          isMineScope || isNetworkScope ? "h-[5.5rem]" : "h-[4.75rem]"
        }`}
      >
        <div className="min-w-0 flex flex-col gap-1.5 justify-center">
          <div className="flex items-center gap-2 overflow-hidden">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: st.color,
                boxShadow:
                  feed.status === "live" ? `0 0 10px ${st.color}` : "none",
              }}
            />
            <h2
              className="text-base sm:text-lg font-semibold tracking-[-0.03em] leading-none truncate"
              style={{ color: theme.label }}
            >
              {feed.pair}
            </h2>
            <span
              className="shrink-0 text-[9px] font-mono tracking-[0.14em] uppercase px-1.5 py-0.5 rounded-full border"
              style={{
                color: st.color,
                borderColor: `${st.color}40`,
                background: `${st.color}14`,
              }}
            >
              {st.label}
            </span>
          </div>
          {/* Always same second line height in hybrid so headers align */}
          {(isMineScope || isNetworkScope) && (
            <div className="flex items-center gap-1.5 pl-3.5 h-[1.25rem] overflow-hidden">
              {isMineScope ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-mono tracking-[0.14em] uppercase px-2 py-0.5 rounded-full border border-[#FF7A3D]/40 bg-[#FF7A3D]/12 text-[#FF7A3D] shrink-0">
                  ● my bridge
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[9px] font-mono tracking-[0.14em] uppercase px-2 py-0.5 rounded-full border border-[#00E5FF]/35 bg-[#00E5FF]/10 text-[#00E5FF] shrink-0">
                  ● lumen network
                </span>
              )}
              <span className="text-[9px] text-[#6B6B78] font-mono truncate">
                {isMineScope
                  ? "your agent · YOU on map"
                  : "host metrics · not your agent"}
              </span>
            </div>
          )}
        </div>

        <EpochAside
          epoch={feed.epoch}
          progress={epochProgress}
          color={theme.accent}
          ageBlocks={feed.ageBlocks}
          liveMax={liveMax}
        />
      </header>

      {/* Map stage — fixed dual height, identical box on both panes */}
      <div className="shrink-0 px-3 sm:px-4 pt-3 sm:pt-3.5">
        <div
          className="lumen-oracle-tile relative w-full rounded-2xl overflow-hidden border border-white/[0.06]"
          style={{
            background: "#050508",
            boxShadow: `inset 0 0 80px ${theme.accentDim}`,
          }}
        >
          {publishPulse > 0 && (
            <div
              className="absolute top-3 left-1/2 z-30 -translate-x-1/2 pointer-events-none"
              key={publishPulse}
              onAnimationEnd={() => setPublishPulse(0)}
            >
              <div
                className="px-3.5 py-1 rounded-full text-[10px] font-mono tracking-[0.22em] uppercase border"
                style={{
                  color: theme.accent,
                  borderColor: `${theme.accent}55`,
                  background: "rgba(0,0,0,0.72)",
                  boxShadow: `0 0 28px ${theme.accent}55`,
                  animation: "oracle-publish-flash 1.35s ease-out forwards",
                }}
              >
                ◆ Publishing
              </div>
            </div>
          )}

          <div className="lumen-oracle-panel lumen-oracle-panel--dual relative w-full">
            <OracleConstellation
              feed={feed}
              compact
              chrome={false}
              accentOverride={theme.accent}
              hideCenterPrice
              onActivity={(rows) => {
                setActivity(rows);
                if (
                  rows.some(
                    (r) => r.kind === "datapoint" || r.kind === "pool_refresh"
                  )
                ) {
                  setPublishPulse((n) => n + 1);
                }
              }}
            />
          </div>

          <CornerChip
            corner="tl"
            label="Consensus"
            value={
              feed.activeOracles != null && feed.requiredOracles != null
                ? `${feed.activeOracles}/${feed.requiredOracles}`
                : `${live}/${total || "—"}`
            }
            sub={
              feed.requiredOracles != null
                ? "active / need"
                : "operators"
            }
            accent={st.color}
          />
          <CornerChip
            corner="tr"
            label="Lag"
            value={feed.ageBlocks != null ? String(feed.ageBlocks) : "—"}
            sub="blocks"
            accent={
              feed.status === "live"
                ? "#E8E8F0"
                : feed.status === "stale"
                  ? "#D4A574"
                  : "#F87171"
            }
          />
          <CornerChip
            corner="bl"
            label="Health"
            value={health.label === "—" ? "—" : health.label}
            sub={
              tipHeight != null
                ? `tip ${tipHeight.toLocaleString()}`
                : undefined
            }
            accent={health.color}
          />
          <CornerChip
            corner="br"
            label="Settlement"
            value={
              feed.settlementHeight != null
                ? feed.settlementHeight.toLocaleString()
                : "—"
            }
            sub="height"
          />
        </div>
      </div>

      {/*
        Footer slots — identical stack + fixed heights so dual panes align
        row-for-row (identity / price / activity / legend).
      */}
      <div className="shrink-0 px-3 sm:px-4 py-3 sm:py-3.5 grid grid-cols-1 gap-2.5 sm:gap-3">
        {/* Row 1: Tier-1 operator / network cockpit — equal height both panes */}
        {(isMineScope || isNetworkScope) && (
          <div
            className="lumen-oracle-tile h-[14.5rem] rounded-xl border px-3.5 py-3 overflow-hidden flex flex-col"
            style={
              isMineScope
                ? {
                    borderColor: "rgba(255,122,61,0.35)",
                    background:
                      "linear-gradient(160deg, rgba(255,122,61,0.12) 0%, rgba(0,0,0,0.5) 50%)",
                    boxShadow: "0 0 32px rgba(255,122,61,0.14)",
                  }
                : {
                    borderColor: "rgba(0,229,255,0.28)",
                    background:
                      "linear-gradient(160deg, rgba(0,229,255,0.09) 0%, rgba(0,0,0,0.5) 50%)",
                  }
            }
          >
            {/* Alert strip */}
            {(() => {
              const a = isMineScope ? mineAlert : networkAlert;
              if (!a) return null;
              const t = alertTone(a.tone);
              return (
                <div
                  className="shrink-0 mb-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono tracking-wide leading-snug truncate"
                  style={{
                    color: t.c,
                    borderColor: t.b,
                    background: t.bg,
                  }}
                  title={a.text}
                >
                  {a.text}
                </div>
              );
            })()}

            <div className="flex items-center justify-between gap-2 shrink-0">
              <div
                className="text-[9px] font-mono tracking-[0.18em] uppercase"
                style={{ color: isMineScope ? "#FF7A3D" : "#00E5FF" }}
              >
                {isMineScope
                  ? "Your oracle · bridge"
                  : "Network · lumen host"}
              </div>
              <span
                className="text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded-full border shrink-0"
                style={
                  isMineScope
                    ? {
                        color:
                          mine?.isHealthy === true
                            ? "#34D399"
                            : mine?.isHealthy === false
                              ? "#F87171"
                              : "#8B8B9A",
                        borderColor:
                          mine?.isHealthy === true
                            ? "rgba(52,211,153,0.35)"
                            : mine?.isHealthy === false
                              ? "rgba(248,113,113,0.35)"
                              : "rgba(255,255,255,0.1)",
                      }
                    : {
                        color: "#00E5FF",
                        borderColor: "rgba(0,229,255,0.3)",
                      }
                }
              >
                {isMineScope
                  ? mine?.isHealthy === true
                    ? "HEALTHY"
                    : mine?.isHealthy === false
                      ? "DOWN"
                      : "—"
                  : "NOT YOURS"}
              </span>
            </div>

            <div
              className="mt-1 font-mono text-[12px] truncate shrink-0"
              style={{ color: isMineScope ? "#F0F0F5" : "#B0B0BC" }}
            >
              {isMineScope
                ? shortMine || "identity matching…"
                : "Public pool · host metrics"}
            </div>

            {/* 2×3 metric grid — same slots both panes */}
            <div className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-2.5 text-center shrink-0">
              <div>
                <div className="text-[8px] font-mono text-[#7A7A88] uppercase tracking-wider">
                  {isMineScope ? "Last post" : "Pool lag"}
                </div>
                <div
                  className="mt-0.5 font-mono text-[13px] tabular-nums leading-none"
                  style={{ color: isMineScope ? "#FF7A3D" : "#00E5FF" }}
                >
                  {isMineScope
                    ? mine?.postAgeBlocks != null
                      ? `${mine.postAgeBlocks}`
                      : "—"
                    : feed.ageBlocks != null
                      ? `${feed.ageBlocks}`
                      : "—"}
                  <span className="text-[9px] text-[#6B6B78] ml-0.5">blk</span>
                </div>
              </div>
              <div>
                <div className="text-[8px] font-mono text-[#7A7A88] uppercase tracking-wider">
                  {isMineScope ? "Rewards" : "Active"}
                </div>
                <div
                  className="mt-0.5 font-mono text-[13px] tabular-nums leading-none"
                  style={{ color: isMineScope ? "#E8C547" : "#E8E8F0" }}
                >
                  {isMineScope
                    ? mine?.claimableRewards != null
                      ? mine.claimableRewards.toLocaleString()
                      : mineNode?.rewardTokens != null
                        ? mineNode.rewardTokens.toLocaleString()
                        : "—"
                    : `${activeN ?? "—"}`}
                  {isMineScope && mine?.rewardsDelta != null && (
                    <span
                      className="ml-1 text-[10px]"
                      style={{
                        color:
                          mine.rewardsDelta > 0
                            ? "#34D399"
                            : mine.rewardsDelta < 0
                              ? "#F87171"
                              : "#6B6B78",
                      }}
                    >
                      {mine.rewardsDelta > 0
                        ? `+${mine.rewardsDelta}`
                        : mine.rewardsDelta === 0
                          ? "±0"
                          : `${mine.rewardsDelta}`}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-mono text-[#7A7A88] uppercase tracking-wider">
                  {isMineScope ? "Wallet" : "Need"}
                </div>
                <div className="mt-0.5 font-mono text-[13px] tabular-nums leading-none text-[#E8E8F0]">
                  {isMineScope
                    ? walletErg != null
                      ? `${walletErg < 10 ? walletErg.toFixed(2) : walletErg.toFixed(1)}`
                      : "—"
                    : `${needN ?? "—"}`}
                  {isMineScope && walletErg != null && (
                    <span className="text-[9px] text-[#6B6B78] ml-0.5">
                      ERG
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-mono text-[#7A7A88] uppercase tracking-wider">
                  {isMineScope ? "In refresh" : "Missing"}
                </div>
                <div
                  className="mt-0.5 font-mono text-[12px] tabular-nums leading-none font-medium"
                  style={{
                    color: isMineScope
                      ? mine?.inLastRefresh === true
                        ? "#34D399"
                        : mine?.inLastRefresh === false
                          ? "#D4A574"
                          : "#8B8B9A"
                      : missingN != null && missingN > 0
                        ? "#D4A574"
                        : "#34D399",
                  }}
                >
                  {isMineScope
                    ? mine?.inLastRefresh === true
                      ? "YES"
                      : mine?.inLastRefresh === false
                        ? "NO"
                        : "—"
                    : missingN != null
                      ? `${missingN}`
                      : "—"}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-mono text-[#7A7A88] uppercase tracking-wider">
                  Quorum
                </div>
                <div className="mt-0.5 font-mono text-[12px] tabular-nums leading-none text-[#E8E8F0]">
                  {activeN != null && needN != null
                    ? `${activeN}/${needN}`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-mono text-[#7A7A88] uppercase tracking-wider">
                  {isMineScope ? "Collect" : "Pool"}
                </div>
                <div className="mt-0.5 font-mono text-[12px] tabular-nums leading-none text-[#B0B0BC]">
                  {isMineScope
                    ? mine?.collectedAgeBlocks != null
                      ? `${mine.collectedAgeBlocks} blk`
                      : "—"
                    : health.label === "—"
                      ? "—"
                      : health.label}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-2 border-t border-white/[0.06] h-[1.85rem] overflow-hidden">
              {isMineScope ? (
                myActivity.length > 0 ? (
                  <p className="text-[10px] font-mono truncate text-[#FF7A3D]/90">
                    ◆ {myActivity[0].message}
                  </p>
                ) : (
                  <p className="text-[10px] text-[#6B6B78] truncate">
                    YOU on map · posts flash orange when you publish
                  </p>
                )
              ) : (
                <p className="text-[10px] text-[#6B6B78] truncate">
                  Attach this pool in ORACLE SETTINGS to run as YOURS
                </p>
              )}
            </div>
          </div>
        )}

        {/* Row 2: price — fixed */}
        <div className="lumen-oracle-tile h-[6.5rem] rounded-xl border border-white/[0.07] bg-black/40 px-3.5 py-3 flex flex-col justify-center overflow-hidden">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase mb-1.5">
            On-chain price
          </div>
          <div
            className="font-mono text-[1.35rem] sm:text-[1.5rem] font-semibold tabular-nums tracking-tight leading-none truncate"
            style={{ color: theme.label }}
          >
            {feed.priceLabel || "—"}
          </div>
          <div className="mt-1 text-[10px] text-[#8B8B9A] font-mono truncate h-[1rem]">
            {feed.unitLabel || "\u00a0"}
          </div>
          <div
            className="mt-1.5 text-[11px] font-mono truncate h-[1rem]"
            style={{
              color: feed.priceAlt ? `${theme.accent}dd` : "transparent",
            }}
          >
            {feed.priceAlt || "\u00a0"}
          </div>
        </div>

        {/* Row 3: publish activity — fixed */}
        <div className="lumen-oracle-tile h-[6.5rem] rounded-xl border border-white/[0.07] bg-black/40 px-3.5 py-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 shrink-0 h-[1.1rem]">
            <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase">
              Publish activity
            </div>
            <span
              className="text-[9px] font-mono tracking-wider uppercase min-w-[3.5rem] text-right"
              style={{
                color: activity.some((a) => a.kind === "datapoint")
                  ? theme.accent
                  : "transparent",
              }}
            >
              ● firing
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {activity.length === 0 ? (
              <p className="text-[11px] text-[#5C5C6A] leading-snug line-clamp-3">
                When an operator posts a datapoint, a diamond flies from their
                node into the pool core.
              </p>
            ) : (
              <ul className="space-y-1 overflow-hidden">
                {activity.slice(0, 3).map((row) => (
                  <li
                    key={row.id}
                    className="text-[10px] sm:text-[11px] font-mono truncate leading-snug h-[1.15rem]"
                    style={{
                      color:
                        row.kind === "datapoint"
                          ? "#2DD4BF"
                          : row.kind === "reward"
                            ? theme.accent
                            : row.kind === "pool_refresh"
                              ? theme.accent
                              : "#8B8B9A",
                    }}
                  >
                    {row.kind === "datapoint"
                      ? "◆ publish "
                      : row.kind === "reward"
                        ? "★ reward "
                        : row.kind === "pool_refresh"
                          ? "⬡ pool "
                          : "· "}
                    {row.message.replace(
                      /^(POST|REWARD|POOL REFRESH|RATE)\s*/i,
                      ""
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Row 4: legend — fixed 2×3 grid incl. You */}
        <div className="lumen-oracle-tile h-[8rem] rounded-xl border border-white/[0.07] bg-black/40 px-3.5 py-3 overflow-hidden flex flex-col">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase mb-2 shrink-0">
            Map legend
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 flex-1 content-start">
            <LegendItem
              shape="hex"
              color={theme.accent}
              label="Pool core"
              hint="Shared on-chain price box"
            />
            <LegendItem
              shape="dot"
              color="#2DD4BF"
              label="Oracle node"
              hint="Operator posting to the pool"
            />
            <LegendItem
              shape="diamond"
              color="#2DD4BF"
              label="Datapoint"
              hint="Publish shot into the core"
            />
            <LegendItem
              shape="star"
              color={theme.accent}
              label="Reward"
              hint="Claimable credit to operator"
            />
            <LegendItem
              shape="dot"
              color="#FF7A3D"
              label="You"
              hint="Your connected oracle (orange)"
            />
            <LegendItem
              shape="dot"
              color="#00E5FF"
              label="lumen"
              hint="Host agent on network pane"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OraclesDualView({
  data,
  isLoading,
  isError,
  onRetry,
}: Props) {
  const feeds = data?.feeds ?? [];
  const usd = feeds.find((f) => f.id === "erg-usd") || feeds[0];
  const xau = feeds.find((f) => f.id === "erg-xau") || feeds[1];
  const panes = [usd, xau].filter(Boolean) as OracleFeedData[];

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-5 sm:gap-6 w-full min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 sm:gap-5 lg:gap-6 items-stretch w-full">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="min-w-0 w-full rounded-[1.35rem] border border-white/[0.06] bg-[#0C0C12] h-[640px] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="rounded-[1.35rem] border border-[#EF4444]/25 bg-[#EF4444]/[0.04] py-20 flex flex-col items-center gap-4">
        <p className="font-mono text-xs tracking-[0.2em] text-[#F87171]">
          ORACLE API UNAVAILABLE
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="px-5 py-2.5 rounded-xl border border-white/10 text-[11px] font-mono tracking-widest text-[#E8E8F0] hover:bg-white/5"
        >
          RETRY
        </button>
      </div>
    );
  }

  const dual = panes.length > 1;
  const mineCount = panes.filter((p) => p.scope === "mine").length;
  const netCount = panes.filter((p) => p.scope === "network").length;

  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full min-w-0">
      {/* Hybrid legend when My Oracle mixes bridge + lumen host */}
      {mineCount > 0 && netCount > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-[9px] font-mono tracking-[0.16em] text-[#7A7A88] uppercase">
            Hybrid view
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#FF7A3D]/35 bg-[#FF7A3D]/10 text-[#FF7A3D] font-mono text-[10px] tracking-wider">
            ● MY BRIDGE · {mineCount}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/10 text-[#00E5FF] font-mono text-[10px] tracking-wider">
            ● LUMEN NETWORK · {netCount}
          </span>
          <span className="text-[#6B6B78] text-[11px]">
            Only attached pools use your agent — the rest stay public from lumen.
          </span>
        </div>
      )}

      {/* Always dual when both feeds present (hybrid keeps both panels) */}
      <div
        className={
          dual
            ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 sm:gap-5 lg:gap-6 items-stretch w-full"
            : "grid grid-cols-1 max-w-3xl mx-auto w-full gap-4"
        }
      >
        {panes.map((feed) => (
          <div key={feed.id} className="min-w-0 w-full h-full">
            <OracleBlock feed={feed} tipHeight={data?.tipHeight ?? null} />
          </div>
        ))}
      </div>

      {/* Status dictionary — footer; STALE ≠ DOWN (age vs local agent health) */}
      <div className="lumen-oracle-tile rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 sm:px-5 py-3.5 sm:py-4">
        <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase mb-3">
          What the statuses mean
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              t: "LIVE",
              c: "#34D399",
              d: "Price age: the shared pool price was updated recently — safe to treat as current.",
            },
            {
              t: "STALE",
              c: "#D4A574",
              d: "Price age: a price is still on-chain, but the pool has not refreshed for a while.",
            },
            {
              t: "DOWN",
              c: "#D4A574",
              d: "Local agent health (Health chip): protocol trouble. Not the same as STALE price age.",
            },
            {
              t: "OFFLINE",
              c: "#F87171",
              d: "Price age: unusable — missing pool box or the data is extremely old.",
            },
          ].map((s) => (
            <div
              key={s.t}
              className="lumen-oracle-tile min-w-0 rounded-xl border border-transparent px-2.5 py-2 -mx-1"
            >
              <div
                className="text-[11px] font-mono tracking-[0.14em] font-medium"
                style={{ color: s.c }}
              >
                {s.t}
              </div>
              <p className="mt-1 text-[11px] sm:text-[12px] text-[#8B8B9A] leading-snug">
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
