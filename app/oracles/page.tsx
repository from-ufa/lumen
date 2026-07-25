"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Zap,
  ArrowLeft,
  RefreshCw,
  Gem,
  Radio,
  ExternalLink,
} from "lucide-react";

const ConsensusSingularity = dynamic(
  () => import("../components/oracles/ConsensusSingularity"),
  {
    ssr: false,
    loading: () => (
      <div className="oracle-singularity flex items-center justify-center font-mono text-[10px] tracking-[0.3em] text-[#A0A0B0]">
        IGNITING SINGULARITY…
      </div>
    ),
  }
);

interface OracleNode {
  address: string;
  height: number | null;
  status: "live" | "stale" | "offline";
}

interface OracleFeed {
  id: string;
  pair: string;
  title: string;
  subtitle: string;
  accent: string;
  accentSoft: string;
  status: "live" | "stale" | "offline";
  priceLabel: string | null;
  priceAlt: string | null;
  unitLabel: string;
  epoch: number | null;
  epochLength: number;
  ageBlocks: number | null;
  ageMs: number | null;
  lastUpdatedAt: number | null;
  activeOracles: number | null;
  totalOracles: number | null;
  nodes: OracleNode[];
  settlementHeight: number | null;
  explorerUrl: string | null;
  history: { t: number; price: number }[];
}

interface OraclesApi {
  generatedAt: number;
  tipHeight: number | null;
  avgBlockMs: number;
  feeds: OracleFeed[];
  error?: string;
}

async function fetchOracles(): Promise<OraclesApi> {
  const res = await fetch("/api/oracles", { cache: "no-store" });
  if (!res.ok) throw new Error(`oracles ${res.status}`);
  return res.json();
}

