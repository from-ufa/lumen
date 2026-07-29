import { NextRequest, NextResponse } from "next/server";
import {
  TG_SESSION_COOKIE,
  TG_SESSION_MAX_AGE_SEC,
  isTelegramBotConfigured,
  makeTgSessionToken,
  sessionFingerprint,
  validateTelegramInitData,
} from "@/app/lib/tg-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/tg/auth
 * Body: { initData: string } — raw Telegram.WebApp.initData
 * Validates HMAC; sets httpOnly session cookie for Public Mode bypass.
 */
export async function POST(req: NextRequest) {
  if (!isTelegramBotConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        disabled: true,
        error: "telegram_bot_not_configured",
        hint: "Set TELEGRAM_BOT_TOKEN on the server",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const initData =
    body &&
    typeof body === "object" &&
    "initData" in body &&
    typeof (body as { initData: unknown }).initData === "string"
      ? (body as { initData: string }).initData
      : "";

  const result = validateTelegramInitData(initData);
  if (!result.ok) {
    // Do not echo initData; log only error code
    console.warn(`[tg/auth] reject: ${result.error}`);
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 401 }
    );
  }

  const userId = result.user?.id ?? 0;
  const session = makeTgSessionToken(userId, result.authDate);
  const res = NextResponse.json({
    ok: true,
    userId: result.user?.id ?? null,
    fp: sessionFingerprint(userId),
  });

  res.cookies.set(TG_SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: req.nextUrl.protocol === "https:",
    maxAge: TG_SESSION_MAX_AGE_SEC,
  });

  console.info(
    `[tg/auth] ok user=${result.user?.id ?? "anon"} fp=${sessionFingerprint(userId)}`
  );
  return res;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: isTelegramBotConfigured(),
    path: "/api/tg/auth",
  });
}
