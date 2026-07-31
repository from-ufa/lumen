import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  LEGACY_COOKIE_NAME,
  REALM,
  extractBasicPassword,
  isLocalRequest,
  passwordHash,
  readPublicPassword,
} from "./lib/public-password";
import {
  TG_SESSION_COOKIE,
  verifyTgSessionToken,
} from "./app/lib/tg-auth";

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required for Lumen Public Mode", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}"`,
      "Cache-Control": "no-store",
      "X-Lumen-Auth": "required",
    },
  });
}

function setSessionCookie(
  res: NextResponse,
  expectedHash: string,
  req: NextRequest
) {
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 24 * 7,
  };
  res.cookies.set(COOKIE_NAME, expectedHash, opts);
  // Keep legacy cookie in sync so old bookmarks/sessions keep working
  res.cookies.set(LEGACY_COOKIE_NAME, expectedHash, opts);
}

/**
 * S4: paths a Telegram Mini App session may access when Public Mode is ON.
 * TG cookie is NOT a full operator password — no public-password admin, etc.
 * My Node still works via /api/bridge/node/* + client token.
 */
function tgSessionPathAllowed(pathname: string, method: string): boolean {
  // Pages / static app shell
  if (!pathname.startsWith("/api/")) return true;

  // Telegram own APIs
  if (pathname.startsWith("/api/tg/")) return true;

  // Product read APIs (dashboard + oracles)
  if (pathname.startsWith("/api/oracles")) return true;
  if (pathname.startsWith("/api/chain/")) return true;
  if (pathname.startsWith("/api/peers/")) return true;
  if (pathname === "/api/public-status") return true;
  if (pathname.startsWith("/api/push/")) return true;

  // Host node proxy (Lumen network mode in Mini App)
  if (pathname.startsWith("/api/node")) return true;

  // Bridge: user agent with their own token (not token registry admin)
  if (pathname.startsWith("/api/bridge/status")) return true;
  if (pathname.startsWith("/api/bridge/node")) return true;
  if (pathname.startsWith("/api/bridge/stats")) return true;
  // Mint + redacted list (POST still rate-limited in route)
  if (pathname === "/api/bridge/tokens") return true;

  // Explicit deny: public password admin (set/clear)
  if (pathname === "/api/public-password") return false;

  // Bridge install assets are handled earlier as public
  if (pathname.startsWith("/bridge/")) return true;

  // Unknown API under Public Mode + TG-only → deny
  void method;
  return false;
}

/**
 * Next.js 16 Node proxy.
 * Public password is read from the password file on every request
 * (not process.env) so UI password changes apply without rebuild.
 * Accepts Lumen + legacy Aether cookie/header names (rebrand 2026-07).
 */
export function proxy(req: NextRequest) {
  const password = readPublicPassword();
  const publicMode = password.length > 0;
  const pathname = req.nextUrl.pathname;
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];

  // Mini App host → rewrite into /m shell (web stays on ergolumen.net)
  // https://m.ergolumen.net/  →  /m
  // Must keep same host/proto as the incoming request — absolute
  // https://localhost rewrites break (Next listens HTTP only behind Caddy).
  if (host === "m.ergolumen.net" || host === "m.localhost") {
    const passThrough =
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/bridge/") ||
      pathname.startsWith("/m") ||
      pathname === "/favicon.ico" ||
      pathname === "/manifest.webmanifest";
    if (!passThrough) {
      const destPath = pathname === "/" ? "/m" : `/m${pathname}`;
      // Caddy terminates TLS; next-server is plain HTTP on 127.0.0.1:3000.
      // Absolute https:// rewrites → EPROTO (wrong version number).
      const url = new URL(destPath + req.nextUrl.search, "http://127.0.0.1:3000");
      return NextResponse.rewrite(url);
    }
  }

  // Public Bridge install / Docker assets (no secrets) — curl & docker build work remotely
  // GET /bridge/install.sh | bridge.js | package.json | package-lock.json
  //     Dockerfile | DOCKER.md | context.tar
  // GET + HEAD so curl -I / docker preflight work without Public Mode auth
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (pathname === "/bridge/install.sh" ||
      pathname === "/bridge/bridge.js" ||
      pathname === "/bridge/package.json" ||
      pathname === "/bridge/package-lock.json" ||
      pathname === "/bridge/Dockerfile" ||
      pathname === "/bridge/DOCKER.md" ||
      pathname === "/bridge/context.tar")
  ) {
    const res = NextResponse.next();
    res.headers.set("X-Lumen-Auth", "bridge-public-asset");
    return res;
  }

  // Telegram Mini App: auth + webhook must be reachable without Basic Auth
  // (client needs to POST initData; Telegram servers POST updates).
  if (
    pathname === "/api/tg/auth" ||
    pathname === "/api/tg/webhook" ||
    pathname === "/api/tg/status" ||
    pathname === "/api/tg/settings/link-code" ||
    pathname.startsWith("/api/tg/settings") ||
    pathname.startsWith("/api/tg/alerts")
  ) {
    const res = NextResponse.next();
    res.headers.set("X-Lumen-Auth", "tg-public-endpoint");
    return res;
  }

  // Always allow local access (SSH -L unchanged)
  if (isLocalRequest(req)) {
    const res = NextResponse.next();
    res.headers.set(
      "X-Lumen-Auth",
      publicMode ? "local-bypass" : "local-open"
    );
    return res;
  }

  // No password file / empty → site is fully public (open internet)
  // Set a password in NODE SETTINGS to re-enable Basic Auth protection.
  if (!publicMode) {
    const res = NextResponse.next();
    res.headers.set("X-Lumen-Auth", "open-no-password");
    return res;
  }

  const expectedHash = passwordHash(password);

  // Session cookie from prior Basic / ?password= auth (Lumen or legacy Aether)
  const cookie =
    req.cookies.get(COOKIE_NAME)?.value ||
    req.cookies.get(LEGACY_COOKIE_NAME)?.value;
  if (cookie && cookie === expectedHash) {
    const res = NextResponse.next();
    res.headers.set("X-Lumen-Auth", "cookie-ok");
    return res;
  }

  // Telegram Mini App session (HMAC-validated initData → short-lived cookie)
  // S4: scoped allowlist — not a full Public Mode password substitute
  const tgCookie = req.cookies.get(TG_SESSION_COOKIE)?.value;
  if (tgCookie) {
    const tg = verifyTgSessionToken(tgCookie);
    if (tg.ok) {
      if (tgSessionPathAllowed(pathname, req.method)) {
        const res = NextResponse.next();
        res.headers.set("X-Lumen-Auth", "tg-session-ok");
        return res;
      }
      // Valid TG session but path not allowed → fall through (need Basic/password)
      // e.g. /api/public-password
    }
  }

  // Share link: ?password=SECRET → set cookie, strip query
  const qPass = req.nextUrl.searchParams.get("password");
  if (qPass !== null && qPass === password) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("password");
    const res = NextResponse.redirect(url);
    setSessionCookie(res, expectedHash, req);
    res.headers.set("X-Lumen-Auth", "query-ok");
    return res;
  }

  // Custom header (Lumen preferred, Aether legacy accepted)
  const headerPass =
    req.headers.get("x-lumen-password") ||
    req.headers.get("x-aether-password");
  if (headerPass === password) {
    const res = NextResponse.next();
    res.headers.set("X-Lumen-Auth", "header-ok");
    return res;
  }

  // HTTP Basic Auth (any username)
  const basicPass = extractBasicPassword(req.headers.get("authorization"));
  if (basicPass === password) {
    const res = NextResponse.next();
    setSessionCookie(res, expectedHash, req);
    res.headers.set("X-Lumen-Auth", "basic-ok");
    return res;
  }

  return unauthorized();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
