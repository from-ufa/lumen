"use client";

/**
 * Lumen Telegram Mini App — tab shell (not a website clone).
 * Tabs: Home · Network · Oracles · Me
 * Decisions: m.ergolumen.net · List|Map · after /link → Home + toast
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Map as MapIcon, List, RefreshCw, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  fetchBridgeStatus,
  fetchNodeResource,
  hydrateSettingsFromTelegramVault,
  loadBridgeToken,
  loadNodeMode,
  nodeRequestHeaders,
  resolveNodeBase,
  saveBridgeToken,
  saveNodeMode,
  type BridgeStatus,
  type NodeMode,
} from "../../lib/node-api";
import { fetchAvgBlockTime } from "../../lib/blocks";
import {
  getStartParam,
  getWebApp,
  hapticImpact,
  initTelegramApp,
  isTelegramLowEnd,
  isTelegramMiniApp,
} from "../../lib/telegram";
import TabBar from "./TabBar";
import MiniCard from "./MiniCard";
import BridgeSheet from "./BridgeSheet";
import AlertsSheet from "./AlertsSheet";
import { tabFade } from "../lib/motion";
import {
  isMiniTabId,
  openSheetFromStartParam,
  tabFromStartParam,
  type MiniTabId,
} from "../lib/tabs";

const PeerMap = dynamic(() => import("../../components/PeerMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center font-mono text-[10px] tracking-[0.2em] text-[#A0A0B0]">
      MAP…
    </div>
  ),
});

/** Same window as web MetricsCards / AVG BLOCK TIME */
const AVG_BLOCK_WINDOW = 100;

type NodeInfoLite = {
  fullHeight?: number;
  headersHeight?: number;
  peersCount?: number;
  name?: string;
  isMining?: boolean;
};

type PeerRow = {
  id?: string;
  address?: string;
  ip?: string;
  city?: string;
  country?: string;
  /** UI label from API `state` */
  status?: string;
  state?: string;
  name?: string;
  lastMessage?: number;
  version?: string | null;
  connectionType?: string;
};

type OracleFeed = {
  id: string;
  title?: string;
  pair?: string;
  /** API field (not latestPrice) */
  price?: number | null;
  priceLabel?: string | null;
  priceChange24h?: number | null;
  status?: string | null;
  history?: Array<{ price?: number | null } | number>;
};

type OracleApiResponse = {
  feeds?: OracleFeed[];
  view?: string;
  mode?: string;
  bridge?: { connected?: boolean };
};

/** Normalize API → UI (price, optional Δ from history) */
function normalizeFeeds(raw: OracleFeed[] | undefined): OracleFeed[] {
  return (raw ?? []).map((f) => {
    const price =
      typeof f.price === "number" && Number.isFinite(f.price) ? f.price : null;
    let ch: number | null =
      typeof f.priceChange24h === "number" ? f.priceChange24h : null;
    if (ch == null && price != null && Array.isArray(f.history) && f.history.length > 1) {
      const first = f.history[0];
      const prev =
        typeof first === "number"
          ? first
          : typeof first?.price === "number"
            ? first.price
            : null;
      if (prev != null && prev !== 0) ch = (price - prev) / prev;
    }
    return { ...f, price, priceChange24h: ch };
  });
}

