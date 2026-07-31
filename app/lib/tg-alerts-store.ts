/**
 * Telegram alert subscriptions — encrypted bridge token + chat binding.
 * Store: data/tg-alert-subs.json (mode 0600).
 */

import fs from "fs";
import path from "path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "crypto";

export const TG_ALERTS_STORE = path.join(
  process.cwd(),
  "data",
  "tg-alert-subs.json"
);

export type TgAlertState = {
  status: "ok" | "bad" | "unknown";
  since: number;
  lastNotifiedAt: number | null;
  /** Optional probe snapshot (height, peers) for stuck / lag logic */
  meta?: {
    height?: number | null;
    peers?: number | null;
    headers?: number | null;
  };
};

export type TgAlertSubscription = {
  id: string;
  tgUserId: number;
  chatId: number;
  bridgeTokenHash: string;
  /** AES-256-GCM encrypted bridge token (base64: iv.tag.ciphertext) */
  tokenEnc: string;
  label?: string | null;
  scopes: {
    node: boolean;
    oracle: boolean;
  };
  prefs: {
    enabled: boolean;
    claimReminder: boolean;
    claimMinTokens: number;
    minPeers: number;
    postLagBlocks: number;
  };
  state: Record<string, TgAlertState>;
  createdAt: string;
  updatedAt: string;
  lastTickAt?: string | null;
  lastError?: string | null;
};

type StoreFile = {
  version: 1;
  updatedAt: string;
  /** tgUserId string → last known private chatId */
  chatByUser: Record<string, number>;
  subscriptions: TgAlertSubscription[];
};

const DEFAULT_PREFS: TgAlertSubscription["prefs"] = {
  enabled: true,
  claimReminder: false,
  claimMinTokens: 100,
  minPeers: 3,
  postLagBlocks: 24,
};

function secretKey(): Buffer {
  const raw =
    process.env.TELEGRAM_SESSION_SECRET?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    "lumen-tg-alerts-dev";
  return createHash("sha256").update(`lumen-tg-alerts:${raw}`).digest();
}

export function hashBridgeToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function encryptToken(plain: string): string {
  const key = secretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptToken(blob: string): string | null {
  try {
    const [ivB, tagB, dataB] = blob.split(".");
    if (!ivB || !tagB || !dataB) return null;
    const key = secretKey();
    const iv = Buffer.from(ivB, "base64url");
    const tag = Buffer.from(tagB, "base64url");
    const data = Buffer.from(dataB, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    return null;
  }
}

function emptyStore(): StoreFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    chatByUser: {},
    subscriptions: [],
  };
}

export function loadAlertStore(): StoreFile {
  try {
    if (!fs.existsSync(TG_ALERTS_STORE)) return emptyStore();
    const raw = fs.readFileSync(TG_ALERTS_STORE, "utf8");
    const j = JSON.parse(raw) as StoreFile;
    if (!j || j.version !== 1) return emptyStore();
    return {
      version: 1,
      updatedAt: j.updatedAt || new Date().toISOString(),
      chatByUser:
        j.chatByUser && typeof j.chatByUser === "object" ? j.chatByUser : {},
      subscriptions: Array.isArray(j.subscriptions) ? j.subscriptions : [],
    };
  } catch {
    return emptyStore();
  }
}

export function saveAlertStore(store: StoreFile): void {
  const dir = path.dirname(TG_ALERTS_STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const next: StoreFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    chatByUser: store.chatByUser,
    // Cap growth
    subscriptions: store.subscriptions.slice(-200),
  };
  fs.writeFileSync(TG_ALERTS_STORE, JSON.stringify(next, null, 2), {
    mode: 0o600,
  });
}

export function recordChatId(tgUserId: number, chatId: number): void {
  if (!Number.isFinite(tgUserId) || !Number.isFinite(chatId)) return;
  const store = loadAlertStore();
  store.chatByUser[String(tgUserId)] = chatId;
  // Keep chatId fresh on existing subs for this user
  for (const s of store.subscriptions) {
    if (s.tgUserId === tgUserId) s.chatId = chatId;
  }
  saveAlertStore(store);
}

export function getChatIdForUser(tgUserId: number): number | null {
  const store = loadAlertStore();
  const c = store.chatByUser[String(tgUserId)];
  return typeof c === "number" && Number.isFinite(c) ? c : null;
}

function shortId(): string {
  return randomBytes(6).toString("hex");
}

export function findSubByUserAndTokenHash(
  tgUserId: number,
  tokenHash: string
): TgAlertSubscription | null {
  const store = loadAlertStore();
  return (
    store.subscriptions.find(
      (s) => s.tgUserId === tgUserId && s.bridgeTokenHash === tokenHash
    ) || null
  );
}

export function listSubsForUser(tgUserId: number): TgAlertSubscription[] {
  return loadAlertStore().subscriptions.filter((s) => s.tgUserId === tgUserId);
}

