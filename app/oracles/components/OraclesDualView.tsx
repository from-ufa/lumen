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

function statusColor(status: string) {
  if (status === "live") return "#10B981";
  if (status === "stale") return "#D4A574";
  return "#EF4444";
}

/** Premium gold vs cyan palette per feed */
function feedTheme(feed: OracleFeedData) {
  const isGold = feed.id === "erg-xau" || feed.pair.includes("XAU");
  if (isGold) {
    return {
      accent: feed.accent || "#C9A84C",
      accentSoft: "rgba(201, 168, 76, 0.12)",
      border: "rgba(201, 168, 76, 0.22)",
      ring: "#C9A84C",
      glow: "rgba(201, 168, 76, 0.35)",
      label: "#E8D5A3",
    };
  }
  return {
    accent: feed.accent || "#00E5FF",
    accentSoft: "rgba(0, 229, 255, 0.1)",
    border: "rgba(0, 229, 255, 0.18)",
    ring: "#00E5FF",
    glow: "rgba(0, 229, 255, 0.35)",
    label: "#A8E8F5",
  };
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
  const r = 22;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 56 56"
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3"
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{
            filter: `drop-shadow(0 0 6px ${color}66)`,
            transition: "stroke-dashoffset 0.4s ease",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[11px] sm:text-xs tabular-nums text-white leading-none">
          {epoch != null ? epoch.toLocaleString() : "—"}
        </div>
        <div className="text-[7px] font-mono tracking-[0.14em] text-[#A0A0B0] mt-0.5 uppercase">
          epoch
        </div>
      </div>
    </div>
  );
}

