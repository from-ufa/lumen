import { NextRequest, NextResponse } from "next/server";
import { bridgeServerFetch } from "../../../../lib/bridge-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };

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

/**
 * GET /api/bridge/node/<ergo-path>?token=…
 * Proxies allowlisted Ergo REST via the user's connected Bridge.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "token_required", message: "Pass ?token= or X-Lumen-Bridge-Token" },
      { status: 400 }
    );
  }

  const { path } = await ctx.params;
  const ergoPath = path.join("/");
  const search = req.nextUrl.searchParams;
  // Rebuild query without token (token goes in header to upstream)
  const qs = new URLSearchParams(search);
  qs.delete("token");
  const q = qs.toString();

  const upstreamPath = `/api/bridge/node/${ergoPath}${q ? `?${q}` : ""}`;

  try {
    const upstream = await bridgeServerFetch(upstreamPath, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Lumen-Bridge-Token": token,
      },
      timeoutMs: 15_000,
    });

    const contentType =
      upstream.headers.get("content-type") || "application/json; charset=utf-8";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Lumen-Bridge": "proxied",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "bridge_server_unreachable";
    return NextResponse.json(
      {
        error: "bridge_server_unreachable",
        message,
        hint: "Start lumen-bridge-server on :3100",
      },
      { status: 502 }
    );
  }
}