export function upsertSubscription(opts: {
  tgUserId: number;
  chatId: number;
  bridgeToken: string;
  scopes?: Partial<TgAlertSubscription["scopes"]>;
  prefs?: Partial<TgAlertSubscription["prefs"]>;
  label?: string | null;
}): TgAlertSubscription {
  const store = loadAlertStore();
  const token = opts.bridgeToken.trim();
  const hash = hashBridgeToken(token);
  const now = new Date().toISOString();
  let sub = store.subscriptions.find(
    (s) => s.tgUserId === opts.tgUserId && s.bridgeTokenHash === hash
  );
  if (sub) {
    sub.chatId = opts.chatId;
    sub.tokenEnc = encryptToken(token);
    sub.scopes = {
      node: opts.scopes?.node ?? sub.scopes.node,
      oracle: opts.scopes?.oracle ?? sub.scopes.oracle,
    };
    sub.prefs = {
      ...sub.prefs,
      ...opts.prefs,
      enabled: opts.prefs?.enabled ?? sub.prefs.enabled,
    };
    if (opts.label != null) sub.label = opts.label;
    sub.updatedAt = now;
  } else {
    sub = {
      id: shortId(),
      tgUserId: opts.tgUserId,
      chatId: opts.chatId,
      bridgeTokenHash: hash,
      tokenEnc: encryptToken(token),
      label: opts.label ?? null,
      scopes: {
        node: opts.scopes?.node ?? true,
        oracle: opts.scopes?.oracle ?? true,
      },
      prefs: { ...DEFAULT_PREFS, ...opts.prefs },
      state: {},
      createdAt: now,
      updatedAt: now,
    };
    store.subscriptions.push(sub);
  }
  store.chatByUser[String(opts.tgUserId)] = opts.chatId;
  saveAlertStore(store);
  return sub;
}

export function setSubEnabled(
  tgUserId: number,
  enabled: boolean,
  subId?: string
): number {
  const store = loadAlertStore();
  let n = 0;
  for (const s of store.subscriptions) {
    if (s.tgUserId !== tgUserId) continue;
    if (subId && s.id !== subId) continue;
    s.prefs.enabled = enabled;
    s.updatedAt = new Date().toISOString();
    n += 1;
  }
  if (n) saveAlertStore(store);
  return n;
}

export function deleteSubsForUser(tgUserId: number, subId?: string): number {
  const store = loadAlertStore();
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter((s) => {
    if (s.tgUserId !== tgUserId) return true;
    if (subId) return s.id !== subId;
    return false;
  });
  const removed = before - store.subscriptions.length;
  if (removed) saveAlertStore(store);
  return removed;
}

export function updateSubState(
  subId: string,
  stateKey: string,
  patch: TgAlertState,
  extra?: { lastTickAt?: string; lastError?: string | null }
): void {
  const store = loadAlertStore();
  const sub = store.subscriptions.find((s) => s.id === subId);
  if (!sub) return;
  sub.state[stateKey] = patch;
  if (extra?.lastTickAt) sub.lastTickAt = extra.lastTickAt;
  if (extra && "lastError" in extra) sub.lastError = extra.lastError ?? null;
  sub.updatedAt = new Date().toISOString();
  saveAlertStore(store);
}

export function touchSubTick(
  subId: string,
  opts?: { lastError?: string | null }
): void {
  const store = loadAlertStore();
  const sub = store.subscriptions.find((s) => s.id === subId);
  if (!sub) return;
  sub.lastTickAt = new Date().toISOString();
  if (opts && "lastError" in opts) sub.lastError = opts.lastError ?? null;
  sub.updatedAt = new Date().toISOString();
  saveAlertStore(store);
}

export function listEnabledSubs(): TgAlertSubscription[] {
  return loadAlertStore().subscriptions.filter((s) => s.prefs.enabled);
}

/** Public-safe view (no tokenEnc) */
export function publicSubView(s: TgAlertSubscription) {
  return {
    id: s.id,
    scopes: s.scopes,
    prefs: {
      enabled: s.prefs.enabled,
      claimReminder: s.prefs.claimReminder,
      claimMinTokens: s.prefs.claimMinTokens,
      minPeers: s.prefs.minPeers,
      postLagBlocks: s.prefs.postLagBlocks,
    },
    label: s.label ?? null,
    tokenFp: s.bridgeTokenHash.slice(0, 12),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    lastTickAt: s.lastTickAt ?? null,
    lastError: s.lastError ?? null,
    stateSummary: Object.fromEntries(
      Object.entries(s.state).map(([k, v]) => [
        k,
        {
          status: v.status,
          since: v.since,
          lastNotifiedAt: v.lastNotifiedAt,
          meta: v.meta ?? null,
        },
      ])
    ),
  };
}

export function verifyInternalSecret(header: string | null): boolean {
  const expected =
    process.env.LUMEN_INTERNAL_SECRET?.trim() ||
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    "";
  if (!expected || !header) return false;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(header);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
