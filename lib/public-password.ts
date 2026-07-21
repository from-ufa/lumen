import { createHash } from "crypto";
import fs from "fs";
import type { NextRequest } from "next/server";

/**
 * Absolute path to the single-line public password file (chmod 600).
 * Fixed path (not process.cwd()) so Turbopack does not NFT-trace the whole tree.
 */
export const PASSWORD_FILE =
  process.env.AETHER_PASSWORD_FILE || "/home/aether/.aether-public-password";

export const COOKIE_NAME = "aether_public_auth";
export const MIN_PASSWORD_LENGTH = 10;
export const REALM = "Aether Public Mode";

/** Read public password from file. Empty string = Public Mode off. */
export function readPublicPassword(): string {
  try {
    if (!fs.existsSync(PASSWORD_FILE)) return "";
    const raw = fs.readFileSync(PASSWORD_FILE, "utf8");
    // first non-empty line only
    const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
    return line.trim();
  } catch {
    return "";
  }
}

/** Write password (one line) and force mode 0600. */
export function writePublicPassword(password: string): void {
  const value = password.trim();
  fs.writeFileSync(PASSWORD_FILE, `${value}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(PASSWORD_FILE, 0o600);
  } catch {
    // ignore chmod errors on exotic FS
  }
}

export function passwordHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isPublicModeEnabled(): boolean {
  return readPublicPassword().length > 0;
}

export function isLoopbackIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const v = ip.trim().toLowerCase();
  return (
    v === "127.0.0.1" ||
    v === "::1" ||
    v === ":ffff:127.0.0.1" ||
    v === "::ffff:127.0.0.1" ||
    v.startsWith("127.")
  );
}

/**
 * Local = Host is loopback (SSH tunnel / same-machine browser).
 * Do not trust nextUrl.hostname when bind is 0.0.0.0.
 */
export function isLocalRequest(req: NextRequest): boolean {
  const hostHeader = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const host = hostHeader.replace(/^\[|\]$/g, "");

  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }

  if (!host) {
    const urlHost = (req.nextUrl.hostname || "").toLowerCase();
    if (urlHost === "localhost" || urlHost === "127.0.0.1" || urlHost === "::1") {
      return true;
    }
    const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = req.headers.get("x-real-ip")?.trim();
    if (isLoopbackIp(xf) || isLoopbackIp(realIp)) {
      return true;
    }
  }

  return false;
}

export function extractBasicPassword(header: string | null): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    return idx >= 0 ? decoded.slice(idx + 1) : decoded;
  } catch {
    return null;
  }
}

/**
 * True if request already has valid public session (cookie / basic / header)
 * against the current password file. Used by password-change API.
 */
export function hasValidPublicAuth(req: NextRequest, password: string): boolean {
  if (!password) return false;
  const expected = passwordHash(password);

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === expected) return true;

  if (req.headers.get("x-aether-password") === password) return true;

  const basic = extractBasicPassword(req.headers.get("authorization"));
  if (basic === password) return true;

  return false;
}
