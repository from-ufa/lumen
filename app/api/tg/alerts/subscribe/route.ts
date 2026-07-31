import { NextRequest, NextResponse } from "next/server";
import { bridgeServerFetch } from "@/app/lib/bridge-server";
import {
  getChatIdForUser,
  publicSubView,
  upsertSubscription,
} from "@/app/lib/tg-alerts-store";
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

async function probeToken(token: string): Promise<{
  ok: boolean;
  connected: boolean;
  error?: string;
}> {
  try {
    const upstream = await bridgeServerFetch(
      `/status?token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" }, timeoutMs: 8_000 }
    );
    const data = (await upstream.json().catch(() => ({}))) as {
      known?: boolean;
      connected?: boolean;
      error?: string;
    };
    if (!upstream.ok && data.error) {
      return { ok: false, connected: false, error: data.error };
    }
    // Token is valid if bridge server knows it OR connected
    return {
      ok: true,
      connected: !!data.connected,
    };
  } catch (e) {
    return {
      ok: false,
      connected: false,
      error: e instanceof Error ? e.message : "bridge_unreachable",
    };
  }
}

/**
 * POST /api/tg/alerts/subscribe
 * Body: { bridgeToken, scopes?, prefs?, sendTest? }
 * Requires lumen_tg_auth cookie. chatId from prior bot /start.
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
    return NextResponse.json(
      {
        ok: false,
        error: "auth_required",
        hint: "Open Lumen from the Telegram bot so we can verify your account",
      },
      { status: 401 }
    );
  }

  let body: {
    bridgeToken?: unknown;
    scopes?: { node?: unknown; oracle?: unknown };
    prefs?: {
      enabled?: unknown;
      claimReminder?: unknown;
      postLagBlocks?: unknown;
      minPeers?: unknown;
      muted?: unknown;
    };
    sendTest?: unknown;
    label?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const bridgeToken =
    typeof body.bridgeToken === "string" ? body.bridgeToken.trim() : "";
  if (!bridgeToken || bridgeToken.length < 10 || bridgeToken.length > 200) {
    return NextResponse.json(
      { ok: false, error: "bridge_token_required" },
      { status: 400 }
    );
  }

  const chatId = getChatIdForUser(userId);
  if (chatId == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "chat_required",
        hint: "Send /start to @ergolumen_bot first, then enable alerts again",
      },
      { status: 400 }
    );
  }

  const probe = await probeToken(bridgeToken);
  if (!probe.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "bridge_token_invalid",
        detail: probe.error,
      },
      { status: 400 }
    );
  }

  const sub = upsertSubscription({
    tgUserId: userId,
    chatId,
    bridgeToken,
    scopes: {
      node: body.scopes?.node !== false,
      oracle: body.scopes?.oracle !== false,
    },
    prefs: {
      enabled: body.prefs?.enabled !== false,
      claimReminder: body.prefs?.claimReminder === true,
      postLagBlocks:
        typeof body.prefs?.postLagBlocks === "number"
          ? body.prefs.postLagBlocks
          : undefined,
      minPeers:
        typeof body.prefs?.minPeers === "number"
          ? Math.max(0, Math.min(50, Math.floor(body.prefs.minPeers)))
          : undefined,
      muted: Array.isArray(body.prefs?.muted)
        ? (body.prefs.muted as string[])
        : undefined,
    },
    label: typeof body.label === "string" ? body.label : null,
  });

  let testSent = false;
  if (body.sendTest !== false) {
    testSent = await sendTestAlert(chatId);
  }

  return NextResponse.json({
    ok: true,
    subscription: publicSubView(sub),
    bridgeConnected: probe.connected,
    testSent,
    hint: probe.connected
      ? "Alerts armed — watchdog will notify on problems"
      : "Subscription saved. Bridge is offline now — you will be notified when it drops or recovers after online.",
  });
}
