import { NextResponse } from "next/server";
import { isTelegramBotConfigured } from "@/app/lib/tg-auth";
import { getWebAppUrl } from "@/app/lib/tg-bot";

export const dynamic = "force-dynamic";

/** Public probe: bot configured? (never returns token) */
export async function GET() {
  return NextResponse.json({
    ok: true,
    botConfigured: isTelegramBotConfigured(),
    webAppUrl: getWebAppUrl(),
    endpoints: {
      auth: "/api/tg/auth",
      webhook: "/api/tg/webhook",
    },
  });
}
