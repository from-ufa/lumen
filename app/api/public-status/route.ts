import { NextResponse } from "next/server";
import { isPublicModeEnabled } from "../../../lib/public-password";

/**
 * Tells the UI whether Public Mode is active (password file non-empty).
 * Never returns the password itself.
 */
export async function GET() {
  const publicMode = isPublicModeEnabled();

  return NextResponse.json(
    {
      publicMode,
      passwordConfigured: publicMode,
      storage: "file",
      auth: publicMode ? "basic-or-query-or-header" : "localhost-only",
      hint: publicMode
        ? "Remote access requires Basic Auth (any user), ?password=, or X-Lumen-Password header. Change password in NODE SETTINGS."
        : "No password set. Open NODE SETTINGS on localhost and set a public password (min 10 chars).",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
