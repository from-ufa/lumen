/**
 * TS-1: bridge settings vault linked to Telegram user.
 * - Browser creates short-lived link code (token stays encrypted).
 * - Bot /link CODE or Mini App claim binds to tgUserId.
 * - Mini App hydrates localStorage from vault (never wipes non-empty local token).
 */

import fs from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import {
  decryptToken,
  encryptToken,
} from "./tg-alerts-store";

export const TG_SETTINGS_STORE = path.join(
  process.cwd(),
  "data",
  "tg-settings-vault.json"
);

const LINK_TTL_MS = 15 * 60_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export type TgVaultSettings = {
  bridgeTokenEnc: string;
  nodeMode?: "lumen" | "my" | null;
  oracleView?: "network" | "my" | null;
  updatedAt: string;
  /**
   * After /link claim: Mini App must overwrite localStorage once
   * even if a different/stale token is already present.
   */
  forceHydrateOnce?: boolean;
};

export type PendingLink = {
  code: string;
  bridgeTokenEnc: string;
  nodeMode?: "lumen" | "my" | null;
  oracleView?: "network" | "my" | null;
  createdAt: string;
  expiresAt: number;
  used: boolean;
};

type StoreFile = {
  version: 1;
  updatedAt: string;
  /** tgUserId string → settings */
  vault: Record<string, TgVaultSettings>;
  pending: PendingLink[];
};

function empty(): StoreFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    vault: {},
    pending: [],
  };
}

export function loadSettingsStore(): StoreFile {
  try {
    if (!fs.existsSync(TG_SETTINGS_STORE)) return empty();
    const j = JSON.parse(fs.readFileSync(TG_SETTINGS_STORE, "utf8")) as StoreFile;
    if (!j || j.version !== 1) return empty();
    return {
      version: 1,
      updatedAt: j.updatedAt || new Date().toISOString(),
      vault: j.vault && typeof j.vault === "object" ? j.vault : {},
      pending: Array.isArray(j.pending) ? j.pending : [],
    };
  } catch {
    return empty();
  }
}

export function saveSettingsStore(store: StoreFile): void {
  const dir = path.dirname(TG_SETTINGS_STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // prune expired unused links
  const now = Date.now();
  store.pending = store.pending
    .filter((p) => !p.used && p.expiresAt > now)
    .slice(-100);
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(TG_SETTINGS_STORE, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

function genCode(): string {
  const bytes = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return s;
}

export function createLinkCode(opts: {
  bridgeToken: string;
  nodeMode?: "lumen" | "my" | null;
  oracleView?: "network" | "my" | null;
}): {
  code: string;
  expiresAt: number;
  expiresInSec: number;
  tokenFp: string;
  tokenTail: string;
} {
  const token = opts.bridgeToken.trim();
  if (token.length < 10) throw new Error("token_too_short");
  const store = loadSettingsStore();
  const code = genCode();
  const expiresAt = Date.now() + LINK_TTL_MS;
  store.pending.push({
    code,
    bridgeTokenEnc: encryptToken(token),
    nodeMode: opts.nodeMode ?? null,
    oracleView: opts.oracleView ?? null,
    createdAt: new Date().toISOString(),
    expiresAt,
    used: false,
  });
  saveSettingsStore(store);
  return {
    code,
    expiresAt,
    expiresInSec: Math.floor(LINK_TTL_MS / 1000),
    tokenFp: tokenFingerprint(token),
    tokenTail: token.slice(-6),
  };
}

export function claimLinkCode(
  tgUserId: number,
  rawCode: string
): {
  ok: true;
  settings: { bridgeToken: string; nodeMode: string | null; oracleView: string | null };
} | { ok: false; error: string } {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) return { ok: false, error: "bad_code" };
  const store = loadSettingsStore();
  const now = Date.now();
  const link = store.pending.find(
    (p) => p.code === code && !p.used && p.expiresAt > now
  );
  if (!link) return { ok: false, error: "code_invalid_or_expired" };
  const plain = decryptToken(link.bridgeTokenEnc);
  if (!plain) return { ok: false, error: "decrypt_failed" };

  link.used = true;
  store.vault[String(tgUserId)] = {
    bridgeTokenEnc: link.bridgeTokenEnc,
    nodeMode: link.nodeMode ?? null,
    oracleView: link.oracleView ?? null,
    updatedAt: new Date().toISOString(),
    forceHydrateOnce: true,
  };
  saveSettingsStore(store);
  return {
    ok: true,
    settings: {
      bridgeToken: plain,
      nodeMode: link.nodeMode ?? null,
      oracleView: link.oracleView ?? null,
    },
  };
}

export function getVaultForUser(tgUserId: number): {
  bridgeToken: string;
  nodeMode: string | null;
  oracleView: string | null;
  updatedAt: string;
  forceHydrateOnce: boolean;
  tokenTail: string;
} | null {
  const store = loadSettingsStore();
  const v = store.vault[String(tgUserId)];
  if (!v) return null;
  const plain = decryptToken(v.bridgeTokenEnc);
  if (!plain) return null;
  return {
    bridgeToken: plain,
    nodeMode: v.nodeMode ?? null,
    oracleView: v.oracleView ?? null,
    updatedAt: v.updatedAt,
    forceHydrateOnce: !!v.forceHydrateOnce,
    tokenTail: plain.slice(-6),
  };
}

/** Clear forceHydrateOnce after Mini App applied vault token. */
export function clearForceHydrate(tgUserId: number): void {
  const store = loadSettingsStore();
  const v = store.vault[String(tgUserId)];
  if (!v?.forceHydrateOnce) return;
  v.forceHydrateOnce = false;
  v.updatedAt = new Date().toISOString();
  saveSettingsStore(store);
}

export function putVaultForUser(
  tgUserId: number,
  opts: {
    bridgeToken: string;
    nodeMode?: "lumen" | "my" | null;
    oracleView?: "network" | "my" | null;
  }
): void {
  const store = loadSettingsStore();
  const prev = store.vault[String(tgUserId)];
  store.vault[String(tgUserId)] = {
    bridgeTokenEnc: encryptToken(opts.bridgeToken.trim()),
    nodeMode: opts.nodeMode ?? prev?.nodeMode ?? null,
    oracleView: opts.oracleView ?? prev?.oracleView ?? null,
    updatedAt: new Date().toISOString(),
    forceHydrateOnce: false,
  };
  saveSettingsStore(store);
}

export function clearVaultForUser(tgUserId: number): boolean {
  const store = loadSettingsStore();
  if (!store.vault[String(tgUserId)]) return false;
  delete store.vault[String(tgUserId)];
  saveSettingsStore(store);
  return true;
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex").slice(0, 12);
}
