import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ address: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { address } = await ctx.params;
    if (!address || address.length < 20) {
      return NextResponse.json({ error: "invalid_address" }, { status: 400 });
    }
    const view = await getAddress(address);
    return NextResponse.json(view, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "address error";
    return NextResponse.json(
      { error: "chain_unavailable", detail: message },
      { status: 502 }
    );
  }
}
