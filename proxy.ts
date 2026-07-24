import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  REALM,
  extractBasicPassword,
  isLocalRequest,
  passwordHash,
  readPublicPassword,
} from "./lib/public-password";

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required for Lumen Public Mode", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}"`,
      "Cache-Control": "no-store",
      "X-Aether-Auth": "required",
    },
  });
}

function publicModeOff(): NextResponse {
  return new NextResponse(
    "Lumen Public Mode is off (no password file). Set a password from NODE SETTINGS on localhost, or write /home/aether/.aether-public-password",
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Aether-Auth": "public-off",
      },
    }
  );
}

/**
 * Next.js 16 Node proxy.
 * Public password is read from `.aether-public-password` on every request
 * (not process.env) so UI password changes apply without rebuild.
 */
export function proxy(req: NextRequest) {
  const password = readPublicPassword();
  const publicMode = password.length > 0;

  // Always allow local access (SSH -L unchanged)
  if (isLocalRequest(req)) {
    const res = NextResponse.next();
    res.headers.set(
      "X-Aether-Auth",
      publicMode ? "local-bypass" : "local-only-ok"
    );
    return res;
  }

  // No password file / empty → Public Mode off for remote
  if (!publicMode) {
    return publicModeOff();
  }

  const expectedHash = passwordHash(password);

  // Session cookie from prior Basic / ?password= auth
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === expectedHash) {
    const res = NextResponse.next();
    res.headers.set("X-Aether-Auth", "cookie-ok");
    return res;
  }

  // Share link: ?password=SECRET → set cookie, strip query
  const qPass = req.nextUrl.searchParams.get("password");
  if (qPass !== null && qPass === password) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("password");
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE_NAME, expectedHash, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: req.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.headers.set("X-Aether-Auth", "query-ok");
    return res;
  }

  // Custom header
  if (req.headers.get("x-aether-password") === password) {
    const res = NextResponse.next();
    res.headers.set("X-Aether-Auth", "header-ok");
    return res;
  }

  // HTTP Basic Auth (any username)
  const basicPass = extractBasicPassword(req.headers.get("authorization"));
  if (basicPass === password) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE_NAME, expectedHash, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: req.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.headers.set("X-Aether-Auth", "basic-ok");
    return res;
  }

  return unauthorized();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
