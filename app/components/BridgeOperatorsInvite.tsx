"use client";

/**
 * Typewriter panel — live bridge hub counts.
 * variant "oracle" → operators; "node" → node agents.
 *
 * mode:
 *  - recruit — no token yet: counts + join CTA (Settings → …)
 *  - status  — token configured: counts only, no connect nag
 *
 * Same chrome as Connect*Invite (browser / mobile / Mini App).
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

export type BridgeInviteVariant = "oracle" | "node";
export type BridgeInviteMode = "recruit" | "status";

const WAKE_EVENT: Record<BridgeInviteVariant, string> = {
  oracle: "lumen-bridge-ops-invite-wake",
  node: "lumen-bridge-node-invite-wake",
};

async function fetchBridgeStats(): Promise<BridgePublicStats> {
  const res = await fetch("/api/bridge/stats", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as BridgePublicStats;
  if (!res.ok && !body) {
    throw new Error(`bridge stats ${res.status}`);
  }
  return body;
}

function agentsLine(n: number): string {
  if (n === 0) return "Bridge hub · no agents online.";
  if (n === 1) return "Bridge hub · 1 agent online.";
  return `Bridge hub · ${n} agents online.`;
}

function buildOracleText(
  stats: BridgePublicStats | undefined,
  loading: boolean,
  mode: BridgeInviteMode
): string {
  if (loading && !stats) {
    return mode === "status"
      ? "Bridge hub · counting…\nLive operators on lumen…"
      : "Bridge hub · counting agents…\nOracle operators on lumen…";
  }
  if (!stats || stats.error) {
    return mode === "status"
      ? "Bridge hub · stats offline right now.\nYour agent stays linked via Settings."
      : "Bridge hub · offline right now.\nOpen Settings → join as operator.";
  }

  const n = stats.connections;
  const m = stats.withOracle;
  const usd = stats.oracles?.["erg-usd"] ?? 0;
  const xau = stats.oracles?.["erg-xau"] ?? 0;

  const ops =
    m === 0
      ? "0 oracle operators online."
      : m === 1
        ? "1 oracle operator online."
        : `${m} oracle operators online.`;

  if (mode === "status") {
    const pools =
      m > 0 ? `\nUSD ${usd} · XAU ${xau} · live on the mesh.` : "";
    return `${agentsLine(n)}\n${ops}${pools}`;
  }

  const pools =
    m > 0
      ? `\nUSD ${usd} · XAU ${xau} · Settings → My Oracle.`
      : "\nBe the first · Settings → My Oracle.";

  return `${agentsLine(n)}\n${ops}${pools}`;
}

function buildNodeText(
  stats: BridgePublicStats | undefined,
  loading: boolean,
  mode: BridgeInviteMode
): string {
  if (loading && !stats) {
    return mode === "status"
      ? "Bridge hub · counting…\nNodes on the mesh…"
      : "Bridge hub · counting agents…\nNodes connected via lumen…";
  }
  if (!stats || stats.error) {
    return mode === "status"
      ? "Bridge hub · stats offline right now.\nYour agent stays linked via Settings."
      : "Bridge hub · offline right now.\nOpen Settings → connect My Node.";
  }

  const n = stats.connections;
  const nodes = stats.withNode;

  const nodeLine =
    nodes === 0
      ? "0 nodes online via lumen."
      : nodes === 1
        ? "1 node online via lumen."
        : `${nodes} nodes online via lumen.`;

  if (mode === "status") {
    return `${agentsLine(n)}\n${nodeLine}`;
  }

  const cta =
    nodes > 0
      ? "\nJoin the mesh · Settings → My Node."
      : "\nBe the first · Settings → My Node.";

  return `${agentsLine(n)}\n${nodeLine}${cta}`;
}

export default function BridgeOperatorsInvite({
  enabled,
  onOpenSettings,
  delayMs = 0,
  variant = "oracle",
  mode = "recruit",
}: {
  enabled: boolean;
  onOpenSettings: () => void;
  delayMs?: number;
  variant?: BridgeInviteVariant;
  /** recruit = join CTAs; status = live counts only (token configured) */
  mode?: BridgeInviteMode;
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
    () =>
      variant === "node"
        ? buildNodeText(data, isLoading, mode)
        : buildOracleText(data, isLoading, mode),
    [data, isLoading, variant, mode]
  );

  const ariaLabel =
    mode === "status"
      ? variant === "node"
        ? "Live bridge mesh — nodes currently online"
        : "Live bridge mesh — oracle operators currently online"
      : variant === "node"
        ? "Open settings to connect your Ergo node via bridge"
        : "Open settings to connect as a bridge oracle operator";

  return (
    <TypewriterInvite
      enabled={enabled}
      onOpenSettings={onOpenSettings}
      fullText={fullText}
      wakeEvent={WAKE_EVENT[variant]}
      delayMs={delayMs}
      loop={false}
      ariaLabel={ariaLabel}
    />
  );
}
