"use client";

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Play, Pause, RefreshCw, Zap, Users, Clock, 
  ArrowRight, ExternalLink, Orbit, Globe2
} from 'lucide-react';
import { toast } from 'sonner';

import Constellation3D from './components/Constellation3D';
import MetricsCards from './components/MetricsCards';
import BlocksTimeline from './components/BlocksTimeline';
import MempoolFlow from './components/MempoolFlow';
import ConnectionSettings from './components/ConnectionSettings';
import ShareCard from './components/ShareCard';
import type { NodeInfo, Peer, RecentBlock, UnconfirmedTx } from './types/ergo';
import { openBlockOnSigmaSpace, sigmaBlockUrl } from './lib/explorer';
import {
  fetchAvgBlockTime,
  fetchBlockDetails,
  fetchRecentBlocks,
} from './lib/blocks';

/** Headers window for AVG BLOCK TIME (matches MetricsCards sublabel). */
const AVG_BLOCK_WINDOW = 100;

// Leaflet needs browser APIs — no SSR
const PeerMap = dynamic(() => import('./components/PeerMap'), {
  ssr: false,
  loading: () => (
    <div className="canvas-container aether-viz relative w-full flex items-center justify-center font-mono text-xs tracking-[3px] text-[#A0A0B0]">
      LOADING MAP…
    </div>
  ),
});

// Same-origin proxy → server talks to local Ergo (works via SSH tunnel).
// Direct URL e.g. http://127.0.0.1:9053 still works if browser can reach it.
const DEFAULT_NODE_URL = '/api/node';

