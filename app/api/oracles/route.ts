import { NextResponse } from "next/server";
import { loadOraclesSnapshot } from "@/lib/oracles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/oracles
 * Network view of ERG/USD + ERG/XAU oracle pools (on-chain pool boxes).
 */
export async function GET() {
  try {
    const data = await loadOraclesSnapshot();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        generatedAt: Date.now(),
        tipHeight: null,
        avgBlockMs: 120_000,
        feeds: [],
        error: e?.message || "oracles unavailable",
      },
      { status: 502 }
    );
  }
}
