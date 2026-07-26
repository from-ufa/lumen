"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  RefreshCw,
  Gem,
  MoreHorizontal,
  Home,
  Globe2,
  Cable,
  Copy,
  Check,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LumenWordmark from "../components/LumenWordmark";
import OraclesDualView from "./components/OraclesDualView";
import type { OraclesApiResponse } from "./components/types";
import {
  bridgeDockerOracleCommand,
  loadBridgeToken,
  saveBridgeToken,
  DEFAULT_BRIDGE_WS_PUBLIC,
} from "../lib/node-api";
import { copyTextToClipboard } from "../lib/copy-text";

type OracleViewMode = "network" | "my";

async function fetchOracles(
  mode: OracleViewMode,
  token: string
): Promise<OraclesApiResponse> {
  const q =
    mode === "my" && token
      ? `?mode=my&token=${encodeURIComponent(token)}`
      : "";
  const res = await fetch(`/api/oracles${q}`, {
    cache: "no-store",
    headers:
      mode === "my" && token
        ? { "X-Lumen-Bridge-Token": token }
        : undefined,
  });
  if (!res.ok && res.status !== 400) throw new Error(`oracles ${res.status}`);
  return res.json();
}

export default function OraclesPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<OracleViewMode>("network");
  const [bridgeToken, setBridgeToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [wantUsd, setWantUsd] = useState(true);
  const [wantXau, setWantXau] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBridgeToken(loadBridgeToken());
    setTokenReady(true);
  }, []);

  const persistToken = useCallback((t: string) => {
    setBridgeToken(t);
    saveBridgeToken(t);
  }, []);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["oracles-constellation", viewMode, bridgeToken],
    queryFn: () => fetchOracles(viewMode, bridgeToken),
    enabled: tokenReady && (viewMode === "network" || !!bridgeToken),
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
                <div className="tracking-[-0.5px] text-xl leading-none truncate">
                  <LumenWordmark />
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
                  <div className="tracking-[-0.5px] text-3xl leading-none group-hover:text-white transition-colors">
                    <LumenWordmark />
                  </div>
                  <div className="text-[10px] text-[#A0A0B0] mt-0.5 font-mono tracking-[3px] truncate">
                    Ergo Node Dashboard
                  </div>
                </div>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-end">
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
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-y-4 mb-5 sm:mb-6">
          <div className="min-w-0">
            <div className="font-mono text-[10px] sm:text-xs tracking-[3px] sm:tracking-[4px] text-[#E8C547] mb-1">
              ERGO ORACLE POOLS
            </div>
            <h1 className="text-[2rem] sm:text-5xl lg:text-6xl font-semibold tracking-[-1px] sm:tracking-[-1.6px] leading-[1.05]">
              Consensus, visualized.
            </h1>
            <p className="text-base sm:text-2xl text-[#A0A0B0] tracking-tight mt-1">
              {viewMode === "my"
                ? "Your oracle agent — one pool or both, securely via bridge."
                : "Live USD and XAU from on-chain pool boxes."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-mono tracking-wider">
              <span className="px-2.5 py-1 rounded-full border border-white/15 text-[#A0A0B0] bg-white/5">
                {viewMode === "my"
                  ? "SOURCE · BRIDGE + EXPLORER"
                  : "SOURCE · EXPLORER + METRICS"}
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

          <div className="flex flex-col items-stretch sm:items-end gap-3">
            {/* Network | My oracle */}
            <div className="inline-flex p-1 rounded-2xl glass border border-white/10 self-start sm:self-end">
              <button
                type="button"
                onClick={() => setViewMode("network")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-mono tracking-widest transition-all ${
                  viewMode === "network"
                    ? "bg-white/10 text-white"
                    : "text-[#A0A0B0] hover:text-white"
                }`}
              >
                <Globe2 className="w-3.5 h-3.5" />
                NETWORK
              </button>
              <button
                type="button"
                onClick={() => setViewMode("my")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-mono tracking-widest transition-all ${
                  viewMode === "my"
                    ? "bg-white/10 text-white"
                    : "text-[#A0A0B0] hover:text-white"
                }`}
              >
                <Cable className="w-3.5 h-3.5" />
                MY ORACLE
              </button>
            </div>

            {/* Status chips */}
            <div className="flex items-end gap-2 sm:gap-3 text-sm flex-wrap justify-end">
              {feeds.map((f) => {
                const tone =
                  f.status === "live"
                    ? {
                        c: "#34D399",
                        bg: "rgba(52,211,153,0.1)",
                        b: "rgba(52,211,153,0.28)",
                      }
                    : f.status === "stale"
                      ? {
                          c: "#D4A574",
                          bg: "rgba(212,165,116,0.1)",
                          b: "rgba(212,165,116,0.28)",
                        }
                      : {
                          c: "#F87171",
                          bg: "rgba(248,113,113,0.1)",
                          b: "rgba(248,113,113,0.28)",
                        };
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
        </div>

        {/* My Oracle connect / status panel */}
        {viewMode === "my" && (
          <div className="mb-5 sm:mb-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-4 sm:py-5">
            <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-mono tracking-[0.18em] text-[#7A7A88] uppercase mb-2">
                  Connect your oracle agent
                </div>
                <p className="text-[13px] text-[#A0A0B0] leading-relaxed max-w-2xl">
                  Run lumen-bridge next to your oracle-core. Set only the pool(s)
                  you operate — USD, XAU, or both. Metrics stay on{" "}
                  <span className="text-[#E8E8F0]">127.0.0.1</span>; the dashboard
                  never opens inbound ports on your machine.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWantUsd((v) => !v)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-mono tracking-wider border transition-all ${
                      wantUsd
                        ? "border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]"
                        : "border-white/10 text-[#6B6B78]"
                    }`}
                  >
                    ERG/USD {wantUsd ? "· ON" : "· OFF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWantXau((v) => !v)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-mono tracking-wider border transition-all ${
                      wantXau
                        ? "border-[#C9A84C]/40 bg-[#C9A84C]/10 text-[#C9A84C]"
                        : "border-white/10 text-[#6B6B78]"
                    }`}
                  >
                    ERG/XAU {wantXau ? "· ON" : "· OFF"}
                  </button>
                </div>
                {!wantUsd && !wantXau && (
                  <p className="mt-2 text-[11px] text-[#D4A574]">
                    Enable at least one pool for the Docker command.
                  </p>
                )}
              </div>

              <div className="w-full lg:w-[22rem] shrink-0 space-y-3">
                <div>
                  <label className="text-[9px] font-mono tracking-[0.16em] text-[#7A7A88] uppercase">
                    Bridge token
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={bridgeToken}
                    onChange={(e) => persistToken(e.target.value.trim())}
                    placeholder="lumen_… from NODE SETTINGS"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[12px] font-mono text-[#E8E8F0] placeholder:text-[#5C5C6A] outline-none focus:border-[#00E5FF]/35"
                  />
                  <p className="mt-1.5 text-[10px] text-[#6B6B78]">
                    Same token as My Node · create under{" "}
                    <Link href="/" className="text-[#00E5FF] hover:underline">
                      Dashboard → NODE SETTINGS
                    </Link>
                  </p>
                </div>

                {bridgeToken && (wantUsd || wantXau) && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-mono tracking-[0.16em] text-[#7A7A88] uppercase">
                        Docker command
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const cmd = bridgeDockerOracleCommand(bridgeToken, {
                            usd: wantUsd,
                            xau: wantXau,
                          });
                          const ok = await copyTextToClipboard(cmd);
                          if (ok) {
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1600);
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-[#A0A0B0] hover:text-white"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-[#34D399]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copied ? "COPIED" : "COPY"}
                      </button>
                    </div>
                    <pre className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-[10px] font-mono text-[#B0B0BC] leading-relaxed overflow-x-auto max-h-36">
                      {bridgeDockerOracleCommand(bridgeToken, {
                        usd: wantUsd,
                        xau: wantXau,
                      })}
                    </pre>
                    <p className="mt-1.5 text-[9px] font-mono text-[#5C5C6A] truncate">
                      WSS · {DEFAULT_BRIDGE_WS_PUBLIC}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Live bridge status strip */}
            {bridgeToken && data?.bridge && (
              <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span
                  className={`px-2.5 py-1 rounded-full border ${
                    data.bridge.connected
                      ? "border-[#34D399]/35 text-[#34D399] bg-[#34D399]/10"
                      : "border-[#F87171]/35 text-[#F87171] bg-[#F87171]/10"
                  }`}
                >
                  {data.bridge.connected ? "● BRIDGE ONLINE" : "○ BRIDGE OFFLINE"}
                </span>
                {data.bridge.version && (
                  <span className="text-[#6B6B78]">
                    agent v{data.bridge.version}
                  </span>
                )}
                {data.bridge.oraclesConfigured?.length > 0 ? (
                  <span className="text-[#A0A0B0]">
                    pools · {data.bridge.oraclesConfigured.join(" · ")}
                  </span>
                ) : data.bridge.connected ? (
                  <span className="text-[#D4A574]">
                    no oracle metrics configured on agent
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )}

        {viewMode === "my" && !bridgeToken && tokenReady ? (
          <div className="rounded-[1.35rem] border border-white/[0.06] bg-[#0C0C12] py-16 flex flex-col items-center gap-3 text-center px-4">
            <Cable className="w-8 h-8 text-[#6B6B78]" />
            <p className="font-mono text-xs tracking-[0.2em] text-[#A0A0B0]">
              PASTE YOUR BRIDGE TOKEN ABOVE
            </p>
            <p className="text-[13px] text-[#6B6B78] max-w-md">
              Create a token on the main dashboard (NODE SETTINGS → Connect my
              node), then paste it here and run the Docker command with your
              pool(s).
            </p>
          </div>
        ) : (
          <OraclesDualView
            data={data}
            isLoading={isLoading || (viewMode === "my" && !tokenReady)}
            isError={isError}
            isFetching={isFetching}
            onRetry={() => void refetch()}
          />
        )}
      </div>
    </div>
  );
}
