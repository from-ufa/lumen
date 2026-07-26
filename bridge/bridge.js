#!/usr/bin/env node
/**
 * Lumen Bridge v1.1
 *
 * Outbound WebSocket agent next to a user's Ergo node and/or oracle-core.
 * Connects to the lumen hub and proxies only allowlisted GET requests:
 *   - Ergo REST (node)
 *   - Oracle metrics (optional, one or both pools — USD and/or XAU)
 *
 * Usage:
 *   node bridge.js --token=lumen_xxxxx
 *   node bridge.js --token=lumen_xxxxx --node=http://127.0.0.1:9053
 *   node bridge.js --token=lumen_xxxxx --oracle-usd=http://127.0.0.1:9021
 *   node bridge.js --token=lumen_xxxxx --oracle-xau=http://127.0.0.1:9011
 */

"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");
const WebSocket = require("ws");

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_NODE = "http://127.0.0.1:9053";
const DEFAULT_SERVER = "ws://127.0.0.1:3100/bridge";
const NODE_TIMEOUT_MS = 12_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const BRIDGE_VERSION = "1.1.0";

// Only these paths may be proxied (GET only).
const ALLOWED_PATH_RULES = [
  { exact: "/info" },
  { exact: "/peers/connected" },
  { exact: "/transactions/unconfirmed" },
  { prefix: "/blocks/" }, // includes /blocks/lastHeaders/*
  { exact: "/blocks" }, // rare, but keep strict
  // Oracle operator paths (virtual → local metrics; only if configured)
  { exact: "/oracle/status" },
  { exact: "/oracle/usd/metrics" },
  { exact: "/oracle/xau/metrics" },
];

/** Virtual path → oracle feed id */
const ORACLE_METRICS_PATHS = {
  "/oracle/usd/metrics": "erg-usd",
  "/oracle/xau/metrics": "erg-xau",
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  // Prefer long names; short aliases for Docker one-liners (LUMEN_TOKEN / LUMEN_SERVER)
  const out = {
    token:
      process.env.LUMEN_BRIDGE_TOKEN ||
      process.env.LUMEN_TOKEN ||
      null,
    node:
      process.env.LUMEN_NODE_URL ||
      process.env.LUMEN_NODE ||
      DEFAULT_NODE,
    server:
      process.env.LUMEN_BRIDGE_SERVER ||
      process.env.LUMEN_SERVER ||
      DEFAULT_SERVER,
    /** Optional oracle-core metrics bases — configure only what you run */
    oracleUsd:
      process.env.LUMEN_ORACLE_USD ||
      process.env.LUMEN_ORACLE_USD_METRICS ||
      null,
    oracleXau:
      process.env.LUMEN_ORACLE_XAU ||
      process.env.LUMEN_ORACLE_XAU_METRICS ||
      null,
    /** Allow non-loopback metrics URLs (default: loopback only) */
    oracleAllowRemote:
      process.env.LUMEN_ORACLE_ALLOW_REMOTE === "1" ||
      process.env.LUMEN_ORACLE_ALLOW_REMOTE === "true",
    help: false,
    version: false,
  };

  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") {
      out.help = true;
      continue;
    }
    if (raw === "--version" || raw === "-v") {
      out.version = true;
      continue;
    }

    const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2] !== undefined ? m[2] : true;

    if (key === "token") out.token = String(val);
    else if (key === "node") out.node = String(val);
    else if (key === "server") out.server = String(val);
    else if (key === "oracle-usd" || key === "oracleUsd")
      out.oracleUsd = String(val);
    else if (key === "oracle-xau" || key === "oracleXau")
      out.oracleXau = String(val);
    else if (key === "oracle-allow-remote") out.oracleAllowRemote = true;
  }

  return out;
}

