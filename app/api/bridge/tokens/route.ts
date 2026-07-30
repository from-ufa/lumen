import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { bridgeServerFetch } from "../../../lib/bridge-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Simple in-process rate limit for mint (S2). Resets on process restart. */
const mintHits = new Map<string, number[]>();
const MINT_WINDOW_MS = 60 * 60 * 1000;
const MINT_MAX_PER_WINDOW = 10;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function allowMint(ip: string): boolean {
  const now = Date.now();
  const arr = (mintHits.get(ip) || []).filter((t) => now - t < MINT_WINDOW_MS);
  if (arr.length >= MINT_MAX_PER_WINDOW) {
    mintHits.set(ip, arr);
    return false;
  }
  arr.push(now);
  mintHits.set(ip, arr);
  return true;
}

/** Redact any accidental plaintext tokens in list responses (defense in depth). */
function redactTokensPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as { tokens?: unknown[]; mode?: string };
  if (!Array.isArray(d.tokens)) return data;
  return {
    ...d,
    mode: d.mode || "redacted",
    tokens: d.tokens.map((row) => {
      if (!row || typeof row !== "object") return row;
      const t = row as Record<string, unknown>;
      if (typeof t.token === "string") {
        const token = t.token;
        const fp =
          typeof t.tokenFp === "string"
            ? t.tokenFp
            : createHash("sha256").update(token).digest("hex").slice(0, 12);
        const { token: _drop, ...rest } = t;
        return {
          ...rest,
          tokenFp: fp,
          tokenTail:
            typeof t.tokenTail === "string"
              ? t.tokenTail
              : token.slice(-4),
        };
      }
      return t;
    }),
  };
}

/**
 * POST /api/bridge/tokens — create a new lumen_* bridge token.
 * Returns full token once (needed for Docker/Settings). Rate-limited per IP.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!allowMint(ip)) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many token creates. Try again later (max 10/hour).",
      },
      { status: 429 }
    );
  }

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
    // POST still returns full token once — required for agent setup
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

/**
 * GET /api/bridge/tokens — public list is redacted (tokenFp only).
 * Full secrets never exposed on this public route.
 */
export async function GET() {
  try {
    const upstream = await bridgeServerFetch("/tokens", {
      headers: { Accept: "application/json" },
      timeoutMs: 8_000,
    });
    const data = await upstream.json().catch(() => ({}));
    const safe = redactTokensPayload(data);
    return NextResponse.json(safe, {
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