export default function OraclesPage() {
  const [now, setNow] = useState(() => Date.now());
  const [activeId, setActiveId] = useState("erg-usd");

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["oracles"],
    queryFn: fetchOracles,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Prefer first feed id when data arrives
  useEffect(() => {
    if (!data?.feeds?.length) return;
    if (!data.feeds.some((f) => f.id === activeId)) {
      setActiveId(data.feeds[0].id);
    }
  }, [data, activeId]);

  const feeds = data?.feeds ?? [];
  const active = feeds.find((f) => f.id === activeId) || feeds[0];
  const liveCount = feeds.filter((f) => f.status === "live").length;
  const allLive = feeds.length > 0 && liveCount === feeds.length;

  return (
    <div className="min-h-dvh flex flex-col bg-[#0A0A0F] text-[#E8E8F0]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-25%] left-[-15%] h-[55vh] w-[55vw] rounded-full bg-[#10B981]/[0.035] blur-[110px]" />
        <div className="absolute bottom-[-20%] right-[-12%] h-[50vh] w-[48vw] rounded-full bg-[#E8C547]/[0.03] blur-[110px]" />
      </div>

      {/* header */}
      <header className="relative z-20 border-b border-white/[0.06] bg-[#0A0A0F]/75 backdrop-blur-xl">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 sm:gap-3 min-w-0 group"
            >
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold tracking-[-0.5px] text-xl sm:text-2xl leading-none group-hover:text-white transition-colors">
                  Lumen
                </div>
                <div className="text-[9px] sm:text-[10px] text-[#A0A0B0] mt-0.5 font-mono tracking-[2px] sm:tracking-[3px]">
                  ORACLES
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <div
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-3xl text-[10px] sm:text-xs font-mono tracking-widest border ${
                  allLive
                    ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
                    : isError
                      ? "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
                      : "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#F59E0B]"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    allLive ? "bg-[#10B981] status-dot" : "bg-current"
                  }`}
                />
                {isLoading
                  ? "LOADING"
                  : isError
                    ? "UNAVAILABLE"
                    : allLive
                      ? "FEEDS LIVE"
                      : `${liveCount}/${feeds.length || 2} LIVE`}
              </div>

              <button
                type="button"
                onClick={() => void refetch()}
                className="p-2.5 sm:p-3 rounded-2xl glass border border-white/10 hover:bg-white/5 transition-all active:scale-95"
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </button>

              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl glass border border-white/10 text-[11px] font-mono tracking-widest text-[#A0A0B0] hover:text-white hover:border-white/20 transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                DASHBOARD
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-[1480px] w-full mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-14 sm:pb-20">
        {/* hero copy */}
        <div className="mb-5 sm:mb-7">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="font-mono text-[10px] sm:text-xs tracking-[3px] sm:tracking-[4px] text-[#E8C547] mb-2 flex items-center gap-2">
              <Gem className="w-3.5 h-3.5" />
              CONSENSUS SINGULARITY
            </div>
            <h1 className="text-[1.75rem] sm:text-4xl lg:text-5xl font-semibold tracking-[-1px] sm:tracking-[-1.4px] leading-[1.08]">
              Where prices collapse into truth.
            </h1>
            <p className="text-sm sm:text-lg text-[#A0A0B0] tracking-tight mt-2 max-w-2xl">
              Data streams fall into oracle gravity wells, then fuse at the
              center — the on-chain consensus price for ERG/USD and ERG/XAU.
            </p>
          </motion.div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] sm:text-[11px] font-mono tracking-wider">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/12 bg-white/[0.04] text-[#A0A0B0]">
              <Radio className="w-3 h-3 text-[#00E5FF]" />
              POOL BOX · EXPLORER
            </span>
            {data?.tipHeight != null && (
              <span className="px-2.5 py-1 rounded-full border border-white/12 bg-white/[0.04] text-[#E8E8F0]">
                TIP · {data.tipHeight.toLocaleString()}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full border border-white/12 bg-white/[0.04] text-[#A0A0B0]">
              AUTO · 20s
            </span>
          </div>
        </div>

        {/* singularity stage */}
        {isLoading && !data ? (
          <div className="oracle-singularity rounded-[1.75rem] border border-white/[0.06] bg-[#050508] animate-pulse flex items-center justify-center font-mono text-[10px] tracking-[0.3em] text-[#A0A0B0]/60">
            ALIGNING ORBITS…
          </div>
        ) : isError && !data ? (
          <div className="oracle-singularity rounded-[1.75rem] border border-[#EF4444]/25 bg-[#EF4444]/5 flex flex-col items-center justify-center gap-3">
            <p className="font-mono text-sm tracking-widest text-[#EF4444]">
              SINGULARITY OFFLINE
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-4 py-2 rounded-xl border border-white/10 text-xs font-mono tracking-widest text-[#E8E8F0] hover:bg-white/5"
            >
              RETRY
            </button>
          </div>
        ) : (
          <ConsensusSingularity
            feeds={feeds}
            activeId={activeId}
            onSelectFeed={setActiveId}
            tipHeight={data?.tipHeight ?? null}
            isFetching={isFetching}
            now={now}
          />
        )}

        {/* slim feed strip — not the hero, just verification */}
        {feeds.length > 0 && (
          <div className="mt-5 sm:mt-6 grid sm:grid-cols-2 gap-3">
            {feeds.map((f) => {
              const on = f.id === activeId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveId(f.id)}
                  className={`text-left rounded-2xl border px-4 py-3.5 transition-all ${
                    on
                      ? "border-white/15 bg-white/[0.05]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                  style={
                    on
                      ? {
                          boxShadow: `0 0 0 1px ${f.accent}33, 0 12px 40px rgba(0,0,0,0.35)`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background:
                            f.status === "live"
                              ? f.accent
                              : f.status === "stale"
                                ? "#F59E0B"
                                : "#EF4444",
                          boxShadow: `0 0 8px ${
                            f.status === "live" ? f.accent : "#666"
                          }`,
                        }}
                      />
                      <span className="font-mono text-[11px] tracking-[0.2em] text-[#A0A0B0]">
                        {f.pair}
                      </span>
                    </div>
                    <span
                      className="font-mono text-[10px] tracking-widest"
                      style={{
                        color:
                          f.status === "live"
                            ? "#10B981"
                            : f.status === "stale"
                              ? "#F59E0B"
                              : "#EF4444",
                      }}
                    >
                      {f.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-xl sm:text-2xl font-semibold tabular-nums tracking-tight text-white">
                      {f.priceLabel || "—"}
                    </span>
                    {f.explorerUrl && (
                      <a
                        href={f.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[9px] font-mono tracking-widest text-[#A0A0B0] hover:text-white"
                      >
                        BOX
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] font-mono text-[#A0A0B0]/60 tracking-wide">
                    {f.activeOracles != null && f.totalOracles != null
                      ? `${f.activeOracles}/${f.totalOracles} oracles · `
                      : ""}
                    epoch {f.epoch?.toLocaleString() ?? "—"}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-8 sm:mt-10 text-center text-[10px] sm:text-[11px] font-mono tracking-wide text-[#A0A0B0]/50 max-w-xl mx-auto leading-relaxed">
          Particles = external data. Nodes = oracle operators. Center =
          consensus price from the pool box. Status from tip height vs
          settlement. Not financial advice.
        </p>
      </main>
    </div>
  );
}
