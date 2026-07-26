"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  RefreshCw,
  Gem,
  MoreHorizontal,
  Home,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import OraclesDualView from "./components/OraclesDualView";
import type { OraclesApiResponse } from "./components/types";

async function fetchOracles(): Promise<OraclesApiResponse> {
  const res = await fetch("/api/oracles", { cache: "no-store" });
  if (!res.ok) throw new Error(`oracles ${res.status}`);
  return res.json();
}

export default function OraclesPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["oracles-constellation"],
    queryFn: fetchOracles,
    // Fast poll so datapoint/reward animations track real network activity
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onDown = (e: Event) => {
      if (!mobileMenuRef.current?.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [mobileMenuOpen]);

  const feeds = data?.feeds ?? [];
  const liveCount = feeds.filter((f) => f.status === "live").length;
  const allLive = feeds.length > 0 && liveCount === feeds.length;
  const anyStale = feeds.some((f) => f.status === "stale");

  const statusTone = isError
    ? "off"
    : allLive
      ? "live"
      : anyStale || liveCount > 0
        ? "warn"
        : "off";

  return (
    <div className="min-h-screen min-h-dvh bg-[#0A0A0F] text-[#E8E8F0] overflow-x-hidden">
      {/* === TOP BAR — same shell as main dashboard === */}
      <div className="border-b border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          {/* Mobile */}
          <div className="sm:hidden flex items-center justify-between gap-2 min-w-0">
            <Link href="/" className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-black" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold tracking-[-0.5px] text-xl leading-none truncate">
                  Lumen
                </div>
                <div className="text-[8px] text-[#A0A0B0] mt-0.5 font-mono tracking-[1.5px] truncate">
                  Oracles
                </div>
              </div>
            </Link>

            <div
              className="flex items-center gap-1.5 shrink-0"
              ref={mobileMenuRef}
            >
              <div
                className={`flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-[10px] font-mono tracking-wider border ${
                  statusTone === "live"
                    ? "border-[#10B981]/35 bg-[#10B981]/[0.08] text-[#10B981]"
                    : statusTone === "warn"
                      ? "border-[#F59E0B]/35 bg-[#F59E0B]/[0.08] text-[#F59E0B]"
                      : "border-[#EF4444]/35 bg-[#EF4444]/[0.08] text-[#EF4444]"
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    statusTone === "live"
                      ? "bg-[#10B981] status-dot"
                      : statusTone === "warn"
                        ? "bg-[#F59E0B]"
                        : "bg-[#EF4444]"
                  }`}
                />
                {isLoading
                  ? "…"
                  : statusTone === "live"
                    ? "LIVE"
                    : statusTone === "warn"
                      ? "MIX"
                      : "OFF"}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  aria-expanded={mobileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Open menu"
                  className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all active:scale-[0.97] ${
                    mobileMenuOpen
                      ? "border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]"
                      : "border-white/12 bg-white/[0.04] text-[#E8E8F0]"
                  }`}
                >
                  <MoreHorizontal className="w-4.5 h-4.5" />
                </button>

                <AnimatePresence>
                  {mobileMenuOpen && (
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute right-0 top-[calc(100%+0.45rem)] z-50 w-[11.5rem] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0F]/96 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
                    >
                      <Link
                        href="/"
                        role="menuitem"
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-[11px] font-mono tracking-widest text-[#E8E8F0] hover:bg-white/[0.06] transition-colors"
                      >
                        <Home className="w-3.5 h-3.5 text-[#A0A0B0] shrink-0" />
                        DASHBOARD
                      </Link>
                      <div className="h-px bg-white/[0.06]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          void refetch();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-[11px] font-mono tracking-widest text-[#E8E8F0] hover:bg-white/[0.06] transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                        SYNC
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/" className="flex items-center gap-3 min-w-0 group">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-black" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold tracking-[-0.5px] text-3xl leading-none group-hover:text-white transition-colors">
                    Lumen
                  </div>
                  <div className="text-[10px] text-[#A0A0B0] mt-0.5 font-mono tracking-[3px] truncate">
                    Ergo Node Dashboard
                  </div>
                </div>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-end">
              <div
                className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-3xl text-sm font-mono tracking-widest border ${
                  statusTone === "live"
                    ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
                    : statusTone === "warn"
                      ? "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#F59E0B]"
                      : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    statusTone === "live"
                      ? "bg-[#10B981] status-dot"
                      : statusTone === "warn"
                        ? "bg-[#F59E0B]"
                        : "bg-[#EF4444]"
                  }`}
                />
                {isLoading
                  ? "LOADING"
                  : statusTone === "live"
                    ? "FEEDS LIVE"
                    : statusTone === "warn"
                      ? `${liveCount}/${feeds.length || 2} LIVE`
                      : "FEEDS OFFLINE"}
              </div>

              <div className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-3xl text-[10px] font-mono tracking-[2px] border border-[#E8C547]/30 bg-[#E8C547]/[0.08] text-[#E8C547]">
                <Gem className="w-3.5 h-3.5" />
                ORACLES
              </div>

              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-3xl text-[10px] font-mono tracking-[2px] border border-white/15 bg-white/5 text-[#A0A0B0] hover:text-white hover:border-white/25 transition-all"
              >
                <Home className="w-3.5 h-3.5" />
                DASHBOARD
              </Link>

              <button
                type="button"
                onClick={() => void refetch()}
                className="p-3 rounded-2xl glass border border-white/10 hover:bg-white/5 transition-all active:scale-95"
                title="Refresh oracle data"
                aria-label="Refresh oracle data"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* === PAGE BODY — same content width / padding as dashboard === */}
      <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-12 sm:pb-16">
        {/* Hero */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-y-4 mb-6 sm:mb-8">
          <div className="min-w-0">
            <div className="font-mono text-[10px] sm:text-xs tracking-[3px] sm:tracking-[4px] text-[#E8C547] mb-1">
              ERGO ORACLE POOLS
            </div>
            <h1 className="text-[2rem] sm:text-5xl lg:text-6xl font-semibold tracking-[-1px] sm:tracking-[-1.6px] leading-[1.05]">
              Consensus, visualized.
            </h1>
            <p className="text-base sm:text-2xl text-[#A0A0B0] tracking-tight mt-1">
              Live ERG/USD and ERG/XAU from on-chain pool boxes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-mono tracking-wider">
              <span className="px-2.5 py-1 rounded-full border border-white/15 text-[#A0A0B0] bg-white/5">
                SOURCE · EXPLORER + METRICS
              </span>
              {data?.tipHeight != null && (
                <span className="px-2.5 py-1 rounded-full border border-white/15 text-[#E8E8F0] bg-white/5">
                  TIP · {data.tipHeight.toLocaleString()}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full border border-white/15 text-[#A0A0B0] bg-white/5">
                AUTO · 5s
              </span>
            </div>
          </div>

          {/* Status chips only — price lives once per feed panel below */}
          <div className="flex items-end gap-2 sm:gap-3 text-sm flex-wrap">
            {feeds.map((f) => {
              const tone =
                f.status === "live"
                  ? { c: "#34D399", bg: "rgba(52,211,153,0.1)", b: "rgba(52,211,153,0.28)" }
                  : f.status === "stale"
                    ? { c: "#D4A574", bg: "rgba(212,165,116,0.1)", b: "rgba(212,165,116,0.28)" }
                    : { c: "#F87171", bg: "rgba(248,113,113,0.1)", b: "rgba(248,113,113,0.28)" };
              return (
                <div
                  key={f.id}
                  className="rounded-xl border px-3 py-2 min-w-[7.5rem]"
                  style={{ borderColor: tone.b, background: tone.bg }}
                >
                  <div className="text-[10px] font-mono tracking-[0.14em] text-[#8B8B9A] uppercase">
                    {f.pair}
                  </div>
                  <div
                    className="mt-1 text-[11px] font-mono tracking-[0.16em] font-medium uppercase"
                    style={{ color: tone.c }}
                  >
                    {f.status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dual constellation panels — same canvas shell as 3D / map */}
        <OraclesDualView
          data={data}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          onRetry={() => void refetch()}
        />
      </div>
    </div>
  );
}
