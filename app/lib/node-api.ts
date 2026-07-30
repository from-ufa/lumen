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

/** Public product domain (Caddy HTTPS). */
export const PUBLIC_DOMAIN = "ergolumen.net";

/**
 * Public WS for remote Bridge agents via Caddy.
 * Path /ws/* is stripped and proxied to lumen-bridge-server :3100
 * so wss://ergolumen.net/ws/bridge → ws://127.0.0.1:3100/bridge
 */
export const DEFAULT_BRIDGE_WS_PUBLIC = `wss://${PUBLIC_DOMAIN}/ws/bridge`;

/** Public HTTPS base for dashboard. */
export const DEFAULT_LUMEN_HTTP_PUBLIC = `https://${PUBLIC_DOMAIN}`;

/** GitHub source of truth for Bridge agent assets (Docker context, install.sh). */
export const GITHUB_REPO = "from-ufa/lumen";
export const GITHUB_BRANCH = "main";
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
/** Docker remote git context — subdirectory `bridge/` as build context. */
export const GITHUB_BRIDGE_DOCKER_CONTEXT = `https://github.com/${GITHUB_REPO}.git#${GITHUB_BRANCH}:bridge`;
/** Raw files for install.sh / curl downloads. */
export const GITHUB_BRIDGE_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/bridge`;
export const GITHUB_BRIDGE_INSTALL_SH = `${GITHUB_BRIDGE_RAW_BASE}/install.sh`;

/** Default install directory used by install.sh */
export const BRIDGE_INSTALL_DIR = "~/lumen-bridge";

export function isNodeMode(v: unknown): v is NodeMode {
  return v === "lumen" || v === "my";
}

/** Human-readable active center node (map pin, 3D sun, settings). */
export function centerNodeLabel(mode: NodeMode): string {
  return mode === "my" ? "My Node" : "lumen node";
}

/** Mono label for map tooltips / legends. */
export function centerNodeLabelUpper(mode: NodeMode): string {
  return mode === "my" ? "MY NODE" : "lumen node";
}

/**
 * @deprecated Bridge assets come from GitHub. Kept for rare self-host overrides.
 * Dashboard HTTP origin (ergolumen.net) — not used for Docker/install by default.
 */
export function bridgeHttpBase(): string {
  if (typeof window === "undefined") return DEFAULT_LUMEN_HTTP_PUBLIC;
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return DEFAULT_LUMEN_HTTP_PUBLIC;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.endsWith(".hostens.cloud")) {
    return DEFAULT_LUMEN_HTTP_PUBLIC;
  }
  const proto =
    window.location.protocol === "https:" || host === PUBLIC_DOMAIN
      ? "https:"
      : window.location.protocol;
  return `${proto}//${window.location.host}`;
}

/** One-liner: install Bridge next to the user's Ergo node (advanced / no Docker). */
export function bridgeInstallCommand(_httpBase?: string): string {
  // Assets always from GitHub so install works even if the dashboard host is down.
  return `curl -fsSL ${GITHUB_BRIDGE_INSTALL_SH} | bash`;
}

/**
 * One-liner: run Bridge with personal token (after install.sh).
 * Uses ~/lumen-bridge — same default as install.sh.
 */
export function bridgeRunCommand(
  token: string,
  wsUrl?: string,
  opts?: { oracleUsd?: boolean; oracleXau?: boolean }
): string {
  const server = wsUrl || bridgeWsUrlForClient();
  let cmd = `cd ~/lumen-bridge && node bridge.js --token=${token} --server=${server}`;
  if (opts?.oracleUsd) cmd += ` --oracle-usd=http://127.0.0.1:9021`;
  if (opts?.oracleXau) cmd += ` --oracle-xau=http://127.0.0.1:9011`;
  return cmd;
}

export const LS_ORACLE_VIEW = "lumen-oracle-view";
export type OracleViewMode = "network" | "my";

export function isOracleViewMode(v: unknown): v is OracleViewMode {
  return v === "network" || v === "my";
}

