/**
 * Telegram Bot API helpers (server-side). Token only from env.
 */

const API = "https://api.telegram.org";

export function getBotToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t && t.length > 10 ? t : null;
}

export function getWebAppUrl(): string {
  return (
    process.env.TELEGRAM_WEBAPP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://ergolumen.net"
  ).replace(/\/$/, "");
}

export async function tgApi<T = unknown>(
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = getBotToken();
  if (!token) return { ok: false, description: "bot_token_missing" };
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    return json;
  } catch (e) {
    return {
      ok: false,
      description: e instanceof Error ? e.message : "fetch_failed",
    };
  }
}

export function webAppKeyboard() {
  const url = getWebAppUrl();
  return {
    inline_keyboard: [
      [
        {
          text: "Open Lumen",
          web_app: { url },
        },
      ],
      [
        {
          text: "Oracles",
          web_app: { url: `${url}/oracles` },
        },
        {
          text: "World Map",
          web_app: { url: `${url}/?viz=map` },
        },
      ],
    ],
  };
}

export async function replyHtml(
  chatId: number,
  html: string,
  withAppButton = true
) {
  return tgApi("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: withAppButton ? webAppKeyboard() : undefined,
  });
}
