"use client";

import { motion } from 'framer-motion';
import { NodeInfo } from '../types/ergo';
import { Clock, Users, Zap, TrendingUp } from 'lucide-react';

interface MetricsProps {
  info: NodeInfo | null;
  mempoolSize: number;
  isOnline: boolean;
  /** Mean inter-block time in seconds (from node headers), or null while loading */
  avgBlockTime: number | null;
  /** How many intervals went into the average */
  avgBlockSamples?: number;
  /** Header window requested (e.g. 100) */
  avgBlockWindow?: number;
}

function MetricCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  accent = false 
}: { 
  icon: any; 
  label: string; 
  value: string | number; 
  subValue?: string; 
  accent?: boolean;
}) {
  return (
    <div className="card glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 flex flex-col justify-between min-h-[112px] sm:min-h-[138px]">
      <div className="flex items-center justify-between gap-2">
        <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl ${accent ? 'bg-[#FF7A3D]/10' : 'bg-white/5'}`}>
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${accent ? 'text-[#FF7A3D]' : 'text-[#A0A0B0]'}`} />
        </div>
        {subValue && (
          <div className="text-[9px] sm:text-[10px] font-mono tracking-[1px] sm:tracking-[1.5px] text-[#A0A0B0] text-right leading-tight">
            {subValue}
          </div>
        )}
      </div>
      
      <div>
        <div className={`metric-value text-2xl sm:text-4xl font-semibold tracking-tighter mt-2 sm:mt-3 mb-0.5 sm:mb-1 ${accent ? 'text-[#FF7A3D]' : 'text-white'}`}>
          {value}
        </div>
        <div className="text-[10px] sm:text-xs font-mono tracking-[0.5px] sm:tracking-[1px] text-[#A0A0B0] leading-tight">
          {label}
        </div>
      </div>
    </div>
  );
}

export default function MetricsCards({
  info,
  mempoolSize,
  isOnline,
  avgBlockTime,
  avgBlockSamples = 0,
  avgBlockWindow = 100,
}: MetricsProps) {
  const syncProgress = info 
    ? Math.min(100, Math.round((info.headersHeight / (info.maxPeerHeight || info.headersHeight)) * 100)) 
    : 0;

  const avgSub =
    avgBlockTime != null && avgBlockSamples > 0
      ? `LAST ${avgBlockWindow} · ${avgBlockSamples} Δ`
      : avgBlockTime != null
        ? `LAST ${avgBlockWindow}`
        : "FROM NODE…";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      <MetricCard 
        icon={Clock} 
        label="AVG BLOCK TIME" 
        value={avgBlockTime != null ? `${avgBlockTime}s` : "—"} 
        subValue={avgSub}
      />
      
      <MetricCard 
        icon={Users} 
        label="MY P2P SESSIONS" 
        value={info?.peersCount || 0} 
        subValue={isOnline ? "LIVE" : "OFFLINE"}
        accent={isOnline}
      />
      
      <MetricCard 
        icon={Zap} 
        label="MEMPOOL SIZE" 
        value={mempoolSize} 
        subValue="UNCONFIRMED"
      />
      
      <div className="card glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 flex flex-col justify-between min-h-[112px] sm:min-h-[138px]">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white/5">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#A0A0B0]" />
          </div>
          <div className="text-[9px] sm:text-[10px] font-mono tracking-[1.5px] text-[#A0A0B0]">SYNC</div>
        </div>
        
        <div>
          <div className="flex items-baseline gap-2">
            <div className="metric-value text-2xl sm:text-4xl font-semibold tracking-tighter text-white">
              {syncProgress}
              <span className="text-lg sm:text-2xl text-[#A0A0B0]">%</span>
            </div>
          </div>
          <div className="text-[10px] sm:text-xs font-mono tracking-[0.5px] sm:tracking-[1px] text-[#A0A0B0] mb-2">
            HEADERS / NETWORK
          </div>
          
          {/* Beautiful progress bar */}
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
            <motion.div 
              className="h-full bg-gradient-to-r from-[#FF7A3D] to-[#00E5FF] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${syncProgress}%` }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
