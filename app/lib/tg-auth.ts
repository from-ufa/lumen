/**
 * Server-side Telegram WebApp initData validation (HMAC-SHA256).
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import { createHmac, createHash, timingSafeEqual } from "crypto";

export const TG_SESSION_COOKIE = "lumen_tg_auth";
/** Max age for auth_date (seconds) — 24h */
export const TG_AUTH_MAX_AGE_SEC = 24 * 60 * 60;
/** Session cookie lifetime */
export const TG_SESSION_MAX_AGE_SEC = 12 * 60 * 60;

export type TgValidatedUser = {
  id: number;
  first_name?: string;
  username?: string;
};

export type TgValidateResult =
  | { ok: true; user: TgValidatedUser | null; authDate: number }
  | { ok: false; error: string };

function getBotToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t && t.length > 10 ? t : null;
}

export function isTelegramBotConfigured(): boolean {
  return !!getBotToken();
}

/**
 * Validate raw initData query string from Telegram.WebApp.initData.
 * Never log full initData or bot token.
 */
export function validateTelegramInitData(initData: string): TgValidateResult {
  const token = getBotToken();
  if (!token) {
    return { ok: false, error: "bot_token_missing" };
  }
  if (!initData || typeof initData !== "string" || initData.length > 8192) {
    return { ok: false, error: "invalid_init_data" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: "parse_failed" };
  }

  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    return { ok: false, error: "missing_hash" };
  }
  params.delete("hash");

  // data-check-string: sorted key=value joined by \n
  const pairs: string[] = [];
  const keys = [...params.keys()].sort();
  for (const key of keys) {
    const val = params.get(key);
    if (val != null) pairs.push(`${key}=${val}`);
  }
  const dataCheckString = pairs.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const calculated = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  try {
    const a = Buffer.from(calculated, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "bad_signature" };
    }
  } catch {
    return { ok: false, error: "bad_signature" };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: "bad_auth_date" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > TG_AUTH_MAX_AGE_SEC) {
    return { ok: false, error: "expired" };
  }
  if (authDate > now + 120) {
    return { ok: false, error: "auth_date_future" };
  }

  let user: TgValidatedUser | null = null;
  const userJson = params.get("user");
  if (userJson) {
    try {
      const u = JSON.parse(userJson) as {
        id?: number;
        first_name?: string;
        username?: string;
      };
      if (u.id != null && Number.isFinite(u.id)) {
        user = {
          id: Number(u.id),
          first_name: u.first_name,
          username: u.username,
        };
      }
    } catch {
      /* user optional */
    }
  }

  return { ok: true, user, authDate };
}

/** Signed session value for cookie (not the bot token). */
export function makeTgSessionToken(userId: number, authDate: number): string {
  const secret =
    process.env.TELEGRAM_SESSION_SECRET?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    "lumen-tg-dev";
  const payload = `${userId}.${authDate}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyTgSessionToken(token: string): {
  ok: boolean;
  userId?: number;
} {
  if (!token || typeof token !== "string") return { ok: false };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const [uidStr, authStr, sig] = parts;
  const userId = Number(uidStr);
  const authDate = Number(authStr);
  if (!Number.isFinite(userId) || !Number.isFinite(authDate)) return { ok: false };
  const expected = makeTgSessionToken(userId, authDate);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  } catch {
    return { ok: false };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > TG_SESSION_MAX_AGE_SEC) return { ok: false };
  return { ok: true, userId };
}

export function sessionFingerprint(userId: number): string {
  return createHash("sha256").update(`tg:${userId}`).digest("hex").slice(0, 12);
}
