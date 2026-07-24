/**
 * Node data source mode for Lumen dashboard.
 *
 * - lumen: local/server Ergo via /api/node (or custom REST URL)
 * - my:    user's node via Lumen Bridge (/api/bridge/node + token)
 */

export type NodeMode = "lumen" | "my";

export const LS_NODE_MODE = "lumen-node-mode";
export const LS_BRIDGE_TOKEN = "lumen-bridge-token";
export const LS_NODE_URL = "lumen-node-url";
export const LS_NODE_URL_LEGACY = "aether-node-url";

export const DEFAULT_LUMEN_NODE_URL = "/api/node";
export const BRIDGE_NODE_BASE = "/api/bridge/node";

/** Public WS endpoint for remote Bridge agents (outbound to this host). */
export const DEFAULT_BRIDGE_WS_PUBLIC = "ws://80.209.232.82:3100/bridge";

/** Public HTTP base for dashboard + bridge install downloads. */
export const DEFAULT_LUMEN_HTTP_PUBLIC = "http://80.209.232.82:3000";

/** Default install directory used by install.sh */
export const BRIDGE_INSTALL_DIR = "~/lumen-bridge";

export function isNodeMode(v: unknown): v is NodeMode {
  return v === "lumen" || v === "my";
}

/**
 * Dashboard HTTP origin for install.sh downloads.
 * On localhost/SSH tunnel → public IP so the user's node machine can curl it.
 */
export function bridgeHttpBase(): string {
  if (typeof window === "undefined") return DEFAULT_LUMEN_HTTP_PUBLIC;
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return DEFAULT_LUMEN_HTTP_PUBLIC;
  }
  return `${window.location.protocol}//${window.location.host}`;
}

/** One-liner: install Bridge next to the user's Ergo node (advanced / no Docker). */
export function bridgeInstallCommand(httpBase?: string): string {
  const base = (httpBase || bridgeHttpBase()).replace(/\/$/, "");
  // LUMEN_BASE ensures install.sh downloads assets from the same host
  return `curl -fsSL ${base}/bridge/install.sh | LUMEN_BASE=${base} bash`;
}

/**
 * One-liner: run Bridge with personal token (after install.sh).
 * Uses ~/lumen-bridge — same default as install.sh.
 */
export function bridgeRunCommand(token: string, wsUrl?: string): string {
  const server = wsUrl || bridgeWsUrlForClient();
  return `cd ~/lumen-bridge && node bridge.js --token=${token} --server=${server}`;
}

/**
 * Recommended: one pasteable Docker command.
 * Builds image from this Lumen host, then runs with token + server already set.
 * --network host so the container can reach Ergo on 127.0.0.1:9053 (Linux).
 */
export function bridgeDockerCommand(
  token: string,
  opts?: { wsUrl?: string; httpBase?: string; nodeUrl?: string }
): string {
  const server = opts?.wsUrl || bridgeWsUrlForClient();
  const base = (opts?.httpBase || bridgeHttpBase()).replace(/\/$/, "");
  const node = opts?.nodeUrl || "http://127.0.0.1:9053";
  // Multi-line, ready to paste. Rebuilds when Dockerfile changes; run is restart-safe.
  return [
    `docker build -t lumen-bridge ${base}/bridge/context.tar && \\`,
    `docker rm -f lumen-bridge 2>/dev/null; \\`,
    `docker run -d --name lumen-bridge --restart unless-stopped \\`,
    `  --network host \\`,
    `  -e LUMEN_TOKEN=${token} \\`,
    `  -e LUMEN_SERVER=${server} \\`,
    `  -e LUMEN_NODE=${node} \\`,
    `  lumen-bridge`,
  ].join("\n");
}

export function loadNodeMode(): NodeMode {
  if (typeof window === "undefined") return "lumen";
  try {
    const raw = localStorage.getItem(LS_NODE_MODE);
    return isNodeMode(raw) ? raw : "lumen";
  } catch {
    return "lumen";
  }
}

