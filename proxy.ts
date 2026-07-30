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
 * Next.js 16 Node proxy.
 * Public password is read from the password file on every request
 * (not process.env) so UI password changes apply without rebuild.
 * Accepts Lumen + legacy Aether cookie/header names (rebrand 2026-07).
 */
export function proxy(req: NextRequest) {
  const password = readPublicPassword();
  const publicMode = password.length > 0;
  const pathname = req.nextUrl.pathname;

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
  const tgCookie = req.cookies.get(TG_SESSION_COOKIE)?.value;
  if (tgCookie) {
    const tg = verifyTgSessionToken(tgCookie);
    if (tg.ok) {
      const res = NextResponse.next();
      res.headers.set("X-Lumen-Auth", "tg-session-ok");
      return res;
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
