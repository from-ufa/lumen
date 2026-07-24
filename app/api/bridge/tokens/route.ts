import { NextRequest, NextResponse } from "next/server";
import { bridgeServerFetch } from "../../../lib/bridge-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/bridge/tokens — create a new lumen_* bridge token */
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const upstream = await bridgeServerFetch("/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
      timeoutMs: 8_000,
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
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

/** GET /api/bridge/tokens — list tokens (debug) */
export async function GET() {
  try {
    const upstream = await bridgeServerFetch("/tokens", {
      headers: { Accept: "application/json" },
      timeoutMs: 8_000,
    });
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
