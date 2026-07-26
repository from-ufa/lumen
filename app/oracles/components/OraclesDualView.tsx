"use client";

import OracleConstellation from "./OracleConstellation";
import type { OraclesApiResponse } from "./types";

interface Props {
  data: OraclesApiResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  onRetry: () => void;
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
  const panes = [usd, xau].filter(Boolean);

  if (isLoading && !data) {
    return (
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="canvas-container lumen-viz lumen-oracle-panel animate-pulse flex items-center justify-center font-mono text-[10px] tracking-[0.25em] text-[#A0A0B0]/60"
          >
            LOADING…
          </div>
        ))}
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="canvas-container lumen-viz flex flex-col items-center justify-center gap-4 border border-[#EF4444]/20 bg-[#EF4444]/[0.04]">
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
    <div className="space-y-4 sm:space-y-6">
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        {panes.map((feed) => (
          <div key={feed!.id} className="min-w-0">
            {/* Panel chrome — matches dashboard viz cards */}
            <div className="flex items-center justify-between gap-2 mb-2.5 px-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background:
                      feed!.status === "live"
                        ? "#10B981"
                        : feed!.status === "stale"
                          ? "#F59E0B"
                          : "#EF4444",
                    boxShadow:
                      feed!.status === "live"
                        ? "0 0 8px #10B98188"
                        : undefined,
                  }}
                />
                <span className="font-mono text-[11px] sm:text-xs tracking-[0.18em] text-[#E8E8F0]">
                  {feed!.pair}
                </span>
                <span className="text-[10px] font-mono text-[#A0A0B0]/70 tracking-wide truncate">
                  {feed!.subtitle || "Oracle Pool"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono tracking-wider">
                <span
                  className={
                    feed!.status === "live"
                      ? "text-[#10B981]"
                      : feed!.status === "stale"
                        ? "text-[#F59E0B]"
                        : "text-[#EF4444]"
                  }
                >
                  {feed!.status.toUpperCase()}
                </span>
                {feed!.epoch != null && (
                  <span className="text-[#A0A0B0]/70">
                    EP {feed!.epoch.toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            <div className="canvas-container lumen-viz lumen-oracle-panel relative">
              <OracleConstellation feed={feed!} compact />
            </div>

            {/* Foot meta row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10px] font-mono tracking-wide text-[#A0A0B0]/70">
              <span className="text-[#E8E8F0] tabular-nums">
                {feed!.priceLabel || "—"}
              </span>
              {feed!.unitLabel && <span>{feed!.unitLabel}</span>}
              {feed!.ageBlocks != null && (
                <span>lag {feed!.ageBlocks} blk</span>
              )}
              {(feed!.activeOracles != null || feed!.nodes?.length) && (
                <span>
                  {feed!.activeOracles ??
                    feed!.nodes.filter((n) => n.status === "live").length}
                  /
                  {feed!.totalOracles ?? feed!.nodes?.length ?? "—"}{" "}
                  oracles
                  {feed!.requiredOracles != null
                    ? ` · quorum ${feed!.requiredOracles}`
                    : ""}
                </span>
              )}
              {feed!.poolHealthy != null && (
                <span
                  style={{
                    color: feed!.poolHealthy ? "#10B981" : "#F59E0B",
                  }}
                >
                  pool {feed!.poolHealthy ? "OK" : "DOWN"}
                </span>
              )}
              {(feed!.liveEvents?.length ?? 0) > 0 && (
                <span style={{ color: "#00E5FF" }}>
                  +{feed!.liveEvents!.length} event
                  {feed!.liveEvents!.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] sm:text-[11px] font-mono tracking-wide text-[#A0A0B0]/50 max-w-2xl mx-auto leading-relaxed pt-2">
        Prices and epochs from on-chain oracle pool boxes. Node statuses from
        operator metrics when available. Visualization is live; not financial
        advice.
      </p>
    </div>
  );
}
