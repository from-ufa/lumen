import { createHash } from "crypto";
import fs from "fs";
import type { NextRequest } from "next/server";

/**
 * Absolute path to the single-line public password file (chmod 600).
 * Fixed path (not process.cwd()) so Turbopack does not NFT-trace the whole tree.
 *
 * Rebrand (Aether → Lumen): prefer LUMEN_PASSWORD_FILE / .lumen-public-password,
 * fall back to legacy AETHER_* / .aether-public-password so prod keeps working.
 */
const CANDIDATE_PASSWORD_FILES = [
  process.env.LUMEN_PASSWORD_FILE,
  process.env.AETHER_PASSWORD_FILE,
  "/home/aether/.lumen-public-password",
  "/home/aether/.aether-public-password",
].filter((p): p is string => Boolean(p && p.trim()));

function resolvePasswordFile(): string {
  for (const p of CANDIDATE_PASSWORD_FILES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  // Default write target: new Lumen name (create if missing)
  return (
    process.env.LUMEN_PASSWORD_FILE ||
    process.env.AETHER_PASSWORD_FILE ||
    "/home/aether/.lumen-public-password"
  );
}

export const PASSWORD_FILE = resolvePasswordFile();

/** Primary session cookie (Lumen). */
export const COOKIE_NAME = "lumen_public_auth";
/** Legacy cookie from pre-rebrand clients. */
export const LEGACY_COOKIE_NAME = "aether_public_auth";

export const MIN_PASSWORD_LENGTH = 10;
export const REALM = "Lumen Public Mode";

/** Read public password from file. Empty string = Public Mode off. */
export function readPublicPassword(): string {
  // Re-resolve each read so a newly created lumen file is preferred over empty legacy.
  const path = resolvePasswordFile();
  try {
    if (!fs.existsSync(path)) return "";
    const raw = fs.readFileSync(path, "utf8");
    // first non-empty line only
    const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
    return line.trim();
  } catch {
    return "";
  }
}

/** Write password (one line) and force mode 0600. Uses Lumen path (or env override). */
export function writePublicPassword(password: string): void {
  const value = password.trim();
  const path =
    process.env.LUMEN_PASSWORD_FILE ||
    process.env.AETHER_PASSWORD_FILE ||
    "/home/aether/.lumen-public-password";
  fs.writeFileSync(path, `${value}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(path, 0o600);
  } catch {
    // ignore chmod errors on exotic FS
  }
}

/**
 * Remove public password files → site open without Basic Auth.
 * Clears both Lumen and legacy Aether paths.
 */
export function clearPublicPassword(): void {
  const paths = [
    process.env.LUMEN_PASSWORD_FILE,
    process.env.AETHER_PASSWORD_FILE,
    "/home/aether/.lumen-public-password",
    "/home/aether/.aether-public-password",
  ].filter((p): p is string => Boolean(p && p.trim()));

  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // try empty write as fallback
      try {
        fs.writeFileSync(p, "", { encoding: "utf8", mode: 0o600 });
      } catch {
        /* ignore */
      }
    }
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

function cookieMatches(
  req: NextRequest,
  expected: string
): boolean {
  const primary = req.cookies.get(COOKIE_NAME)?.value;
  if (primary && primary === expected) return true;
  const legacy = req.cookies.get(LEGACY_COOKIE_NAME)?.value;
  if (legacy && legacy === expected) return true;
  return false;
}

function headerPasswordMatches(req: NextRequest, password: string): boolean {
  const h =
    req.headers.get("x-lumen-password") ||
    req.headers.get("x-aether-password");
  return h === password;
}

/**
 * True if request already has valid public session (cookie / basic / header)
 * against the current password file. Used by password-change API.
 */
export function hasValidPublicAuth(req: NextRequest, password: string): boolean {
  if (!password) return false;
  const expected = passwordHash(password);

  if (cookieMatches(req, expected)) return true;
  if (headerPasswordMatches(req, password)) return true;

  const basic = extractBasicPassword(req.headers.get("authorization"));
  if (basic === password) return true;

  return false;
}
