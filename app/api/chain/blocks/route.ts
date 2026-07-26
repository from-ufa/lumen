import { NextRequest, NextResponse } from "next/server";
import { getRecentBlocks } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || 8);
    const blocks = await getRecentBlocks(Number.isFinite(limit) ? limit : 8);
    return NextResponse.json(
      { count: blocks.length, blocks },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "blocks error";
    return NextResponse.json(
      { error: "chain_unavailable", detail: message },
      { status: 502 }
    );
  }
}
