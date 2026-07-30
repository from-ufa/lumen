import { NextRequest, NextResponse } from "next/server";
import {
  deleteSubsForUser,
  setSubEnabled,
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

/**
 * POST /api/tg/alerts/unsubscribe
 * Body: { subId?: string, mute?: true }
 * mute → disable; else delete (all if no subId).
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

  let body: { subId?: unknown; mute?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const subId = typeof body.subId === "string" ? body.subId : undefined;

  if (body.mute === true) {
    const n = setSubEnabled(userId, false, subId);
    return NextResponse.json({ ok: true, muted: n });
  }

  const removed = deleteSubsForUser(userId, subId);
  return NextResponse.json({ ok: true, removed });
}
