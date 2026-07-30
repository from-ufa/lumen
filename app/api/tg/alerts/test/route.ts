import { NextRequest, NextResponse } from "next/server";
import { getChatIdForUser, listSubsForUser } from "@/app/lib/tg-alerts-store";
import { sendTestAlert } from "@/app/lib/tg-alerts-engine";
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

/** POST /api/tg/alerts/test — send one test message to the user's chat */
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
  const chatId =
    getChatIdForUser(userId) ?? listSubsForUser(userId)[0]?.chatId ?? null;
  if (chatId == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "chat_required",
        hint: "Send /start to the bot first",
      },
      { status: 400 }
    );
  }
  const sent = await sendTestAlert(chatId);
  return NextResponse.json({ ok: sent, chatId: sent ? chatId : undefined });
}
