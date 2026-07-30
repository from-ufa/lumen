import { NextRequest, NextResponse } from "next/server";
import {
  getChatIdForUser,
  listSubsForUser,
  publicSubView,
} from "@/app/lib/tg-alerts-store";
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

/** GET /api/tg/alerts/me — list subscriptions for TG session user */
export async function GET(req: NextRequest) {
  if (!isTelegramBotConfigured()) {
    return NextResponse.json(
      { ok: false, disabled: true, error: "telegram_bot_not_configured" },
      { status: 503 }
    );
  }
  const userId = userFromCookie(req);
  if (userId == null) {
    return NextResponse.json(
      { ok: false, error: "auth_required", hint: "Open Mini App via bot first" },
      { status: 401 }
    );
  }
  const subs = listSubsForUser(userId).map(publicSubView);
  const chatId = getChatIdForUser(userId);
  return NextResponse.json({
    ok: true,
    userId,
    chatId,
    hasChat: chatId != null,
    subscriptions: subs,
  });
}
