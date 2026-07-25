"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  RefreshCw, Zap,
  ExternalLink, Orbit, Globe2, Cable
} from 'lucide-react';
import { toast } from 'sonner';

import Constellation3D from './components/Constellation3D';
import MetricsCards from './components/MetricsCards';
import BlocksTimeline from './components/BlocksTimeline';
import MempoolFlow from './components/MempoolFlow';
import ConnectionSettings from './components/ConnectionSettings';
import ShareCard from './components/ShareCard';
import type { NodeInfo, Peer, RecentBlock } from './types/ergo';
import {
  openBlockOnSigmaSpace,
  officialExplorerAddressUrl,
  officialExplorerBlockUrl,
  sigmaBlockUrl,
} from './lib/explorer';
import {
  fetchAvgBlockTime,
  fetchBlockDetails,
  fetchRecentBlocks,
} from './lib/blocks';
import {
  fetchBlockMinerByHeight,
  fetchBlockMinerById,
} from './lib/miner';
import type { BridgeStatus, NodeMode } from './lib/node-api';
import {
  DEFAULT_LUMEN_NODE_URL,
  fetchBridgeStatus,
  fetchNodeResource,
  loadBridgeToken,
  loadNodeMode,
  nodeRequestHeaders,
  resolveNodeBase,
  saveBridgeToken,
  saveNodeMode,
} from './lib/node-api';

/** Headers window for AVG BLOCK TIME (matches MetricsCards sublabel). */
const AVG_BLOCK_WINDOW = 100;

// Leaflet needs browser APIs — no SSR
const PeerMap = dynamic(() => import('./components/PeerMap'), {
  ssr: false,
  loading: () => (
    <div className="canvas-container lumen-viz relative w-full flex items-center justify-center font-mono text-xs tracking-[3px] text-[#A0A0B0]">
      LOADING MAP…
    </div>
  ),
});

