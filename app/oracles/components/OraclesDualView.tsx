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
      border: "rgba(201, 168, 76, 0.22)",
      surface: "rgba(201, 168, 76, 0.04)",
      label: "#E8D5A3",
    };
  }
  return {
    accent: "#2DD4BF",
    accentDim: "rgba(45, 212, 191, 0.12)",
    border: "rgba(45, 212, 191, 0.2)",
    surface: "rgba(45, 212, 191, 0.03)",
    label: "#A7F3E8",
  };
}

function statusTone(status: string) {
  if (status === "live") return { color: "#34D399", label: "LIVE" };
  if (status === "stale") return { color: "#D4A574", label: "STALE" };
  return { color: "#F87171", label: "OFFLINE" };
}

function EpochRing({
  epoch,
  progress,
  color,
}: {
  epoch: number | null;
  progress: number;
  color: string;
}) {
  const size = 64;
  const r = 24;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      title="Epoch progress = pool lag / live window"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="3.5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{
            filter: `drop-shadow(0 0 8px ${color}55)`,
            transition: "stroke-dashoffset 0.5s ease",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-1">
        <span className="font-mono text-[11px] sm:text-xs tabular-nums text-white leading-none tracking-tight">
          {epoch != null ? epoch.toLocaleString() : "—"}
        </span>
        <span className="mt-1 text-[8px] font-mono tracking-[0.12em] text-[#8B8B9A] uppercase">
          epoch
        </span>
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
      ? "top-3 left-3 sm:top-4 sm:left-4"
      : corner === "tr"
        ? "top-3 right-3 sm:top-4 sm:right-4 text-right"
        : corner === "bl"
          ? "bottom-3 left-3 sm:bottom-4 sm:left-4"
          : "bottom-3 right-3 sm:bottom-4 sm:right-4 text-right";

  return (
    <div
      className={`absolute z-20 pointer-events-none ${pos}`}
      style={{ maxWidth: "42%" }}
    >
      <div className="rounded-2xl border border-white/[0.09] bg-[#07070C]/78 backdrop-blur-xl px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
        <div className="text-[8px] sm:text-[9px] font-mono tracking-[0.16em] text-[#8B8B9A] uppercase whitespace-nowrap">
          {label}
        </div>
        <div
          className="mt-1 font-mono text-[13px] sm:text-[15px] tabular-nums tracking-tight leading-none whitespace-nowrap"
          style={{ color: accent || "#F2F2F7" }}
        >
          {value}
        </div>
        {sub ? (
          <div className="mt-1 text-[8px] sm:text-[9px] font-mono text-[#6B6B7A] tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
            {sub}
          </div>
        ) : null}
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

  const theme = themeFor(feed);
  const st = statusTone(feed.status);
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
      className="rounded-[1.25rem] sm:rounded-[1.5rem] border overflow-hidden"
      style={{
        borderColor: theme.border,
        background: `linear-gradient(180deg, ${theme.surface} 0%, rgba(10,10,15,0.95) 40%)`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-4 px-5 sm:px-7 py-4 sm:py-5 border-b border-white/[0.06]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: st.color,
                boxShadow:
                  feed.status === "live" ? `0 0 10px ${st.color}` : "none",
              }}
            />
            <h2
              className="text-xl sm:text-2xl font-semibold tracking-[-0.03em] leading-none"
              style={{ color: theme.label }}
            >
              {feed.pair}
            </h2>
            <span
              className="text-[10px] font-mono tracking-[0.18em] uppercase px-2 py-0.5 rounded-full border"
              style={{
                color: st.color,
                borderColor: `${st.color}44`,
                background: `${st.color}12`,
              }}
            >
              {st.label}
            </span>
          </div>
          <p className="mt-2 text-[11px] sm:text-xs font-mono text-[#7A7A8A] tracking-wide">
            {feed.subtitle || "Oracle Pool"} · on-chain pool box
          </p>
        </div>
        <EpochRing
          epoch={feed.epoch}
          progress={epochProgress}
          color={theme.accent}
        />
      </header>

      {/* Visualization stage */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5">
        <div
          className="relative rounded-2xl overflow-hidden border border-white/[0.06]"
          style={{
            background: "#050508",
            boxShadow: `inset 0 0 80px ${theme.accentDim}`,
          }}
        >
          <div className="lumen-oracle-panel relative w-full">
            <OracleConstellation
              feed={feed}
              compact
              chrome={false}
              accentOverride={theme.accent}
              onActivity={setActivity}
            />
          </div>

          {/* Corner metrics — integrated into stage */}
          <CornerChip
            corner="tl"
            label="Consensus"
            value={`${live} / ${total}`}
            sub={
              feed.requiredOracles != null
                ? `quorum ${feed.requiredOracles}`
                : "live operators"
            }
            accent={st.color}
          />
          <CornerChip
            corner="tr"
            label="Lag"
            value={feed.ageBlocks != null ? String(feed.ageBlocks) : "—"}
            sub="blocks behind tip"
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
            value={
              feed.poolHealthy == null
                ? "—"
                : feed.poolHealthy
                  ? "OK"
                  : "DOWN"
            }
            sub={
              tipHeight != null
                ? `chain ${tipHeight.toLocaleString()}`
                : "from metrics"
            }
            accent={
              feed.poolHealthy == null
                ? undefined
                : feed.poolHealthy
                  ? "#34D399"
                  : "#D4A574"
            }
          />
          <CornerChip
            corner="br"
            label="Settlement"
            value={
              feed.settlementHeight != null
                ? feed.settlementHeight.toLocaleString()
                : "—"
            }
            sub="pool box height"
          />
        </div>
      </div>

      {/* Bottom panels — equal, clean */}
      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5">
        <div className="rounded-2xl border border-white/[0.07] bg-black/35 px-4 py-3.5 min-h-[120px] flex flex-col">
          <div className="text-[9px] font-mono tracking-[0.2em] text-[#7A7A8A] uppercase mb-3">
            Live activity
          </div>
          <div className="flex-1 min-h-0">
            {activity.length === 0 ? (
              <p className="text-[12px] font-mono text-[#5C5C6A] leading-relaxed">
                Waiting for real posts / pool refresh…
              </p>
            ) : (
              <ul className="space-y-1.5">
                {activity.slice(0, 5).map((row) => (
                  <li
                    key={row.id}
                    className="text-[11px] font-mono truncate leading-snug"
                    style={{
                      color:
                        row.kind === "datapoint"
                          ? "#2DD4BF"
                          : row.kind === "reward"
                            ? theme.accent
                            : row.kind === "pool_refresh"
                              ? theme.accent
                              : "#9A9AAA",
                    }}
                  >
                    <span className="opacity-70 mr-1">
                      {row.kind === "datapoint"
                        ? "◆"
                        : row.kind === "reward"
                          ? "★"
                          : row.kind === "pool_refresh"
                            ? "⬡"
                            : "·"}
                    </span>
                    {row.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-black/35 px-4 py-3.5 min-h-[120px] flex flex-col">
          <div className="text-[9px] font-mono tracking-[0.2em] text-[#7A7A8A] uppercase mb-3">
            Price
          </div>
          <div
            className="font-mono text-2xl sm:text-[1.75rem] font-medium tabular-nums tracking-tight leading-none"
            style={{ color: theme.label }}
          >
            {feed.priceLabel || "—"}
          </div>
          <div className="mt-1.5 text-[11px] font-mono text-[#8B8B9A] tracking-wide">
            {feed.unitLabel}
          </div>
          {feed.priceAlt && (
            <div
              className="mt-2 text-[12px] font-mono tracking-wide"
              style={{ color: `${theme.accent}cc` }}
            >
              {feed.priceAlt}
            </div>
          )}
          <div className="mt-auto pt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-[#6B6B7A]">
            <span>live ≤ {feed.statusThresholds?.liveMax ?? "—"} blk</span>
            <span>stale ≤ {feed.statusThresholds?.staleMax ?? "—"} blk</span>
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
      <div className="flex flex-col gap-6 sm:gap-8">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-[1.5rem] border border-white/[0.06] bg-[#0C0C12] h-[480px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="rounded-[1.5rem] border border-[#EF4444]/25 bg-[#EF4444]/[0.04] py-20 flex flex-col items-center gap-4">
        <p className="font-mono text-xs tracking-[0.2em] text-[#F87171]">
          ORACLE API UNAVAILABLE
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="px-5 py-2.5 rounded-xl border border-white/10 text-[11px] font-mono tracking-widest text-[#E8E8F0] hover:bg-white/5 transition-colors"
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {panes.map((feed) => (
        <OracleBlock
          key={feed.id}
          feed={feed}
          tipHeight={data?.tipHeight ?? null}
        />
      ))}
      <p className="text-center text-[10px] sm:text-[11px] font-mono tracking-wide text-[#5C5C6A] max-w-xl mx-auto leading-relaxed">
        On-chain pool boxes · operator metrics · live event stream
      </p>
    </div>
  );
}
