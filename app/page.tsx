"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  RefreshCw, Zap,
  ExternalLink,
  MoreHorizontal, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

import Constellation3D from './components/Constellation3D';
import MetricsCards from './components/MetricsCards';
import OracleOperatorsLive from './components/OracleOperatorsLive';
import BlocksTimeline from './components/BlocksTimeline';
import MempoolFlow from './components/MempoolFlow';
import type { OraclesApiResponse } from './oracles/components/types';
import ConnectionSettings from './components/ConnectionSettings';
import ConnectNodeInvite, {
  wakeConnectInvite,
} from './components/ConnectNodeInvite';
import CrystalIcon from './components/CrystalIcon';
import LumenPageBody from './components/LumenPageBody';
import LumenPageHero from './components/LumenPageHero';
import LumenWordmark from './components/LumenWordmark';
import { SoftLink } from './components/soft-nav';
import VizCrossfade from './components/VizCrossfade';
import VizModeToggle, { softSetViewMode } from './components/VizModeToggle';
import {
  HeaderActions,
  HeaderIconButton,
  HeaderPill,
} from './components/HeaderChrome';
import type { NodeInfo, Peer, RecentBlock } from './types/ergo';
import {
  openAddressOnSigmaSpace,
  openBlockOnSigmaSpace,
  officialExplorerBlockUrl,
  sigmaBlockUrl,
} from './lib/explorer';
import ExternalOpenConfirm from './components/ExternalOpenConfirm';
import {
  fetchAvgBlockTime,
  fetchBlockDetails,
  fetchRecentBlocks,
} from './lib/blocks';
import {
  enrichBlocksWithMiners,
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
  const [viewMode, setViewMode] = useState<'constellation' | 'map'>('constellation');
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  /** Hide floating Boom/Refresh when any full-screen modal is open */
  const isAnyModalOpen = settingsModalOpen;
  /** Mobile header: compact menu */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpenKey, setSettingsOpenKey] = useState(0);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

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

  /** Public oracle pools — operator online counts for dashboard panel */
  const {
    data: oraclesLive,
    isLoading: oraclesLiveLoading,
    isError: oraclesLiveError,
    isFetching: oraclesLiveFetching,
  } = useQuery({
    queryKey: ["oracles-dashboard-live"],
    queryFn: async (): Promise<OraclesApiResponse> => {
      const res = await fetch("/api/oracles?mode=network", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`oracles ${res.status}`);
      return res.json();
    },
    refetchInterval: 8_000,
    staleTime: 5_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
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
          // Always show miner in the list (Explorer bulk enrich — not only on click)
          void enrichBlocksWithMiners(blocks)
            .then((enriched) => {
              if (!cancelled) setRecentBlocks(enriched);
            })
            .catch(() => {
              /* explorer optional */
            });
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
        ? "Reconnecting via lumen bridge..."
        : "Reconnecting to Ergo node...",
      { id: "reconnect" }
    );
    setTimeout(() => toast.dismiss('reconnect'), 1400);
  };

  // === BLOCK DETAIL MODAL (simple beautiful) ===
  const [selectedBlock, setSelectedBlock] = useState<RecentBlock | null>(null);
  /** External leave-confirm for block detail (SigmaSpace / explorer / address) */
  const [blockExt, setBlockExt] = useState<null | {
    kind: "sigma" | "explorer" | "address";
    detail: string;
    url?: string;
  }>(null);
  const [blockExtBusy, setBlockExtBusy] = useState(false);

  /** Open block preview; backfill honest miner from Explorer if missing */
  const openBlockDetail = (block: RecentBlock) => {
    wakeConnectInvite();
    setSelectedBlock(block);
    setBlockExt(null);
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

  const confirmBlockExternal = useCallback(async () => {
    if (!blockExt || !selectedBlock) return;
    setBlockExtBusy(true);
    try {
      if (blockExt.kind === "address" && selectedBlock.minerAddress) {
        openAddressOnSigmaSpace(selectedBlock.minerAddress);
      } else if (blockExt.kind === "explorer" && blockExt.url) {
        window.open(blockExt.url, "_blank", "noopener,noreferrer");
      } else if (blockExt.kind === "sigma") {
        if (selectedBlock.id) {
          window.open(
            sigmaBlockUrl(selectedBlock.id),
            "_blank",
            "noopener,noreferrer"
          );
        } else {
          await openBlockOnSigmaSpace(
            selectedBlock.height,
            effectiveNodeUrl,
            undefined,
            apiHeaders
          );
        }
      }
      setBlockExt(null);
    } catch {
      toast.error("Could not open external page");
    } finally {
      setBlockExtBusy(false);
    }
  }, [blockExt, selectedBlock, effectiveNodeUrl, apiHeaders]);

  const effectivePeers = peers;
  const effectiveInfo = nodeInfo;

  return (
    <div className="min-h-screen min-h-dvh bg-[#0A0A0F] text-[#E8E8F0] overflow-x-hidden">
      {/* === HERO / TOP BAR === */}
      <div className="vt-lumen-header border-b border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          {/* ── Mobile header: one row — logo left · LIVE + ··· right ── */}
          <div className="sm:hidden flex items-center justify-between gap-2 min-w-0">
            <div className="vt-lumen-brand-mobile flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-black" />
              </div>
              <div className="min-w-0">
                <div className="tracking-[-0.5px] text-xl leading-none truncate">
                  <LumenWordmark />
                </div>
                <div className="text-[8px] text-[#A0A0B0] mt-0.5 font-mono tracking-[1.5px] truncate">
                  Ergo Node Dashboard
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-1.5 shrink-0"
              ref={mobileMenuRef}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen((v) => !v);
                    wakeConnectInvite();
                  }}
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
                      <SoftLink
                        href="/oracles"
                        role="menuitem"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          wakeConnectInvite();
                        }}
                        onMouseEnter={() => {
                          void fetch("/api/oracles", { cache: "default" }).catch(
                            () => {}
                          );
                          wakeConnectInvite();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-[11px] font-mono tracking-widest text-[#E8E8F0] hover:bg-white/[0.06] transition-colors"
                      >
                        <CrystalIcon className="w-3.5 h-3.5 text-[#E8C547] shrink-0" />
                        ORACLES
                      </SoftLink>
                      <div className="h-px bg-white/[0.06]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setSettingsOpenKey((k) => k + 1);
                          wakeConnectInvite();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-[11px] font-mono tracking-widest text-[#E8E8F0] hover:bg-white/[0.06] transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#A0A0B0] shrink-0" />
                        SETTINGS
                      </button>
                      <div className="h-px bg-white/[0.06]" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleReconnect();
                          wakeConnectInvite();
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

            {/* Hidden triggers — settings modal only */}
            <div className="hidden">
              <ConnectionSettings
                isOnline={isOnline}
                onReconnect={handleReconnect}
                onOpenChange={(open) => {
                  setSettingsModalOpen(open);
                  if (open) wakeConnectInvite();
                }}
                nodeMode={nodeMode}
                setNodeMode={setNodeMode}
                bridgeToken={bridgeToken}
                setBridgeToken={setBridgeToken}
                bridgeStatus={bridgeStatus}
                bridgeStatusLoading={bridgeStatusLoading}
                onRefreshBridgeStatus={onRefreshBridgeStatus}
                hideTrigger
                openKey={settingsOpenKey}
              />
            </div>
          </div>

          {/* ── Desktop header ── */}
          <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div className="vt-lumen-brand-desktop flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <div className="min-w-0">
                <div className="tracking-[-0.5px] text-3xl leading-none">
                  <LumenWordmark />
                </div>
                <div className="text-[10px] text-[#A0A0B0] mt-0.5 font-mono tracking-[3px] truncate">
                  Ergo Node Dashboard
                </div>
              </div>
            </div>

            <HeaderActions>
              <HeaderPill
                as="link"
                href="/oracles"
                tone="gold"
                className="vt-lumen-nav-primary"
                title="ERG/USD & ERG/XAU oracle pools"
                onMouseEnter={() => {
                  void fetch("/api/oracles", { cache: "default" }).catch(
                    () => {}
                  );
                  wakeConnectInvite();
                }}
                onClick={() => wakeConnectInvite()}
              >
                <CrystalIcon className="w-3.5 h-3.5 shrink-0 opacity-95" />
                ORACLES
              </HeaderPill>

              <ConnectionSettings
                isOnline={isOnline}
                onReconnect={() => {
                  handleReconnect();
                  wakeConnectInvite();
                }}
                onOpenChange={(open) => {
                  setSettingsModalOpen(open);
                  if (open) wakeConnectInvite();
                }}
                nodeMode={nodeMode}
                setNodeMode={setNodeMode}
                bridgeToken={bridgeToken}
                setBridgeToken={setBridgeToken}
                bridgeStatus={bridgeStatus}
                bridgeStatusLoading={bridgeStatusLoading}
                onRefreshBridgeStatus={onRefreshBridgeStatus}
                openKey={settingsOpenKey}
              />

              <HeaderIconButton
                onClick={() => {
                  handleReconnect();
                  wakeConnectInvite();
                }}
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4" />
              </HeaderIconButton>
            </HeaderActions>
          </div>
        </div>
      </div>

      {/* Body only — VT + enter motion; header frozen */}
      <LumenPageBody>
      <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-12 sm:pb-16">
        <LumenPageHero
          kicker="ERGO NODE VISUALIZER"
          kickerClassName="text-[#FF7A3D]"
          title="The living network."
          subtitle="Your node. Your peers. Real-time beauty."
          invite={
            nodeMode === "lumen" ? (
              <ConnectNodeInvite
                enabled
                delayMs={5000}
                onOpenSettings={() => setSettingsOpenKey((k) => k + 1)}
              />
            ) : null
          }
          badges={
            <>
              <span
                title={
                  isOnline
                    ? nodeMode === "my"
                      ? "Live — your node via bridge"
                      : "Live — source lumen"
                    : nodeMode === "my"
                      ? "Offline — bridge / node"
                      : "Offline — source lumen"
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
                {nodeMode === "my" ? "SOURCE · BRIDGE" : "SOURCE · lumen"}
                {isOnline && (
                  <span className="text-[9px] tracking-[0.14em] opacity-80">
                    LIVE
                  </span>
                )}
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
            </>
          }
          footer={
            nodeMode === "my" && !isOnline ? (
              <p className="mt-3 text-[11px] sm:text-sm font-mono tracking-wide text-[#F59E0B] max-w-xl">
                {bridgeToken
                  ? bridgeOnline
                    ? "Bridge is online but node data is not ready yet — check Ergo REST on the agent side."
                    : "My Node mode: Bridge offline. Open NODE SETTINGS → run the Bridge command next to your node."
                  : "My Node mode: no Bridge token. Open NODE SETTINGS → Connect my node."}
              </p>
            ) : null
          }
        />

        {/* Mode switcher + heights — same mb-4 → viz as before */}
        <div className="mb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-6">
          <div className="hidden md:flex items-center gap-2 min-w-0">
            <VizModeToggle
              mode={viewMode}
              onChange={(m) => {
                softSetViewMode(m, setViewMode);
                wakeConnectInvite();
              }}
            />
            <span className="text-[10px] font-mono text-[#A0A0B0]/60 tracking-widest">
              {viewMode === 'map'
                ? 'PEERS BY GEOIP · CITY-LEVEL ACCURACY'
                : 'NETWORK ORBIT · EARTH CORE · ORBITAL PEERS'}
            </span>
          </div>

          <div className="flex items-end justify-end gap-3 sm:gap-6 text-sm shrink-0 self-end md:self-auto">
            <div className="text-right">
              <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest font-mono">
                HEADERS
              </div>
              <div className="font-mono text-3xl sm:text-5xl tracking-[-1.5px] tabular-nums text-white mt-0.5 leading-none">
                {(effectiveInfo?.headersHeight || 0).toLocaleString()}
              </div>
            </div>
            <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest self-end pb-1.5 sm:pb-2 font-mono">
              /
            </div>
            <div className="text-right">
              <div className="text-[#A0A0B0] text-[10px] sm:text-xs tracking-widest font-mono">
                FULL HEIGHT
              </div>
              <div className="font-mono text-3xl sm:text-5xl tracking-[-1.5px] tabular-nums text-[#FF7A3D] mt-0.5 leading-none">
                {(effectiveInfo?.fullHeight || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <VizCrossfade
          mode={viewMode}
          orbit={
            <Constellation3D
              key={`3d-${nodeMode}-${bridgeToken || "lumen"}`}
              peers={effectivePeers}
              myNodeHeight={
                effectiveInfo?.fullHeight ||
                effectiveInfo?.headersHeight ||
                0
              }
              isOnline={isOnline}
              lastBlockHeight={
                lastBlockHeight || (effectiveInfo?.fullHeight || 0)
              }
              hideControls={isAnyModalOpen}
              centerLabel={nodeMode === "my" ? "My Node" : "lumen node"}
            />
          }
          map={
            <PeerMap
              blockHeight={
                lastBlockHeight ||
                effectiveInfo?.fullHeight ||
                effectiveInfo?.headersHeight ||
                0
              }
              lastBlockAt={recentBlocks[0]?.timestamp ?? null}
              hideControls={isAnyModalOpen}
              nodeMode={nodeMode}
              bridgeToken={bridgeToken}
            />
          }
        />

        {/* === VIEW TOGGLE (mobile: BELOW viz) === */}
        <div className="md:hidden mb-8 space-y-2">
          <VizModeToggle
            compact
            mode={viewMode}
            onChange={(m) => {
              softSetViewMode(m, setViewMode);
              wakeConnectInvite();
            }}
          />
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

        {/* === ORACLE OPERATORS ONLINE === */}
        <div className="mb-8">
          <OracleOperatorsLive
            data={oraclesLive}
            isLoading={oraclesLiveLoading}
            isError={oraclesLiveError}
            isFetching={oraclesLiveFetching}
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
      </LumenPageBody>

      {/* === BLOCK DETAIL MODAL — same glow language as dashboard panels === */}
      {selectedBlock && (
        <div
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-[6px] p-0 sm:p-6"
          onClick={() => {
            if (blockExt) return;
            setSelectedBlock(null);
          }}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="lumen-glow-panel lumen-glow-panel--orange max-w-md w-full rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-white/[0.1] max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="lumen-glow-orb lumen-glow-orb--a" aria-hidden />
            <span className="lumen-glow-orb lumen-glow-orb--b" aria-hidden />

            <div className="lumen-glow-kicker mb-2 flex items-center gap-2">
              <span className="lumen-glow-pulse" />
              Block #{selectedBlock.height}
            </div>
            <div
              className="lumen-glow-value text-5xl sm:text-6xl font-semibold tracking-tighter tabular-nums mb-6"
              style={{
                color: "var(--lumen-accent)",
                textShadow:
                  "0 0 28px color-mix(in srgb, var(--lumen-glow) 70%, transparent)",
              }}
            >
              {selectedBlock.height.toLocaleString()}
            </div>

            <div className="lumen-glow-inset divide-y divide-white/[0.06] text-sm">
              <div className="flex justify-between gap-4 px-3.5 py-3">
                <span className="text-[#7A7A88] text-[11px] font-mono tracking-[0.12em] uppercase">
                  Confirmed
                </span>
                <span className="font-mono text-right text-[#E8E8F0]">
                  {new Date(selectedBlock.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between gap-4 px-3.5 py-3">
                <span className="text-[#7A7A88] text-[11px] font-mono tracking-[0.12em] uppercase">
                  Transactions
                </span>
                <span
                  className="font-mono text-xl tracking-tighter tabular-nums"
                  style={{ color: "var(--lumen-accent)" }}
                >
                  {selectedBlock.txCount}
                </span>
              </div>
              <div className="flex justify-between gap-4 px-3.5 py-3">
                <span className="text-[#7A7A88] text-[11px] font-mono tracking-[0.12em] uppercase shrink-0">
                  Miner
                </span>
                <span className="font-mono text-right text-[#E8E8F0] text-[13px]">
                  {selectedBlock.minerLabel || "—"}
                  {selectedBlock.minerShort
                    ? ` · ${selectedBlock.minerShort}`
                    : ""}
                </span>
              </div>
              {selectedBlock.minerAddress && (
                <div className="flex justify-between gap-4 px-3.5 py-3 items-center">
                  <span className="text-[#7A7A88] text-[11px] font-mono tracking-[0.12em] uppercase shrink-0">
                    Reward addr
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setBlockExt({
                        kind: "address",
                        detail: selectedBlock.minerAddress!,
                      })
                    }
                    className="font-mono text-right text-[11px] text-[#00E5FF] break-all hover:underline max-w-[60%]"
                  >
                    {selectedBlock.minerAddress.slice(0, 12)}…
                    {selectedBlock.minerAddress.slice(-8)}
                  </button>
                </div>
              )}
              <div className="flex justify-between gap-4 px-3.5 py-3">
                <span className="text-[#7A7A88] text-[11px] font-mono tracking-[0.12em] uppercase">
                  Time since
                </span>
                <span className="font-mono text-[#A0A0B0]">
                  {Math.floor(
                    (Date.now() - selectedBlock.timestamp) / 1000
                  )}{" "}
                  s ago
                </span>
              </div>
              {selectedBlock.id && (
                <div className="flex justify-between gap-4 px-3.5 py-3">
                  <span className="text-[#7A7A88] text-[11px] font-mono tracking-[0.12em] uppercase shrink-0">
                    Block id
                  </span>
                  <span className="font-mono text-right text-[11px] text-[#6B6B78] break-all max-w-[60%]">
                    {selectedBlock.id.slice(0, 14)}…{selectedBlock.id.slice(-8)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() =>
                  setBlockExt({
                    kind: "sigma",
                    detail: selectedBlock.id
                      ? selectedBlock.id
                      : `height ${selectedBlock.height.toLocaleString()}`,
                  })
                }
                className="w-full h-12 rounded-xl border border-[#FF7A3D]/40 bg-[#FF7A3D]/[0.14] text-[11px] font-mono tracking-[0.16em] uppercase text-[#FFD4BE] hover:bg-[#FF7A3D]/[0.22] transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,122,61,0.18)]"
              >
                Open on SigmaSpace <ExternalLink size={14} />
              </button>
              {selectedBlock.id && (
                <button
                  type="button"
                  onClick={() =>
                    setBlockExt({
                      kind: "explorer",
                      detail: selectedBlock.id!,
                      url: officialExplorerBlockUrl(selectedBlock.id!),
                    })
                  }
                  className="w-full h-11 rounded-xl border border-white/[0.1] bg-white/[0.03] text-[11px] font-mono tracking-[0.14em] uppercase text-[#A0A0B0] hover:text-white hover:border-white/20 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  Official explorer <ExternalLink size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBlockExt(null);
                  setSelectedBlock(null);
                }}
                className="w-full h-11 rounded-xl border border-white/[0.08] text-[11px] font-mono tracking-[0.14em] uppercase text-[#6B6B78] hover:text-white hover:bg-white/[0.04] transition-all"
              >
                Stay
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ExternalOpenConfirm
        open={!!blockExt && !!selectedBlock}
        accent={blockExt?.kind === "explorer" ? "cyan" : blockExt?.kind === "address" ? "teal" : "orange"}
        title={
          blockExt?.kind === "explorer"
            ? "Open official explorer?"
            : blockExt?.kind === "address"
              ? "Open on SigmaSpace?"
              : "Open on SigmaSpace?"
        }
        subtitle="Leaves lumen · opens a new tab"
        badge={
          blockExt?.kind === "address"
            ? "ADDR"
            : blockExt?.kind === "explorer"
              ? "EXPLORER"
              : "BLOCK"
        }
        badgeColor={
          blockExt?.kind === "explorer"
            ? "#00E5FF"
            : blockExt?.kind === "address"
              ? "#2DD4BF"
              : "#FF7A3D"
        }
        meta={
          selectedBlock
            ? `#${selectedBlock.height.toLocaleString()}`
            : undefined
        }
        detail={blockExt?.detail || ""}
        hostLabel={
          blockExt?.kind === "explorer"
            ? "explorer.ergoplatform.com"
            : "sigmaspace.io"
        }
        busy={blockExtBusy}
        onCancel={() => {
          if (!blockExtBusy) setBlockExt(null);
        }}
        onConfirm={() => void confirmBlockExternal()}
      />
    </div>
  );
}
