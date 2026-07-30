import { NextRequest, NextResponse } from "next/server";
import {
  getBotToken,
  getWebAppUrl,
  replyHtml,
  webAppKeyboard,
} from "@/app/lib/tg-bot";
import {
  getChatIdForUser,
  listSubsForUser,
  publicSubView,
  recordChatId,
  setSubEnabled,
  deleteSubsForUser,
} from "@/app/lib/tg-alerts-store";
import { sendTestAlert } from "@/app/lib/tg-alerts-engine";
import { claimLinkCode, tokenFingerprint } from "@/app/lib/tg-settings-vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TgUpdate = {
  update_id?: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string };
  };
};

async function fetchJson(path: string): Promise<unknown | null> {
  const base =
    process.env.LUMEN_INTERNAL_URL?.trim() || "http://127.0.0.1:3000";
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function handleCommand(
  chatId: number,
  text: string,
  fromId?: number
) {
  // Bind private chat for alerts (userId ≈ chatId in DMs)
  if (fromId != null) {
    recordChatId(fromId, chatId);
  } else {
    recordChatId(chatId, chatId);
  }

  const parts = text.trim().split(/\s+/);
  // Telegram: /alerts@bot, /ALERTS, optional arg; also one-word /alerttest
  let cmd = parts[0].toLowerCase().replace(/@\w+$/, "");
  let arg = (parts[1] || "").toLowerCase();
  // /alertstest · /alert_test · /alerts_test → treat as /alerts + test
  const oneWord = cmd.match(
    /^\/(alerts?)[_-]?(test|on|off|delete|remove|status)?$/
  );
  if (oneWord) {
    cmd = oneWord[1].startsWith("alert") ? "/alerts" : cmd;
    if (oneWord[1] === "alert" || oneWord[1] === "alerts") {
      cmd = "/alerts";
    }
    if (oneWord[2]) arg = oneWord[2];
  }
  // /alert → /alerts (common typo / menu cut)
  if (cmd === "/alert") cmd = "/alerts";
  const userId = fromId ?? chatId;

  if (cmd === "/start" || cmd === "/app") {
    await replyHtml(
      chatId,
      [
        "<b>lumen</b> — live Ergo node + oracles",
        "Dashboard · map · dual oracle pools",
        "",
        "<b>New here</b>",
        "1. <b>Open Lumen</b> (button below)",
        "2. Settings → connect Bridge (Docker one-liner)",
        "3. My Node / My Oracle — your machine, no open ports",
        "",
        "<b>Already set up in browser</b>",
        "1. Browser Settings → <b>LINK TELEGRAM</b> → code",
        "2. Here: <code>/link CODE</code>",
        "3. Open Mini App again — same token, no reinstall",
        "",
        "<b>Alerts</b> (after Bridge is linked)",
        "Mini App Settings → Telegram alerts · or <code>/alertstest</code>",
        "",
        "<b>Commands</b> · /help · /status · /oracles · /link · /alerts",
      ].join("\n")
    );
    return;
  }

  if (cmd === "/help") {
    await replyHtml(
      chatId,
      [
        "<b>Commands</b>",
        "/start — welcome + Open Lumen",
        "/app — Mini App button",
        "/status — node snapshot (public metrics)",
        "/oracles — ERG/USD + ERG/XAU",
        "/link CODE — import browser bridge settings",
        "/alerts — alert status",
        "/alertstest — test alert (no space)",
        "/alerts on|off — enable / mute",
        "/help — this list",
      ].join("\n")
    );
    return;
  }

  if (cmd === "/link") {
    const code = (parts[1] || arg || "").trim();
    if (!code) {
      await replyHtml(
        chatId,
        [
          "<b>Link browser settings</b>",
          "",
          "1. On desktop browser: Settings → <b>Link Telegram</b>",
          "2. Copy the 6-char code",
          "3. Here: <code>/link ABC123</code>",
          "4. Open Mini App — My Node / My Oracle restore",
          "",
          "Bridge agent is <b>not</b> reinstalled — same token.",
        ].join("\n")
      );
      return;
    }
    const result = claimLinkCode(userId, code);
    if (!result.ok) {
      await replyHtml(
        chatId,
        result.error === "code_invalid_or_expired"
          ? "❌ Code invalid or expired. Generate a new one in browser Settings."
          : `❌ Link failed: ${result.error}`
      );
      return;
    }
    const fp = tokenFingerprint(result.settings.bridgeToken);
    const tail = result.settings.bridgeToken.slice(-6);
    await replyHtml(
      chatId,
      [
        "✅ <b>Settings linked</b>",
        `Token · <code>${fp}…</code> · ends <code>…${tail}</code>`,
        result.settings.nodeMode
          ? `Node mode · ${result.settings.nodeMode}`
          : "",
        result.settings.oracleView
          ? `Oracle view · ${result.settings.oracleView}`
          : "",
        "",
        "1. Close Mini App completely",
        "2. Open Lumen again from the bot",
        "3. Settings must show the same ends <code>…" +
          tail +
          "</code>",
        "",
        "If still wrong: Mini App Settings → <b>Restore from vault</b>",
        "Docker / bridge on your machine stays as-is.",
      ]
        .filter(Boolean)
        .join("\n")
    );
    return;
  }

  if (cmd === "/alerts") {
    const subs = listSubsForUser(userId);
    if (arg === "on") {
      const n = setSubEnabled(userId, true);
      await replyHtml(
        chatId,
        n
          ? `✅ Alerts <b>enabled</b> (${n} subscription${n > 1 ? "s" : ""}).`
          : "No subscription yet. Open Mini App → Settings → enable <b>Telegram alerts</b> (bridge token required)."
      );
      return;
    }
    if (arg === "off") {
      const n = setSubEnabled(userId, false);
      await replyHtml(
        chatId,
        n
          ? "🔇 Alerts <b>muted</b>. /alerts on to re-enable."
          : "No subscription found."
      );
      return;
    }
    if (arg === "test") {
      const ok = await sendTestAlert(chatId);
      await replyHtml(
        chatId,
        ok ? "✅ Test sent." : "❌ Could not send test (bot token?).",
        false
      );
      return;
    }
    if (arg === "delete" || arg === "remove") {
      const n = deleteSubsForUser(userId);
      await replyHtml(
        chatId,
        n ? `Removed ${n} subscription(s).` : "Nothing to remove."
      );
      return;
    }

    const chatKnown = getChatIdForUser(userId) != null;
    if (!subs.length) {
      await replyHtml(
        chatId,
        [
          "<b>Telegram alerts</b> (TA-1)",
          "",
          chatKnown
            ? "Chat linked ✓"
            : "Chat will link on any message (done).",
          "",
          "No active subscription.",
          "1. Open Mini App → Settings",
          "2. Connect bridge token",
          "3. Enable <b>Telegram alerts</b>",
          "",
          "Then: /alerts test",
        ].join("\n")
      );
      return;
    }

    const lines = subs.map((s) => {
      const p = publicSubView(s);
      const scopes = [
        p.scopes.node ? "node" : null,
        p.scopes.oracle ? "oracle" : null,
      ]
        .filter(Boolean)
        .join("+");
      return `• <code>${p.tokenFp}…</code> ${p.prefs.enabled ? "ON" : "OFF"} · ${scopes}${p.lastTickAt ? ` · tick ${p.lastTickAt.slice(11, 19)}Z` : ""}`;
    });
    await replyHtml(
      chatId,
      [
        "<b>Your alert subscriptions</b>",
        ...lines,
        "",
        "/alerts on · /alerts off · /alerts test",
      ].join("\n")
    );
    return;
  }

  if (cmd === "/status") {
    // Prefer public chain/node paths already exposed by Lumen UI
    const node = (await fetchJson("/api/node/info")) as {
      fullHeight?: number;
      headersHeight?: number;
      peersCount?: number;
      name?: string;
    } | null;
    const peers = (await fetchJson("/api/node/peers/connected")) as
      | unknown[]
      | null;
    const height =
      node?.fullHeight ?? node?.headersHeight ?? "—";
    const peerN =
      typeof peers?.length === "number"
        ? peers.length
        : node?.peersCount ?? "—";
    await replyHtml(
      chatId,
      [
        "<b>Node status</b> (read-only)",
        `Height: <code>${esc(String(height))}</code>`,
        `Peers: <code>${esc(String(peerN))}</code>`,
        node?.name ? `Name: <code>${esc(String(node.name))}</code>` : "",
        "",
        "Open Mini App for full dashboard.",
      ]
        .filter(Boolean)
        .join("\n")
    );
    return;
  }

  if (cmd === "/oracles") {
    const data = (await fetchJson("/api/oracles?mode=network")) as {
      feeds?: Array<{
        pair?: string;
        priceLabel?: string | null;
        status?: string;
        activeOracles?: number | null;
        totalOracles?: number | null;
      }>;
    } | null;
    const lines = (data?.feeds || []).map((f) => {
      const act = f.activeOracles ?? "—";
      const tot = f.totalOracles ?? "—";
      return `• <b>${esc(f.pair || "?")}</b> ${esc(f.priceLabel || "—")} · ${esc(f.status || "?")} · ${act}/${tot}`;
    });
    await replyHtml(
      chatId,
      ["<b>Oracles</b>", ...(lines.length ? lines : ["(no data)"]), "", "Open Oracles in Mini App."].join(
        "\n"
      )
    );
    return;
  }

  // Unknown — short nudge
  await replyHtml(
    chatId,
    "Unknown command. Try /help or open the Mini App.",
    true
  );
}

/**
 * POST /api/tg/webhook — Telegram Bot updates.
 * Optional header secret: X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(req: NextRequest) {
  if (!getBotToken()) {
    return NextResponse.json(
      { ok: false, disabled: true, error: "telegram_bot_not_configured" },
      { status: 503 }
    );
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    const hdr = req.headers.get("x-telegram-bot-api-secret-token");
    if (hdr !== secret) {
      return NextResponse.json({ ok: false, error: "bad_secret" }, { status: 401 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const msg = update.message;
  // MUST await: fire-and-forget is killed after response in Next.js,
  // so /help never replied. Long-poll hits localhost — no Telegram webhook timeout.
  if (msg?.text && msg.chat?.id != null) {
    try {
      await handleCommand(msg.chat.id, msg.text, msg.from?.id);
    } catch (e) {
      console.warn(
        "[tg/webhook] handler error",
        e instanceof Error ? e.message : "err"
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const configured = !!getBotToken();
  return NextResponse.json({
    ok: true,
    configured,
    webAppUrl: getWebAppUrl(),
    hint: configured
      ? "POST Telegram updates here. setWebhook to this URL."
      : "Set TELEGRAM_BOT_TOKEN to enable.",
    keyboard: webAppKeyboard(),
  });
}
