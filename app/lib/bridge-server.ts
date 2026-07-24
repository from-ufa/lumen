/**
 * Client helpers for the Lumen Bridge Server (separate Node process).
 * Default: http://127.0.0.1:3100
 */

const DEFAULT_URL = "http://127.0.0.1:3100";

export function bridgeServerBase(): string {
  return (
    process.env.LUMEN_BRIDGE_SERVER_URL ||
    process.env.BRIDGE_SERVER_URL ||
    DEFAULT_URL
  ).replace(/\/$/, "");
}

export async function bridgeServerFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 15_000;
  const { timeoutMs: _t, ...rest } = init || {};
  const url = `${bridgeServerBase()}${path.startsWith("/") ? path : `/${path}`}`;

  return fetch(url, {
    ...rest,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}
