import { NextRequest, NextResponse } from "next/server";
import { createLinkCode } from "@/app/lib/tg-settings-vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/tg/settings/link-code
 * Browser (no TG required): create one-time code to claim settings in Telegram.
 * Body: { bridgeToken, nodeMode?, oracleView? }
 */
export async function POST(req: NextRequest) {
  let body: {
    bridgeToken?: unknown;
    nodeMode?: unknown;
    oracleView?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const bridgeToken =
    typeof body.bridgeToken === "string" ? body.bridgeToken.trim() : "";
  if (bridgeToken.length < 10 || bridgeToken.length > 200) {
    return NextResponse.json(
      { ok: false, error: "bridge_token_required" },
      { status: 400 }
    );
  }

  const nodeMode =
    body.nodeMode === "my" || body.nodeMode === "lumen"
      ? body.nodeMode
      : null;
  const oracleView =
    body.oracleView === "my" || body.oracleView === "network"
      ? body.oracleView
      : null;

  try {
    const { code, expiresAt, expiresInSec } = createLinkCode({
      bridgeToken,
      nodeMode,
      oracleView,
    });
    return NextResponse.json({
      ok: true,
      code,
      expiresAt,
      expiresInSec,
      botHint: `/link ${code}`,
      instructions: [
        "1. Open @ergolumen_bot in Telegram",
        `2. Send: /link ${code}`,
        "3. Open Mini App — settings restore (bridge not reinstalled)",
      ],
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "create_failed",
      },
      { status: 400 }
    );
  }
}
