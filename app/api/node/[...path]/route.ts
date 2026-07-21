import { NextRequest, NextResponse } from "next/server";

/** Upstream Ergo node REST (server-side only). */
const UPSTREAM = (process.env.ERGO_NODE_URL || "http://127.0.0.1:9053").replace(
  /\/$/,
  ""
);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(req: NextRequest, path: string[]) {
  const targetPath = path.join("/");
  const search = req.nextUrl.search;
  const url = `${UPSTREAM}/${targetPath}${search}`;

  try {
    const res = await fetch(url, {
      method: req.method,
      headers: {
        Accept: "application/json",
      },
      // Node fetch to local Ergo — keep timeouts reasonable
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "proxy error";
    return NextResponse.json(
      { error: "upstream_unreachable", detail: message, upstream: UPSTREAM },
      { status: 502 }
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
