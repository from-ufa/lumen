import { NextRequest, NextResponse } from "next/server";
import {
  getBotToken,
  getWebAppUrl,
  replyHtml,
  tgApi,
  webAppKeyboard,
} from "@/app/lib/tg-bot";

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

async function handleCommand(chatId: number, text: string) {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
  const url = getWebAppUrl();

  if (cmd === "/start" || cmd === "/app") {
    await replyHtml(
      chatId,
      [
        "<b>lumen</b> — the living pulse of your Ergo node.",
        "",
        "Open the Mini App for Orbit, World Map, Oracles, and Bridge.",
        "",
        `Web: <a href="${esc(url)}">${esc(url)}</a>`,
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
        "/help — this list",
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
  if (msg?.text && msg.chat?.id != null) {
    try {
      await handleCommand(msg.chat.id, msg.text);
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
