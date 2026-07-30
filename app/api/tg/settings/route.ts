import { NextRequest, NextResponse } from "next/server";
import {
  clearForceHydrate,
  clearVaultForUser,
  getVaultForUser,
  putVaultForUser,
  tokenFingerprint,
} from "@/app/lib/tg-settings-vault";
import {
  isTelegramBotConfigured,
  verifyTgSessionToken,
  TG_SESSION_COOKIE,
} from "@/app/lib/tg-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function userFromCookie(req: NextRequest): number | null {
  const raw = req.cookies.get(TG_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const v = verifyTgSessionToken(raw);
  return v.ok && v.userId != null ? v.userId : null;
}

/** GET /api/tg/settings — hydrate Mini App from vault (TG session) */
export async function GET(req: NextRequest) {
  if (!isTelegramBotConfigured()) {
    return NextResponse.json(
      { ok: false, disabled: true, error: "telegram_bot_not_configured" },
      { status: 503 }
    );
  }
  const userId = userFromCookie(req);
  if (userId == null) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  const v = getVaultForUser(userId);
  if (!v) {
    return NextResponse.json({
      ok: true,
      hasVault: false,
      settings: null,
    });
  }
  // Optional: Mini App signals it applied vault → clear force flag
  const consume =
    req.nextUrl.searchParams.get("consumeForce") === "1" ||
    req.nextUrl.searchParams.get("consumeForce") === "true";
  if (consume && v.forceHydrateOnce) {
    clearForceHydrate(userId);
  }
  return NextResponse.json({
    ok: true,
    hasVault: true,
    settings: {
      bridgeToken: v.bridgeToken,
      nodeMode: v.nodeMode,
      oracleView: v.oracleView,
      tokenFp: tokenFingerprint(v.bridgeToken),
      tokenTail: v.tokenTail,
      forceHydrateOnce: consume ? false : v.forceHydrateOnce,
      updatedAt: v.updatedAt,
    },
  });
}

/** PUT /api/tg/settings — push current token into vault (TG session) */
export async function PUT(req: NextRequest) {
  if (!isTelegramBotConfigured()) {
    return NextResponse.json(
      { ok: false, disabled: true, error: "telegram_bot_not_configured" },
      { status: 503 }
    );
  }
  const userId = userFromCookie(req);
  if (userId == null) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  let body: {
    bridgeToken?: unknown;
    nodeMode?: unknown;
    oracleView?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const bridgeToken =
    typeof body.bridgeToken === "string" ? body.bridgeToken.trim() : "";
  if (bridgeToken.length < 10) {
    return NextResponse.json(
      { ok: false, error: "bridge_token_required" },
      { status: 400 }
    );
  }
  putVaultForUser(userId, {
    bridgeToken,
    nodeMode:
      body.nodeMode === "my" || body.nodeMode === "lumen"
        ? body.nodeMode
        : null,
    oracleView:
      body.oracleView === "my" || body.oracleView === "network"
        ? body.oracleView
        : null,
  });
  return NextResponse.json({
    ok: true,
    tokenFp: tokenFingerprint(bridgeToken),
  });
}

/** DELETE /api/tg/settings — unlink vault for this TG user */
export async function DELETE(req: NextRequest) {
  if (!isTelegramBotConfigured()) {
    return NextResponse.json(
      { ok: false, disabled: true, error: "telegram_bot_not_configured" },
      { status: 503 }
    );
  }
  const userId = userFromCookie(req);
  if (userId == null) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  const cleared = clearVaultForUser(userId);
  return NextResponse.json({ ok: true, cleared });
}
