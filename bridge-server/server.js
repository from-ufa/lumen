#!/usr/bin/env node
/**
 * Lumen Bridge Server v1
 *
 * - WebSocket hub for outbound Bridge agents (`/bridge`)
 * - HTTP API: create tokens, status, proxy node paths through a live bridge
 *
 * Env:
 *   PORT                 default 3100
 *   HOST                 default 0.0.0.0
 *   AUTO_REGISTER_TOKENS if "1", accept unknown lumen_ or aether_ tokens on connect
 *   LUMEN_BRIDGE_TOKEN_STORE  path to tokens.json (default: data/tokens.json)
 *   REQUEST_TIMEOUT_MS   default 12000
 */

"use strict";

const http = require("http");
const { URL } = require("url");
const { WebSocketServer } = require("ws");
const { BridgeRegistry, tokenPreview } = require("./lib/registry");
const { requestViaBridge, handleBridgeReply } = require("./lib/proxy");
const { isPathAllowed, normalizePath } = require("./lib/allowlist");

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || "0.0.0.0";
const AUTO_REGISTER = process.env.AUTO_REGISTER_TOKENS === "1";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12_000);
const VERSION = "1.0.0";

const registry = new BridgeRegistry();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(level, msg, extra) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  if (extra !== undefined) console.log(line, extra);
  else console.log(line);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Lumen-Bridge-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ _raw: raw });
      }
    });
    req.on("error", reject);
  });
}

function extractToken(req, url) {
  const h =
    req.headers["x-lumen-bridge-token"] ||
    req.headers["x-bridge-token"] ||
    "";
  if (h) return String(h).trim();

  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();

  const q = url.searchParams.get("token");
  if (q) return q.trim();

  return null;
}

