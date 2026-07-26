import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!id || id.length < 16) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }
    const token = await getToken(id);
    return NextResponse.json(token, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "token error";
    return NextResponse.json(
      { error: "chain_unavailable", detail: message },
      { status: 502 }
    );
  }
}