export function saveNodeMode(mode: NodeMode): void {
  try {
    localStorage.setItem(LS_NODE_MODE, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadBridgeToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(LS_BRIDGE_TOKEN) || "").trim();
  } catch {
    return "";
  }
}

export function saveBridgeToken(token: string): void {
  try {
    if (token) localStorage.setItem(LS_BRIDGE_TOKEN, token);
    else localStorage.removeItem(LS_BRIDGE_TOKEN);
  } catch {
    /* ignore */
  }
}

/** Base path used for Ergo REST proxies from the browser. */
export function resolveNodeBase(
  mode: NodeMode,
  lumenNodeUrl: string = DEFAULT_LUMEN_NODE_URL
): string {
  if (mode === "my") return BRIDGE_NODE_BASE;
  const u = (lumenNodeUrl || DEFAULT_LUMEN_NODE_URL).replace(/\/$/, "");
  return u || DEFAULT_LUMEN_NODE_URL;
}

/** Headers for browser → Next proxy (and bridge token when in My Node mode). */
export function nodeRequestHeaders(
  mode: NodeMode,
  bridgeToken?: string | null
): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (mode === "my" && bridgeToken) {
    headers["X-Lumen-Bridge-Token"] = bridgeToken;
  }
  return headers;
}

/**
 * Build absolute-from-origin path for a node REST resource.
 * e.g. joinNodePath("/api/node", "info") → "/api/node/info"
 */
export function joinNodePath(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.replace(/^\//, "");
  return `${b}/${p}`;
}

/** Suggested WS URL for the Bridge agent on the user's machine. */
export function bridgeWsUrlForClient(): string {
  if (typeof window === "undefined") return DEFAULT_BRIDGE_WS_PUBLIC;
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return DEFAULT_BRIDGE_WS_PUBLIC;
  }
  // Same host as dashboard; bridge-server listens on 3100
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  // Prefer public IP host when page is served by IP; keep hostname otherwise
  return `${proto}://${host}:3100/bridge`;
}

/** @deprecated prefer bridgeRunCommand — kept for callers that only need node bridge.js … */
export function bridgeConnectCommand(token: string, wsUrl?: string): string {
  return bridgeRunCommand(token, wsUrl);
}

export type BridgeStatus = {
  token: string;
  known: boolean;
  createdAt: number | null;
  label: string | null;
  connected: boolean;
  connectedAt: number | null;
  lastSeen: number | null;
  version: string | null;
  node: string | null;
  remoteAddress: string | null;
  pendingRequests: number;
  error?: string;
  message?: string;
};

export async function createBridgeToken(
  label = "dashboard"
): Promise<{ token: string; connect?: { command?: string; wsUrl?: string } }> {
  const res = await fetch("/api/bridge/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ label }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(
      data.message || data.error || `token create failed (${res.status})`
    );
  }
  return data;
}

export async function fetchBridgeStatus(
  token: string
): Promise<BridgeStatus> {
  const res = await fetch(
    `/api/bridge/status?token=${encodeURIComponent(token)}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.error === "bridge_server_unreachable") {
    return {
      token,
      known: false,
      createdAt: null,
      label: null,
      connected: false,
      connectedAt: null,
      lastSeen: null,
      version: null,
      node: null,
      remoteAddress: null,
      pendingRequests: 0,
      error: data.error,
      message: data.message,
    };
  }
  return {
    token: data.token || token,
    known: !!data.known,
    createdAt: data.createdAt ?? null,
    label: data.label ?? null,
    connected: !!data.connected,
    connectedAt: data.connectedAt ?? null,
    lastSeen: data.lastSeen ?? null,
    version: data.version ?? null,
    node: data.node ?? null,
    remoteAddress: data.remoteAddress ?? null,
    pendingRequests: data.pendingRequests ?? 0,
    error: data.error,
    message: data.message,
  };
}
