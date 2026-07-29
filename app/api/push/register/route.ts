import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/push/register
 * Phase 1 stub: accept device push tokens from Capacitor clients.
 * No APNs delivery — store hashed token metadata only (no secrets logged raw).
 */

const STORE = path.join(process.cwd(), "data", "push-tokens.json");
const MAX_TOKEN_LEN = 512;
const MIN_TOKEN_LEN = 16;

type Stored = {
  id: string;
  tokenHash: string;
  platform: string;
  appId: string;
  createdAt: string;
  lastSeenAt: string;
};

function loadStore(): Stored[] {
  try {
    if (!fs.existsSync(STORE)) return [];
    const raw = fs.readFileSync(STORE, "utf8");
    const j = JSON.parse(raw) as { tokens?: Stored[] };
    return Array.isArray(j.tokens) ? j.tokens : [];
  } catch {
    return [];
  }
}

function saveStore(tokens: Stored[]) {
  try {
    const dir = path.dirname(STORE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Cap file growth
    const trimmed = tokens.slice(-500);
    fs.writeFileSync(
      STORE,
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), tokens: trimmed }, null, 2),
      { mode: 0o600 }
    );
  } catch {
    /* non-fatal */
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const b = body as {
    token?: unknown;
    platform?: unknown;
    appId?: unknown;
  };

  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (
    !token ||
    token.length < MIN_TOKEN_LEN ||
    token.length > MAX_TOKEN_LEN ||
    !/^[A-Za-z0-9_\-.:]+$/.test(token)
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 400 }
    );
  }

  const platform =
    typeof b.platform === "string" && b.platform.length < 32
      ? b.platform
      : "unknown";
  const appId =
    typeof b.appId === "string" && b.appId.length < 80
      ? b.appId
      : "net.ergolumen.app";

  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const list = loadStore();
  const existing = list.find((t) => t.tokenHash === tokenHash);
  if (existing) {
    existing.lastSeenAt = now;
    existing.platform = platform;
    saveStore(list);
    console.info(
      `[push/register] refresh hash=${tokenHash.slice(0, 12)}… platform=${platform}`
    );
    return NextResponse.json({
      ok: true,
      status: "refreshed",
      id: existing.id,
    });
  }

  const entry: Stored = {
    id: crypto.randomBytes(8).toString("hex"),
    tokenHash,
    platform,
    appId,
    createdAt: now,
    lastSeenAt: now,
  };
  list.push(entry);
  saveStore(list);
  console.info(
    `[push/register] new hash=${tokenHash.slice(0, 12)}… platform=${platform}`
  );

  return NextResponse.json({ ok: true, status: "registered", id: entry.id });
}

/** Health / empty GET */
export async function GET() {
  return NextResponse.json({
    service: "lumen-push-register",
    phase: 1,
    apns: false,
    message: "POST device token from Capacitor native shell only",
  });
}
