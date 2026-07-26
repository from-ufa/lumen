import { NextRequest, NextResponse } from "next/server";
import { getBlockById, NODE_URL } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;

    // Allow height as numeric path segment
    if (/^\d+$/.test(id)) {
      const h = Number(id);
      const at = await fetch(`${NODE_URL}/blocks/at/${h}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      });
      if (!at.ok) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      const ids: string[] = await at.json();
      const bid = ids?.[0];
      if (!bid) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      const block = await getBlockById(bid);
      if (!block) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json(block, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const block = await getBlockById(id);
    if (!block) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(block, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "block error";
    return NextResponse.json(
      { error: "chain_unavailable", detail: message },
      { status: 502 }
    );
  }
}
