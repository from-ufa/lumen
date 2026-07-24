import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public download of Lumen Bridge install / Docker artifacts.
 *
 * GET /bridge/install.sh | bridge.js | package.json | package-lock.json
 * GET /bridge/Dockerfile | DOCKER.md
 * GET /bridge/context.tar  — Docker build context (docker build -t lumen-bridge <url>)
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
  "package-lock.json": {
    disk: "package-lock.json",
    contentType: "application/json; charset=utf-8",
    disposition: 'inline; filename="package-lock.json"',
  },
  Dockerfile: {
    disk: "Dockerfile",
    contentType: "text/plain; charset=utf-8",
    disposition: 'inline; filename="Dockerfile"',
  },
  "DOCKER.md": {
    disk: "DOCKER.md",
    contentType: "text/markdown; charset=utf-8",
    disposition: 'inline; filename="DOCKER.md"',
  },
};

/** Files included in the Docker build context tarball */
const CONTEXT_FILES = [
  "Dockerfile",
  "package.json",
  "package-lock.json",
  "bridge.js",
];

type Ctx = { params: Promise<{ file: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { file } = await ctx.params;
  const bridgeDir = path.join(process.cwd(), "bridge");

  // Special: docker build context as tar (no gzip — Docker expects plain tar URL)
  if (file === "context.tar") {
    try {
      const { stdout } = await execFileAsync(
        "tar",
        ["-c", "-C", bridgeDir, ...CONTEXT_FILES],
        { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 }
      );
      return new NextResponse(new Uint8Array(stdout), {
        status: 200,
        headers: {
          "Content-Type": "application/x-tar",
          "Content-Disposition": 'attachment; filename="lumen-bridge-context.tar"',
          "Cache-Control": "public, max-age=60",
          "X-Lumen-Bridge-Asset": "context.tar",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "tar_failed";
      return NextResponse.json(
        { error: "tar_failed", message },
        { status: 500 }
      );
    }
  }

  const meta = ALLOWED[file];
  if (!meta) {
    return NextResponse.json(
      {
        error: "not_found",
        message:
          "Allowed: install.sh, bridge.js, package.json, package-lock.json, Dockerfile, DOCKER.md, context.tar",
      },
      { status: 404 }
    );
  }

  const diskPath = path.join(bridgeDir, meta.disk);

  try {
    const body = await readFile(diskPath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": meta.contentType,
        "Content-Disposition": meta.disposition,
        "Cache-Control": "public, max-age=60",
        "X-Lumen-Bridge-Asset": file,
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
