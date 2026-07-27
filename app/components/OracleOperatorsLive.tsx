"use client";

/**
 * Dashboard panel — live oracle operator count.
 * Soft glass table, pool glows (teal USD / gold XAU), soft live pulse.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Radio } from "lucide-react";
import { SoftLink } from "./soft-nav";
import type { OracleFeedData, OraclesApiResponse } from "../oracles/components/types";

type Props = {
  data: OraclesApiResponse | undefined;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
};

function shortAddr(addr: string) {
  if (addr.length < 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function poolTheme(feed: OracleFeedData) {
  const gold = feed.id === "erg-xau" || feed.pair.includes("XAU");
  if (gold) {
    return {
      accent: "#C9A84C",
      glow: "rgba(201, 168, 76, 0.45)",
      soft: "rgba(201, 168, 76, 0.12)",
      bar: "linear-gradient(90deg, #A8872E, #E8D5A3)",
      label: "#E8D5A3",
    };
  }
  return {
    accent: "#2DD4BF",
    glow: "rgba(45, 212, 191, 0.42)",
    soft: "rgba(45, 212, 191, 0.12)",
    bar: "linear-gradient(90deg, #0D9488, #5EEAD4)",
    label: "#A7F3E8",
  };
}

function statusMeta(status: string) {
  if (status === "live")
    return { label: "LIVE", color: "#34D399", glow: "rgba(52, 211, 153, 0.55)" };
  if (status === "stale")
    return { label: "STALE", color: "#D4A574", glow: "rgba(212, 165, 116, 0.4)" };
  return { label: "OFF", color: "#F87171", glow: "rgba(248, 113, 113, 0.35)" };
}

function liveCount(feed: OracleFeedData): number {
  if (feed.activeOracles != null) return feed.activeOracles;
  return (feed.nodes || []).filter((n) => n.status === "live").length;
}

function totalCount(feed: OracleFeedData): number {
  if (feed.totalOracles != null) return feed.totalOracles;
  return feed.nodes?.length || 0;
}

export default function OracleOperatorsLive({
  data,
  isLoading,
  isError,
  isFetching,
}: Props) {
  const reduceMotion = useReducedMotion();
  const feeds = data?.feeds ?? [];

  const stats = useMemo(() => {
    const liveAddrs = new Set<string>();
    const allAddrs = new Set<string>();
    let activeSum = 0;
    let totalSum = 0;

    for (const feed of feeds) {
      activeSum += liveCount(feed);
      totalSum += totalCount(feed);
      for (const n of feed.nodes || []) {
        allAddrs.add(n.address);
        if (n.status === "live") liveAddrs.add(n.address);
      }
    }

    // Prefer unique addresses when nodes are present; else sum of pool actives
    const uniqueLive =
      liveAddrs.size > 0 ? liveAddrs.size : activeSum;
    const uniqueTotal =
      allAddrs.size > 0 ? allAddrs.size : totalSum || uniqueLive;

    // Showcase a few live operators (newest / first from API)
    const showcase: { address: string; pool: string; accent: string }[] = [];
    const seen = new Set<string>();
    for (const feed of feeds) {
      const th = poolTheme(feed);
      for (const n of feed.nodes || []) {
        if (n.status !== "live" || seen.has(n.address)) continue;
        seen.add(n.address);
        showcase.push({
          address: n.address,
          pool: feed.pair,
          accent: th.accent,
        });
        if (showcase.length >= 6) break;
      }
      if (showcase.length >= 6) break;
    }

    return { uniqueLive, uniqueTotal, activeSum, showcase };
  }, [feeds]);

  const empty = !isLoading && (isError || feeds.length === 0);

  return (
    <section
      className="lumen-glow-panel lumen-glow-panel--dual rounded-2xl sm:rounded-3xl"
      aria-label="Oracle operators online"
    >
      <span className="lumen-glow-orb lumen-glow-orb--a" aria-hidden />
      <span className="lumen-glow-orb lumen-glow-orb--b" aria-hidden />

      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4 sm:mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <span className="lumen-glow-icon h-7 w-7">
                <Radio className="h-3.5 w-3.5" />
              </span>
              <div className="lumen-glow-kicker text-[10px] sm:text-[11px]">
                Oracle operators
              </div>
              {!empty && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5">
                  <span
                    className="lumen-glow-pulse"
                    style={{
                      background: "#34D399",
                      boxShadow: "0 0 8px rgba(52, 211, 153, 0.9)",
                      animation: reduceMotion
                        ? "none"
                        : undefined,
                    }}
                  />
                  <span className="text-[9px] font-mono tracking-[0.16em] text-emerald-300/90 uppercase">
                    {isFetching ? "Sync" : "Online"}
                  </span>
                </span>
              )}
            </div>
            <p className="text-[12px] sm:text-[13px] text-[#6B6B78] leading-snug max-w-md">
              Operators currently posting into public pools — live right now.
            </p>
          </div>

          <SoftLink
            href="/oracles"
            className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-mono tracking-[0.14em] uppercase text-[#A0A0B0] transition-colors hover:border-[#2DD4BF]/35 hover:text-[#A7F3E8]"
          >
            Open pools
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </SoftLink>
        </div>

        {/* Hero count */}
        <div className="mb-5 sm:mb-6 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.18em] text-[#6B6B78] uppercase mb-1">
              Online now
            </div>
            <div className="flex items-baseline gap-2">
              <motion.span
                key={stats.uniqueLive}
                initial={reduceMotion ? false : { opacity: 0.4, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="lumen-glow-value metric-value text-4xl sm:text-5xl font-semibold tracking-tighter"
              >
                {isLoading && feeds.length === 0 ? "—" : stats.uniqueLive}
              </motion.span>
              <span className="text-lg sm:text-xl font-mono text-[#5C5C6A] tabular-nums">
                / {stats.uniqueTotal || "—"}
              </span>
            </div>
          </div>
          <div className="pb-1 text-[11px] sm:text-[12px] text-[#6B6B78] font-mono">
            unique operators · both pools
          </div>
        </div>

        {/* Pool table */}
        <div className="lumen-glow-inset">
          <div className="hidden sm:grid grid-cols-[1.2fr_0.7fr_0.7fr_1.4fr_0.7fr] gap-2 px-4 py-2.5 border-b border-white/[0.06] text-[9px] font-mono tracking-[0.16em] text-[#5C5C6A] uppercase">
            <div>Pool</div>
            <div className="text-right">Online</div>
            <div className="text-right">Of total</div>
            <div>Participation</div>
            <div className="text-right">Status</div>
          </div>

          {empty ? (
            <div className="px-4 py-8 text-center text-[12px] text-[#5C5C6A]">
              Oracle feed unavailable — try again in a moment.
            </div>
          ) : isLoading && feeds.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] font-mono tracking-[0.14em] text-[#5C5C6A] uppercase">
              Loading operators…
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {feeds.map((feed) => {
                const th = poolTheme(feed);
                const online = liveCount(feed);
                const total = totalCount(feed) || 1;
                const pct = Math.min(100, Math.round((online / total) * 100));
                const st = statusMeta(feed.status);
                const need = feed.requiredOracles;

                return (
                  <li key={feed.id}>
                    <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_0.7fr_0.7fr_1.4fr_0.7fr] gap-2 sm:gap-2 items-center px-4 py-3.5 sm:py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{
                            background: th.accent,
                            boxShadow: `0 0 10px ${th.glow}`,
                          }}
                        />
                        <div className="min-w-0">
                          <div
                            className="text-[13px] sm:text-sm font-medium tracking-tight truncate"
                            style={{ color: th.label }}
                          >
                            {feed.pair}
                          </div>
                          <div className="text-[10px] font-mono text-[#5C5C6A] truncate">
                            {need != null
                              ? `need ${need} for refresh`
                              : feed.title}
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:block items-baseline justify-between sm:text-right">
                        <span className="sm:hidden text-[10px] font-mono tracking-[0.12em] text-[#5C5C6A] uppercase">
                          Online
                        </span>
                        <span
                          className="metric-value text-xl sm:text-2xl font-semibold tabular-nums tracking-tighter"
                          style={{
                            color: th.accent,
                            textShadow: `0 0 16px ${th.glow}`,
                          }}
                        >
                          {online}
                        </span>
                      </div>

                      <div className="flex sm:block items-baseline justify-between sm:text-right">
                        <span className="sm:hidden text-[10px] font-mono tracking-[0.12em] text-[#5C5C6A] uppercase">
                          Of total
                        </span>
                        <span className="font-mono text-sm tabular-nums text-[#8B8B9A]">
                          {totalCount(feed) || "—"}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono tabular-nums text-[#6B6B78]">
                            {pct}%
                          </span>
                          {need != null && (
                            <span className="text-[9px] font-mono text-[#5C5C6A]">
                              {online >= need ? "quorum ok" : `${need - online} short`}
                            </span>
                          )}
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: th.bar,
                              boxShadow: `0 0 12px ${th.glow}`,
                            }}
                            initial={false}
                            animate={{ width: `${pct}%` }}
                            transition={{
                              duration: reduceMotion ? 0 : 0.55,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex sm:justify-end">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-mono tracking-[0.14em] uppercase"
                          style={{
                            color: st.color,
                            borderColor: `${st.color}40`,
                            background: `${st.color}12`,
                            boxShadow: `0 0 14px ${st.glow}`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              background: st.color,
                              boxShadow: `0 0 6px ${st.glow}`,
                            }}
                          />
                          {st.label}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Live operator chips */}
        {stats.showcase.length > 0 && (
          <div className="mt-4 sm:mt-5">
            <div className="text-[9px] font-mono tracking-[0.16em] text-[#5C5C6A] uppercase mb-2">
              Live operators
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {stats.showcase.map((op) => (
                <span
                  key={op.address}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-black/30 px-2 py-1 font-mono text-[10px] sm:text-[11px] text-[#A0A0B0]"
                  title={`${op.address} · ${op.pool}`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      background: op.accent,
                      boxShadow: `0 0 8px ${op.accent}`,
                    }}
                  />
                  {shortAddr(op.address)}
                </span>
              ))}
              {stats.uniqueLive > stats.showcase.length && (
                <span className="inline-flex items-center rounded-lg border border-white/[0.05] px-2 py-1 font-mono text-[10px] text-[#5C5C6A]">
                  +{stats.uniqueLive - stats.showcase.length} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
