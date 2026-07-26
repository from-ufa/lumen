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
  if (status === "stale") return "#F59E0B";
  return "#EF4444";
}

function MetricCell({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 sm:px-4 py-3 sm:py-3.5 min-h-[76px] flex flex-col justify-between">
      <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.18em] text-[#A0A0B0] uppercase">
        {label}
      </div>
      <div
        className="mt-1.5 font-mono text-lg sm:text-xl tabular-nums tracking-tight leading-none"
        style={{ color: accent || "#E8E8F0" }}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1.5 text-[10px] font-mono text-[#A0A0B0]/65 tracking-wide truncate">
          {sub}
        </div>
      ) : (
        <div className="mt-1.5 h-[14px]" />
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

  return (
    <section className="rounded-2xl sm:rounded-3xl border border-white/[0.08] bg-[#0C0C12]/80 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
      {/* ── Header row — symmetric ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: sc,
              boxShadow: feed.status === "live" ? `0 0 10px ${sc}` : undefined,
            }}
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
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
            </p>
          </div>
        </div>

        <div className="sm:text-right shrink-0">
          <div className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight text-white">
            {feed.priceLabel || "—"}
          </div>
          <div className="text-[10px] font-mono text-[#A0A0B0] tracking-[0.14em] mt-0.5">
            {feed.unitLabel}
            {feed.epoch != null ? ` · EPOCH ${feed.epoch.toLocaleString()}` : ""}
          </div>
        </div>
      </div>

      {/* ── Metric grid — 4 equal cells ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 px-4 sm:px-6 pt-4 sm:pt-5">
        <MetricCell
          label="Consensus"
          value={`${live}/${total}`}
          sub={
            feed.requiredOracles != null
              ? `quorum ${feed.requiredOracles}`
              : "operators live"
          }
          accent={sc}
        />
        <MetricCell
          label="Pool lag"
          value={feed.ageBlocks != null ? `${feed.ageBlocks}` : "—"}
          sub="blocks behind tip"
        />
        <MetricCell
          label="Pool health"
          value={
            feed.poolHealthy == null
              ? "—"
              : feed.poolHealthy
                ? "OK"
                : "DOWN"
          }
          sub={
            tipHeight != null ? `tip ${tipHeight.toLocaleString()}` : "metrics"
          }
          accent={
            feed.poolHealthy == null
              ? undefined
              : feed.poolHealthy
                ? "#10B981"
                : "#F59E0B"
          }
        />
        <MetricCell
          label="Settlement"
          value={
            feed.settlementHeight != null
              ? feed.settlementHeight.toLocaleString()
              : "—"
          }
          sub={feed.priceAlt ? feed.priceAlt.slice(0, 28) : "pool box height"}
        />
      </div>

      {/* ── Visualization — full-width framed ── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5">
        <div className="canvas-container lumen-oracle-panel relative w-full">
          <OracleConstellation
            feed={feed}
            compact
            chrome={false}
            onActivity={setActivity}
          />
        </div>
      </div>

      {/* ── Bottom row: activity | meta — equal columns ── */}
      <div className="grid sm:grid-cols-2 gap-3 px-4 sm:px-6 py-4 sm:py-5">
        <div className="rounded-2xl border border-white/[0.06] bg-black/30 px-3.5 py-3 min-h-[112px]">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#A0A0B0] uppercase mb-2">
            Live activity
          </div>
          {activity.length === 0 ? (
            <p className="text-[11px] font-mono text-[#A0A0B0]/55 leading-relaxed">
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
                          ? "#FFD700"
                          : row.kind === "pool_refresh"
                            ? "#00E5FF"
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

        <div className="rounded-2xl border border-white/[0.06] bg-black/30 px-3.5 py-3 min-h-[112px]">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#A0A0B0] uppercase mb-2">
            Thresholds · sample
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] font-mono">
            <div>
              <div className="text-[#A0A0B0]/60 text-[9px] tracking-wider">
                LIVE ≤
              </div>
              <div className="text-[#E8E8F0] tabular-nums">
                {feed.statusThresholds?.liveMax ?? "—"} blk
              </div>
            </div>
            <div>
              <div className="text-[#A0A0B0]/60 text-[9px] tracking-wider">
                STALE ≤
              </div>
              <div className="text-[#E8E8F0] tabular-nums">
                {feed.statusThresholds?.staleMax ?? "—"} blk
              </div>
            </div>
            <div>
              <div className="text-[#A0A0B0]/60 text-[9px] tracking-wider">
                HISTORY
              </div>
              <div className="text-[#E8E8F0] tabular-nums">
                {feed.history?.length ?? 0} pts
              </div>
            </div>
            <div>
              <div className="text-[#A0A0B0]/60 text-[9px] tracking-wider">
                EVENTS
              </div>
              <div className="text-[#00E5FF] tabular-nums">
                +{feed.liveEvents?.length ?? 0}
              </div>
            </div>
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
      {/* Vertical stack: USD then XAU */}
      {panes.map((feed) => (
        <OracleBlock
          key={feed.id}
          feed={feed}
          tipHeight={data?.tipHeight ?? null}
        />
      ))}

      <p className="text-center text-[10px] sm:text-[11px] font-mono tracking-wide text-[#A0A0B0]/50 max-w-2xl mx-auto leading-relaxed">
        Prices and epochs from on-chain oracle pool boxes. Operator nodes and
        rewards from local metrics. Visualization reacts to real network
        events.
      </p>
    </div>
  );
}
