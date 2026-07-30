import { NextRequest, NextResponse } from "next/server";
import { runAlertTick } from "@/app/lib/tg-alerts-engine";
import { verifyInternalSecret } from "@/app/lib/tg-alerts-store";
import { isTelegramBotConfigured } from "@/app/lib/tg-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/tg/alerts/tick
 * Internal watchdog tick. Header: X-Lumen-Internal: <secret>
 * Secret = LUMEN_INTERNAL_SECRET or TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  if (!isTelegramBotConfigured()) {
    return NextResponse.json(
      { ok: false, disabled: true },
      { status: 503 }
    );
  }

  const secret =
    req.headers.get("x-lumen-internal") ||
    req.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyInternalSecret(secret)) {
    // Allow localhost without secret only if no secret configured
    const hasSecret = !!(
      process.env.LUMEN_INTERNAL_SECRET?.trim() ||
      process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
    );
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    const local =
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "" ||
      ip.startsWith("127.");
    if (hasSecret || !local) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  try {
    const result = await runAlertTick();
    return NextResponse.json(result);
  } catch (e) {
    console.warn(
      "[tg/alerts/tick]",
      e instanceof Error ? e.message : "error"
    );
    return NextResponse.json(
      { ok: false, error: "tick_failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Same auth as POST for systemd curl convenience
  return POST(req);
}