export function loadOracleViewMode(): OracleViewMode {
  if (typeof window === "undefined") return "network";
  try {
    const raw = localStorage.getItem(LS_ORACLE_VIEW);
    return isOracleViewMode(raw) ? raw : "network";
  } catch {
    return "network";
  }
}

export function saveOracleViewMode(mode: OracleViewMode): void {
  try {
    localStorage.setItem(LS_ORACLE_VIEW, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Recommended: one pasteable Docker command.
 * Builds image from GitHub (from-ufa/lumen#main:bridge), then runs with token + WSS.
 * --network host so the container can reach Ergo on 127.0.0.1:9053 (Linux).
 */
export function bridgeDockerCommand(
  token: string,
  opts?: {
    wsUrl?: string;
    nodeUrl?: string;
    dockerContext?: string;
    /** Optional ERG/USD metrics base (loopback). Omit if you don't run USD. */
    oracleUsd?: string | null;
    /** Optional ERG/XAU metrics base (loopback). Omit if you don't run XAU. */
    oracleXau?: string | null;
  }
): string {
  const server = opts?.wsUrl || bridgeWsUrlForClient();
  const node = opts?.nodeUrl || "http://127.0.0.1:9053";
  const context = opts?.dockerContext || GITHUB_BRIDGE_DOCKER_CONTEXT;
  const lines = [
    `docker build -t lumen-bridge ${context} && \\`,
    `docker rm -f lumen-bridge 2>/dev/null; \\`,
    `docker run -d --name lumen-bridge --restart unless-stopped \\`,
    `  --network host \\`,
    `  -e LUMEN_TOKEN=${token} \\`,
    `  -e LUMEN_SERVER=${server} \\`,
    `  -e LUMEN_NODE=${node} \\`,
  ];
  if (opts?.oracleUsd) {
    lines.push(`  -e LUMEN_ORACLE_USD=${opts.oracleUsd} \\`);
  }
  if (opts?.oracleXau) {
    lines.push(`  -e LUMEN_ORACLE_XAU=${opts.oracleXau} \\`);
  }
  lines.push(`  lumen-bridge`);
  return lines.join("\n");
}

/** Docker one-liner for oracle operators — set only pools you run. */
export function bridgeDockerOracleCommand(
  token: string,
  pools: { usd?: boolean; xau?: boolean }
): string {
  return bridgeDockerCommand(token, {
    oracleUsd: pools.usd ? "http://127.0.0.1:9021" : null,
    oracleXau: pools.xau ? "http://127.0.0.1:9011" : null,
  });
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

/**
 * TS-1: pull vault settings into localStorage for Telegram Mini App.
 * - Default: never overwrite non-empty local token (safe).
 * - After /link: forceHydrateOnce=true → overwrite once even if local differs.
 */
export async function hydrateSettingsFromTelegramVault(opts?: {
  force?: boolean;
}): Promise<{
  ok: boolean;
  applied: boolean;
  reason?: string;
  tokenFp?: string;
  tokenTail?: string;
}> {
  if (typeof window === "undefined") {
    return { ok: false, applied: false, reason: "ssr" };
  }
  try {
    const res = await fetch("/api/tg/settings", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      return { ok: false, applied: false, reason: "auth_required" };
    }
    if (res.status === 503) {
      return { ok: false, applied: false, reason: "disabled" };
    }
    if (!res.ok) {
      return { ok: false, applied: false, reason: "http_error" };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      hasVault?: boolean;
      settings?: {
        bridgeToken?: string;
        nodeMode?: string | null;
        oracleView?: string | null;
        tokenFp?: string;
        tokenTail?: string;
        forceHydrateOnce?: boolean;
      } | null;
    };
    if (!data.ok || !data.hasVault || !data.settings?.bridgeToken) {
      return { ok: true, applied: false, reason: "no_vault" };
    }
    const vaultToken = data.settings.bridgeToken;
    const local = loadBridgeToken();
    const force =
      !!opts?.force ||
      !!data.settings.forceHydrateOnce ||
      // same user re-linked and tokens differ
      (!!local && local !== vaultToken && !!data.settings.forceHydrateOnce);

    if (local && local === vaultToken) {
      // Already correct — clear force if needed
      if (data.settings.forceHydrateOnce) {
        void fetch("/api/tg/settings?consumeForce=1", {
          credentials: "include",
          cache: "no-store",
        });
      }
      return {
        ok: true,
        applied: false,
        reason: "already_synced",
        tokenFp: data.settings.tokenFp,
        tokenTail: data.settings.tokenTail,
      };
    }

    if (local && !force) {
      return {
        ok: true,
        applied: false,
        reason: "local_token_present",
        tokenFp: data.settings.tokenFp,
        tokenTail: data.settings.tokenTail,
      };
    }

    saveBridgeToken(vaultToken);
    if (data.settings.nodeMode === "my" || data.settings.nodeMode === "lumen") {
      saveNodeMode(data.settings.nodeMode);
    }
    if (
      data.settings.oracleView === "my" ||
      data.settings.oracleView === "network"
    ) {
      saveOracleViewMode(data.settings.oracleView);
    }
    // Consume force flag
    void fetch("/api/tg/settings?consumeForce=1", {
      credentials: "include",
      cache: "no-store",
    });
    return {
      ok: true,
      applied: true,
      reason: force ? "force_from_link" : "empty_local",
      tokenFp: data.settings.tokenFp,
      tokenTail: data.settings.tokenTail,
    };
  } catch {
    return { ok: false, applied: false, reason: "network" };
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

/**
 * Full browser URL for a node REST path.
 * In My Node mode always attaches token as query param (in addition to header)
 * so proxies/extensions can't drop the custom header and fall back to wrong data.
 */
export function nodeResourceUrl(
  base: string,
  path: string,
  mode: NodeMode,
  bridgeToken?: string | null
): string {
  let url = joinNodePath(base, path);
  if (mode === "my" && bridgeToken) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}token=${encodeURIComponent(bridgeToken)}`;
  }
  return url;
}

/** Browser fetch to Ergo REST via /api/node or /api/bridge/node. */
export async function fetchNodeResource(
  mode: NodeMode,
  bridgeToken: string | null | undefined,
  path: string,
  init?: RequestInit & { timeoutMs?: number; base?: string }
): Promise<Response> {
  const base = init?.base || resolveNodeBase(mode);
  const timeoutMs = init?.timeoutMs ?? (mode === "my" ? 14_000 : 6_500);
  const { timeoutMs: _t, base: _b, headers: extraHeaders, ...rest } = init || {};
  const url = nodeResourceUrl(base, path, mode, bridgeToken);
  const headers: Record<string, string> = {
    ...(nodeRequestHeaders(mode, bridgeToken) as Record<string, string>),
  };
  if (extraHeaders) {
    const h = new Headers(extraHeaders);
    h.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return fetch(url, {
    ...rest,
    headers,
    cache: "no-store",
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Suggested WS URL for the Bridge agent on the user's machine.
 * Always prefer wss://ergolumen.net/ws/bridge in production (Caddy → :3100).
 */
export function bridgeWsUrlForClient(): string {
  if (typeof window === "undefined") return DEFAULT_BRIDGE_WS_PUBLIC;
  const host = window.location.hostname;
  if (
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.endsWith(".hostens.cloud")
  ) {
    return DEFAULT_BRIDGE_WS_PUBLIC;
  }
  // Same host as dashboard via Caddy path /ws → bridge-server
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${host}/ws/bridge`;
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
  /** Agent-reported public IPv4 (hello.publicIp), if any */
  publicIp?: string | null;
  /** Configured oracle feeds from agent hello (e.g. ["erg-usd"]) */
  oracles?: string[];
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
    publicIp: data.publicIp ?? null,
    pendingRequests: data.pendingRequests ?? 0,
    error: data.error,
    message: data.message,
  };
}
