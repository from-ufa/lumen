import { NextRequest, NextResponse } from "next/server";
import { getChainFeed } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const blocks = Number(sp.get("blocks") || 5);
    const mempool = Number(sp.get("mempool") || 30);
    const feed = await getChainFeed({
      blocks: Number.isFinite(blocks) ? blocks : 5,
      mempool: Number.isFinite(mempool) ? mempool : 30,
    });
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "chain feed error";
    return NextResponse.json(
      { error: "chain_unavailable", detail: message },
      { status: 502 }
    );
  }
}
