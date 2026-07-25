"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Zap,
  ArrowLeft,
  RefreshCw,
  Gem,
  Radio,
} from "lucide-react";
import OracleFeedCard, {
  type OracleFeedView,
} from "../components/oracles/OracleFeedCard";

interface OraclesApi {
  generatedAt: number;
  tipHeight: number | null;
  avgBlockMs: number;
  feeds: OracleFeedView[];
  error?: string;
}

async function fetchOracles(): Promise<OraclesApi> {
  const res = await fetch("/api/oracles", { cache: "no-store" });
  if (!res.ok) throw new Error(`oracles ${res.status}`);
  return res.json();
}

export default function OraclesPage() {
  const [now, setNow] = useState(() => Date.now());

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

  const feeds = data?.feeds ?? [];
  const liveCount = feeds.filter((f) => f.status === "live").length;
  const allLive = feeds.length > 0 && liveCount === feeds.length;

  return (
    <div className="min-h-dvh flex flex-col bg-[#0A0A0F] text-[#E8E8F0]">
      {/* ambient bg */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] h-[50vh] w-[50vw] rounded-full bg-[#10B981]/[0.04] blur-[100px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[45vh] w-[45vw] rounded-full bg-[#E8C547]/[0.035] blur-[100px]" />
        <div className="absolute top-[40%] left-[40%] h-[30vh] w-[30vw] rounded-full bg-[#00E5FF]/[0.03] blur-[90px]" />
      </div>

      {/* sticky header */}
      <header className="relative z-20 border-b border-white/[0.06] bg-[#0A0A0F]/80 backdrop-blur-xl">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <Link
                href="/"
                className="flex items-center gap-2 sm:gap-3 min-w-0 group"
              >
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-black" />
                </div>
                <div className="min-w-0 hidden xs:block sm:block">
                  <div className="font-semibold tracking-[-0.5px] text-xl sm:text-2xl leading-none group-hover:text-white transition-colors">
                    Lumen
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-[#A0A0B0] mt-0.5 font-mono tracking-[2px] sm:tracking-[3px] truncate">
                    ORACLES
                  </div>
                </div>
              </Link>
            </div>

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
                      : `${liveCount}/${feeds.length} LIVE`}
              </div>

              <button
                type="button"
                onClick={() => void refetch()}
                className="p-2.5 sm:p-3 rounded-2xl glass border border-white/10 hover:bg-white/5 transition-all active:scale-95"
                title="Refresh oracle feeds"
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

      <main className="relative z-10 flex-1 max-w-[1480px] w-full mx-auto px-3 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-16 sm:pb-20">
        {/* hero */}
        <div className="mb-8 sm:mb-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="font-mono text-[10px] sm:text-xs tracking-[3px] sm:tracking-[4px] text-[#E8C547] mb-2 flex items-center gap-2">
              <Gem className="w-3.5 h-3.5" />
              NETWORK ORACLE FEEDS
            </div>
            <h1 className="text-[2rem] sm:text-5xl lg:text-6xl font-semibold tracking-[-1px] sm:tracking-[-1.6px] leading-[1.05]">
              Price, on-chain.
            </h1>
            <p className="text-base sm:text-xl text-[#A0A0B0] tracking-tight mt-2 max-w-2xl">
              Live ERG/USD and ERG/XAU from Ergo Oracle Pools — settlement you
              can verify, not a private price API.
            </p>
          </motion.div>

          <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-mono tracking-wider">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/12 bg-white/[0.04] text-[#A0A0B0]">
              <Radio className="w-3 h-3 text-[#00E5FF]" />
              SOURCE · EXPLORER POOL BOX
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

        {/* cards */}
        {isLoading && !data ? (
          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-[1.75rem] border border-white/[0.06] bg-[#121218]/80 min-h-[320px] animate-pulse"
              />
            ))}
          </div>
        ) : isError && !data ? (
          <div className="rounded-3xl border border-[#EF4444]/25 bg-[#EF4444]/5 px-6 py-10 text-center">
            <p className="font-mono text-sm tracking-widest text-[#EF4444]">
              ORACLE FEEDS UNAVAILABLE
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 px-4 py-2 rounded-xl border border-white/10 text-xs font-mono tracking-widest text-[#E8E8F0] hover:bg-white/5"
            >
              RETRY
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            {feeds.map((f, i) => (
              <OracleFeedCard key={f.id} feed={f} now={now} index={i} />
            ))}
          </div>
        )}

        {/* footer note */}
        <p className="mt-10 sm:mt-14 text-center text-[10px] sm:text-[11px] font-mono tracking-wide text-[#A0A0B0]/55 max-w-xl mx-auto leading-relaxed">
          Rates from on-chain pool boxes (R4 nanoERG per unit). Status uses tip
          height vs pool settlement. History builds as Lumen samples the network.
          Not financial advice.
        </p>
      </main>
    </div>
  );
}