function printHelp() {
  console.log(`Lumen Bridge v${BRIDGE_VERSION}

Usage:
  node bridge.js --token=lumen_xxxxx
  node bridge.js --token=lumen_xxxxx --node=http://127.0.0.1:9053
  node bridge.js --token=lumen_xxxxx --oracle-usd=http://127.0.0.1:9021
  node bridge.js --token=lumen_xxxxx --oracle-xau=http://127.0.0.1:9011
  # one oracle only is fine — set only the pool(s) you run

Options:
  --token=TOKEN        Bridge auth token (required).
                       Env: LUMEN_BRIDGE_TOKEN or LUMEN_TOKEN
  --node=URL           Local Ergo node REST URL (default: ${DEFAULT_NODE})
                       Env: LUMEN_NODE_URL or LUMEN_NODE
  --server=URL         Lumen Bridge WebSocket URL (default: ${DEFAULT_SERVER})
                       Env: LUMEN_BRIDGE_SERVER or LUMEN_SERVER
  --oracle-usd=URL     Local ERG/USD oracle-core metrics base (optional)
                       Env: LUMEN_ORACLE_USD or LUMEN_ORACLE_USD_METRICS
  --oracle-xau=URL     Local ERG/XAU oracle-core metrics base (optional)
                       Env: LUMEN_ORACLE_XAU or LUMEN_ORACLE_XAU_METRICS
  --oracle-allow-remote  Allow non-loopback metrics URLs (default: loopback only)
                       Env: LUMEN_ORACLE_ALLOW_REMOTE=1
  --help, -h           Show this help
  --version, -v        Show version

Docker (node + USD oracle only example):
  docker run -d --name lumen-bridge --restart unless-stopped --network host \\
    -e LUMEN_TOKEN=lumen_xxx \\
    -e LUMEN_SERVER=wss://ergolumen.net/ws/bridge \\
    -e LUMEN_ORACLE_USD=http://127.0.0.1:9021 \\
    lumen-bridge

Allowed GET paths:
  Node:   /info  /peers/connected  /transactions/unconfirmed  /blocks/*
  Oracle: /oracle/status  /oracle/usd/metrics  /oracle/xau/metrics
          (metrics only if the matching oracle URL is configured)
`);
}

/** Metrics bases must be loopback unless explicitly allowed (security). */
function isLoopbackHost(hostname) {
  const h = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1"
  );
}

/**
 * Validate and normalize an oracle metrics base URL.
 * @returns {{ ok: true, base: string } | { ok: false, error: string }}
 */
function validateOracleBase(raw, { allowRemote = false } = {}) {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "empty" };
  }
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "invalid_protocol" };
  }
  if (!allowRemote && !isLoopbackHost(u.hostname)) {
    return {
      ok: false,
      error: "metrics_url_must_be_loopback",
    };
  }
  // Strip path — we only ever fetch /metrics on the base
  u.pathname = "/";
  u.search = "";
  u.hash = "";
  const base = u.toString().replace(/\/$/, "");
  return { ok: true, base };
}

// ---------------------------------------------------------------------------
// Path allowlist
// ---------------------------------------------------------------------------

function normalizePath(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return null;
  let p = rawPath.trim();
  if (!p.startsWith("/")) p = `/${p}`;

  // Strip query/hash if present in path field
  const q = p.indexOf("?");
  if (q !== -1) p = p.slice(0, q);
  const h = p.indexOf("#");
  if (h !== -1) p = p.slice(0, h);

  // Collapse duplicate slashes, reject traversal
  p = p.replace(/\/+/g, "/");
  if (p.includes("..") || p.includes("\\") || p.includes("%2e") || p.includes("%2E")) {
    return null;
  }

  // Remove trailing slash except root
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);

  return p;
}

