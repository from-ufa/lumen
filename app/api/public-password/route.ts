import { NextRequest, NextResponse } from "next/server";
import {
  MIN_PASSWORD_LENGTH,
  hasValidPublicAuth,
  isLocalRequest,
  readPublicPassword,
  writePublicPassword,
} from "../../../lib/public-password";

/**
 * POST /api/public-password
 * Body: { "password": "newpassword" }  (min 10 chars)
 *
 * Allowed from:
 *  - localhost / SSH tunnel (always)
 *  - remote with valid Basic / cookie / X-Lumen-Password against CURRENT password
 *
 * Writes `/home/aether/.lumen-public-password` (chmod 600).
 */
export async function POST(req: NextRequest) {
  const current = readPublicPassword();
  const local = isLocalRequest(req);

  if (!local && !hasValidPublicAuth(req, current)) {
    return NextResponse.json(
      {
        success: false,
        error:
          current.length > 0
            ? "Unauthorized. Use localhost or valid public auth to change the password."
            : "Public Mode is off. Change password only from localhost / SSH tunnel.",
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

  // Reject control characters / newlines (file is single-line)
  if (/[\r\n\0]/.test(trimmed)) {
    return NextResponse.json(
      { success: false, error: "Password must be a single line without control characters" },
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
      message: "Password updated. Existing public sessions need to re-authenticate.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
