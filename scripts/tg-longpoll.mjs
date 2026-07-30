#!/usr/bin/env node
/**
 * Telegram long-poll bridge.
 * Hostens/inbound often times out for Telegram webhooks; outbound works.
 * Pull getUpdates → POST each update to local Next webhook.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnvLocal() {
  try {
    const p = path.join(ROOT, ".env.local");
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* */
  }
}

loadEnvLocal();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
  process.env.LUMEN_INTERNAL_SECRET?.trim() ||
  "";
const LOCAL =
  process.env.LUMEN_INTERNAL_URL?.trim() || "http://127.0.0.1:3000";
const WEBHOOK_PATH = `${LOCAL.replace(/\/$/, "")}/api/tg/webhook`;
const API = `https://api.telegram.org/bot${TOKEN}`;
const OFFSET_FILE = path.join(ROOT, "data", "tg-poll-offset.json");

if (!TOKEN || TOKEN.length < 10) {
  console.error("[tg-longpoll] TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}

function log(...a) {
  console.log(new Date().toISOString(), "[tg-longpoll]", ...a);
}

function loadOffset() {
  try {
    const j = JSON.parse(fs.readFileSync(OFFSET_FILE, "utf8"));
    return typeof j.offset === "number" ? j.offset : 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset) {
  try {
    const dir = path.dirname(OFFSET_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      OFFSET_FILE,
      JSON.stringify({ offset, updatedAt: new Date().toISOString() }),
      { mode: 0o600 }
    );
  } catch (e) {
    log("saveOffset fail", e.message);
  }
}

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function forward(update) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (SECRET) headers["X-Telegram-Bot-Api-Secret-Token"] = SECRET;
  const res = await fetch(WEBHOOK_PATH, {
    method: "POST",
    headers,
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`local webhook ${res.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function ensureNoWebhook() {
  const info = await tg("getWebhookInfo");
  const url = info?.result?.url || "";
  if (url) {
    log("deleting webhook", url);
    await tg("deleteWebhook", { drop_pending_updates: false });
  }
}

async function loop() {
  await ensureNoWebhook();
  let offset = loadOffset();
  log("start", { offset, local: WEBHOOK_PATH });

  for (;;) {
    try {
      const data = await tg("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      });
      if (!data.ok) {
        log("getUpdates fail", data.description || data);
        await sleep(3000);
        // If webhook was re-set elsewhere, clear again
        if (String(data.description || "").includes("webhook")) {
          await ensureNoWebhook();
        }
        continue;
      }
      const updates = data.result || [];
      for (const u of updates) {
        try {
          await forward(u);
          log("fwd", u.update_id, u.message?.text?.slice(0, 40) || "(no text)");
        } catch (e) {
          log("fwd error", e.message);
        }
        offset = u.update_id + 1;
        saveOffset(offset);
      }
    } catch (e) {
      log("loop error", e.message);
      await sleep(2000);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
