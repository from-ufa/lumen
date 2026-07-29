"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import LumenWordmark from "../components/LumenWordmark";
import ConnectionSettings from "../components/ConnectionSettings";
import ConnectOracleInvite, {
  wakeOracleInvite,
} from "../components/ConnectOracleInvite";
import BridgeOperatorsInvite from "../components/BridgeOperatorsInvite";
import LumenPageBody from "../components/LumenPageBody";
import LumenPageHero from "../components/LumenPageHero";
import VizModeChrome from "../components/VizModeChrome";
import type { VizMode } from "../components/VizModeToggle";
import { SoftLink, useSoftNavigate } from "../components/soft-nav";
import { HeaderActions, HeaderIconButton } from "../components/HeaderChrome";
import type { OraclesApiResponse } from "./components/types";
import type { BridgeStatus, NodeMode, OracleViewMode } from "../lib/node-api";
import {
  fetchBridgeStatus,
  loadBridgeToken,
  loadOracleViewMode,
  saveBridgeToken,
  saveOracleViewMode,
} from "../lib/node-api";

/** Heavy dual canvas — load after shell paints (cuts first-switch jank) */
const OraclesDualView = dynamic(() => import("./components/OraclesDualView"), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 w-full">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="min-w-0 w-full rounded-[1.35rem] border border-white/[0.06] bg-[#0C0C12] h-[min(640px,70vh)] animate-pulse"
        />
      ))}
    </div>
  ),
});

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

/** Map oracle view ↔ ConnectionSettings nodeMode (same modal chrome). */
function viewToNodeMode(v: OracleViewMode): NodeMode {
  return v === "my" ? "my" : "lumen";
}
function nodeModeToView(m: NodeMode): OracleViewMode {
  return m === "my" ? "my" : "network";
}

