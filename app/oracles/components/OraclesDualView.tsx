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

/** Human status copy — plain language, not debug */
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
          ? `The shared price is up to date — last pool update about ${lag} block${lag === 1 ? "" : "s"} ago.`
          : "The shared price is up to date — the pool was refreshed recently.",
    };
  }
  if (feed.status === "stale") {
    return {
      color: "#D4A574",
      label: "STALE",
      blurb:
        lag != null
          ? `A price is still on-chain, but it is getting old (~${lag} blocks). Operators may still be posting while the pool waits for enough agreement.`
          : "A price is still on-chain, but the pool has not refreshed for a while.",
    };
  }
  return {
    color: "#F87171",
    label: "OFFLINE",
    blurb:
      "This feed cannot be trusted right now — the pool box is missing or the data is extremely old.",
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
      <div className="rounded-xl border border-white/[0.08] bg-[#06060A]/82 backdrop-blur-xl px-2.5 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.5)]">
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
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4">
        {shape === "dot" && (
          <span
            className="block w-2.5 h-2.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
          />
        )}
        {shape === "hex" && (
          <span
            className="block w-3 h-3"
            style={{
              background: color,
              clipPath:
                "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
            }}
          />
        )}
        {shape === "diamond" && (
          <span
            className="block w-2.5 h-2.5 rotate-45"
            style={{ background: color }}
          />
        )}
        {shape === "star" && (
          <span className="text-[11px] leading-none" style={{ color }}>
            ★
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-[#D0D0D8] leading-tight">
          {label}
        </div>
        <div className="text-[10px] text-[#6B6B78] leading-snug mt-0.5">
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

  return (
    <section
      className="h-full min-h-0 flex flex-col rounded-2xl sm:rounded-[1.35rem] border overflow-hidden"
      style={{
        borderColor: theme.border,
        background: `linear-gradient(180deg, ${theme.surface} 0%, rgba(9,9,12,0.98) 45%)`,
        boxShadow: "0 20px 56px rgba(0,0,0,0.42)",
      }}
    >
      {/* Compact header: title left · epoch ring+copy right */}
      <header className="shrink-0 flex items-center justify-between gap-2.5 sm:gap-3 px-3.5 sm:px-4 lg:px-5 py-3 border-b border-white/[0.06] min-h-[4.75rem]">
        <div className="min-w-0 flex items-center gap-2">
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

        <EpochAside
          epoch={feed.epoch}
          progress={epochProgress}
          color={theme.accent}
          ageBlocks={feed.ageBlocks}
          liveMax={liveMax}
        />
      </header>

      {/* Human status strip — fixed min-height so dual panes align */}
      <div className="shrink-0 px-3.5 sm:px-4 lg:px-5 py-2 border-b border-white/[0.04] bg-black/20 min-h-[3.25rem] flex items-center">
        <p className="text-[11px] sm:text-[12px] text-[#B0B0BC] leading-snug line-clamp-2">
          <span className="font-medium" style={{ color: st.color }}>
            {st.label}
          </span>
          <span className="text-[#5C5C6A]"> · </span>
          {st.blurb}
          {feed.poolHealthy === false && (
            <>
              <span className="text-[#5C5C6A]"> · </span>
              <span style={{ color: health.color }}>{health.label}</span>
              <span className="text-[#8B8B9A]">
                {" "}
                — local agent sees protocol trouble.
              </span>
            </>
          )}
        </p>
      </div>

      {/* Map stage — flex-grow keeps dual panes same height */}
      <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-4 pt-3 sm:pt-3.5">
        <div
          className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/[0.06]"
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

          <div className="lumen-oracle-panel lumen-oracle-panel--dual relative w-full h-full">
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
            value={`${live}/${total}`}
            sub={
              feed.requiredOracles != null
                ? `need ${feed.requiredOracles}`
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

      {/* Single price + activity + legend — stacked for dual-column rhythm */}
      <div className="shrink-0 px-3 sm:px-4 py-3 sm:py-3.5 grid grid-cols-1 gap-2.5 sm:gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-black/40 px-3.5 py-3 flex flex-col justify-center min-h-[88px]">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase mb-1.5">
            On-chain price
          </div>
          <div
            className="font-mono text-[1.35rem] sm:text-[1.5rem] font-semibold tabular-nums tracking-tight leading-none"
            style={{ color: theme.label }}
          >
            {feed.priceLabel || "—"}
          </div>
          <div className="mt-1 text-[10px] text-[#8B8B9A] font-mono">
            {feed.unitLabel}
          </div>
          {feed.priceAlt && (
            <div
              className="mt-1.5 text-[11px] font-mono"
              style={{ color: `${theme.accent}dd` }}
            >
              {feed.priceAlt}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-black/40 px-3.5 py-3 min-h-[88px] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase">
              Publish activity
            </div>
            {activity.some((a) => a.kind === "datapoint") && (
              <span
                className="text-[9px] font-mono tracking-wider uppercase"
                style={{ color: theme.accent }}
              >
                ● firing
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {activity.length === 0 ? (
              <p className="text-[11px] text-[#5C5C6A] leading-relaxed">
                When an operator posts a datapoint, a diamond flies from their
                node into the pool core.
              </p>
            ) : (
              <ul className="space-y-1 max-h-[72px] overflow-hidden">
                {activity.slice(0, 4).map((row) => (
                  <li
                    key={row.id}
                    className="text-[10px] sm:text-[11px] font-mono truncate leading-snug"
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

        <div className="rounded-xl border border-white/[0.07] bg-black/40 px-3.5 py-3">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase mb-2.5">
            Map legend
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
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
      <div className="flex flex-col gap-5 sm:gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 items-stretch">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-[1.35rem] border border-white/[0.06] bg-[#0C0C12] h-[640px] animate-pulse"
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

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* Side-by-side dual panels — equal height, shared rhythm */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 items-stretch">
        {panes.map((feed) => (
          <OracleBlock
            key={feed.id}
            feed={feed}
            tipHeight={data?.tipHeight ?? null}
          />
        ))}
      </div>

      {/* Status dictionary — footer, once for the page */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 sm:px-5 py-3.5 sm:py-4">
        <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase mb-3">
          What the statuses mean
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              t: "LIVE",
              c: "#34D399",
              d: "Fresh. The shared pool price was updated recently — safe to treat as current.",
            },
            {
              t: "STALE",
              c: "#D4A574",
              d: "Getting old. A price is still on-chain, but the pool has not refreshed for a while.",
            },
            {
              t: "DOWN",
              c: "#D4A574",
              d: "Local software sees protocol trouble (not enough operators agreeing). Separate from price age.",
            },
            {
              t: "OFFLINE",
              c: "#F87171",
              d: "Unusable right now — missing pool box or the data is extremely old.",
            },
          ].map((s) => (
            <div key={s.t} className="min-w-0">
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
