#!/usr/bin/env node
/**
 * Minimal mock Lumen Bridge server for local testing.
 *
 * Listens on ws://127.0.0.1:9099/bridge by default.
 * On client hello, accepts any token, then issues sample GET requests
 * against the bridge (which proxies to the local Ergo node).
 *
 * Usage:
 *   node scripts/mock-server.js
 *   node scripts/mock-server.js --port=9099
 */

"use strict";

const http = require("http");
const { WebSocketServer } = require("ws");
const { randomUUID } = require("crypto");

const port = (() => {
  const a = process.argv.find((x) => x.startsWith("--port="));
  return a ? Number(a.split("=")[1]) : 9099;
})();

const SAMPLE_PATHS = [
  "/info",
  "/peers/connected",
  "/transactions/unconfirmed",
  "/blocks/lastHeaders/10",
  "/wallet/balances", // should be forbidden by bridge
];

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Lumen Bridge mock server. Connect via WebSocket at /bridge\n");
});

const wss = new WebSocketServer({ server, path: "/bridge" });

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const qToken = url.searchParams.get("token");
  const hToken =
    req.headers["x-lumen-bridge-token"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  log("client connected", {
    ip: req.socket.remoteAddress,
    token: qToken || hToken || "(none yet)",
  });

  const pending = new Map();

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      log("bad json from client");
      return;
    }

    if (msg.type === "hello") {
      log("hello from bridge", { version: msg.version, token: msg.token });
      ws.send(JSON.stringify({ type: "hello_ack", ok: true }));

      // Fire sample requests after a short delay
      setTimeout(() => runSampleRequests(ws, pending), 500);
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now(), id: msg.id }));
      return;
    }

    if (msg.type === "response" || msg.type === "error") {
      const waiter = pending.get(msg.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        pending.delete(msg.id);
        if (msg.type === "error") {
          log(`response error id=${msg.id}`, msg.error, msg.message);
        } else {
          const preview =
            typeof msg.body === "object"
              ? JSON.stringify(msg.body).slice(0, 180)
              : String(msg.body).slice(0, 180);
          log(`response ok id=${msg.id} status=${msg.status}`, preview);
        }
      } else {
        log("orphan response", msg.type, msg.id);
      }
      return;
    }

    log("client msg", msg.type || msg);
  });

  ws.on("close", () => log("client disconnected"));
  ws.on("error", (err) => log("ws error", err.message));
});

function runSampleRequests(ws, pending) {
  if (ws.readyState !== ws.OPEN) return;

  for (const path of SAMPLE_PATHS) {
    const id = randomUUID();
    const payload = {
      type: "request",
      id,
      method: "GET",
      path,
    };

    pending.set(id, {
      path,
      timer: setTimeout(() => {
        pending.delete(id);
        log(`timeout waiting for ${path} (${id})`);
      }, 15_000),
    });

    log(`→ request ${path} id=${id}`);
    ws.send(JSON.stringify(payload));
  }
}

server.listen(port, "127.0.0.1", () => {
  log(`Mock Lumen Bridge server listening on ws://127.0.0.1:${port}/bridge`);
  log("Start the client with:");
  log(
    `  node bridge.js --token=lumen_test_local --server=ws://127.0.0.1:${port}/bridge --node=http://127.0.0.1:9053`
  );
});