function isPathAllowed(pathname) {
  const p = normalizePath(pathname);
  if (!p) return false;

  for (const rule of ALLOWED_PATH_RULES) {
    if (rule.exact && p === rule.exact) return true;
    if (rule.prefix && p.startsWith(rule.prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// HTTP GET to local Ergo node
// ---------------------------------------------------------------------------

function nodeGet(nodeBase, pathWithQuery, timeoutMs = NODE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`, nodeBase.endsWith("/") ? nodeBase : `${nodeBase}/`);
    } catch (err) {
      reject(new Error(`invalid_url: ${err.message}`));
      return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      reject(new Error("invalid_protocol"));
      return;
    }

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": `lumen-bridge/${BRIDGE_VERSION}`,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const contentType = res.headers["content-type"] || "application/json";
          let body;
          const text = buf.toString("utf8");
          if (contentType.includes("application/json")) {
            try {
              body = text.length ? JSON.parse(text) : null;
            } catch {
              body = text;
            }
          } else {
            body = text;
          }
          resolve({
            status: res.statusCode || 502,
            contentType,
            body,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err) => {
      reject(err);
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public IP (for map "My Node" pin on Lumen)
// ---------------------------------------------------------------------------

/**
 * Best-effort public IPv4 for the machine running the agent.
 * Used so the dashboard can place My Node at a real GeoIP location.
 * Failures are non-fatal — hub may still use TCP remoteAddress.
 */
function detectPublicIp(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const envIp =
      process.env.LUMEN_PUBLIC_IP ||
      process.env.LUMEN_BRIDGE_PUBLIC_IP ||
      "";
    if (envIp && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(envIp.trim())) {
      resolve(envIp.trim());
      return;
    }

    const url = new URL("https://api.ipify.org?format=json");
    const req = https.get(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        timeout: timeoutMs,
        headers: { Accept: "application/json", "User-Agent": `lumen-bridge/${BRIDGE_VERSION}` },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const ip = j && typeof j.ip === "string" ? j.ip.trim() : "";
            resolve(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ? ip : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

// ---------------------------------------------------------------------------
// Bridge client
// ---------------------------------------------------------------------------

class LumenBridge {
  constructor({
    token,
    node,
    server,
    oracleUsd = null,
    oracleXau = null,
    oracleAllowRemote = false,
  }) {
    this.token = token;
    this.node = node.replace(/\/$/, "");
    this.server = server;
    this.oracleAllowRemote = !!oracleAllowRemote;
    /** @type {Record<string, string>} feedId → validated metrics base */
    this.oracleBases = {};
    if (oracleUsd) {
      const v = validateOracleBase(oracleUsd, {
        allowRemote: this.oracleAllowRemote,
      });
      if (v.ok) this.oracleBases["erg-usd"] = v.base;
      else
        log(
          "warn",
          `ERG/USD oracle metrics ignored (${v.error}): ${oracleUsd}`
        );
    }
    if (oracleXau) {
      const v = validateOracleBase(oracleXau, {
        allowRemote: this.oracleAllowRemote,
      });
      if (v.ok) this.oracleBases["erg-xau"] = v.base;
      else
        log(
          "warn",
          `ERG/XAU oracle metrics ignored (${v.error}): ${oracleXau}`
        );
    }
    this.configuredOracles = Object.keys(this.oracleBases);
    this.publicIp = null;
    this.ws = null;
    this.closed = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pending = new Map(); // reserved for future request tracking
  }

  async start() {
    this.closed = false;
    log("info", `Lumen Bridge v${BRIDGE_VERSION}`);
    log("info", `Node:   ${this.node}`);
    log("info", `Server: ${this.server}`);
    log("info", `Token:  ${maskToken(this.token)}`);
    if (this.configuredOracles.length === 0) {
      log(
        "info",
        "Oracles: none configured (optional — set LUMEN_ORACLE_USD / LUMEN_ORACLE_XAU)"
      );
    } else {
      for (const id of this.configuredOracles) {
        log("info", `Oracle ${id}: ${this.oracleBases[id]} → /metrics`);
      }
    }
    this.publicIp = await detectPublicIp();
    if (this.publicIp) log("info", `Public IP: ${this.publicIp} (for map pin)`);
    else log("info", "Public IP: unknown — hub may use TCP remote address");
    this.connect();
  }

  stop() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.clearPing();
    if (this.ws) {
      try {
        this.ws.close(1000, "bridge shutdown");
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    log("info", "Bridge stopped");
  }

  connect() {
    if (this.closed) return;

    log("info", `Connecting to ${this.server}…`);

    let ws;
    try {
      // Token via subprotocol-style header + query for maximum compatibility
      const u = new URL(this.server);
      if (!u.searchParams.has("token")) {
        u.searchParams.set("token", this.token);
      }
      ws = new WebSocket(u.toString(), {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "X-Lumen-Bridge-Token": this.token,
          "X-Lumen-Bridge-Version": BRIDGE_VERSION,
        },
        handshakeTimeout: 15_000,
      });
    } catch (err) {
      log("error", `Invalid server URL: ${err.message}`);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempt = 0;
      log("info", "Connected. Sending hello…");
      const paths = [
        "/info",
        "/peers/connected",
        "/transactions/unconfirmed",
        "/blocks/*",
        "/oracle/status",
      ];
      if (this.oracleBases["erg-usd"]) paths.push("/oracle/usd/metrics");
      if (this.oracleBases["erg-xau"]) paths.push("/oracle/xau/metrics");
      const hello = {
        type: "hello",
        token: this.token,
        version: BRIDGE_VERSION,
        node: this.node,
        capabilities: {
          methods: ["GET"],
          paths,
          oracles: this.configuredOracles.slice(),
        },
      };
      if (this.publicIp) hello.publicIp = this.publicIp;
      this.send(hello);
      this.startPing();
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        log("warn", "Ignoring binary message");
        return;
      }
      this.handleMessage(data.toString("utf8"));
    });

    ws.on("ping", () => {
      try {
        ws.pong();
      } catch {
        /* ignore */
      }
    });

    ws.on("close", (code, reason) => {
      this.clearPing();
      const r = reason ? reason.toString() : "";
      log("warn", `Disconnected (code=${code}${r ? ` reason=${r}` : ""})`);
      this.ws = null;
      if (!this.closed) this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      log("error", `WebSocket error: ${err.message}`);
      // close handler will schedule reconnect
    });
  }

  scheduleReconnect() {
    if (this.closed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const exp = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt
    );
    // jitter ±20%
    const delay = Math.floor(exp * (0.8 + Math.random() * 0.4));
    this.reconnectAttempt += 1;
    log("info", `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})…`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  startPing() {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
      } catch {
        /* ignore */
      }
      // Also send app-level heartbeat so server can track liveness without WS ping support
      this.send({ type: "ping", ts: Date.now() });
    }, PING_INTERVAL_MS);
  }

  clearPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(obj));
    } catch (err) {
      log("error", `Send failed: ${err.message}`);
    }
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      log("warn", "Non-JSON message from server");
      return;
    }

    if (!msg || typeof msg !== "object") return;

    const type = msg.type;

    if (type === "pong" || type === "ping") {
      if (type === "ping") this.send({ type: "pong", ts: Date.now(), id: msg.id });
      return;
    }

    if (type === "hello_ack" || type === "auth_ok") {
      log("info", `Server accepted bridge (${type})`);
      return;
    }

    if (type === "auth_error" || type === "error" && !msg.id) {
      log("error", `Server auth/error: ${msg.message || msg.error || "unknown"}`);
      return;
    }

    if (type === "request") {
      this.handleRequest(msg);
      return;
    }

    log("warn", `Unknown message type: ${type}`);
  }

  async handleRequest(msg) {
    const id = msg.id;
    if (!id) {
      log("warn", "Request without id — ignored");
      return;
    }

    const method = String(msg.method || "GET").toUpperCase();
    if (method !== "GET") {
      this.send({
        type: "error",
        id,
        error: "method_not_allowed",
        message: "Only GET is allowed",
      });
      return;
    }

    const rawPath = msg.path || msg.url || "";
    const pathOnly = normalizePath(rawPath);
    if (!pathOnly || !isPathAllowed(pathOnly)) {
      log("warn", `Blocked path: ${rawPath}`);
      this.send({
        type: "error",
        id,
        error: "forbidden",
        message: `Path not allowed: ${rawPath}`,
      });
      return;
    }

    // Optional query string from message
    let pathWithQuery = pathOnly;
    if (msg.query) {
      const q =
        typeof msg.query === "string"
          ? msg.query.replace(/^\?/, "")
          : new URLSearchParams(msg.query).toString();
      if (q) pathWithQuery = `${pathOnly}?${q}`;
    } else if (typeof rawPath === "string" && rawPath.includes("?")) {
      const q = rawPath.slice(rawPath.indexOf("?") + 1);
      if (q) pathWithQuery = `${pathOnly}?${q}`;
    }

    // ── Virtual oracle routes (never forwarded to Ergo node) ──
    if (pathOnly === "/oracle/status") {
      const oracles = {};
      for (const id of ["erg-usd", "erg-xau"]) {
        const base = this.oracleBases[id] || null;
        oracles[id] = {
          configured: !!base,
          // host:port only — never leak credentials
          endpoint: base
            ? (() => {
                try {
                  const u = new URL(base);
                  return `${u.hostname}${u.port ? `:${u.port}` : ""}`;
                } catch {
                  return "configured";
                }
              })()
            : null,
        };
      }
      this.send({
        type: "response",
        id,
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: {
          version: BRIDGE_VERSION,
          node: this.node,
          oracles,
          configured: this.configuredOracles.slice(),
        },
      });
      log("info", `← 200 /oracle/status (${this.configuredOracles.join(",") || "none"})`);
      return;
    }

    const oracleFeed = ORACLE_METRICS_PATHS[pathOnly];
    if (oracleFeed) {
      const base = this.oracleBases[oracleFeed];
      if (!base) {
        this.send({
          type: "error",
          id,
          error: "oracle_not_configured",
          message: `Oracle ${oracleFeed} metrics not configured on this bridge agent`,
        });
        log("warn", `Oracle path ${pathOnly} — not configured`);
        return;
      }
      log("info", `→ GET ${base}/metrics (${oracleFeed})`);
      try {
        const result = await nodeGet(base, "/metrics", NODE_TIMEOUT_MS);
        this.send({
          type: "response",
          id,
          status: result.status,
          contentType: result.contentType || "text/plain; charset=utf-8",
          body: result.body,
        });
        log("info", `← ${result.status} ${pathOnly}`);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        const isTimeout = /timeout/i.test(message);
        this.send({
          type: "error",
          id,
          error: isTimeout ? "timeout" : "upstream_unreachable",
          message,
        });
        log("error", `Oracle metrics failed: ${message}`);
      }
      return;
    }

    log("info", `→ GET ${pathWithQuery}`);

    try {
      const result = await nodeGet(this.node, pathWithQuery, NODE_TIMEOUT_MS);
      this.send({
        type: "response",
        id,
        status: result.status,
        contentType: result.contentType,
        body: result.body,
      });
      log("info", `← ${result.status} ${pathOnly}`);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const isTimeout = /timeout/i.test(message);
      this.send({
        type: "error",
        id,
        error: isTimeout ? "timeout" : "upstream_unreachable",
        message,
      });
      log("error", `Node request failed: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskToken(token) {
  if (!token || token.length < 10) return "***";
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.version) {
    console.log(BRIDGE_VERSION);
    process.exit(0);
  }

  if (!args.token) {
    console.error("Error: --token is required (or set LUMEN_BRIDGE_TOKEN)");
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  if (!args.token.startsWith("lumen_") && !args.token.startsWith("aether_")) {
    log("warn", 'Token does not start with "lumen_" — continuing anyway');
  }

  try {
    // Validate URLs early
    // eslint-disable-next-line no-new
    new URL(args.node);
    // eslint-disable-next-line no-new
    new URL(args.server);
  } catch (err) {
    console.error(`Error: invalid URL — ${err.message}`);
    process.exit(1);
  }

  if (!/^wss?:\/\//i.test(args.server)) {
    console.error("Error: --server must be a WebSocket URL (ws:// or wss://)");
    process.exit(1);
  }

  const bridge = new LumenBridge({
    token: args.token,
    node: args.node,
    server: args.server,
    oracleUsd: args.oracleUsd,
    oracleXau: args.oracleXau,
    oracleAllowRemote: args.oracleAllowRemote,
  });

  bridge.start();

  const shutdown = (sig) => {
    log("info", `Received ${sig}, shutting down…`);
    bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Export for tests / mock tooling
module.exports = {
  parseArgs,
  normalizePath,
  isPathAllowed,
  nodeGet,
  LumenBridge,
  ALLOWED_PATH_RULES,
  ORACLE_METRICS_PATHS,
  validateOracleBase,
  isLoopbackHost,
  BRIDGE_VERSION,
};

if (require.main === module) {
  main();
}
