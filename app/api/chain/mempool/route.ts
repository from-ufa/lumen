import { NextRequest, NextResponse } from "next/server";
import { getMempool } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || 40);
    const txs = await getMempool(Number.isFinite(limit) ? limit : 40);
    return NextResponse.json(
      { count: txs.length, transactions: txs },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "mempool error";
    return NextResponse.json(
      { error: "chain_unavailable", detail: message },
      { status: 502 }
    );
  }
}