async function fetchOracles(mode: "network" | "my", token: string) {
  const q =
    mode === "my" && token
      ? `?mode=my&token=${encodeURIComponent(token)}`
      : "?mode=network";
  const res = await fetch(`/api/oracles${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error("oracles");
  const data = (await res.json()) as OracleApiResponse;
  return {
    ...data,
    feeds: normalizeFeeds(data.feeds),
  };
}

async function fetchPeersMap(mode: NodeMode, token: string) {
  const q =
    mode === "my" && token
      ? `?mode=my&token=${encodeURIComponent(token)}`
      : "";
  const res = await fetch(`/api/peers/map${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error("map");
  // API shape: { markers: PeerMapMarker[], me, links, … } — not `peers`
  const data = (await res.json()) as {
    markers?: Array<{
      id?: string;
      ip?: string;
      address?: string;
      city?: string;
      country?: string;
      state?: string;
      name?: string;
      lastMessage?: number;
      version?: string | null;
      connectionType?: string;
    }>;
    peers?: PeerRow[];
    me?: { city?: string; country?: string; name?: string };
    totalPeers?: number;
    liveMapped?: number;
  };
  const markers = data.markers ?? data.peers ?? [];
  const peers: PeerRow[] = markers.map((m) => ({
    id: m.id,
    ip: m.ip,
    address: m.address,
    city: m.city,
    country: m.country,
    state: m.state,
    status: m.state,
    name: m.name,
    lastMessage: m.lastMessage,
    version: m.version,
    connectionType: m.connectionType,
  }));
  return { peers, me: data.me, totalPeers: data.totalPeers, liveMapped: data.liveMapped };
}

async function fetchMempoolSize(mode: NodeMode, token: string) {
  if (mode === "my" && !token) return 0;
  try {
    const res = await fetchNodeResource(
      mode,
      token,
      "transactions/unconfirmed",
      { timeoutMs: mode === "my" ? 14000 : 6500 }
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as unknown;
    if (Array.isArray(data)) return data.length;
    if (data && typeof data === "object" && Array.isArray((data as { transactions?: unknown }).transactions)) {
      return ((data as { transactions: unknown[] }).transactions).length;
    }
    return 0;
  } catch {
    return 0;
  }
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse ${className}`}
    />
  );
}

export default function MiniAppShell() {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const [tab, setTab] = useState<MiniTabId>("home");
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  /** Default MAP first; LIST on demand */
  const [netView, setNetView] = useState<"list" | "map">("map");
  const [netFilter, setNetFilter] = useState<"live" | "all">("live");
  const [peerDetail, setPeerDetail] = useState<PeerRow | null>(null);
  const [oracleSeg, setOracleSeg] = useState<"network" | "my">("network");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<NodeMode>("lumen");
  const [lowEnd, setLowEnd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);

  // Boot: TG chrome + local settings + deep link
  useEffect(() => {
    initTelegramApp();
    // Extra top inset under TG close / ··· chrome (safe-area alone is not enough)
    try {
      const wa = (
        window as unknown as {
          Telegram?: {
            WebApp?: {
              contentSafeAreaInset?: { top?: number };
              safeAreaInset?: { top?: number };
              expand?: () => void;
            };
          };
        }
      ).Telegram?.WebApp;
      wa?.expand?.();
      const top = Math.max(
        wa?.contentSafeAreaInset?.top ?? 0,
        wa?.safeAreaInset?.top ?? 0,
        0
      );
      // TG header controls ~48–56px; never less than 52px under the system bar
      const pad = Math.max(top + 8, 56);
      document.documentElement.style.setProperty(
        "--mini-header-pad-top",
        `${pad}px`
      );
    } catch {
      document.documentElement.style.setProperty(
        "--mini-header-pad-top",
        "56px"
      );
    }
    setToken(loadBridgeToken());
    setMode(loadNodeMode());
    setLowEnd(isTelegramLowEnd());

    const param = getStartParam();
    setTab(tabFromStartParam(param));
    const sheet = openSheetFromStartParam(param);
    if (sheet === "bridge") setBridgeOpen(true);
    if (sheet === "alerts") setAlertsOpen(true);

    // Query ?tab=
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (isMiniTabId(t)) setTab(t);
    } catch {
      /* */
    }

    // Decision 3: after vault hydrate from /link → Home + toast
    const onHydrate = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { applied?: boolean }
        | undefined;
      setToken(loadBridgeToken());
      setMode(loadNodeMode());
      if (detail?.applied) {
        setTab("home");
        toast.success("Bridge restored");
        void hapticImpact("medium");
      }
    };
    window.addEventListener("lumen:settings-hydrated", onHydrate);

    // Force hydrate once on mini open (TG vault)
    if (isTelegramMiniApp()) {
      void hydrateSettingsFromTelegramVault().then((h) => {
        if (h.applied) {
          setToken(loadBridgeToken());
          setMode(loadNodeMode());
          setTab("home");
          toast.success("Bridge restored");
        } else if (h.reason === "already_synced") {
          setToken(loadBridgeToken());
        }
      });
    }

    return () => window.removeEventListener("lumen:settings-hydrated", onHydrate);
  }, []);

  // TG BackButton when a sheet is open
  useEffect(() => {
    const wa = getWebApp();
    if (!wa?.BackButton) return;
    const anyOpen = bridgeOpen || alertsOpen || !!peerDetail;
    try {
      if (anyOpen) {
        wa.BackButton.show();
        const onBack = () => {
          if (peerDetail) setPeerDetail(null);
          else if (alertsOpen) setAlertsOpen(false);
          else if (bridgeOpen) setBridgeOpen(false);
        };
        wa.BackButton.onClick(onBack);
        return () => {
          try {
            wa.BackButton.offClick(onBack);
            wa.BackButton.hide();
          } catch {
            /* */
          }
        };
      }
      wa.BackButton.hide();
    } catch {
      /* */
    }
  }, [bridgeOpen, alertsOpen, peerDetail]);

  const onTab = useCallback(
    (id: MiniTabId) => {
      if (id === tab) return;
      void hapticImpact("light");
      setTab(id);
      try {
        const u = new URL(window.location.href);
        u.searchParams.set("tab", id);
        window.history.replaceState({}, "", u.pathname + u.search);
      } catch {
        /* */
      }
    },
    [tab]
  );

  const {
    data: nodeInfo,
    isFetching: infoFetching,
    refetch: refetchInfo,
    isError: infoError,
  } = useQuery({
    queryKey: ["mini-nodeInfo", mode, token],
    queryFn: async (): Promise<NodeInfoLite> => {
      if (mode === "my" && !token) throw new Error("no_token");
      const res = await fetchNodeResource(mode, token, "info", {
        timeoutMs: mode === "my" ? 14000 : 6500,
      });
      if (!res.ok) throw new Error(`info ${res.status}`);
      return res.json();
    },
    refetchInterval: 8_000,
    retry: 1,
  });

  const { data: bridgeStatus } = useQuery({
    queryKey: ["mini-bridge", token],
    queryFn: (): Promise<BridgeStatus> => fetchBridgeStatus(token),
    enabled: !!token,
    refetchInterval: 8_000,
  });

  const { data: oraclesNet, isLoading: oraclesNetLoading } = useQuery({
    queryKey: ["mini-oracles", "network"],
    queryFn: () => fetchOracles("network", ""),
    refetchInterval: 8_000,
    enabled: tab === "oracles" || tab === "home",
  });

  const { data: oraclesMy, isLoading: oraclesMyLoading } = useQuery({
    queryKey: ["mini-oracles", "my", token],
    queryFn: () => fetchOracles("my", token),
    refetchInterval: 8_000,
    enabled: tab === "oracles" && oracleSeg === "my" && !!token,
  });

  const { data: mapData, isLoading: mapLoading } = useQuery({
    queryKey: ["mini-peers-map", mode, token],
    queryFn: () => fetchPeersMap(mode, token),
    enabled: tab === "network",
    refetchInterval: 12_000,
  });

  const { data: mempoolSize = 0 } = useQuery({
    queryKey: ["mini-mempool", mode, token],
    queryFn: () => fetchMempoolSize(mode, token),
    refetchInterval: 10_000,
    enabled: tab === "home",
  });

  /** Real avg block time from last N headers (one node request) */
  const { data: avgBlock } = useQuery({
    queryKey: ["mini-avg-block", mode, token],
    queryFn: async () => {
      if (mode === "my" && !token) return null;
      return fetchAvgBlockTime(
        resolveNodeBase(mode),
        AVG_BLOCK_WINDOW,
        nodeRequestHeaders(mode, token)
      );
    },
    enabled: tab === "home" && (mode === "lumen" || !!token),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  const height =
    nodeInfo?.fullHeight ?? nodeInfo?.headersHeight ?? null;
  const headersH = nodeInfo?.headersHeight ?? null;
  const peersN = nodeInfo?.peersCount;
  const bridgeOnline = !!bridgeStatus?.connected;
  const isOnline = !infoError && height != null;
  const syncPct =
    height != null && headersH != null && headersH > 0
      ? Math.min(100, Math.round((height / headersH) * 100))
      : null;

  const feeds = oraclesNet?.feeds ?? [];
  const myFeeds = oraclesMy?.feeds ?? [];
  const peerRows = useMemo(() => {
    const list = mapData?.peers ?? [];
    const now = Date.now();
    const filtered =
      netFilter === "all"
        ? list
        : list.filter((p) => {
            // API uses state: live | connected | seen | ghost | …
            const st = (p.state || p.status || "").toLowerCase();
            if (
              st === "live" ||
              st === "connected" ||
              st.includes("live") ||
              st.includes("connected")
            ) {
              return true;
            }
            const lm = p.lastMessage;
            if (!lm) return false;
            const ms = lm > 1e12 ? lm : lm * 1000;
            return now - ms < 180_000;
          });
    // Prefer recently active first
    return [...filtered]
      .sort((a, b) => (b.lastMessage || 0) - (a.lastMessage || 0))
      .slice(0, 120);
  }, [mapData?.peers, netFilter]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    void hapticImpact("light");
    try {
      await Promise.all([
        refetchInfo(),
        qc.invalidateQueries({ queryKey: ["mini-bridge"] }),
        qc.invalidateQueries({ queryKey: ["mini-oracles"] }),
        qc.invalidateQueries({ queryKey: ["mini-peers-map"] }),
        qc.invalidateQueries({ queryKey: ["mini-mempool"] }),
        qc.invalidateQueries({ queryKey: ["mini-avg-block"] }),
      ]);
    } finally {
      setRefreshing(false);
      setPullY(0);
    }
  }, [qc, refetchInfo]);

  const onSavedBridge = useCallback((t: string, m: NodeMode) => {
    setToken(t);
    setMode(m);
    void qc.invalidateQueries({ queryKey: ["mini-nodeInfo"] });
    void qc.invalidateQueries({ queryKey: ["mini-bridge"] });
    void qc.invalidateQueries({ queryKey: ["mini-peers-map"] });
  }, [qc]);

  return (
    <div className="flex flex-col h-dvh max-h-dvh overflow-hidden">
      {/* Top safe + brand strip — clear of TG close / collapse / ··· */}
      <header
        className="shrink-0 px-4 pb-2 border-b border-white/[0.06]"
        style={{
          paddingTop:
            "max(var(--mini-header-pad-top, 56px), calc(env(safe-area-inset-top, 0px) + 44px))",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF7A3D] to-[#00E5FF] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-black" />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-semibold tracking-tight leading-none">
                lumen
              </div>
              <div className="text-[9px] font-mono text-[#A0A0B0] tracking-[0.14em] mt-0.5">
                {mode === "my" ? "MY NODE" : "NETWORK"}
              </div>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono tracking-wider ${
              isOnline
                ? "border-[#10B981]/40 text-[#10B981] bg-[#10B981]/10"
                : "border-[#EF4444]/40 text-[#EF4444] bg-[#EF4444]/10"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOnline ? "bg-[#10B981] status-dot" : "bg-[#EF4444]"
              }`}
            />
            {isOnline ? "LIVE" : "OFF"}
          </span>
        </div>
      </header>

      {/* Content: Network MAP fills remaining viewport; others scroll */}
      <main
        className={`flex-1 min-h-0 overflow-x-hidden ${
          tab === "network" && netView === "map"
            ? "flex flex-col overflow-hidden"
            : "overflow-y-auto"
        }`}
        onTouchStart={(e) => {
          if (tab !== "home") return;
          (e.currentTarget as HTMLElement & { _ty?: number })._ty =
            e.touches[0]?.clientY;
        }}
        onTouchMove={(e) => {
          if (tab !== "home" || refreshing) return;
          const el = e.currentTarget as HTMLElement & { _ty?: number };
          if (el.scrollTop > 0 || el._ty == null) return;
          const dy = e.touches[0].clientY - el._ty;
          if (dy > 0 && dy < 90) setPullY(dy);
        }}
        onTouchEnd={() => {
          if (tab === "home" && pullY > 56) void refreshAll();
          else setPullY(0);
        }}
      >
        {tab === "home" && pullY > 8 ? (
          <div className="text-center text-[10px] font-mono text-[#A0A0B0] pt-1">
            {pullY > 56 ? "Release to refresh" : "Pull to refresh"}
          </div>
        ) : null}

        {tab === "network" && netView === "map" ? (
          <NetworkMapFull
            netView={netView}
            setNetView={setNetView}
            mode={mode}
            token={token}
            height={height}
          />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              className="px-3.5 py-3 pb-4"
              initial={reduce ? false : tabFade.initial}
              animate={tabFade.animate}
              exit={reduce ? undefined : tabFade.exit}
              transition={
                reduce ? { duration: 0.01 } : tabFade.transition
              }
            >
              {tab === "home" && (
                <HomeBody
                  height={height}
                  headersH={headersH}
                  syncPct={syncPct}
                  peersN={peersN}
                  mempoolSize={mempoolSize}
                  avgBlockTime={avgBlock?.avgSeconds ?? null}
                  avgBlockSamples={avgBlock?.samples ?? 0}
                  avgBlockWindow={AVG_BLOCK_WINDOW}
                  nodeName={nodeInfo?.name}
                  mode={mode}
                  token={token}
                  bridgeOnline={bridgeOnline}
                  infoLoading={!nodeInfo && infoFetching}
                  infoFetching={infoFetching || refreshing}
                  feeds={feeds}
                  onRefresh={() => void refreshAll()}
                  onOpenBridge={() => setBridgeOpen(true)}
                  onOracles={() => onTab("oracles")}
                  onAlerts={() => setAlertsOpen(true)}
                  onToggleMode={() => {
                    const next: NodeMode = mode === "my" ? "lumen" : "my";
                    if (next === "my" && !token) {
                      setBridgeOpen(true);
                      return;
                    }
                    saveNodeMode(next);
                    setMode(next);
                    void hapticImpact("light");
                  }}
                />
              )}
              {tab === "network" && (
                <NetworkBody
                  netView={netView}
                  setNetView={setNetView}
                  netFilter={netFilter}
                  setNetFilter={setNetFilter}
                  lowEnd={lowEnd}
                  peerRows={peerRows}
                  mapLoading={mapLoading}
                  mode={mode}
                  token={token}
                  height={height}
                  onPeer={setPeerDetail}
                />
              )}
              {tab === "oracles" && (
                <OraclesBody
                  seg={oracleSeg}
                  setSeg={setOracleSeg}
                  feeds={feeds}
                  myFeeds={myFeeds}
                  hasToken={!!token}
                  loading={
                    oracleSeg === "my" ? oraclesMyLoading : oraclesNetLoading
                  }
                  myBridgeConnected={!!oraclesMy?.bridge?.connected}
                  onConnect={() => setBridgeOpen(true)}
                />
              )}
              {tab === "me" && (
                <MeBody
                  mode={mode}
                  token={token}
                  bridgeOnline={bridgeOnline}
                  onOpenBridge={() => setBridgeOpen(true)}
                  onOpenAlerts={() => setAlertsOpen(true)}
                  onClear={() => {
                    saveBridgeToken("");
                    saveNodeMode("lumen");
                    setToken("");
                    setMode("lumen");
                    toast.message("Token cleared");
                    void hapticImpact("light");
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <TabBar active={tab} onChange={onTab} />

      <BridgeSheet
        open={bridgeOpen}
        onClose={() => setBridgeOpen(false)}
        token={token}
        mode={mode}
        onSaved={onSavedBridge}
      />
      <AlertsSheet
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        bridgeToken={token}
      />
      <PeerSheet peer={peerDetail} onClose={() => setPeerDetail(null)} />
    </div>
  );
}

function HomeBody({
  height,
  headersH,
  syncPct,
  peersN,
  mempoolSize,
  avgBlockTime,
  avgBlockSamples,
  avgBlockWindow,
  nodeName,
  mode,
  token,
  bridgeOnline,
  infoLoading,
  infoFetching,
  feeds,
  onRefresh,
  onOpenBridge,
  onOracles,
  onAlerts,
  onToggleMode,
}: {
  height: number | null;
  headersH: number | null;
  syncPct: number | null;
  peersN?: number;
  mempoolSize: number;
  avgBlockTime: number | null;
  avgBlockSamples: number;
  avgBlockWindow: number;
  nodeName?: string;
  mode: NodeMode;
  token: string;
  bridgeOnline: boolean;
  infoLoading: boolean;
  infoFetching: boolean;
  feeds: OracleFeed[];
  onRefresh: () => void;
  onOpenBridge: () => void;
  onOracles: () => void;
  onAlerts: () => void;
  onToggleMode: () => void;
}) {
  const usd = feeds.find((f) => f.id === "erg-usd" || f.pair === "ERG/USD");
  const avgSub =
    avgBlockTime != null && avgBlockSamples > 0
      ? `LAST ${avgBlockWindow} · ${avgBlockSamples} Δ`
      : avgBlockTime != null
        ? `LAST ${avgBlockWindow}`
        : "FROM NODE…";
  if (infoLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-32" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <MiniCard onClick={onToggleMode}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-[#A0A0B0] tracking-[0.16em]">
            SOURCE
          </span>
          <span className="text-xs font-mono text-[#FF7A3D] tracking-wider">
            {mode === "my" ? "MY NODE ›" : "LUMEN ›"}
          </span>
        </div>
      </MiniCard>

      <MiniCard>
        <div className="text-[10px] font-mono text-[#A0A0B0] tracking-[0.16em]">
          HEIGHT
        </div>
        <div className="mt-1 font-mono text-3xl tracking-tight tabular-nums text-white">
          {height != null ? height.toLocaleString() : "—"}
        </div>
        {headersH != null && height != null && headersH !== height ? (
          <div className="mt-1 text-[10px] font-mono text-[#F59E0B]">
            Headers {headersH.toLocaleString()}
            {syncPct != null ? ` · sync ~${syncPct}%` : ""}
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono text-[#A0A0B0]">
          <span>Peers · {peersN ?? "—"}</span>
          <span>Mempool · {mempoolSize}</span>
          <span className="text-[#FF7A3D]">
            Avg block ·{" "}
            {avgBlockTime != null ? `${avgBlockTime}s` : "—"}
          </span>
          <span className="text-[10px] text-[#A0A0B0]/90 truncate">
            {avgSub}
          </span>
          {nodeName ? (
            <span className="truncate col-span-2">Node · {nodeName}</span>
          ) : null}
          {token ? (
            <span
              className={`col-span-2 ${
                bridgeOnline ? "text-[#10B981]" : "text-[#F59E0B]"
              }`}
            >
              Bridge · {bridgeOnline ? "online" : "offline"}
            </span>
          ) : (
            <span className="col-span-2">Bridge · not set</span>
          )}
        </div>
      </MiniCard>

      <div className="grid grid-cols-2 gap-2">
        <ActionChip
          label={infoFetching ? "…" : "Refresh"}
          icon={
            <RefreshCw
              className={`w-3.5 h-3.5 ${infoFetching ? "animate-spin" : ""}`}
            />
          }
          onClick={onRefresh}
        />
        <ActionChip label="Bridge" onClick={onOpenBridge} />
        <ActionChip label="Alerts" onClick={onAlerts} />
        <ActionChip
          label={
            usd?.price != null
              ? `$${Number(usd.price).toFixed(2)}`
              : usd?.priceLabel || "Oracles"
          }
          onClick={onOracles}
        />
      </div>

      {!token ? (
        <MiniCard onClick={onOpenBridge}>
          <p className="text-sm text-[#E8E8F0]">Connect your node</p>
          <p className="text-[11px] text-[#A0A0B0] mt-1">
            Generate or paste a bridge token — no desktop site needed.
          </p>
        </MiniCard>
      ) : null}
    </div>
  );
}

function ActionChip({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 rounded-2xl border border-white/10 bg-white/[0.05] font-mono text-[11px] tracking-wider text-[#E8E8F0] inline-flex items-center justify-center gap-1.5 active:scale-[0.98] lumen-ui-transition"
    >
      {icon}
      {label}
    </button>
  );
}

/** Full-bleed map: toolbar + map to tab bar (no dead space below). */
function NetworkMapFull({
  netView,
  setNetView,
  mode,
  token,
  height,
}: {
  netView: "list" | "map";
  setNetView: (v: "list" | "map") => void;
  mode: NodeMode;
  token: string;
  height: number | null;
}) {
  return (
    <div className="grid grid-rows-[auto_minmax(0,1fr)] flex-1 min-h-0 h-full w-full">
      <div className="shrink-0 z-10 flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.06] bg-[#0A0A0F]">
        <h1 className="text-base font-semibold tracking-tight">Network</h1>
        <NetViewToggle netView={netView} setNetView={setNetView} />
      </div>
      {/*
        Real height from grid 1fr row — absolute fill kills .lumen-viz 52dvh
        and any leftover gap above the tab bar.
      */}
      <div className="relative min-h-0 w-full h-full overflow-hidden bg-[#050508]">
        <div className="absolute inset-0 mini-map-fill">
          <PeerMap
            blockHeight={height ?? undefined}
            hideControls={false}
            nodeMode={mode}
            bridgeToken={token}
            fillParent
          />
        </div>
      </div>
    </div>
  );
}

function NetViewToggle({
  netView,
  setNetView,
}: {
  netView: "list" | "map";
  setNetView: (v: "list" | "map") => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-white/10 p-0.5 bg-black/20">
      <button
        type="button"
        onClick={() => {
          setNetView("map");
          void hapticImpact("light");
        }}
        className={`h-9 px-3 rounded-full inline-flex items-center gap-1 text-[10px] font-mono tracking-wider ${
          netView === "map" ? "bg-white/10 text-white" : "text-[#A0A0B0]"
        }`}
      >
        <MapIcon className="w-3.5 h-3.5" /> MAP
      </button>
      <button
        type="button"
        onClick={() => {
          setNetView("list");
          void hapticImpact("light");
        }}
        className={`h-9 px-3 rounded-full inline-flex items-center gap-1 text-[10px] font-mono tracking-wider ${
          netView === "list" ? "bg-white/10 text-white" : "text-[#A0A0B0]"
        }`}
      >
        <List className="w-3.5 h-3.5" /> LIST
      </button>
    </div>
  );
}

function NetworkBody({
  netView,
  setNetView,
  netFilter,
  setNetFilter,
  lowEnd,
  peerRows,
  mapLoading,
  mode,
  token,
  height,
  onPeer,
}: {
  netView: "list" | "map";
  setNetView: (v: "list" | "map") => void;
  netFilter: "live" | "all";
  setNetFilter: (v: "live" | "all") => void;
  lowEnd: boolean;
  peerRows: PeerRow[];
  mapLoading: boolean;
  mode: NodeMode;
  token: string;
  height: number | null;
  onPeer: (p: PeerRow) => void;
}) {
  // MAP mode is rendered by NetworkMapFull (full height); this is LIST only
  void mode;
  void token;
  void height;
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return peerRows;
    return peerRows.filter((p) => {
      const hay = [
        p.name,
        p.city,
        p.country,
        p.ip,
        p.address,
        p.version,
        p.state,
        p.status,
        p.connectionType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [peerRows, query]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Network</h1>
        <NetViewToggle netView={netView} setNetView={setNetView} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A0B0]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, city, IP…"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full h-11 rounded-2xl border border-white/10 bg-black/30 pl-9 pr-3 font-mono text-[12px] text-[#E8E8F0] placeholder:text-[#A0A0B0]/70 outline-none focus:border-[#FF7A3D]/35"
        />
      </div>

      <div className="inline-flex rounded-full border border-white/10 p-0.5 bg-black/20">
        {(["live", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setNetFilter(f);
              void hapticImpact("light");
            }}
            className={`h-8 px-3 rounded-full text-[10px] font-mono tracking-wider ${
              netFilter === f ? "bg-white/10 text-white" : "text-[#A0A0B0]"
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-mono text-[#A0A0B0]">
          {mapLoading
            ? "Loading peers…"
            : `${filtered.length}${
                query.trim() ? ` / ${peerRows.length}` : ""
              } peers · ${netFilter}${lowEnd ? " · lite" : ""}`}
        </p>
        {mapLoading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : filtered.length === 0 ? (
          <MiniCard>
            <p className="text-sm text-[#A0A0B0]">
              {query.trim()
                ? "No peers match this search."
                : "No peers in this filter."}
            </p>
          </MiniCard>
        ) : (
          filtered.map((p, i) => (
            <MiniCard
              key={`${p.id || p.ip || p.address || i}`}
              onClick={() => {
                onPeer(p);
                void hapticImpact("light");
              }}
            >
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm truncate">
                    {p.name ||
                      [p.city, p.country].filter(Boolean).join(", ") ||
                      "Unknown"}
                  </div>
                  <div className="text-[10px] font-mono text-[#A0A0B0] truncate mt-0.5">
                    {[p.city, p.country].filter(Boolean).join(", ") ||
                      p.ip ||
                      p.address ||
                      "—"}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[#A0A0B0] shrink-0 uppercase">
                  {p.state || p.status || "›"}
                </span>
              </div>
            </MiniCard>
          ))
        )}
      </div>
    </div>
  );
}

function OraclesBody({
  seg,
  setSeg,
  feeds,
  myFeeds,
  hasToken,
  loading,
  myBridgeConnected,
  onConnect,
}: {
  seg: "network" | "my";
  setSeg: (s: "network" | "my") => void;
  feeds: OracleFeed[];
  myFeeds: OracleFeed[];
  hasToken: boolean;
  loading: boolean;
  myBridgeConnected: boolean;
  onConnect: () => void;
}) {
  const active = seg === "my" ? myFeeds : feeds;
  const usd = active.find(
    (f) => f.id === "erg-usd" || f.pair === "ERG/USD"
  );
  const xau = active.find(
    (f) => f.id === "erg-xau" || f.pair === "ERG/XAU"
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Oracles</h1>
        <div className="inline-flex rounded-full border border-white/10 p-0.5 bg-black/20">
          {(["network", "my"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSeg(s);
                void hapticImpact("light");
              }}
              className={`h-8 px-3 rounded-full text-[10px] font-mono tracking-wider ${
                seg === s ? "bg-white/10 text-white" : "text-[#A0A0B0]"
              }`}
            >
              {s === "network" ? "NETWORK" : "MY"}
            </button>
          ))}
        </div>
      </div>

      {seg === "my" && !hasToken ? (
        <MiniCard onClick={onConnect}>
          <p className="text-sm">Connect bridge</p>
          <p className="text-[11px] text-[#A0A0B0] mt-1">
            Your operator feeds need a bridge token.
          </p>
        </MiniCard>
      ) : loading ? (
        <>
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </>
      ) : (
        <>
          {seg === "my" ? (
            <MiniCard>
              <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wider">
                AGENT
              </div>
              <div
                className={`mt-1 text-sm font-mono ${
                  myBridgeConnected ? "text-[#10B981]" : "text-[#F59E0B]"
                }`}
              >
                {myBridgeConnected
                  ? "Bridge online"
                  : "Bridge offline / no data"}
              </div>
            </MiniCard>
          ) : null}
          <div className="grid grid-cols-1 gap-2">
            <OracleTile
              title={usd?.title || usd?.pair || "ERG / USD"}
              price={usd?.price}
              priceLabel={usd?.priceLabel}
              ch={usd?.priceChange24h}
              accent="#00E5FF"
            />
            <OracleTile
              title={xau?.title || xau?.pair || "ERG / XAU"}
              price={xau?.price}
              priceLabel={xau?.priceLabel}
              ch={xau?.priceChange24h}
              accent="#E8C547"
            />
          </div>
          {seg === "my" && active.length === 0 && hasToken ? (
            <MiniCard>
              <p className="text-sm text-[#A0A0B0]">
                No operator feeds yet — ensure oracle scope on the agent.
              </p>
            </MiniCard>
          ) : null}
          {seg === "network" && active.length === 0 ? (
            <MiniCard>
              <p className="text-sm text-[#A0A0B0]">
                Oracle feeds unavailable — pull to refresh or try again.
              </p>
            </MiniCard>
          ) : null}
        </>
      )}
    </div>
  );
}

function OracleTile({
  title,
  price,
  priceLabel,
  ch,
  accent,
}: {
  title: string;
  price?: number | null;
  priceLabel?: string | null;
  ch?: number | null;
  accent: string;
}) {
  const up = ch != null && ch >= 0;
  const display =
    price != null && Number.isFinite(price)
      ? price < 10
        ? price.toFixed(4)
        : price.toFixed(2)
      : priceLabel || "—";
  return (
    <MiniCard>
      <div
        className="text-[10px] font-mono tracking-[0.16em]"
        style={{ color: accent }}
      >
        {title}
      </div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-white">
        {typeof display === "string" && display.startsWith("$")
          ? display
          : price != null && Number.isFinite(price)
            ? title.includes("USD")
              ? `$${display}`
              : display
            : display}
      </div>
      {ch != null && Number.isFinite(ch) ? (
        <div
          className={`mt-1 text-[11px] font-mono ${
            up ? "text-[#10B981]" : "text-[#EF4444]"
          }`}
        >
          {up ? "+" : ""}
          {(ch * 100).toFixed(2)}%
        </div>
      ) : null}
    </MiniCard>
  );
}

function MeBody({
  mode,
  token,
  bridgeOnline,
  onOpenBridge,
  onOpenAlerts,
  onClear,
}: {
  mode: NodeMode;
  token: string;
  bridgeOnline: boolean;
  onOpenBridge: () => void;
  onOpenAlerts: () => void;
  onClear: () => void;
}) {
  const tail = token ? `…${token.slice(-6)}` : "—";
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold tracking-tight">Me</h1>
      <MiniCard onClick={onOpenBridge}>
        <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wider">
          BRIDGE
        </div>
        <div className="mt-1 text-sm">
          {token ? (
            <>
              Token {tail} ·{" "}
              <span
                className={
                  bridgeOnline ? "text-[#10B981]" : "text-[#F59E0B]"
                }
              >
                {bridgeOnline ? "online" : "offline"}
              </span>
            </>
          ) : (
            "Not connected — tap to set up"
          )}
        </div>
        <div className="mt-1 text-[11px] font-mono text-[#A0A0B0]">
          Mode · {mode === "my" ? "My Node" : "lumen"}
        </div>
      </MiniCard>
      <MiniCard onClick={onOpenAlerts}>
        <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wider">
          ALERTS
        </div>
        <div className="mt-1 text-sm">Telegram watchdog</div>
        <div className="text-[11px] text-[#A0A0B0] mt-0.5">
          Bridge / oracle problem pings
        </div>
      </MiniCard>
      <MiniCard
        onClick={() => {
          try {
            window.open(
              "https://ergolumen.net",
              "_blank",
              "noopener,noreferrer"
            );
          } catch {
            /* */
          }
        }}
      >
        <div className="text-sm">Open full site</div>
        <div className="text-[11px] text-[#A0A0B0] mt-0.5">
          Orbit · desktop cockpit · ergolumen.net
        </div>
      </MiniCard>
      {token ? (
        <button
          type="button"
          onClick={onClear}
          className="w-full h-11 rounded-xl border border-[#EF4444]/30 text-[#EF4444] font-mono text-[11px] tracking-wider"
        >
          CLEAR TOKEN
        </button>
      ) : null}
    </div>
  );
}

function PeerSheet({
  peer,
  onClose,
}: {
  peer: PeerRow | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {peer ? (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[80] bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            className="fixed inset-x-0 bottom-0 z-[90] rounded-t-3xl border border-white/10 bg-[#12121A] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            initial={reduce ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: reduce ? 0.01 : 0.26 }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <h2 className="text-base font-semibold mb-3">Peer</h2>
            <dl className="space-y-2 text-sm font-mono">
              {peer.name ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#A0A0B0]">Name</dt>
                  <dd className="text-right truncate max-w-[60%]">{peer.name}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-[#A0A0B0]">Place</dt>
                <dd className="text-right">
                  {[peer.city, peer.country].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#A0A0B0]">IP</dt>
                <dd className="text-right truncate max-w-[60%]">
                  {peer.ip || peer.address || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#A0A0B0]">Status</dt>
                <dd className="uppercase">{peer.state || peer.status || "—"}</dd>
              </div>
              {peer.connectionType ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#A0A0B0]">Link</dt>
                  <dd>{peer.connectionType}</dd>
                </div>
              ) : null}
              {peer.version ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#A0A0B0]">Version</dt>
                  <dd className="truncate max-w-[60%]">{peer.version}</dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full h-11 rounded-xl border border-white/15 font-mono text-[11px] tracking-wider"
            >
              CLOSE
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
