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
import {
  Map as MapIcon,
  List,
  RefreshCw,
  Search,
  Zap,
  Link2,
  Radio,
  LineChart,
} from "lucide-react";
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
import { fetchAvgBlockTime, fetchRecentBlocks } from "../../lib/blocks";
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
import EmptyState from "./EmptyState";
import OracleFeedCard, {
  type OracleFeedRich,
} from "./OracleFeedCards";
import MempoolPanel, { type MiniMempoolTx } from "./MempoolPanel";
import BlocksPanel, { type MiniBlock } from "./BlocksPanel";
import OperatorsPanel from "./OperatorsPanel";
import { tabFade } from "../lib/motion";
import {
  isMiniTabId,
  openSheetFromStartParam,
  tabFromStartParam,
  type MiniTabId,
} from "../lib/tabs";
import { detectMiniLocale, t as tStatic } from "../lib/i18n";
import { MiniI18nProvider, useMiniI18n } from "../lib/MiniI18n";

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

type OracleFeed = OracleFeedRich & {
  priceChange24h?: number | null;
};

type OracleApiResponse = {
  feeds?: OracleFeed[];
  view?: string;
  mode?: string;
  bridge?: {
    connected?: boolean;
    oraclesConfigured?: string[];
    error?: string;
    version?: string | null;
  };
};