export default function LumenDashboard() {
  const queryClient = useQueryClient();
  /** Fixed Lumen REST base — custom URL was removed from Node Settings. */
  const nodeUrl = DEFAULT_LUMEN_NODE_URL;
  const [nodeMode, setNodeModeState] = useState<NodeMode>("lumen");
  const [bridgeToken, setBridgeTokenState] = useState("");
  const [recentBlocks, setRecentBlocks] = useState<RecentBlock[]>([]);
  const [lastBlockHeight, setLastBlockHeight] = useState(0);
  const [avgBlockTime, setAvgBlockTime] = useState<number | null>(null);
  const [avgBlockSamples, setAvgBlockSamples] = useState(0);
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [viewMode, setViewMode] = useState<'constellation' | 'map'>('constellation');
  const [publicMode, setPublicMode] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  /** Hide floating Boom/Refresh when any full-screen modal is open */
  const isAnyModalOpen = shareModalOpen || settingsModalOpen;

  const setNodeMode = useCallback((mode: NodeMode) => {
    setNodeModeState(mode);
    saveNodeMode(mode);
    // Drop all node-sourced caches so My Node never shows Lumen leftovers
    void queryClient.removeQueries({ queryKey: ["nodeInfo"] });
    void queryClient.removeQueries({ queryKey: ["peers"] });
    void queryClient.removeQueries({ queryKey: ["mempool"] });
    void queryClient.removeQueries({ queryKey: ["peer-map"] });
  }, [queryClient]);

  const setBridgeToken = useCallback((token: string) => {
    setBridgeTokenState(token);
    saveBridgeToken(token);
  }, []);

  // Effective REST base: /api/node (Lumen) or /api/bridge/node (My Node)
  const effectiveNodeUrl = useMemo(
    () => resolveNodeBase(nodeMode, nodeUrl),
    [nodeMode, nodeUrl]
  );
  const apiHeaders = useMemo(
    () => nodeRequestHeaders(nodeMode, bridgeToken),
    [nodeMode, bridgeToken]
  );

  // My Node mode needs a token to query the bridge proxy
  const canFetchNode = nodeMode === "lumen" || !!bridgeToken;

  // When data source changes, wipe in-memory timeline + query cache again
  useEffect(() => {
    setRecentBlocks([]);
    setLastBlockHeight(0);
    setAvgBlockTime(null);
    setAvgBlockSamples(0);
    void queryClient.invalidateQueries({ queryKey: ["nodeInfo"] });
    void queryClient.invalidateQueries({ queryKey: ["peers"] });
    void queryClient.invalidateQueries({ queryKey: ["mempool"] });
    void queryClient.invalidateQueries({ queryKey: ["peer-map"] });
  }, [nodeMode, bridgeToken, effectiveNodeUrl, queryClient]);

  // Load saved mode / token from localStorage
  useEffect(() => {
    setNodeModeState(loadNodeMode());
    setBridgeTokenState(loadBridgeToken());
  }, []);

  // Public Mode status (ShareCard / badge only — not editable in Node Settings)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/public-status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setPublicMode(!!data.publicMode);
      } catch {
        /* offline / first paint */
      }
    })();
  }, []);

  // Bridge connection status (poll when we have a token)
  const {
    data: bridgeStatus = null,
    isFetching: bridgeStatusLoading,
    refetch: refetchBridgeStatus,
  } = useQuery({
    queryKey: ["bridgeStatus", bridgeToken],
    queryFn: async (): Promise<BridgeStatus> => fetchBridgeStatus(bridgeToken),
    enabled: !!bridgeToken,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const onRefreshBridgeStatus = useCallback(() => {
    if (bridgeToken) void refetchBridgeStatus();
  }, [bridgeToken, refetchBridgeStatus]);

  // === REAL NODE DATA (Lumen: /api/node · My Node: /api/bridge/node + token) ===
  const { data: nodeInfo, isLoading: infoLoading, refetch: refetchInfo, isError: infoError, isFetching: infoFetching } = useQuery({
    queryKey: ['nodeInfo', nodeMode, effectiveNodeUrl, bridgeToken],
    queryFn: async (): Promise<NodeInfo> => {
      if (nodeMode === "my" && !bridgeToken) throw new Error("no_bridge_token");
      const res = await fetchNodeResource(nodeMode, bridgeToken, "info", {
        base: effectiveNodeUrl,
        timeoutMs: nodeMode === "my" ? 14000 : 6500,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Node unreachable");
      }
      // Guard: response must look like Ergo /info (not a bridge error JSON)
      const data = await res.json();
      if (!data || typeof data !== "object" || (data.fullHeight == null && data.headersHeight == null)) {
        throw new Error(data?.error || "invalid_node_info");
      }
      return data as NodeInfo;
    },
    enabled: canFetchNode,
    refetchInterval: 7500,
    retry: nodeMode === "my" ? 1 : 2,
    // Never show the other mode's cached row while loading
    placeholderData: undefined,
    structuralSharing: false,
  });

  const { data: peers = [], refetch: refetchPeers } = useQuery({
    queryKey: ['peers', nodeMode, effectiveNodeUrl, bridgeToken],
    queryFn: async (): Promise<Peer[]> => {
      const res = await fetchNodeResource(
        nodeMode,
        bridgeToken,
        "peers/connected",
        { base: effectiveNodeUrl, timeoutMs: nodeMode === "my" ? 14000 : 6500 }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: canFetchNode,
    refetchInterval: 14000,
    placeholderData: undefined,
    structuralSharing: false,
  });

  const { data: mempoolData, refetch: refetchMempool } = useQuery({
    queryKey: ['mempool', nodeMode, effectiveNodeUrl, bridgeToken],
    queryFn: async () => {
      const res = await fetchNodeResource(
        nodeMode,
        bridgeToken,
        "transactions/unconfirmed",
        { base: effectiveNodeUrl, timeoutMs: nodeMode === "my" ? 14000 : 6500 }
      );
      if (!res.ok) return { size: 0, txs: [] };
      const txs: any[] = await res.json();
      if (!Array.isArray(txs)) return { size: 0, txs: [] };
      return { size: txs.length, txs: txs.slice(0, 24).map(t => ({ id: t.id })) };
    },
    enabled: canFetchNode,
    refetchInterval: 8500,
    placeholderData: undefined,
    structuralSharing: false,
  });

  const bridgeOnline = !!bridgeStatus?.connected;
  const isOnline = !!nodeInfo && !infoError && canFetchNode;
  const currentHeight = nodeInfo?.fullHeight || nodeInfo?.headersHeight || 0;
  const mempoolSize = mempoolData?.size || 0;
  const mempoolTxs = mempoolData?.txs || [];

  // === INITIAL + LIVE BLOCKS (real tx counts from node) ===
  //
  // Source of truth:
  //   GET /blocks/at/{height}  → header id
  //   GET /blocks/{id}/transactions → { transactions: [...] }
  //   txCount = transactions.length  (NOT random!)
  //
  useEffect(() => {
    if (!currentHeight || !canFetchNode) return;

    let cancelled = false;
    // Blocks helpers take a base URL; for My Node put token in each path via headers
    // and also use a base that works with header+query through fetchBlockDetails.
    const blockBase =
      nodeMode === "my" && bridgeToken
        ? effectiveNodeUrl
        : effectiveNodeUrl;
    const blockHeaders = apiHeaders;

    const loadInitial = async () => {
      // First connect or reconnect: pull last 9 blocks with real counts
      if (lastBlockHeight === 0 || recentBlocks.length === 0) {
        const blocks = await fetchRecentBlocks(
          blockBase,
          currentHeight,
          9,
          blockHeaders
        );
        if (cancelled) return;
        if (blocks.length) {
          setRecentBlocks(blocks);
          setLastBlockHeight(currentHeight);
        } else {
          setLastBlockHeight(currentHeight);
        }
        // Real avg from last N headers (one node request)
        const avg = await fetchAvgBlockTime(
          blockBase,
          AVG_BLOCK_WINDOW,
          blockHeaders
        );
        if (!cancelled && avg) {
          setAvgBlockTime(avg.avgSeconds);
          setAvgBlockSamples(avg.samples);
        }
        return;
      }

      // New tip height → append real block + honest Explorer miner
      if (currentHeight > lastBlockHeight) {
        const prev = lastBlockHeight;
        setLastBlockHeight(currentHeight);

        for (let h = prev + 1; h <= currentHeight; h++) {
          const block = await fetchBlockDetails(blockBase, h, blockHeaders);
          if (cancelled) return;
          if (!block) continue;

          // Miner attribution: Explorer only (never peers)
          let minerLabel: string | undefined;
          let minerAddress: string | undefined;
          let minerShort: string | undefined;
          try {
            const miner = block.id
              ? await fetchBlockMinerById(block.id, block.height)
              : await fetchBlockMinerByHeight(block.height);
            if (miner) {
              minerLabel = miner.label;
              minerAddress = miner.address;
              minerShort = miner.short;
              if (!cancelled && h === currentHeight) {
                toast.success(miner.line, {
                  description: "Miner from Explorer API · not a map peer",
                  duration: 5000,
                });
              }
            }
          } catch {
            /* explorer optional */
          }

          const enriched = {
            ...block,
            minerLabel,
            minerAddress,
            minerShort,
          };

          setRecentBlocks((list) => {
            if (list.some((b) => b.height === enriched.height)) {
              return list.map((b) =>
                b.height === enriched.height ? { ...b, ...enriched } : b
              );
            }
            return [enriched, ...list]
              .sort((a, b) => b.height - a.height)
              .slice(0, 9);
          });
        }

        const avg = await fetchAvgBlockTime(
          blockBase,
          AVG_BLOCK_WINDOW,
          blockHeaders
        );
        if (!cancelled && avg) {
          setAvgBlockTime(avg.avgSeconds);
          setAvgBlockSamples(avg.samples);
        }
      }
    };

    loadInitial();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on height / mode / node
  }, [currentHeight, effectiveNodeUrl, nodeMode, bridgeToken, canFetchNode]);

  // === MANUAL RECONNECT ===
  const handleReconnect = () => {
    void queryClient.removeQueries({ queryKey: ["nodeInfo"] });
    void queryClient.removeQueries({ queryKey: ["peers"] });
    void queryClient.removeQueries({ queryKey: ["mempool"] });
    void queryClient.removeQueries({ queryKey: ["peer-map"] });
    refetchInfo();
    refetchPeers();
    refetchMempool();
    if (bridgeToken) void refetchBridgeStatus();
    // Refresh real avg block time from headers
    if (canFetchNode) {
      fetchAvgBlockTime(effectiveNodeUrl, AVG_BLOCK_WINDOW, apiHeaders).then(
        (avg) => {
          if (avg) {
            setAvgBlockTime(avg.avgSeconds);
            setAvgBlockSamples(avg.samples);
          }
        }
      );
    }
    toast.loading(
      nodeMode === "my"
        ? "Reconnecting via Lumen Bridge..."
        : "Reconnecting to Ergo node...",
      { id: "reconnect" }
    );
    setTimeout(() => toast.dismiss('reconnect'), 1400);
  };

  // === BLOCK DETAIL MODAL (simple beautiful) ===
  const [selectedBlock, setSelectedBlock] = useState<RecentBlock | null>(null);

  /** Open block preview; backfill honest miner from Explorer if missing */
  const openBlockDetail = (block: RecentBlock) => {
    setSelectedBlock(block);
    if (block.minerAddress && block.minerLabel) return;
    void (async () => {
      try {
        const miner = block.id
          ? await fetchBlockMinerById(block.id, block.height)
          : await fetchBlockMinerByHeight(block.height);
        if (!miner) return;
        const patch = {
          minerAddress: miner.address,
          minerLabel: miner.label,
          minerShort: miner.short,
          id: block.id || miner.blockId,
        };
        setSelectedBlock((prev) =>
          prev && prev.height === block.height ? { ...prev, ...patch } : prev
        );
        setRecentBlocks((list) =>
          list.map((b) =>
            b.height === block.height ? { ...b, ...patch } : b
          )
        );
      } catch {
        /* optional */
      }
    })();
  };

  const effectivePeers = peers;
  const effectiveInfo = nodeInfo;

  return (
    <div className="min-h-screen min-h-dvh bg-[#0A0A0F] text-[#E8E8F0] overflow-x-hidden">
      {/* === HERO / TOP BAR === */}
      <div className="border-b border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col gap-2.5 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo row */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold tracking-[-0.5px] text-2xl sm:text-3xl leading-none">
                Lumen
              </div>
              <div className="text-[9px] sm:text-[10px] text-[#A0A0B0] mt-0.5 font-mono tracking-[2px] sm:tracking-[3px] truncate">
                Ergo Node Dashboard
              </div>
            </div>
          </div>

          {/*
            Mobile: one full-width row — SHARE · SETTINGS · refresh · LIVE
            Desktop: status + mode + controls (unchanged flow)
          */}
          <div
            className="
              grid grid-cols-4 gap-1.5 w-full
              sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:justify-end sm:w-auto
              [&_button]:min-h-[2.75rem] sm:[&_button]:min-h-0
              [&_button]:w-full sm:[&_button]:w-auto
              [&_button]:justify-center
              [&_button]:px-1.5 sm:[&_button]:px-4
              [&_button]:text-[10px] sm:[&_button]:text-xs
            "
          >
            {/* Status — desktop only */}
            <div
              className={`hidden sm:flex items-center gap-2 px-4 lg:px-5 py-2 rounded-3xl text-sm font-mono tracking-widest border ${
                isOnline
                  ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
                  : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isOnline ? "bg-[#10B981] status-dot" : "bg-[#EF4444]"
                }`}
              />
              {nodeMode === "my"
                ? isOnline
                  ? "MY NODE LIVE"
                  : bridgeOnline
                    ? "BRIDGE UP · WAITING"
                    : "BRIDGE OFFLINE"
                : isOnline
                  ? "NODE LIVE"
                  : "NODE OFFLINE"}
            </div>

            {/* Mode badge — desktop md+ */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-3 py-2 rounded-3xl text-[10px] font-mono tracking-[2px] border ${
                nodeMode === "my"
                  ? bridgeOnline
                    ? "border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]"
                    : "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]"
                  : "border-white/15 bg-white/5 text-[#A0A0B0]"
              }`}
              title={
                nodeMode === "my"
                  ? bridgeOnline
                    ? "Reading your node via Lumen Bridge"
                    : "My Node selected — Bridge agent offline"
                  : "Reading this server’s Lumen Ergo node"
              }
            >
              {nodeMode === "my" ? (
                <>
                  <Cable className="w-3 h-3" />
                  MY NODE{bridgeOnline ? " · BRIDGE" : ""}
                </>
              ) : (
                "LUMEN NODE"
              )}
            </div>

            <ShareCard
              nodeInfo={nodeInfo}
              avgBlockTime={avgBlockTime}
              isOnline={isOnline}
              publicMode={publicMode}
              mempoolSize={mempoolSize}
              onOpenChange={setShareModalOpen}
            />

            <ConnectionSettings
              isOnline={isOnline}
              onReconnect={handleReconnect}
              onOpenChange={setSettingsModalOpen}
              nodeMode={nodeMode}
              setNodeMode={setNodeMode}
              bridgeToken={bridgeToken}
              setBridgeToken={setBridgeToken}
              bridgeStatus={bridgeStatus}
              bridgeStatusLoading={bridgeStatusLoading}
              onRefreshBridgeStatus={onRefreshBridgeStatus}
            />

            <button
              type="button"
              onClick={handleReconnect}
              className="flex items-center gap-1.5 rounded-2xl glass border border-white/10 hover:bg-white/5 transition-all active:scale-[0.98] text-[#E8E8F0] font-mono tracking-wider"
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="sm:hidden">SYNC</span>
            </button>

            {/* LIVE — mobile only (desktop has full status chip) */}
            <div
              className={`sm:hidden flex items-center justify-center gap-1 min-h-[2.75rem] px-1.5 rounded-2xl text-[10px] font-mono tracking-wider border ${
                isOnline
                  ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]"
                  : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]"
              }`}
              title={isOnline ? "Node live" : "Node offline"}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isOnline ? "bg-[#10B981] status-dot" : "bg-[#EF4444]"
                }`}
              />
              {nodeMode === "my"
                ? isOnline
                  ? "MY"
                  : bridgeOnline
                    ? "BR"
                    : "OFF"
                : isOnline
                  ? "LIVE"
                  : "OFF"}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-12 sm:pb-16">
        {/* HERO STATUS */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-y-4 mb-6 sm:mb-8">
          <div className="min-w-0">
            <div className="font-mono text-[10px] sm:text-xs tracking-[3px] sm:tracking-[4px] text-[#FF7A3D] mb-1">ERGO NODE VISUALIZER</div>
            <h1 className="text-[2rem] sm:text-5xl lg:text-6xl font-semibold tracking-[-1px] sm:tracking-[-1.6px] leading-[1.05]">
              The living network.
            </h1>
            <p className="text-base sm:text-2xl text-[#A0A0B0] tracking-tight mt-1">
              Your node. Your peers. Real-time beauty.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-mono tracking-wider">
              <span
                className={`px-2.5 py-1 rounded-full border ${
                  nodeMode === "my"
                    ? "border-[#00E5FF]/35 text-[#00E5FF] bg-[#00E5FF]/10"
                    : "border-white/15 text-[#A0A0B0] bg-white/5"
                }`}
              >
                {nodeMode === "my" ? "SOURCE · BRIDGE" : "SOURCE · LUMEN"}
              </span>
              {effectiveInfo?.name && (
                <span className="px-2.5 py-1 rounded-full border border-white/15 text-[#E8E8F0] bg-white/5">
                  NODE · {effectiveInfo.name}
                  {infoFetching ? " …" : ""}
                </span>
              )}
              {nodeMode === "my" && (
                <span className="text-[10px] text-[#A0A0B0]/70 tracking-widest">
                  via /api/bridge/node
                </span>
              )}
            </div>
            {nodeMode === "my" && !isOnline && (
              <p className="mt-3 text-[11px] sm:text-sm font-mono tracking-wide text-[#F59E0B] max-w-xl">
                {bridgeToken
                  ? bridgeOnline
                    ? "Bridge is online but node data is not ready yet — check Ergo REST on the agent side."
                    : "My Node mode: Bridge offline. Open NODE SETTINGS → run the Bridge command next to your node."
                  : "My Node mode: no Bridge token. Open NODE SETTINGS → Connect my node."}
              </p>
            )}
          </div>

          <div className="flex items-end gap-4 sm:gap-8 text-sm flex-wrap">
            <div>
              <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest">HEADERS</div>
              <div className="font-mono text-3xl sm:text-5xl tracking-[-1.5px] tabular-nums text-white mt-0.5">
                {(effectiveInfo?.headersHeight || 0).toLocaleString()}
              </div>
            </div>
            <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest self-end pb-1.5 sm:pb-2">/</div>
            <div>
              <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest">FULL HEIGHT</div>
              <div className="font-mono text-3xl sm:text-5xl tracking-[-1.5px] tabular-nums text-[#FF7A3D]">
                {(effectiveInfo?.fullHeight || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* === VIEW TOGGLE (desktop: above viz) === */}
        <div className="hidden md:flex mb-4 items-center gap-2">
          <div className="inline-flex p-1 rounded-2xl glass border border-white/10">
            <button
              onClick={() => setViewMode('constellation')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono tracking-widest transition-all ${
                viewMode === 'constellation'
                  ? 'bg-[#FF7A3D]/15 text-[#FF7A3D] border border-[#FF7A3D]/30'
                  : 'text-[#A0A0B0] hover:text-white'
              }`}
            >
              <Orbit className="w-3.5 h-3.5" /> 3D CONSTELLATION
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono tracking-widest transition-all ${
                viewMode === 'map'
                  ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30'
                  : 'text-[#A0A0B0] hover:text-white'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" /> WORLD MAP
            </button>
          </div>
          <span className="text-[10px] font-mono text-[#A0A0B0]/60 tracking-widest">
            {viewMode === 'map'
              ? 'PEERS BY GEOIP · CITY-LEVEL ACCURACY'
              : 'NETWORK GRAPH · DETERMINISTIC 3D LAYOUT'}
          </span>
        </div>

        <div className="mb-3 md:mb-8 relative">
          {viewMode === 'constellation' ? (
            <>
              <Constellation3D
                key={`3d-${nodeMode}-${bridgeToken || "lumen"}`}
                peers={effectivePeers}
                myNodeHeight={effectiveInfo?.fullHeight || effectiveInfo?.headersHeight || 0}
                isOnline={isOnline}
                lastBlockHeight={lastBlockHeight || (effectiveInfo?.fullHeight || 0)}
                onPeerHover={setSelectedPeer}
                hideControls={isAnyModalOpen}
                centerLabel={nodeMode === "my" ? "My Node" : "Lumen Node"}
                onSimulateBlock={() => {
                  if ((window as any).__lumenSimulateBlock) {
                    (window as any).__lumenSimulateBlock();
                  } else {
                    toast('Block wave simulation triggered in 3D scene');
                  }
                }}
              />
              
              {selectedPeer && (
                <div className="mt-2.5 md:mt-0 md:absolute md:bottom-6 md:left-1/2 md:-translate-x-1/2 z-30 glass rounded-2xl sm:rounded-3xl px-4 sm:px-8 py-2.5 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-6 text-sm border border-white/10 w-full md:w-auto md:max-w-[min(90vw,520px)]">
                  <div className="font-mono text-[#00E5FF] text-[10px] sm:text-xs tracking-[2px]">SELECTED PEER</div>
                  <div className="font-mono text-white text-xs sm:text-sm break-all flex-1 min-w-0">{selectedPeer.address || selectedPeer.name || '—'}</div>
                  <button onClick={() => setSelectedPeer(null)} className="text-[#A0A0B0] hover:text-white text-xs font-mono tracking-widest flex-shrink-0">CLOSE</button>
                </div>
              )}
            </>
          ) : (
            <PeerMap
              blockHeight={
                lastBlockHeight ||
                effectiveInfo?.fullHeight ||
                effectiveInfo?.headersHeight ||
                0
              }
              hideControls={isAnyModalOpen}
              nodeMode={nodeMode}
              bridgeToken={bridgeToken}
            />
          )}
        </div>

        {/* === VIEW TOGGLE (mobile: BELOW viz so it never covers the map) === */}
        <div className="md:hidden mb-8 space-y-2">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl glass border border-white/10">
            <button
              onClick={() => setViewMode('constellation')}
              className={`flex items-center justify-center gap-1.5 px-2 py-3 rounded-xl text-[11px] font-mono tracking-wider transition-all ${
                viewMode === 'constellation'
                  ? 'bg-[#FF7A3D]/15 text-[#FF7A3D] border border-[#FF7A3D]/30'
                  : 'text-[#A0A0B0]'
              }`}
            >
              <Orbit className="w-3.5 h-3.5" /> 3D
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center justify-center gap-1.5 px-2 py-3 rounded-xl text-[11px] font-mono tracking-wider transition-all ${
                viewMode === 'map'
                  ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30'
                  : 'text-[#A0A0B0]'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" /> WORLD MAP
            </button>
          </div>
        </div>

        {/* === LIVE METRICS === */}
        <div className="mb-8">
          <MetricsCards 
            info={effectiveInfo || null}
            mempoolSize={mempoolSize}
            isOnline={isOnline}
            avgBlockTime={avgBlockTime}
            avgBlockSamples={avgBlockSamples}
            avgBlockWindow={AVG_BLOCK_WINDOW}
          />
        </div>

        {/* === BLOCKS + MEMPOOL — equal columns === */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 items-stretch">
          <div className="min-h-0 h-full">
            <BlocksTimeline 
              blocks={recentBlocks} 
              currentHeight={effectiveInfo?.fullHeight || effectiveInfo?.headersHeight || 0}
              onBlockClick={openBlockDetail}
            />
          </div>
          <div className="min-h-0 h-full">
            <MempoolFlow 
              txs={mempoolTxs} 
              size={mempoolSize} 
            />
          </div>
        </div>

        {/* Footer / Easter egg */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-mono tracking-[3px] text-[#A0A0B0]/60">
            BUILT FOR ERGO NODE RUNNERS WHO WANT TO FEEL THEIR NETWORK
            <span className="inline-block w-px h-3 bg-white/20 mx-1" />
            <a href="https://ergoplatform.org" target="_blank" className="hover:text-[#FF7A3D] inline-flex items-center gap-1">ERGOPLATFORM.ORG <ExternalLink size={11} /></a>
          </div>
        </div>
      </div>

      {/* === BLOCK DETAIL MODAL === */}
      {selectedBlock && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/90 p-0 sm:p-6" onClick={() => setSelectedBlock(null)}>
          <motion.div 
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass max-w-md w-full rounded-t-3xl sm:rounded-3xl p-6 sm:p-9 border border-white/10 max-h-[90dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="font-mono text-xs tracking-[4px] text-[#FF7A3D] mb-2">BLOCK #{selectedBlock.height}</div>
            <div className="text-6xl font-semibold tracking-[-2.5px] tabular-nums mb-8">{selectedBlock.height}</div>
            
            <div className="space-y-6 text-sm">
              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-[#A0A0B0]">CONFIRMED AT</span>
                <span className="font-mono text-right">{new Date(selectedBlock.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-[#A0A0B0]">TRANSACTIONS</span>
                <span className="font-mono text-[#FF7A3D] text-xl tracking-tighter">{selectedBlock.txCount}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-white/10 gap-4">
                <span className="text-[#A0A0B0] flex-shrink-0">MINER</span>
                <span className="font-mono text-right text-[#E8E8F0]">
                  {selectedBlock.minerLabel || "—"}
                  {selectedBlock.minerShort
                    ? ` · ${selectedBlock.minerShort}`
                    : ""}
                </span>
              </div>
              {selectedBlock.minerAddress && (
                <div className="flex justify-between py-3 gap-4 border-b border-white/10">
                  <span className="text-[#A0A0B0] flex-shrink-0">REWARD ADDR</span>
                  <a
                    href={officialExplorerAddressUrl(selectedBlock.minerAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-right text-[11px] text-[#00E5FF] break-all hover:underline"
                  >
                    {selectedBlock.minerAddress.slice(0, 14)}…
                    {selectedBlock.minerAddress.slice(-10)}
                  </a>
                </div>
              )}
              <div className="flex justify-between py-3 border-b border-white/10">
                <span className="text-[#A0A0B0]">TIME SINCE</span>
                <span className="font-mono">{Math.floor((Date.now() - selectedBlock.timestamp) / 1000)} seconds ago</span>
              </div>
              {selectedBlock.id && (
                <div className="flex justify-between py-3 gap-4">
                  <span className="text-[#A0A0B0] flex-shrink-0">BLOCK ID</span>
                  <span className="font-mono text-right text-[11px] text-[#A0A0B0] break-all">
                    {selectedBlock.id.slice(0, 16)}…{selectedBlock.id.slice(-8)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-9 flex flex-col gap-2">
              <a
                href={
                  selectedBlock.id
                    ? sigmaBlockUrl(selectedBlock.id)
                    : `https://sigmaspace.io/en/blocks`
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={async (e) => {
                  if (!selectedBlock.id) {
                    e.preventDefault();
                    try {
                      await openBlockOnSigmaSpace(
                        selectedBlock.height,
                        effectiveNodeUrl,
                        undefined,
                        apiHeaders
                      );
                    } catch {
                      toast.error("Could not resolve block on SigmaSpace");
                    }
                  }
                }}
                className="w-full py-4 rounded-2xl bg-[#FF7A3D] text-black text-sm font-semibold tracking-widest hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                OPEN ON SIGMASPACE <ExternalLink size={14} />
              </a>
              {selectedBlock.id && (
                <a
                  href={officialExplorerBlockUrl(selectedBlock.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 rounded-2xl border border-white/20 text-sm font-mono tracking-widest hover:bg-white/5 active:bg-white/10 transition-all flex items-center justify-center gap-2 text-[#E8E8F0]"
                >
                  OFFICIAL EXPLORER <ExternalLink size={14} />
                </a>
              )}
            </div>

            <button 
              onClick={() => setSelectedBlock(null)}
              className="mt-3 w-full py-4 rounded-2xl border border-white/20 text-sm font-mono tracking-widest hover:bg-white/5 active:bg-white/10 transition-all"
            >
              CLOSE PREVIEW
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
