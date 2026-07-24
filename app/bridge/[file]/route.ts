import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public download of Lumen Bridge install artifacts.
 * GET /bridge/install.sh | /bridge/bridge.js | /bridge/package.json
 *
 * Source of truth lives in /home/aether/bridge/ (not duplicated in public/).
 */

const ALLOWED: Record<
  string,
  { disk: string; contentType: string; disposition: string }
> = {
  "install.sh": {
    disk: "install.sh",
    contentType: "text/x-shellscript; charset=utf-8",
    disposition: 'inline; filename="install.sh"',
  },
  "bridge.js": {
    disk: "bridge.js",
    contentType: "application/javascript; charset=utf-8",
    disposition: 'inline; filename="bridge.js"',
  },
  "package.json": {
    disk: "package.json",
    contentType: "application/json; charset=utf-8",
    disposition: 'inline; filename="package.json"',
  },
};

type Ctx = { params: Promise<{ file: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { file } = await ctx.params;
  const meta = ALLOWED[file];
  if (!meta) {
    return NextResponse.json(
      {
        error: "not_found",
        message: "Allowed: install.sh, bridge.js, package.json",
      },
      { status: 404 }
    );
  }

  const diskPath = path.join(process.cwd(), "bridge", meta.disk);

  try {
    const body = await readFile(diskPath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": meta.contentType,
        "Content-Disposition": meta.disposition,
        "Cache-Control": "public, max-age=60",
        "X-Lumen-Bridge-Asset": file,
        // Easy to curl from other hosts
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "read_failed";
    return NextResponse.json(
      { error: "read_failed", message, path: meta.disk },
      { status: 500 }
    );
  }
}
