"use client";

/**
 * Typewriter panel — live count of bridge agents / oracle operators on lumen.
 * Same chrome as ConnectOracleInvite; stacks under the first invite.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import TypewriterInvite from "./TypewriterInvite";

type BridgePublicStats = {
  generatedAt: number;
  tokensIssued: number;
  connections: number;
  withNode: number;
  withOracle: number;
  oracles: Record<string, number>;
  error?: string;
};

const WAKE_EVENT = "lumen-bridge-ops-invite-wake";

async function fetchBridgeStats(): Promise<BridgePublicStats> {
  const res = await fetch("/api/bridge/stats", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as BridgePublicStats;
  if (!res.ok && !body) {
    throw new Error(`bridge stats ${res.status}`);
  }
  return body;
}

function buildText(stats: BridgePublicStats | undefined, loading: boolean): string {
  if (loading && !stats) {
    return "Bridge hub · counting agents…\nOracle operators on lumen…";
  }
  if (!stats || stats.error) {
    return "Bridge hub · offline right now.\nOpen Settings → join as operator.";
  }

  const n = stats.connections;
  const m = stats.withOracle;
  const usd = stats.oracles?.["erg-usd"] ?? 0;
  const xau = stats.oracles?.["erg-xau"] ?? 0;

  const agents =
    n === 0
      ? "Bridge hub · no agents online."
      : n === 1
        ? "Bridge hub · 1 agent online."
        : `Bridge hub · ${n} agents online.`;

  const ops =
    m === 0
      ? "0 oracle operators via lumen."
      : m === 1
        ? "1 oracle operator via lumen."
        : `${m} oracle operators via lumen.`;

  const pools =
    m > 0 ? `\nUSD ${usd} · XAU ${xau} · Settings → My Oracle.` : "\nBe the first · Settings → My Oracle.";

  return `${agents}\n${ops}${pools}`;
}

export default function BridgeOperatorsInvite({
  enabled,
  onOpenSettings,
  delayMs = 0,
}: {
  enabled: boolean;
  onOpenSettings: () => void;
  delayMs?: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["bridge-public-stats"],
    queryFn: fetchBridgeStats,
    enabled,
    refetchInterval: 8_000,
    staleTime: 4_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });

  const fullText = useMemo(
    () => buildText(data, isLoading),
    [data, isLoading]
  );

  return (
    <TypewriterInvite
      enabled={enabled}
      onOpenSettings={onOpenSettings}
      fullText={fullText}
      wakeEvent={WAKE_EVENT}
      delayMs={delayMs}
      loop={false}
      ariaLabel="Open settings to connect as a bridge oracle operator"
    />
  );
}
