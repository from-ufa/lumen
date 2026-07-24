import { NextResponse } from "next/server";
import { isPublicModeEnabled } from "../../../lib/public-password";

/**
 * Tells the UI whether password protection is active (password file non-empty).
 * Never returns the password itself.
 *
 * Semantics (2026-07):
 *  - no password → site fully open on the internet
 *  - password set → remote visitors need Basic / cookie / header
 */
export async function GET() {
  const publicMode = isPublicModeEnabled();

  return NextResponse.json(
    {
      publicMode,
      passwordConfigured: publicMode,
      storage: "file",
      /** open = no password; protected = password required for remote */
      access: publicMode ? "protected" : "open",
      auth: publicMode ? "basic-or-query-or-header" : "none",
      hint: publicMode
        ? "Password protection ON. Remote visitors need Basic Auth (any user), ?password=, or X-Lumen-Password. Clear password in NODE SETTINGS to open the site."
        : "Site is fully public (no password). Set a password in NODE SETTINGS to protect remote access.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