/** Normalize API → UI (keep full feed; optional Δ from history) */
function normalizeFeeds(raw: OracleFeed[] | undefined): OracleFeed[] {
  return (raw ?? []).map((f) => {
    const price =
      typeof f.price === "number" && Number.isFinite(f.price) ? f.price : null;
    let ch: number | null =
      typeof f.priceChange24h === "number" ? f.priceChange24h : null;
    // history is newest-first from API; use last point for short Δ if needed
    if (ch == null && price != null && Array.isArray(f.history) && f.history.length > 1) {
      const older = f.history[f.history.length - 1];
      const prev =
        typeof older === "number"
          ? older
          : typeof older?.price === "number"
            ? older.price
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

type MempoolPayload = {
  size: number;
  txs: MiniMempoolTx[];
  source: string;
};

function mapNodeUnconfirmed(raw: unknown): MiniMempoolTx[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 48).map((t) => {
    const tx = t as {
      id?: string;
      size?: number;
      inputs?: unknown[] | number;
      outputs?: Array<{ value?: number | string; assets?: unknown[] }> | number;
    };
    let ergNano: string | null = null;
    let outputsN: number | null = null;
    let inputsN: number | null = null;
    let tokens: MiniMempoolTx["tokens"] = null;
    if (Array.isArray(tx.inputs)) inputsN = tx.inputs.length;
    else if (typeof tx.inputs === "number") inputsN = tx.inputs;
    if (Array.isArray(tx.outputs)) {
      outputsN = tx.outputs.length;
      let sum = BigInt(0);
      const toks: NonNullable<MiniMempoolTx["tokens"]> = [];
      for (const o of tx.outputs) {
        try {
          if (o?.value != null) sum += BigInt(String(o.value));
        } catch {
          /* */
        }
        const assets = (o as { assets?: Array<{ tokenId?: string; amount?: string }> })
          ?.assets;
        if (Array.isArray(assets)) {
          for (const a of assets) {
            if (a?.tokenId)
              toks.push({ tokenId: a.tokenId, amount: a.amount });
          }
        }
      }
      if (sum > BigInt(0)) ergNano = sum.toString();
      if (toks.length) tokens = toks;
    } else if (typeof tx.outputs === "number") {
      outputsN = tx.outputs;
    }
    return {
      id: tx.id || "",
      size: tx.size ?? null,
      inputs: inputsN,
      outputs: outputsN,
      ergNano,
      tokens,
      pending: true,
    };
  });
}

async function fetchRecentBlocksMini(
  mode: NodeMode,
  token: string,
  tipHeight: number | null
): Promise<{ blocks: MiniBlock[]; source: string }> {
  if (mode === "my" && !token) {
    return { blocks: [], source: "—" };
  }
  // Lumen: rich chain feed with tx counts
  if (mode === "lumen") {
    try {
      const res = await fetch("/api/chain/blocks?limit=12", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          blocks?: Array<{
            id?: string;
            height?: number;
            timestamp?: number;
            txCount?: number;
            size?: number;
          }>;
        };
        const blocks: MiniBlock[] = (data.blocks || [])
          .filter((b) => typeof b.height === "number")
          .map((b) => ({
            id: b.id || "",
            height: b.height as number,
            timestamp: b.timestamp ?? null,
            txCount: b.txCount ?? null,
            size: b.size ?? null,
          }));
        return { blocks, source: "chain" };
      }
    } catch {
      /* fall through */
    }
  }
  // My Node / fallback: real headers + tx counts from node
  const tip = tipHeight && tipHeight > 0 ? tipHeight : 0;
  if (!tip) return { blocks: [], source: "node" };
  try {
    const list = await fetchRecentBlocks(
      resolveNodeBase(mode),
      tip,
      10,
      nodeRequestHeaders(mode, token)
    );
    return {
      blocks: list.map((b) => ({
        id: b.id || "",
        height: b.height,
        timestamp: b.timestamp ?? null,
        txCount: b.txCount ?? null,
        size: null,
      })),
      source: "node",
    };
  } catch {
    return { blocks: [], source: "—" };
  }
}

async function fetchMempool(
  mode: NodeMode,
  token: string
): Promise<MempoolPayload> {
  if (mode === "my" && !token) {
    return { size: 0, txs: [], source: "—" };
  }
  // Lumen host: prefer rich chain mempool; fallback to node REST
  if (mode === "lumen") {
    try {
      const res = await fetch("/api/chain/mempool?limit=40", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          count?: number;
          transactions?: MiniMempoolTx[];
        };
        const txs = Array.isArray(data.transactions)
          ? data.transactions
          : [];
        return {
          size: data.count ?? txs.length,
          txs,
          source: "chain",
        };
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetchNodeResource(
      mode,
      token,
      "transactions/unconfirmed",
      { timeoutMs: mode === "my" ? 14000 : 6500 }
    );
    if (!res.ok) return { size: 0, txs: [], source: "node" };
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data)
      ? data
      : data &&
          typeof data === "object" &&
          Array.isArray((data as { transactions?: unknown }).transactions)
        ? (data as { transactions: unknown[] }).transactions
        : [];
    const txs = mapNodeUnconfirmed(list);
    return { size: list.length, txs, source: "node" };
  } catch {
    return { size: 0, txs: [], source: "—" };
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
  return (
    <MiniI18nProvider>
      <Shell />
    </MiniI18nProvider>
  );
}

function Shell() {
  const reduce = useReducedMotion();
  const { t } = useMiniI18n();
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
        toast.success(tStatic(detectMiniLocale(), "toast_bridge_restored"));
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
          toast.success(tStatic(detectMiniLocale(), "toast_bridge_restored"));
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

  const {
    data: mempool = { size: 0, txs: [], source: "—" },
    isLoading: mempoolLoading,
  } = useQuery({
    queryKey: ["mini-mempool", mode, token],
    queryFn: () => fetchMempool(mode, token),
    refetchInterval: 8_000,
    enabled: tab === "home",
  });
  const mempoolSize = mempool.size;

  const heightForBlocks =
    nodeInfo?.fullHeight ?? nodeInfo?.headersHeight ?? null;
  const {
    data: recentBlocks = { blocks: [], source: "—" },
    isLoading: blocksLoading,
  } = useQuery({
    queryKey: ["mini-blocks", mode, token, heightForBlocks],
    queryFn: () => fetchRecentBlocksMini(mode, token, heightForBlocks),
    refetchInterval: 12_000,
    enabled: tab === "home" && (mode === "lumen" || !!token),
    staleTime: 8_000,
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
        qc.invalidateQueries({ queryKey: ["mini-blocks"] }),
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
                {mode === "my" ? t("source_my") : t("source_lumen")}
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
            {isOnline ? t("status_live") : t("status_off")}
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
            {pullY > 56 ? t("release_refresh") : t("pull_refresh")}
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
                  mempoolTxs={mempool.txs}
                  mempoolSource={mempool.source}
                  mempoolLoading={mempoolLoading}
                  blocks={recentBlocks.blocks}
                  blocksSource={recentBlocks.source}
                  blocksLoading={blocksLoading}
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
                  myBridgeConfigured={
                    oraclesMy?.bridge?.oraclesConfigured ?? []
                  }
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
                    toast.message(t("toast_token_cleared"));
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
  mempoolTxs,
  mempoolSource,
  mempoolLoading,
  blocks,
  blocksSource,
  blocksLoading,
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
  mempoolTxs: MiniMempoolTx[];
  mempoolSource: string;
  mempoolLoading: boolean;
  blocks: MiniBlock[];
  blocksSource: string;
  blocksLoading: boolean;
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
  const { t } = useMiniI18n();
  const [panel, setPanel] = useState<"dash" | "blocks" | "mempool">("dash");
  const usd = feeds.find((f) => f.id === "erg-usd" || f.pair === "ERG/USD");
  const avgSub =
    avgBlockTime != null && avgBlockSamples > 0
      ? t("avg_sub_samples", { w: avgBlockWindow, s: avgBlockSamples })
      : avgBlockTime != null
        ? t("avg_sub_window", { w: avgBlockWindow })
        : t("avg_sub_loading");

  const title =
    panel === "dash"
      ? t("tab_home")
      : panel === "blocks"
        ? t("blk_title")
        : t("mp_title");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight shrink-0">
          {title}
        </h1>
      </div>
      {/* Submenu: Overview · Blocks · Mempool */}
      <div className="inline-flex w-full rounded-full border border-white/10 p-0.5 bg-black/20">
        {(
          [
            { id: "dash" as const, label: t("home_seg_dash") },
            {
              id: "blocks" as const,
              label: t("home_seg_blocks"),
            },
            {
              id: "mempool" as const,
              label: `${t("home_seg_mempool")}${
                mempoolSize > 0 ? ` ${mempoolSize}` : ""
              }`,
            },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setPanel(s.id);
              void hapticImpact("light");
            }}
            className={`flex-1 h-9 rounded-full text-[10px] font-mono tracking-wider ${
              panel === s.id ? "bg-white/10 text-white" : "text-[#A0A0B0]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {panel === "mempool" ? (
        <MempoolPanel
          size={mempoolSize}
          txs={mempoolTxs}
          loading={mempoolLoading}
          source={mempoolSource}
        />
      ) : panel === "blocks" ? (
        <BlocksPanel
          blocks={blocks}
          loading={blocksLoading}
          tipHeight={height}
          source={blocksSource}
        />
      ) : infoLoading ? (
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
      ) : (
        <>
          <MiniCard onClick={onToggleMode}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[#A0A0B0] tracking-[0.16em]">
                {t("source")}
              </span>
              <span className="text-xs font-mono text-[#FF7A3D] tracking-wider">
                {mode === "my" ? t("source_my_node") : t("source_lumen_node")}
              </span>
            </div>
          </MiniCard>

          <MiniCard>
            <div className="text-[10px] font-mono text-[#A0A0B0] tracking-[0.16em]">
              {t("height")}
            </div>
            <div className="mt-1 font-mono text-3xl tracking-tight tabular-nums text-white">
              {height != null ? height.toLocaleString() : "—"}
            </div>
            {headersH != null && height != null && headersH !== height ? (
              <div className="mt-1 text-[10px] font-mono text-[#F59E0B]">
                {t("headers_sync", {
                  h: headersH.toLocaleString(),
                  p: syncPct ?? "—",
                })}
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono text-[#A0A0B0]">
              <span>{t("peers", { n: peersN ?? "—" })}</span>
              <button
                type="button"
                className="text-left text-[#00E5FF]"
                onClick={() => {
                  setPanel("mempool");
                  void hapticImpact("light");
                }}
              >
                {t("mempool", { n: mempoolSize })} ›
              </button>
              <span className="text-[#FF7A3D]">
                {t("avg_block", {
                  v: avgBlockTime != null ? `${avgBlockTime}s` : "—",
                })}
              </span>
              <button
                type="button"
                className="text-left text-[#FF7A3D]/90"
                onClick={() => {
                  setPanel("blocks");
                  void hapticImpact("light");
                }}
              >
                {t("home_blocks_link", { n: blocks.length || "—" })} ›
              </button>
              {nodeName ? (
                <span className="truncate col-span-2">
                  {t("node", { n: nodeName })}
                </span>
              ) : null}
              <span className="text-[10px] text-[#A0A0B0]/90 truncate col-span-2">
                {avgSub}
              </span>
              {token ? (
                <span
                  className={`col-span-2 ${
                    bridgeOnline ? "text-[#10B981]" : "text-[#F59E0B]"
                  }`}
                >
                  {bridgeOnline ? t("bridge_online") : t("bridge_offline")}
                </span>
              ) : (
                <span className="col-span-2">{t("bridge_not_set")}</span>
              )}
            </div>
          </MiniCard>

          <div className="grid grid-cols-2 gap-2">
            <ActionChip
              label={infoFetching ? "…" : t("action_refresh")}
              icon={
                <RefreshCw
                  className={`w-3.5 h-3.5 ${infoFetching ? "animate-spin" : ""}`}
                />
              }
              onClick={onRefresh}
            />
            <ActionChip label={t("action_bridge")} onClick={onOpenBridge} />
            <ActionChip label={t("action_alerts")} onClick={onAlerts} />
            <ActionChip
              label={
                usd?.price != null
                  ? `$${Number(usd.price).toFixed(2)}`
                  : usd?.priceLabel || t("action_oracles")
              }
              onClick={onOracles}
            />
          </div>

          {!token ? (
            <EmptyState
              title={t("empty_connect_title")}
              body={t("empty_connect_body")}
              icon={<Link2 className="w-4 h-4" />}
              onClick={onOpenBridge}
              actionLabel={t("action_bridge")}
            />
          ) : null}
        </>
      )}
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
  const { t } = useMiniI18n();
  return (
    <div className="grid grid-rows-[auto_minmax(0,1fr)] flex-1 min-h-0 h-full w-full">
      <div className="shrink-0 z-10 flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.06] bg-[#0A0A0F]">
        <h1 className="text-base font-semibold tracking-tight">
          {t("network_title")}
        </h1>
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
  const { t } = useMiniI18n();
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
        <MapIcon className="w-3.5 h-3.5" /> {t("map")}
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
        <List className="w-3.5 h-3.5" /> {t("list")}
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
  const { t } = useMiniI18n();
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

  const filterLabel =
    netFilter === "live" ? t("filter_live") : t("filter_all");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("network_title")}
        </h1>
        <NetViewToggle netView={netView} setNetView={setNetView} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A0A0B0]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_peers")}
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
            {f === "live" ? t("filter_live") : t("filter_all")}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[11px] font-mono text-[#A0A0B0]">
          {mapLoading
            ? t("peers_loading")
            : query.trim()
              ? t("peers_count_q", {
                  n: filtered.length,
                  total: peerRows.length,
                  f: `${filterLabel}${lowEnd ? " · lite" : ""}`,
                })
              : t("peers_count", {
                  n: filtered.length,
                  f: `${filterLabel}${lowEnd ? " · lite" : ""}`,
                })}
        </p>
        {mapLoading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              query.trim()
                ? t("empty_peers_search")
                : t("empty_peers_filter")
            }
            body={
              query.trim()
                ? t("empty_peers_search_body")
                : t("empty_peers_filter_body")
            }
            icon={<Radio className="w-4 h-4" />}
          />
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
                      t("peer_unknown")}
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
  myBridgeConfigured,
  onConnect,
}: {
  seg: "network" | "my";
  setSeg: (s: "network" | "my") => void;
  feeds: OracleFeed[];
  myFeeds: OracleFeed[];
  hasToken: boolean;
  loading: boolean;
  myBridgeConnected: boolean;
  myBridgeConfigured?: string[];
  onConnect: () => void;
}) {
  const { t } = useMiniI18n();
  const [view, setView] = useState<"pools" | "ops">("pools");
  const active = seg === "my" ? myFeeds : feeds;
  // Prefer canonical order USD → XAU
  const ordered = [...active].sort((a, b) => {
    const rank = (id?: string) =>
      id === "erg-usd" ? 0 : id === "erg-xau" ? 1 : 2;
    return rank(a.id) - rank(b.id);
  });

  const opsLive = ordered.reduce((acc, f) => {
    for (const n of f.nodes || []) {
      const st = (n.status || "").toLowerCase();
      if (st === "live" || st === "active") acc += 1;
    }
    return acc;
  }, 0);
  const opsTotal = ordered.reduce(
    (acc, f) => acc + (f.nodes?.length || 0),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("oracles_title")}
        </h1>
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
              {s === "network" ? t("oracles_network") : t("oracles_my")}
            </button>
          ))}
        </div>
      </div>

      {/* Submenu: Pools | Operators */}
      <div className="inline-flex rounded-full border border-white/10 p-0.5 bg-black/20 w-full">
        <button
          type="button"
          onClick={() => {
            setView("pools");
            void hapticImpact("light");
          }}
          className={`flex-1 h-9 rounded-full text-[10px] font-mono tracking-wider ${
            view === "pools" ? "bg-white/10 text-white" : "text-[#A0A0B0]"
          }`}
        >
          {t("ora_view_pools")}
        </button>
        <button
          type="button"
          onClick={() => {
            setView("ops");
            void hapticImpact("light");
          }}
          className={`flex-1 h-9 rounded-full text-[10px] font-mono tracking-wider ${
            view === "ops" ? "bg-white/10 text-white" : "text-[#A0A0B0]"
          }`}
        >
          {t("ora_view_ops")}
          {opsTotal > 0 ? ` · ${opsLive}/${opsTotal}` : ""}
        </button>
      </div>

      {seg === "my" && !hasToken ? (
        <EmptyState
          title={t("empty_oracle_connect_title")}
          body={t("empty_oracle_connect_body")}
          icon={<Link2 className="w-4 h-4" />}
          onClick={onConnect}
          actionLabel={t("action_bridge")}
        />
      ) : view === "ops" ? (
        <OperatorsPanel feeds={ordered} loading={loading} />
      ) : loading ? (
        <>
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </>
      ) : (
        <>
          {seg === "my" ? (
            <MiniCard>
              <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wider">
                {t("ora_bridge_banner")}
              </div>
              <div
                className={`mt-1 text-sm font-mono ${
                  myBridgeConnected ? "text-[#10B981]" : "text-[#F59E0B]"
                }`}
              >
                {myBridgeConnected
                  ? t("ora_bridge_online")
                  : t("ora_bridge_offline")}
              </div>
              {myBridgeConfigured && myBridgeConfigured.length > 0 ? (
                <div className="mt-1 text-[10px] font-mono text-[#A0A0B0]">
                  {t("ora_configured", {
                    list: myBridgeConfigured.join(", "),
                  })}
                </div>
              ) : null}
            </MiniCard>
          ) : null}

          {ordered.length === 0 ? (
            <EmptyState
              title={
                seg === "my" ? t("empty_oracle_my") : t("empty_oracle_net")
              }
              body={
                seg === "my"
                  ? t("empty_oracle_my_body")
                  : t("empty_oracle_net_body")
              }
              icon={<LineChart className="w-4 h-4" />}
            />
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {ordered.map((f) => (
                <OracleFeedCard
                  key={f.id}
                  feed={f}
                  variant={seg}
                  showOperator={
                    seg === "my" ||
                    !!f.myOperator ||
                    !!f.nodes?.some((n) => n.isMine)
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
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
  const { t, locale, setLocale } = useMiniI18n();
  const tail = token ? `…${token.slice(-6)}` : "—";
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold tracking-tight">{t("me_title")}</h1>
      <MiniCard onClick={onOpenBridge}>
        <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wider">
          {t("bridge")}
        </div>
        <div className="mt-1 text-sm">
          {token ? (
            <>
              {t("token_status", { t: tail })}
              <span
                className={
                  bridgeOnline ? "text-[#10B981]" : "text-[#F59E0B]"
                }
              >
                {bridgeOnline ? t("online") : t("offline")}
              </span>
            </>
          ) : (
            t("not_connected")
          )}
        </div>
        <div className="mt-1 text-[11px] font-mono text-[#A0A0B0]">
          {t("mode_line", {
            m: mode === "my" ? t("mode_my") : t("mode_lumen"),
          })}
        </div>
      </MiniCard>
      <MiniCard onClick={onOpenAlerts}>
        <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wider">
          {t("alerts")}
        </div>
        <div className="mt-1 text-sm">{t("alerts_watchdog")}</div>
        <div className="text-[11px] text-[#A0A0B0] mt-0.5">
          {t("alerts_watchdog_sub")}
        </div>
      </MiniCard>
      <MiniCard>
        <div className="text-[10px] font-mono text-[#A0A0B0] tracking-wider mb-2">
          {t("language")}
        </div>
        <div className="inline-flex rounded-full border border-white/10 p-0.5 bg-black/20">
          {(["en", "ru"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLocale(l);
                void hapticImpact("light");
              }}
              className={`h-8 px-4 rounded-full text-[10px] font-mono tracking-wider ${
                locale === l ? "bg-white/10 text-white" : "text-[#A0A0B0]"
              }`}
            >
              {l === "en" ? t("lang_en") : t("lang_ru")}
            </button>
          ))}
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
        <div className="text-sm">{t("open_site")}</div>
        <div className="text-[11px] text-[#A0A0B0] mt-0.5">
          {t("open_site_sub")}
        </div>
      </MiniCard>
      {token ? (
        <button
          type="button"
          onClick={onClear}
          className="w-full h-11 rounded-xl border border-[#EF4444]/30 text-[#EF4444] font-mono text-[11px] tracking-wider"
        >
          {t("clear_token")}
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
  const { t } = useMiniI18n();
  return (
    <AnimatePresence>
      {peer ? (
        <>
          <motion.button
            type="button"
            aria-label={t("close_aria")}
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
            <h2 className="text-base font-semibold mb-3">{t("peer_title")}</h2>
            <dl className="space-y-2 text-sm font-mono">
              {peer.name ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#A0A0B0]">{t("peer_name")}</dt>
                  <dd className="text-right truncate max-w-[60%]">{peer.name}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-[#A0A0B0]">{t("peer_place")}</dt>
                <dd className="text-right">
                  {[peer.city, peer.country].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#A0A0B0]">{t("peer_ip")}</dt>
                <dd className="text-right truncate max-w-[60%]">
                  {peer.ip || peer.address || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#A0A0B0]">{t("peer_status")}</dt>
                <dd className="uppercase">{peer.state || peer.status || "—"}</dd>
              </div>
              {peer.connectionType ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#A0A0B0]">{t("peer_link")}</dt>
                  <dd>{peer.connectionType}</dd>
                </div>
              ) : null}
              {peer.version ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[#A0A0B0]">{t("peer_version")}</dt>
                  <dd className="truncate max-w-[60%]">{peer.version}</dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full h-11 rounded-xl border border-white/15 font-mono text-[11px] tracking-wider"
            >
              {t("close")}
            </button>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
