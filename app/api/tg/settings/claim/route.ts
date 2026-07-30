import { NextRequest, NextResponse } from "next/server";
import { claimLinkCode, tokenFingerprint } from "@/app/lib/tg-settings-vault";
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

/**
 * POST /api/tg/settings/claim
 * Mini App (TG session): claim browser link code into vault.
 * Body: { code: "K7M2PQ" }
 */
export async function POST(req: NextRequest) {
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
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code : "";
  const result = claimLinkCode(userId, code);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    settings: {
      bridgeToken: result.settings.bridgeToken,
      nodeMode: result.settings.nodeMode,
      oracleView: result.settings.oracleView,
      tokenFp: tokenFingerprint(result.settings.bridgeToken),
    },
  });
}
