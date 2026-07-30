"use client";

import type { ComponentType } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { NodeInfo } from "../types/ergo";
import { Clock, Users, Zap, TrendingUp } from "lucide-react";

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

type Tone = "orange" | "cyan" | "teal" | "violet" | "emerald";

const TONE_CLASS: Record<Tone, string> = {
  orange: "lumen-glow-panel--orange",
  cyan: "lumen-glow-panel--cyan",
  teal: "lumen-glow-panel--teal",
  violet: "lumen-glow-panel--violet",
  emerald: "lumen-glow-panel--emerald",
};

function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone = "cyan",
  live,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subValue?: string;
  tone?: Tone;
  live?: boolean;
}) {
  return (
    <div
      className={`lumen-glow-panel lumen-glow-panel--metric ${TONE_CLASS[tone]} rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 flex flex-col justify-between`}
    >
      <span className="lumen-glow-orb lumen-glow-orb--a" aria-hidden />
      <span className="lumen-glow-orb lumen-glow-orb--b" aria-hidden />

      <div className="flex items-center justify-between gap-2">
        <div className="lumen-glow-icon p-2 sm:p-3">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        {subValue && (
          <div className="flex items-center gap-1.5 min-w-0">
            {live && <span className="lumen-glow-pulse shrink-0" />}
            <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.12em] sm:tracking-[0.14em] text-[#8B8B9A] text-right leading-tight uppercase truncate">
              {subValue}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 sm:mt-3">
        <div className="lumen-glow-value metric-value text-2xl sm:text-4xl font-semibold tracking-tighter mb-0.5 sm:mb-1">
          {value}
        </div>
        <div className="text-[10px] sm:text-xs font-mono tracking-[0.08em] sm:tracking-[0.1em] text-[#7A7A88] leading-tight uppercase">
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
  const reduceMotion = useReducedMotion();
  const syncProgress = info
    ? Math.min(
        100,
        Math.round(
          (info.headersHeight / (info.maxPeerHeight || info.headersHeight)) *
            100
        )
      )
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
        tone="orange"
      />

      <MetricCard
        icon={Users}
        label="MY P2P SESSIONS"
        value={info?.peersCount || 0}
        subValue={isOnline ? "LIVE" : "OFFLINE"}
        tone={isOnline ? "emerald" : "violet"}
        live={isOnline}
      />

      <MetricCard
        icon={Zap}
        label="MEMPOOL SIZE"
        value={mempoolSize}
        subValue="UNCONFIRMED"
        tone="cyan"
      />

      <div className="lumen-glow-panel lumen-glow-panel--metric lumen-glow-panel--violet rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 flex flex-col justify-between">
        <span className="lumen-glow-orb lumen-glow-orb--a" aria-hidden />
        <span className="lumen-glow-orb lumen-glow-orb--b" aria-hidden />

        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="lumen-glow-icon p-2 sm:p-3">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.14em] text-[#8B8B9A] uppercase">
            Sync
          </div>
        </div>

        <div>
          <div className="flex items-baseline gap-1">
            <div className="lumen-glow-value metric-value text-2xl sm:text-4xl font-semibold tracking-tighter">
              {syncProgress}
            </div>
            <span className="text-lg sm:text-2xl font-mono text-[#5C5C6A]">
              %
            </span>
          </div>
          <div className="text-[10px] sm:text-xs font-mono tracking-[0.08em] text-[#7A7A88] mb-2 uppercase">
            Headers / network
          </div>

          <div className="lumen-glow-track mt-1">
            <motion.div
              className="lumen-glow-bar"
              style={{
                background:
                  "linear-gradient(90deg, #FF7A3D, #00E5FF, #A78BFA)",
                boxShadow:
                  "0 0 14px rgba(0,229,255,0.45), 0 0 10px rgba(255,122,61,0.35)",
              }}
              initial={reduceMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: Math.min(1, Math.max(0, syncProgress / 100)) }}
              transition={{
                duration: reduceMotion ? 0 : 0.22,
                ease: [0.23, 1, 0.32, 1],
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
