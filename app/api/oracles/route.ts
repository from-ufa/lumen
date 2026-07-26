import { NextRequest, NextResponse } from "next/server";
import {
  loadOraclesSnapshot,
  type OracleFeedId,
  type OraclesResponse,
} from "@/lib/oracles";
import { bridgeServerFetch } from "@/app/lib/bridge-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function extractToken(req: NextRequest): string | null {
  const header =
    req.headers.get("x-lumen-bridge-token") ||
    req.headers.get("x-bridge-token");
  if (header) return header.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const q = req.nextUrl.searchParams.get("token");
  return q ? q.trim() : null;
}

async function bridgeGet(
  token: string,
  path: string,
  timeoutMs = 12_000
): Promise<{ ok: boolean; status: number; text: string; json?: unknown }> {
  const upstream = await bridgeServerFetch(
    `/api/bridge/node${path.startsWith("/") ? path : `/${path}`}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Lumen-Bridge-Token": token,
      },
      timeoutMs,
    }
  );
  const text = await upstream.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = undefined;
  }
  return { ok: upstream.ok, status: upstream.status, text, json };
}

/**
 * GET /api/oracles
 *  - default / mode=network — public network view (explorer + host metrics)
 *  - mode=my&token=… — personal operator view (explorer prices + bridge metrics)
 *    Supports 1 or 2 oracles depending on agent config (USD and/or XAU).
 */
export async function GET(req: NextRequest) {
  try {
    const mode = (req.nextUrl.searchParams.get("mode") || "network").toLowerCase();

    if (mode === "my") {
      const token = extractToken(req);
      if (!token) {
        return NextResponse.json(
          {
            generatedAt: Date.now(),
            tipHeight: null,
            avgBlockMs: 120_000,
            feeds: [],
            view: "my",
            bridge: {
              connected: false,
              oraclesConfigured: [],
              error: "token_required",
            },
            error: "Pass ?token= or X-Lumen-Bridge-Token for My Oracle",
          } satisfies OraclesResponse & { error?: string },
          { status: 400 }
        );
      }

      // Bridge status
      let bridgeStatus: {
        connected?: boolean;
        version?: string | null;
        oracles?: string[];
      } = {};
      try {
        const st = await bridgeServerFetch(
          `/api/bridge/status?token=${encodeURIComponent(token)}`,
          { timeoutMs: 5_000 }
        );
        if (st.ok) bridgeStatus = (await st.json()) as typeof bridgeStatus;
      } catch {
        bridgeStatus = { connected: false };
      }

      if (!bridgeStatus.connected) {
        // Still return network prices so UI isn't empty — mark bridge offline
        const network = await loadOraclesSnapshot({
          view: "my",
          skipLocalMetrics: true,
          bridge: {
            connected: false,
            version: bridgeStatus.version ?? null,
            oraclesConfigured: [],
            error: "bridge_offline",
          },
        });
        return NextResponse.json(network, {
          headers: { "Cache-Control": "no-store, max-age=0" },
        });
      }

      // Discover which oracles the agent exposes
      let configured: OracleFeedId[] = [];
      try {
        const statusRes = await bridgeGet(token, "/oracle/status", 8_000);
        if (statusRes.ok && statusRes.json && typeof statusRes.json === "object") {
          const body = statusRes.json as {
            configured?: string[];
            oracles?: Record<string, { configured?: boolean }>;
          };
          if (Array.isArray(body.configured)) {
            configured = body.configured.filter(
              (id): id is OracleFeedId => id === "erg-usd" || id === "erg-xau"
            );
          } else if (body.oracles) {
            configured = (["erg-usd", "erg-xau"] as OracleFeedId[]).filter(
              (id) => body.oracles?.[id]?.configured
            );
          }
        }
      } catch {
        /* fall through */
      }

      // Fallback to hello.capabilities.oracles from hub status
      if (!configured.length && Array.isArray(bridgeStatus.oracles)) {
        configured = bridgeStatus.oracles.filter(
          (id): id is OracleFeedId => id === "erg-usd" || id === "erg-xau"
        );
      }

      const metricsByFeed: Partial<Record<OracleFeedId, string | null>> = {};
      const pathFor: Record<OracleFeedId, string> = {
        "erg-usd": "/oracle/usd/metrics",
        "erg-xau": "/oracle/xau/metrics",
      };

      // If agent didn't announce, try both (404/error → skip)
      const toFetch: OracleFeedId[] =
        configured.length > 0 ? configured : ["erg-usd", "erg-xau"];

      await Promise.all(
        toFetch.map(async (id) => {
          try {
            const res = await bridgeGet(token, pathFor[id], 10_000);
            if (res.ok && res.text && res.text.includes("ergo_oracle_")) {
              metricsByFeed[id] = res.text;
              if (!configured.includes(id)) configured.push(id);
            }
          } catch {
            /* skip */
          }
        })
      );

      // Tip from operator's node when possible
      let tipOverride: number | null | undefined = undefined;
      try {
        const info = await bridgeGet(token, "/info", 8_000);
        if (info.ok && info.json && typeof info.json === "object") {
          const j = info.json as { fullHeight?: number; headersHeight?: number };
          const h = j.fullHeight ?? j.headersHeight;
          if (typeof h === "number" && Number.isFinite(h)) tipOverride = h;
        }
      } catch {
        tipOverride = undefined;
      }

      const onlyFeeds =
        configured.length > 0
          ? configured
          : undefined; // no metrics → still show both network prices with empty enrichment

      const data = await loadOraclesSnapshot({
        view: "my",
        metricsByFeed,
        onlyFeeds:
          configured.length > 0
            ? onlyFeeds
            : undefined,
        skipLocalMetrics: true,
        tipHeightOverride: tipOverride,
        bridge: {
          connected: true,
          version: bridgeStatus.version ?? null,
          oraclesConfigured: configured,
          error:
            configured.length === 0
              ? "no_oracles_configured"
              : undefined,
        },
      });

      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    // ── Network (default) ──
    const data = await loadOraclesSnapshot({ view: "network" });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "oracles unavailable";
    return NextResponse.json(
      {
        generatedAt: Date.now(),
        tipHeight: null,
        avgBlockMs: 120_000,
        feeds: [],
        error: message,
      },
      { status: 502 }
    );
  }
}