export default function AetherDashboard() {
  const [nodeUrl, setNodeUrl] = useState(DEFAULT_NODE_URL);
  const [isDemoMode, setIsDemoMode] = useState(false);
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

  // Load saved URL from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('aether-node-url');
    if (saved) setNodeUrl(saved);
  }, []);

  // Public Mode status from server password file (.aether-public-password)
  const refreshPublicMode = async () => {
    try {
      const res = await fetch('/api/public-status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setPublicMode(!!data.publicMode);
    } catch {
      // offline / first paint — leave as-is
    }
  };

  useEffect(() => {
    void refreshPublicMode();
  }, []);

  // === REAL NODE DATA ===
  const { data: nodeInfo, isLoading: infoLoading, refetch: refetchInfo, isError: infoError } = useQuery({
    queryKey: ['nodeInfo', nodeUrl],
    queryFn: async (): Promise<NodeInfo> => {
      if (isDemoMode) throw new Error('demo');
      const res = await fetch(`${nodeUrl}/info`, { 
        signal: AbortSignal.timeout(6500),
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Node unreachable');
      return res.json();
    },
    enabled: !isDemoMode,
    refetchInterval: 7500,
  });

  const { data: peers = [], refetch: refetchPeers } = useQuery({
    queryKey: ['peers', nodeUrl],
    queryFn: async (): Promise<Peer[]> => {
      if (isDemoMode) return generateDemoPeers();
      // Ergo has no bare /peers — use connected peers list
      const res = await fetch(`${nodeUrl}/peers/connected`, { signal: AbortSignal.timeout(6500) });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isDemoMode,
    refetchInterval: 14000,
  });

  const { data: mempoolData, refetch: refetchMempool } = useQuery({
    queryKey: ['mempool', nodeUrl],
    queryFn: async () => {
      if (isDemoMode) return { size: 47, txs: generateDemoTxs(47) };
      const res = await fetch(`${nodeUrl}/transactions/unconfirmed`, { signal: AbortSignal.timeout(6500) });
      if (!res.ok) return { size: 0, txs: [] };
      const txs: any[] = await res.json();
      return { size: txs.length, txs: txs.slice(0, 24).map(t => ({ id: t.id })) };
    },
    enabled: !isDemoMode,
    refetchInterval: 8500,
  });

  const isOnline = !!nodeInfo && !infoError && !isDemoMode;
  const currentHeight = nodeInfo?.fullHeight || nodeInfo?.headersHeight || 0;
  const mempoolSize = mempoolData?.size || 0;
  const mempoolTxs = mempoolData?.txs || [];

  // === DEMO DATA GENERATOR (beautiful fallback) ===
  function generateDemoPeers(): Peer[] {
    const demoAddresses = [
      "88.198.13.202:9030", "95.217.208.169:9030", "65.21.132.88:9030",
      "162.55.184.53:9030", "135.181.103.87:9030", "94.130.23.58:9030",
      "37.27.82.11:9030", "116.202.17.145:9030", "195.201.87.169:9030",
      "49.13.63.112:9030", "142.132.202.86:9030", "167.235.249.48:9030",
    ];
    return demoAddresses.map((addr, i) => ({
      address: addr,
      lastMessage: Math.floor(Date.now() / 1000) - (i % 3 === 0 ? 380 : Math.floor(Math.random() * 95)),
    }));
  }

  function generateDemoTxs(count: number): UnconfirmedTx[] {
    return Array.from({ length: count }, (_, i) => ({
      id: Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join(''),
    }));
  }

  function generateDemoBlocks(baseHeight: number): RecentBlock[] {
    const now = Date.now();
    return Array.from({ length: 9 }, (_, i) => ({
      height: baseHeight - i,
      timestamp: now - (i * 118000) - Math.random() * 8000,
      txCount: 12 + Math.floor(Math.random() * 31),
    }));
  }

  // === DEMO MODE HANDLER ===
  const toggleDemoMode = () => {
    const nextDemo = !isDemoMode;
    setIsDemoMode(nextDemo);
    
    if (nextDemo) {
      // Beautiful demo data
      const demoHeight = 1284792;
      setLastBlockHeight(demoHeight);
      setRecentBlocks(generateDemoBlocks(demoHeight));
      setAvgBlockTime(118);
      setAvgBlockSamples(0);
      toast.success('Demo mode activated', { 
        description: 'Immersive experience with simulated live data' 
      });
    } else {
      setRecentBlocks([]);
      setLastBlockHeight(0);
      setAvgBlockTime(null);
      setAvgBlockSamples(0);
      refetchInfo();
      toast.info('Switched to real node connection');
    }
  };

  // === INITIAL + LIVE BLOCKS (real tx counts from node) ===
  //
  // Source of truth:
  //   GET /blocks/at/{height}  → header id
  //   GET /blocks/{id}/transactions → { transactions: [...] }
  //   txCount = transactions.length  (NOT random!)
  //
  useEffect(() => {
    if (!currentHeight || isDemoMode) return;

    let cancelled = false;

    const loadInitial = async () => {
      // First connect or reconnect: pull last 9 blocks with real counts
      if (lastBlockHeight === 0 || recentBlocks.length === 0) {
        const blocks = await fetchRecentBlocks(nodeUrl, currentHeight, 9);
        if (cancelled) return;
        if (blocks.length) {
          setRecentBlocks(blocks);
          setLastBlockHeight(currentHeight);
        } else {
          setLastBlockHeight(currentHeight);
        }
        // Real avg from last N headers (one node request)
        const avg = await fetchAvgBlockTime(nodeUrl, AVG_BLOCK_WINDOW);
        if (!cancelled && avg) {
          setAvgBlockTime(avg.avgSeconds);
          setAvgBlockSamples(avg.samples);
        }
        return;
      }

      // New tip height → append real block
      if (currentHeight > lastBlockHeight) {
        const prev = lastBlockHeight;
        setLastBlockHeight(currentHeight);

        // Fill any skipped heights (rare) with real data
        for (let h = prev + 1; h <= currentHeight; h++) {
          const block = await fetchBlockDetails(nodeUrl, h);
          if (cancelled) return;
          if (!block) continue;
          setRecentBlocks((list) => {
            if (list.some((b) => b.height === block.height)) return list;
            return [block, ...list].sort((a, b) => b.height - a.height).slice(0, 9);
          });
          // New-block toast: only PeerMap's dark Aether toast.custom (no sonner.success)
        }

        // Refresh avg block time on every new tip
        const avg = await fetchAvgBlockTime(nodeUrl, AVG_BLOCK_WINDOW);
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
  }, [currentHeight, isDemoMode, nodeUrl]);

  // === MANUAL RECONNECT ===
  const handleReconnect = () => {
    refetchInfo();
    refetchPeers();
    refetchMempool();
    // Refresh real avg block time from headers
    fetchAvgBlockTime(nodeUrl, AVG_BLOCK_WINDOW).then((avg) => {
      if (avg && !isDemoMode) {
        setAvgBlockTime(avg.avgSeconds);
        setAvgBlockSamples(avg.samples);
      }
    });
    toast.loading('Reconnecting to Ergo node...', { id: 'reconnect' });
    setTimeout(() => toast.dismiss('reconnect'), 1400);
  };

  // === BLOCK DETAIL MODAL (simple beautiful) ===
  const [selectedBlock, setSelectedBlock] = useState<RecentBlock | null>(null);

  /** Open block preview modal only — SigmaSpace is opened via button inside modal */
  const openBlockDetail = (block: RecentBlock) => {
    setSelectedBlock(block);
  };

  // === KEYBOARD SHORTCUTS HINT ===
  useEffect(() => {
    const hint = () => toast('Press F to focus • O to toggle orbit • B to simulate wave', { duration: 2800 });
    // Show once on load in demo
    if (isDemoMode) setTimeout(hint, 4200);
  }, [isDemoMode]);

  const effectivePeers = isDemoMode ? generateDemoPeers() : peers;
  const effectiveInfo = isDemoMode 
    ? { fullHeight: lastBlockHeight || 1284792, headersHeight: lastBlockHeight || 1284792, peersCount: effectivePeers.length, currentTime: Date.now() } as NodeInfo 
    : nodeInfo;

  return (
    <div className="min-h-screen min-h-dvh bg-[#0A0A0F] text-[#E8E8F0] overflow-x-hidden">
      {/* === HERO / TOP BAR === */}
      <div className="border-b border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1480px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#FF7A3D] via-[#FF7A3D] to-[#00E5FF] flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold tracking-[-0.5px] text-2xl sm:text-3xl leading-none">Aether</div>
                <div className="text-[9px] sm:text-[10px] text-[#A0A0B0] mt-0.5 font-mono tracking-[2px] sm:tracking-[3px] truncate">
                  THE LIVING PULSE OF YOUR ERGO NODE
                </div>
              </div>
            </div>
            {/* Compact status on mobile next to logo */}
            <div className={`sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl text-[10px] font-mono tracking-wider border flex-shrink-0 ${isOnline || isDemoMode ? 'border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]' : 'border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline || isDemoMode ? 'bg-[#10B981] status-dot' : 'bg-[#EF4444]'}`} />
              {isDemoMode ? 'DEMO' : isOnline ? 'LIVE' : 'OFF'}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-start sm:justify-end">
            {/* Status — desktop */}
            <div className={`hidden sm:flex items-center gap-2 px-4 lg:px-5 py-2 rounded-3xl text-sm font-mono tracking-widest border ${isOnline || isDemoMode ? 'border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]' : 'border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline || isDemoMode ? 'bg-[#10B981] status-dot' : 'bg-[#EF4444]'}`} />
              {isDemoMode ? 'DEMO MODE' : isOnline ? 'NODE LIVE' : 'NODE OFFLINE'}
            </div>

            {publicMode && (
              <div
                className="flex items-center gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-2xl sm:rounded-3xl text-[10px] sm:text-xs font-mono tracking-[2px] sm:tracking-[3px] border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]"
                title="Public password file is set — remote access requires auth"
              >
                PUBLIC
              </div>
            )}

            <ShareCard
              nodeInfo={isDemoMode ? effectiveInfo : nodeInfo}
              avgBlockTime={avgBlockTime}
              isOnline={isOnline || isDemoMode}
              publicMode={publicMode}
              mempoolSize={mempoolSize}
              onOpenChange={setShareModalOpen}
            />

            <ConnectionSettings 
              nodeUrl={nodeUrl} 
              setNodeUrl={setNodeUrl} 
              isOnline={isOnline} 
              onReconnect={handleReconnect}
              publicMode={publicMode}
              onPublicModeChange={(enabled) => {
                setPublicMode(enabled);
                void refreshPublicMode();
              }}
              onOpenChange={setSettingsModalOpen}
            />

            <button 
              onClick={toggleDemoMode}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 rounded-2xl sm:rounded-3xl glass border border-white/10 hover:border-[#FF7A3D]/40 text-[10px] sm:text-xs font-mono tracking-[1px] sm:tracking-[2px] transition-all active:scale-[0.985]"
            >
              {isDemoMode ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="hidden xs:inline sm:inline">{isDemoMode ? 'EXIT DEMO' : 'TRY DEMO'}</span>
              <span className="sm:hidden">{isDemoMode ? 'EXIT' : 'DEMO'}</span>
            </button>

            <button 
              onClick={handleReconnect}
              className="p-2.5 sm:p-3 rounded-2xl glass border border-white/10 hover:bg-white/5 transition-all active:scale-95"
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
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
                peers={effectivePeers}
                myNodeHeight={effectiveInfo?.fullHeight || effectiveInfo?.headersHeight || 0}
                isOnline={isOnline || isDemoMode}
                lastBlockHeight={lastBlockHeight || (effectiveInfo?.fullHeight || 0)}
                onPeerHover={setSelectedPeer}
                hideControls={isAnyModalOpen}
                onSimulateBlock={() => {
                  if ((window as any).__aetherSimulateBlock) {
                    (window as any).__aetherSimulateBlock();
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
            isOnline={isOnline || isDemoMode}
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
                      nodeUrl
                    );
                  } catch {
                    toast.error("Could not resolve block on SigmaSpace");
                  }
                }
              }}
              className="mt-9 w-full py-4 rounded-2xl bg-[#FF7A3D] text-black text-sm font-semibold tracking-widest hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              OPEN ON SIGMASPACE <ExternalLink size={14} />
            </a>

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
