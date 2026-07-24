import { NextRequest, NextResponse } from "next/server";
import { bridgeServerFetch } from "../../../lib/bridge-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

/** GET /api/bridge/status?token=lumen_… — is bridge online? */
export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "token_required", message: "Pass ?token= or X-Lumen-Bridge-Token" },
      { status: 400 }
    );
  }

  try {
    const upstream = await bridgeServerFetch(
      `/status?token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" }, timeoutMs: 8_000 }
    );
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "bridge_server_unreachable";
    return NextResponse.json(
      { error: "bridge_server_unreachable", message },
      { status: 502 }
    );
  }
}