function extractWsToken(req, url) {
  return (
    url.searchParams.get("token") ||
    req.headers["x-lumen-bridge-token"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim() ||
    null
  );
}

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

async function handleHttp(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  // Health
  if (req.method === "GET" && (path === "/" || path === "/health")) {
    sendJson(res, 200, {
      service: "lumen-bridge-server",
      version: VERSION,
      ...registry.stats(),
      wsPath: "/bridge",
    });
    return;
  }

  // Create token
  // POST /tokens  |  POST /api/tokens
  if (req.method === "POST" && (path === "/tokens" || path === "/api/tokens")) {
    let body = null;
    try {
      body = await readBody(req);
    } catch (err) {
      sendJson(res, 400, { error: "bad_body", message: err.message });
      return;
    }
    const label = body && typeof body.label === "string" ? body.label : undefined;
    const entry = registry.createToken(label);
    log("info", `token created ${entry.token.slice(0, 12)}…`);
    sendJson(res, 201, {
      token: entry.token,
      createdAt: entry.createdAt,
      label: entry.label ?? null,
      connect: {
        command: `node bridge.js --token=${entry.token} --server=wss://ergolumen.net/ws/bridge`,
        wsUrl: `wss://ergolumen.net/ws/bridge`,
      },
    });
    return;
  }

  // List tokens (debug)
  if (req.method === "GET" && (path === "/tokens" || path === "/api/tokens")) {
    sendJson(res, 200, { tokens: registry.listTokens() });
    return;
  }

  // Bridge status
  // GET /status?token=  |  GET /api/bridge/status?token=
  // GET /status/:token
  if (
    req.method === "GET" &&
    (path === "/status" ||
      path === "/api/bridge/status" ||
      path.startsWith("/status/") ||
      path.startsWith("/api/bridge/status/"))
  ) {
    let token = extractToken(req, url);
    if (!token) {
      const parts = path.split("/").filter(Boolean);
      const last = parts[parts.length - 1];
      if (
        last &&
        (last.startsWith("lumen_") || last.startsWith("aether_"))
      ) {
        token = last;
      }
    }
    if (!token) {
      sendJson(res, 400, { error: "token_required" });
      return;
    }
    sendJson(res, 200, registry.status(token));
    return;
  }

  // Proxy node path through bridge
  // GET /node/<token>/<ergo-path...>
  // GET /api/bridge/node/<ergo-path...>  + token header/query
  // GET /api/node/<ergo-path...>         + token header/query
  if (req.method === "GET") {
    let token = null;
    let ergoPath = null;

    if (path.startsWith("/node/")) {
      const rest = path.slice("/node/".length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        token = rest;
        ergoPath = "/info";
      } else {
        token = rest.slice(0, slash);
        ergoPath = rest.slice(slash);
      }
    } else if (
      path.startsWith("/api/bridge/node/") ||
      path.startsWith("/api/node/")
    ) {
      token = extractToken(req, url);
      const prefix = path.startsWith("/api/bridge/node/")
        ? "/api/bridge/node"
        : "/api/node";
      ergoPath = path.slice(prefix.length) || "/";
      if (!ergoPath.startsWith("/")) ergoPath = `/${ergoPath}`;
    }

    if (token && ergoPath) {
      await proxyNode(res, token, ergoPath, url.searchParams);
      return;
    }
  }

  // Method guard for node proxy paths
  if (
    path.startsWith("/node/") ||
    path.startsWith("/api/bridge/node/") ||
    path.startsWith("/api/node/")
  ) {
    sendJson(res, 405, { error: "method_not_allowed", message: "Only GET" });
    return;
  }

  sendJson(res, 404, { error: "not_found", path });
}

async function proxyNode(res, token, ergoPath, searchParams) {
  if (AUTO_REGISTER) {
    registry.ensureToken(token, { autoRegister: true, label: "proxy-auto" });
  }

  if (!registry.hasToken(token) && !registry.getConnection(token)) {
    sendJson(res, 404, {
      error: "unknown_token",
      message: "Token not found. Create one via POST /tokens",
    });
    return;
  }

  if (!registry.isConnected(token)) {
    sendJson(res, 503, {
      error: "bridge_offline",
      message: "Bridge is not connected for this token",
      status: registry.status(token),
    });
    return;
  }

  const pathOnly = normalizePath(ergoPath);
  if (!pathOnly || !isPathAllowed(pathOnly)) {
    sendJson(res, 403, {
      error: "forbidden",
      message: `Path not allowed: ${ergoPath}`,
    });
    return;
  }

  const session = registry.getConnection(token);
  const query = searchParams && searchParams.toString() ? searchParams.toString() : undefined;

  try {
    const result = await requestViaBridge(session, pathOnly, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      query,
    });
    registry.touch(token);

    const body =
      typeof result.body === "string"
        ? result.body
        : JSON.stringify(result.body ?? null);

    res.writeHead(result.status, {
      "Content-Type": result.contentType || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Lumen-Bridge": "proxied",
    });
    res.end(body);
  } catch (err) {
    const code = err.code || "proxy_error";
    const status =
      code === "forbidden"
        ? 403
        : code === "timeout"
          ? 504
          : code === "bridge_offline"
            ? 503
            : 502;
    sendJson(res, status, {
      error: code,
      message: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// WebSocket: Bridge agents
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  handleHttp(req, res).catch((err) => {
    log("error", `HTTP handler: ${err.message}`);
    if (!res.headersSent) sendJson(res, 500, { error: "internal", message: err.message });
  });
});

const wss = new WebSocketServer({ server, path: "/bridge" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/bridge", `http://${req.headers.host || "localhost"}`);
  let token = extractWsToken(req, url);
  let authed = false;
  let sessionToken = null;
  let rejectReason = null;

  const remote =
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  log(
    "info",
    `WS open from ${remote} (token=${token ? tokenPreview(token) : "pending hello"})`
  );

  const heartbeat = setInterval(() => {
    if (ws.readyState !== 1) return;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }, 30_000);

  const rejectAuth = (error, message, closeCode = 4001) => {
    rejectReason = error;
    log(
      "warn",
      `WS auth rejected remote=${remote} token=${tokenPreview(token)} error=${error}`
    );
    try {
      ws.send(
        JSON.stringify({
          type: "auth_error",
          error,
          message,
        })
      );
    } catch {
      /* ignore */
    }
    try {
      ws.close(closeCode, error);
    } catch {
      /* ignore */
    }
  };

  // Optional early auth from query/header
  if (token) {
    const entry = registry.ensureToken(token, {
      autoRegister: AUTO_REGISTER,
      label: "ws-connect",
    });
    if (!entry && !registry.hasToken(token)) {
      // Attach minimal close logging, then reject (stale token after hub restart is common)
      ws.on("close", (code) => {
        clearInterval(heartbeat);
        log(
          "info",
          `WS closed unauthenticated code=${code} reason=${rejectReason || "unknown_token"} remote=${remote}`
        );
      });
      rejectAuth(
        "unknown_token",
        "Token not registered. Create a token in the dashboard (Connect my node) and re-run the Docker command with that token."
      );
      return;
    }
    // Wait for hello to fully register, but mark known
  }

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try {
      msg = JSON.parse(data.toString("utf8"));
    } catch {
      return;
    }

    if (msg.type === "hello") {
      const t = msg.token || token;
      if (!t) {
        rejectAuth("token_required", "hello.token is required");
        return;
      }

      const entry = registry.ensureToken(t, {
        autoRegister: AUTO_REGISTER,
        label: "hello",
      });
      if (!entry && !registry.hasToken(t)) {
        token = t;
        rejectAuth(
          "unknown_token",
          "Token not registered. Create a token in the dashboard (Connect my node) and re-run the Docker command with that token."
        );
        return;
      }

      token = t;
      sessionToken = t;
      authed = true;
      const publicIp =
        typeof msg.publicIp === "string" && msg.publicIp.trim()
          ? msg.publicIp.trim()
          : null;
      registry.registerConnection(t, ws, {
        version: msg.version,
        node: msg.node,
        remoteAddress: remote,
        publicIp,
      });

      log(
        "info",
        `Bridge online token=${tokenPreview(t)} version=${msg.version || "?"} node=${msg.node || "?"} remote=${remote} publicIp=${publicIp || "—"}`
      );
      ws.send(
        JSON.stringify({
          type: "hello_ack",
          ok: true,
          serverVersion: VERSION,
        })
      );
      return;
    }

    if (!authed || !sessionToken) {
      // Allow late hello only
      if (msg.type !== "hello") {
        ws.send(
          JSON.stringify({
            type: "auth_error",
            error: "not_authenticated",
            message: "Send hello with token first",
          })
        );
      }
      return;
    }

    registry.touch(sessionToken);
    const session = registry.getConnection(sessionToken);

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now(), id: msg.id }));
      return;
    }

    if (msg.type === "pong") {
      return;
    }

    if (msg.type === "response" || msg.type === "error") {
      if (session) handleBridgeReply(session, msg);
      return;
    }

    log("warn", `Unknown bridge message type: ${msg.type}`);
  });

  ws.on("pong", () => {
    if (sessionToken) registry.touch(sessionToken);
  });

  ws.on("close", (code, reason) => {
    clearInterval(heartbeat);
    if (sessionToken) {
      registry.removeConnection(sessionToken, ws);
      log(
        "info",
        `Bridge offline token=${tokenPreview(sessionToken)} code=${code} ${reason || ""}`
      );
    } else {
      log(
        "info",
        `WS closed unauthenticated code=${code} reason=${rejectReason || reason || ""} remote=${remote}`
      );
    }
  });

  ws.on("error", (err) => {
    log("error", `WS error remote=${remote}: ${err.message}`);
  });
});

server.listen(PORT, HOST, () => {
  const stats = registry.stats();
  log(
    "info",
    `Lumen Bridge Server v${VERSION} listening on http://${HOST}:${PORT} (WS /bridge)`
  );
  log("info", `AUTO_REGISTER_TOKENS=${AUTO_REGISTER ? "on" : "off"}`);
  log(
    "info",
    `Token store: ${stats.storePath || "disabled"} (loaded ${stats.tokens} token(s))`
  );
});

// Graceful shutdown
function shutdown(sig) {
  log("info", `${sig} — shutting down`);
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = { registry, server };
