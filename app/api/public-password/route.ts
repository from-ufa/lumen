import { NextRequest, NextResponse } from "next/server";
import {
  MIN_PASSWORD_LENGTH,
  clearPublicPassword,
  hasValidPublicAuth,
  isLocalRequest,
  readPublicPassword,
  writePublicPassword,
} from "../../../lib/public-password";

/**
 * POST /api/public-password
 * Body:
 *   { "password": "newpassword" }  — set/change (min 10 chars)
 *   { "clear": true }              — remove password → site fully open
 *
 * S3 security (does not affect SSH):
 *  - Site OPEN (no password): set password **only from localhost** (blocks remote takeover C2)
 *  - Site PROTECTED: change password with valid current Basic/cookie/header OR localhost
 *  - clear: **localhost only** (blocks opening site after stolen session H8)
 *
 * Writes `/home/lumen/.lumen-public-password` (chmod 600).
 */
export async function POST(req: NextRequest) {
  const current = readPublicPassword();
  const local = isLocalRequest(req);

  // C2 fix: when open, remote must NOT set a password
  if (!local && current.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Remote password set disabled while site is open. Set password via SSH/localhost only.",
        hint: 'On server: curl -X POST http://127.0.0.1:3000/api/public-password -H "Content-Type: application/json" -d \'{"password":"your-long-password"}\'',
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  // When already protected: need localhost or valid current public auth
  if (!local && current.length > 0 && !hasValidPublicAuth(req, current)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Unauthorized. Use localhost or valid public auth to change the password.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const clear =
    typeof body === "object" &&
    body !== null &&
    "clear" in body &&
    (body as { clear: unknown }).clear === true;

  if (clear) {
    // H8 fix: clear only from localhost (never open the site via stolen remote session)
    if (!local) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Clearing the public password is only allowed from the server (localhost/SSH).",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    try {
      clearPublicPassword();
    } catch (e) {
      console.error("[public-password] clear failed", e);
      return NextResponse.json(
        { success: false, error: "Failed to clear password file" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        success: true,
        publicMode: false,
        access: "open",
        message: "Password removed. Site is fully public.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const password =
    typeof body === "object" &&
    body !== null &&
    "password" in body &&
    typeof (body as { password: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  const trimmed = password.trim();

  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      },
      { status: 400 }
    );
  }

  if (/[\r\n\0]/.test(trimmed)) {
    return NextResponse.json(
      {
        success: false,
        error: "Password must be a single line without control characters",
      },
      { status: 400 }
    );
  }

  try {
    writePublicPassword(trimmed);
  } catch (e) {
    console.error("[public-password] write failed", e);
    return NextResponse.json(
      { success: false, error: "Failed to write password file" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      publicMode: true,
      access: "protected",
      message:
        "Password updated. Existing public sessions need to re-authenticate.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