export default function OraclesPage() {
  const softNav = useSoftNavigate();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [settingsOpenKey, setSettingsOpenKey] = useState(0);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Prefetch dashboard + map chunk so Orbit/Map taps feel instant
  useEffect(() => {
    const warm = () => {
      try {
        router.prefetch("/");
        router.prefetch("/?viz=map");
        router.prefetch("/?viz=constellation");
      } catch {
        /* */
      }
      void import("../components/PeerMap").catch(() => {});
    };
    let idleId: number | undefined;
    let t: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(warm, { timeout: 2200 });
    } else {
      t = setTimeout(warm, 900);
    }
    return () => {
      if (idleId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (t != null) clearTimeout(t);
    };
  }, [router]);

  const onSelectVizMode = useCallback(
    (m: VizMode) => {
      if (m === "oracles") return;
      softNav(m === "map" ? "/?viz=map" : "/?viz=constellation");
    },
    [softNav]
  );

  const onPrefetchVizMode = useCallback(
    (m: VizMode) => {
      if (m === "oracles") return;
      try {
        router.prefetch(m === "map" ? "/?viz=map" : "/?viz=constellation");
        router.prefetch("/");
      } catch {
        /* */
      }
      if (m === "map") {
        void import("../components/PeerMap").catch(() => {});
      }
    },
    [router]
  );

  // Sync hydrate from localStorage — no ready-gate (fetch starts on first paint)
  const [viewMode, setViewMode] = useState<OracleViewMode>(() => {
    if (typeof window === "undefined") return "network";
    return loadOracleViewMode();
  });
  const [bridgeToken, setBridgeToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return loadBridgeToken();
  });

  const persistToken = useCallback((t: string) => {
    setBridgeToken(t);
    saveBridgeToken(t);
  }, []);

  const setNodeMode = useCallback((mode: NodeMode) => {
    const v = nodeModeToView(mode);
    setViewMode(v);
    saveOracleViewMode(v);
  }, []);

  const {
    data: bridgeStatus = null,
    isFetching: bridgeStatusLoading,
    refetch: refetchBridgeStatus,
  } = useQuery({
    queryKey: ["bridgeStatus", bridgeToken],
    queryFn: async (): Promise<BridgeStatus> => fetchBridgeStatus(bridgeToken),
    enabled: !!bridgeToken,
    refetchInterval: 8_000,
    staleTime: 5_000,
  });

  const onRefreshBridgeStatus = useCallback(() => {
    if (bridgeToken) void refetchBridgeStatus();
  }, [bridgeToken, refetchBridgeStatus]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["oracles-constellation", viewMode, bridgeToken],
    queryFn: () => fetchOracles(viewMode, bridgeToken),
    enabled: viewMode === "network" || !!bridgeToken,
    refetchInterval: 5_000,
    staleTime: 8_000,
    gcTime: 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });

  const isOnline =
    viewMode === "network"
      ? !isError && !!data?.feeds?.length
      : !!bridgeStatus?.connected && !isError;

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
  const nodeMode = viewToNodeMode(viewMode);
  const bridgeOnline = !!bridgeStatus?.connected;
  /** Hide invite when My Oracle is already connected via bridge */
  const oracleInviteEnabled = !(viewMode === "my" && bridgeOnline);
  /** Second typewriter (bridge ops count) — 3s after first finishes typing */
  const [bridgeInviteReady, setBridgeInviteReady] = useState(false);

  useEffect(() => {
    // If first invite is hidden, still show bridge stats after a short wait
    if (oracleInviteEnabled) return;
    setBridgeInviteReady(false);
    const t = window.setTimeout(() => setBridgeInviteReady(true), 3000);
    return () => window.clearTimeout(t);
  }, [oracleInviteEnabled]);

  const onOracleInviteTyped = useCallback(() => {
    window.setTimeout(() => setBridgeInviteReady(true), 3000);
  }, []);

  return (
    <div className="min-h-screen min-h-dvh bg-[#0A0A0F] text-[#E8E8F0] overflow-x-hidden">
      {/* === TOP BAR — same shell as main dashboard === */}
      <div className="vt-lumen-header border-b border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          {/* Mobile */}
          <div className="sm:hidden flex items-center justify-between gap-2 min-w-0">
            <SoftLink
              href="/"
              className="vt-lumen-brand-mobile flex items-center gap-2 min-w-0 flex-1"
            >
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
            </SoftLink>

            <div
              className="flex items-center gap-1.5 shrink-0"
              ref={mobileMenuRef}
            >
              <div className="relative">
                <HeaderIconButton
                  onClick={() => {
                    setMobileMenuOpen((v) => !v);
                    wakeOracleInvite();
                  }}
                  title="Open menu"
                  active={mobileMenuOpen}
                  className="!h-9 !w-9"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </HeaderIconButton>

                <AnimatePresence>
                  {mobileMenuOpen && (
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute right-0 top-[calc(100%+0.45rem)] z-50 w-[12rem] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0F]/96 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setSettingsOpenKey((k) => k + 1);
                          wakeOracleInvite();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-[11px] font-mono tracking-widest text-[#E8E8F0] hover:bg-white/[0.06] transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#A0A0B0] shrink-0" />
                        SETTINGS
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Desktop — mirror dashboard header actions */}
          <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <SoftLink
                href="/"
                className="vt-lumen-brand-desktop flex items-center gap-3 min-w-0 group"
                onClick={() => wakeOracleInvite()}
              >
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
              </SoftLink>
            </div>

            <HeaderActions>
              <div className="hidden sm:contents">
                <ConnectionSettings
                  variant="oracle"
                  isOnline={isOnline}
                  onReconnect={() => {
                    void refetch();
                    wakeOracleInvite();
                  }}
                  onOpenChange={(open) => {
                    setSettingsModalOpen(open);
                    if (open) wakeOracleInvite();
                  }}
                  nodeMode={nodeMode}
                  setNodeMode={setNodeMode}
                  bridgeToken={bridgeToken}
                  setBridgeToken={persistToken}
                  bridgeStatus={bridgeStatus}
                  bridgeStatusLoading={bridgeStatusLoading}
                  onRefreshBridgeStatus={onRefreshBridgeStatus}
                  openKey={settingsOpenKey}
                />
              </div>
            </HeaderActions>
          </div>
        </div>
      </div>

      {/* Single settings instance for mobile (trigger via menu openKey) */}
      <div className="sm:hidden">
        <ConnectionSettings
          variant="oracle"
          isOnline={isOnline}
          onReconnect={() => void refetch()}
          onOpenChange={setSettingsModalOpen}
          nodeMode={nodeMode}
          setNodeMode={setNodeMode}
          bridgeToken={bridgeToken}
          setBridgeToken={persistToken}
          bridgeStatus={bridgeStatus}
          bridgeStatusLoading={bridgeStatusLoading}
          onRefreshBridgeStatus={onRefreshBridgeStatus}
          hideTrigger
          openKey={settingsOpenKey}
        />
      </div>

      {/* Body only — VT + enter motion; sticky header solid */}
      <LumenPageBody>
      <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-12 sm:pb-16">
        <LumenPageHero
          kicker="ERGO ORACLE POOLS"
          kickerClassName="text-[#E8C547]"
          title="Consensus, visualized."
          subtitle={
            viewMode === "my"
              ? "Your oracle agent via the same lumen bridge as My Node."
              : "Live USD and XAU from on-chain pool boxes."
          }
          invite={
            <div className="flex w-full flex-col items-end gap-2">
              {oracleInviteEnabled ? (
                <ConnectOracleInvite
                  enabled
                  delayMs={5000}
                  onFirstComplete={onOracleInviteTyped}
                  onOpenSettings={() => setSettingsOpenKey((k) => k + 1)}
                />
              ) : null}
              <BridgeOperatorsInvite
                enabled={bridgeInviteReady}
                delayMs={0}
                onOpenSettings={() => setSettingsOpenKey((k) => k + 1)}
              />
            </div>
          }
          badges={
            <>
              <span
                title={
                  isOnline
                    ? viewMode === "my"
                      ? "Live — bridge oracle"
                      : "Live — lumen network oracles"
                    : "Oracle source offline"
                }
                className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${
                  isOnline
                    ? "border-[#10B981]/40 text-[#10B981] bg-[#10B981]/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "border-[#EF4444]/40 text-[#EF4444] bg-[#EF4444]/[0.1]"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isOnline ? "bg-[#10B981] status-dot" : "bg-[#EF4444]"
                  }`}
                  aria-hidden
                />
                {viewMode === "my" ? "SOURCE · BRIDGE" : "SOURCE · lumen"}
                {isOnline && (
                  <span className="text-[9px] tracking-[0.14em] opacity-80">
                    LIVE
                  </span>
                )}
              </span>
              {data?.tipHeight != null && (
                <span className="px-2.5 py-1 rounded-full border border-white/15 text-[#E8E8F0] bg-white/5">
                  TIP · {data.tipHeight.toLocaleString()}
                </span>
              )}
            </>
          }
        />

        {/* Identical height chrome as dashboard (toggle + TIP/HEIGHTS) */}
        <VizModeChrome
          mode="oracles"
          onSelectMode={onSelectVizMode}
          onPrefetchMode={onPrefetchVizMode}
          leftLabel="TIP"
          leftValue={data?.tipHeight ?? 0}
          rightLabel="FULL HEIGHT"
          rightValue={
            data?.tipHeight ??
            data?.feeds?.[0]?.tipHeight ??
            0
          }
          rightAccentClass="text-[#E8C547]"
        />

        {viewMode === "my" && !bridgeToken ? (
          <div className="rounded-[1.35rem] border border-white/[0.06] bg-[#0C0C12] py-16 flex flex-col items-center gap-4 text-center px-4">
            <p className="font-mono text-xs tracking-[0.2em] text-[#A0A0B0]">
              CONNECT VIA ORACLE SETTINGS
            </p>
            <p className="text-[13px] text-[#6B6B78] max-w-md leading-relaxed">
              Same bridge as My Node — one token. Open settings, start Docker
              with the pool(s) you run.
            </p>
            <button
              type="button"
              onClick={() => setSettingsOpenKey((k) => k + 1)}
              className="px-5 py-3 rounded-2xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF] text-xs font-mono tracking-widest hover:bg-[#00E5FF]/15"
            >
              OPEN ORACLE SETTINGS
            </button>
          </div>
        ) : (
          <OraclesDualView
            data={data}
            isLoading={isLoading && !data}
            isError={isError}
            isFetching={isFetching}
            onRetry={() => void refetch()}
          />
        )}
      </div>
      </LumenPageBody>

      {/* Avoid unused lint for settings modal open state when only onOpenChange used */}
      {settingsModalOpen ? null : null}
    </div>
  );
}