function CornerMetric({
  label,
  value,
  sub,
  accent,
  align = "left",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`pointer-events-none rounded-xl border border-white/[0.08] bg-black/55 backdrop-blur-md px-2.5 py-2 min-w-[6.5rem] sm:min-w-[7.5rem] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <div className="text-[8px] sm:text-[9px] font-mono tracking-[0.16em] text-[#A0A0B0]/90 uppercase">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-sm sm:text-base tabular-nums tracking-tight leading-none"
        style={{ color: accent || "#F0F0F5" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[8px] sm:text-[9px] font-mono text-[#A0A0B0]/55 tracking-wide truncate max-w-[9rem]">
          {sub}
        </div>
      )}
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

  const live =
    feed.activeOracles ??
    feed.nodes.filter((n) => n.status === "live").length;
  const total = feed.totalOracles ?? feed.nodes.length;
  const sc = statusColor(feed.status);
  const theme = feedTheme(feed);

  // Epoch progress = how much of LIVE window is consumed (0 = fresh, 1 = at liveMax)
  const liveMax = feed.statusThresholds?.liveMax ?? 24;
  const epochProgress =
    feed.ageBlocks != null && liveMax > 0
      ? Math.min(1, feed.ageBlocks / liveMax)
      : 0;

  return (
    <section
      className="rounded-2xl sm:rounded-3xl border bg-[#0C0C12]/85 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.4)]"
      style={{ borderColor: theme.border }}
    >
      {/* ── Header: title left · epoch ring right (not raw price) ── */}
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: sc,
              boxShadow: feed.status === "live" ? `0 0 10px ${sc}` : undefined,
            }}
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2
                className="text-lg sm:text-xl font-semibold tracking-tight"
                style={{ color: theme.label }}
              >
                {feed.pair}
              </h2>
              <span
                className="text-[10px] font-mono tracking-[0.16em] uppercase"
                style={{ color: sc }}
              >
                {feed.status}
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#A0A0B0]/70 tracking-wide mt-0.5 truncate">
              {feed.subtitle || "Oracle Pool"} · on-chain
              {feed.priceAlt ? ` · ${feed.priceAlt}` : ""}
            </p>
          </div>
        </div>

        <EpochRing
          epoch={feed.epoch}
          progress={epochProgress}
          color={theme.ring}
        />
      </div>

      {/* ── Viz with corner-integrated metrics ── */}
      <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-2">
        <div
          className="canvas-container lumen-oracle-panel relative w-full"
          style={{
            boxShadow: `inset 0 0 60px ${theme.accentSoft}`,
          }}
        >
          <OracleConstellation
            feed={feed}
            compact
            chrome={false}
            accentOverride={theme.accent}
            onActivity={setActivity}
          />

          {/* Four corners — integrated into scene */}
          <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-10">
            <CornerMetric
              label="Consensus"
              value={`${live}/${total}`}
              sub={
                feed.requiredOracles != null
                  ? `quorum ${feed.requiredOracles}`
                  : "operators"
              }
              accent={sc}
            />
          </div>
          <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-10">
            <CornerMetric
              label="Pool lag"
              value={feed.ageBlocks != null ? `${feed.ageBlocks}` : "—"}
              sub="blocks"
              align="right"
              accent={
                feed.ageBlocks != null &&
                feed.statusThresholds &&
                feed.ageBlocks > feed.statusThresholds.liveMax
                  ? "#D4A574"
                  : "#E8E8F0"
              }
            />
          </div>
          <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 z-10">
            <CornerMetric
              label="Pool health"
              value={
                feed.poolHealthy == null
                  ? "—"
                  : feed.poolHealthy
                    ? "OK"
                    : "DOWN"
              }
              sub={
                tipHeight != null
                  ? `tip ${tipHeight.toLocaleString()}`
                  : undefined
              }
              accent={
                feed.poolHealthy == null
                  ? undefined
                  : feed.poolHealthy
                    ? "#10B981"
                    : "#D4A574"
              }
            />
          </div>
          <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 z-10">
            <CornerMetric
              label="Settlement"
              value={
                feed.settlementHeight != null
                  ? feed.settlementHeight.toLocaleString()
                  : "—"
              }
              sub="pool box h"
              align="right"
            />
          </div>
        </div>
      </div>

      {/* ── Bottom: activity | thresholds — equal ── */}
      <div className="grid sm:grid-cols-2 gap-3 px-4 sm:px-5 pb-4 sm:pb-5 pt-2">
        <div className="rounded-2xl border border-white/[0.06] bg-black/30 px-3.5 py-3 min-h-[108px]">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#A0A0B0] uppercase mb-2">
            Live activity
          </div>
          {activity.length === 0 ? (
            <p className="text-[11px] font-mono text-[#A0A0B0]/50 leading-relaxed">
              Waiting for network posts / pool refresh…
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[88px] overflow-hidden">
              {activity.slice(0, 5).map((row) => (
                <div
                  key={row.id}
                  className="text-[10px] sm:text-[11px] font-mono truncate"
                  style={{
                    color:
                      row.kind === "datapoint"
                        ? "#00D4AA"
                        : row.kind === "reward"
                          ? theme.accent
                          : row.kind === "pool_refresh"
                            ? theme.ring
                            : "#A0A0B0",
                  }}
                >
                  {row.kind === "datapoint"
                    ? "◆ "
                    : row.kind === "reward"
                      ? "★ "
                      : row.kind === "pool_refresh"
                        ? "⬡ "
                        : "· "}
                  {row.message}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-black/30 px-3.5 py-3 min-h-[108px]">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#A0A0B0] uppercase mb-2">
            Price · window
          </div>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div
              className="font-mono text-xl sm:text-2xl tabular-nums tracking-tight"
              style={{ color: theme.label }}
            >
              {feed.priceLabel || "—"}
            </div>
            <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wide text-right">
              {feed.unitLabel}
            </div>
          </div>
          {feed.priceAlt && (
            <div className="text-[11px] font-mono text-[#A0A0B0]/80 mb-2">
              {feed.priceAlt}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#A0A0B0]/70">
            <span>
              LIVE ≤ {feed.statusThresholds?.liveMax ?? "—"} blk
            </span>
            <span>
              STALE ≤ {feed.statusThresholds?.staleMax ?? "—"} blk
            </span>
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
      <div className="flex flex-col gap-5 sm:gap-7">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-3xl border border-white/[0.06] bg-[#0C0C12]/80 h-[420px] sm:h-[480px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="rounded-3xl border border-[#EF4444]/20 bg-[#EF4444]/[0.04] py-16 flex flex-col items-center justify-center gap-4">
        <p className="font-mono text-sm tracking-widest text-[#EF4444]">
          ORACLE API UNAVAILABLE
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-xl border border-white/10 text-xs font-mono tracking-widest text-[#E8E8F0] hover:bg-white/5 transition-colors"
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-7">
      {panes.map((feed) => (
        <OracleBlock
          key={feed.id}
          feed={feed}
          tipHeight={data?.tipHeight ?? null}
        />
      ))}

      <p className="text-center text-[10px] sm:text-[11px] font-mono tracking-wide text-[#A0A0B0]/50 max-w-2xl mx-auto leading-relaxed">
        Prices and epochs from on-chain oracle pool boxes. Corner metrics and
        epoch ring use live tip / settlement data. XAU shown as μoz gold per ERG
        (with ERG per troy oz secondary).
      </p>
    </div>
  );
}
