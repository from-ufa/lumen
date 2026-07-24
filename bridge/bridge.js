#!/usr/bin/env node
/**
 * Lumen Bridge v1
 *
 * Outbound WebSocket agent that runs next to a user's Ergo node.
 * Connects to the Lumen server and proxies only allowlisted GET requests
 * to the local node REST API.
 *
 * Usage:
 *   node bridge.js --token=lumen_xxxxx
 *   node bridge.js --token=lumen_xxxxx --node=http://127.0.0.1:9053
 *   node bridge.js --token=lumen_xxxxx --server=wss://lumen.example.com/bridge
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
const BRIDGE_VERSION = "1.0.0";

// Only these paths may be proxied (GET only).
const ALLOWED_PATH_RULES = [
  { exact: "/info" },
  { exact: "/peers/connected" },
  { exact: "/transactions/unconfirmed" },
  { prefix: "/blocks/" }, // includes /blocks/lastHeaders/*
  { exact: "/blocks" }, // rare, but keep strict
];

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
  }

  return out;
}

function printHelp() {
  console.log(`Lumen Bridge v${BRIDGE_VERSION}

Usage:
  node bridge.js --token=lumen_xxxxx
  node bridge.js --token=lumen_xxxxx --node=http://127.0.0.1:9053
  node bridge.js --token=lumen_xxxxx --server=wss://lumen.example.com/bridge

Options:
  --token=TOKEN     Bridge auth token (required).
                    Env: LUMEN_BRIDGE_TOKEN or LUMEN_TOKEN
  --node=URL        Local Ergo node REST URL (default: ${DEFAULT_NODE})
                    Env: LUMEN_NODE_URL or LUMEN_NODE
  --server=URL      Lumen Bridge WebSocket URL (default: ${DEFAULT_SERVER})
                    Env: LUMEN_BRIDGE_SERVER or LUMEN_SERVER
  --help, -h        Show this help
  --version, -v     Show version

Docker:
  docker run -d --name lumen-bridge --restart unless-stopped --network host \\
    -e LUMEN_TOKEN=lumen_xxx -e LUMEN_SERVER=ws://host:3100/bridge lumen-bridge


Protocol (JSON over WebSocket):
  Client → Server (on open):
    { "type": "hello", "token": "...", "version": "1.0.0" }

  Server → Client (proxy request):
    { "type": "request", "id": "<id>", "method": "GET", "path": "/info" }

  Client → Server (proxy response):
    { "type": "response", "id": "<id>", "status": 200, "body": <json|string>, "contentType": "..." }

  Client → Server (error):
    { "type": "error", "id": "<id>", "error": "forbidden|timeout|...", "message": "..." }

Allowed GET paths:
  /info
  /peers/connected
  /transactions/unconfirmed
  /blocks/*
  /blocks/lastHeaders/*
`);
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
          Accept: "application/json",
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
// Bridge client
// ---------------------------------------------------------------------------

class LumenBridge {
  constructor({ token, node, server }) {
    this.token = token;
    this.node = node.replace(/\/$/, "");
    this.server = server;
    this.ws = null;
    this.closed = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pending = new Map(); // reserved for future request tracking
  }

  start() {
    this.closed = false;
    log("info", `Lumen Bridge v${BRIDGE_VERSION}`);
    log("info", `Node:   ${this.node}`);
    log("info", `Server: ${this.server}`);
    log("info", `Token:  ${maskToken(this.token)}`);
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
      this.send({
        type: "hello",
        token: this.token,
        version: BRIDGE_VERSION,
        node: this.node,
        capabilities: {
          methods: ["GET"],
          paths: [
            "/info",
            "/peers/connected",
            "/transactions/unconfirmed",
            "/blocks/*",
          ],
        },
      });
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
  BRIDGE_VERSION,
};

if (require.main === module) {
  main();
}
