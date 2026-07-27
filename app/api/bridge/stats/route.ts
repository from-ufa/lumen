import { NextResponse } from "next/server";
import { bridgeServerFetch } from "../../../lib/bridge-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type BridgePublicStats = {
  generatedAt: number;
  tokensIssued: number;
  connections: number;
  withNode: number;
  withOracle: number;
  oracles: Record<string, number>;
  service?: string;
  version?: string;
  error?: string;
};

/**
 * GET /api/bridge/stats
 * Public counts of live bridge agents (no tokens / IPs).
 */
export async function GET() {
  try {
    const upstream = await bridgeServerFetch("/stats", {
      headers: { Accept: "application/json" },
      timeoutMs: 6_000,
    });
    const data = (await upstream.json().catch(() => ({}))) as BridgePublicStats;
    if (!upstream.ok) {
      return NextResponse.json(
        {
          generatedAt: Date.now(),
          tokensIssued: 0,
          connections: 0,
          withNode: 0,
          withOracle: 0,
          oracles: {},
          error: (data as { error?: string }).error || "upstream_error",
        } satisfies BridgePublicStats,
        { status: upstream.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      {
        generatedAt: Number(data.generatedAt) || Date.now(),
        tokensIssued: Number(data.tokensIssued) || 0,
        connections: Number(data.connections) || 0,
        withNode: Number(data.withNode) || 0,
        withOracle: Number(data.withOracle) || 0,
        oracles:
          data.oracles && typeof data.oracles === "object" ? data.oracles : {},
        service: data.service,
        version: data.version,
      } satisfies BridgePublicStats,
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "bridge_server_unreachable";
    return NextResponse.json(
      {
        generatedAt: Date.now(),
        tokensIssued: 0,
        connections: 0,
        withNode: 0,
        withOracle: 0,
        oracles: {},
        error: message,
      } satisfies BridgePublicStats,
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
