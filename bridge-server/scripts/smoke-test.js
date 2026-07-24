#!/usr/bin/env node
"use strict";

/**
 * Smoke test against a running bridge-server (default http://127.0.0.1:3100)
 * and a bridge client pointing at it (optional — we also test offline paths).
 */

const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const BASE = process.env.BRIDGE_SERVER_URL || "http://127.0.0.1:3100";
const BRIDGE_CLIENT = path.resolve(__dirname, "../../bridge/bridge.js");

function req(method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method,
        headers: {
          Accept: "application/json",
          ...(data
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
            : {}),
          ...headers,
        },
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = text;
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log("== health ==");
  const health = await req("GET", "/health");
  console.log(health.status, health.body);
  if (health.status !== 200) throw new Error("health failed");

  console.log("\n== create token ==");
  const created = await req("POST", "/tokens", { body: { label: "smoke" } });
  console.log(created.status, created.body);
  if (created.status !== 201 || !created.body.token) throw new Error("create token failed");
  const token = created.body.token;

  console.log("\n== status offline ==");
  const st0 = await req("GET", `/status?token=${encodeURIComponent(token)}`);
  console.log(st0.status, st0.body);
  if (!st0.body || st0.body.connected !== false) throw new Error("expected offline");

  console.log("\n== proxy while offline ==");
  const off = await req("GET", `/api/bridge/node/info?token=${encodeURIComponent(token)}`);
  console.log(off.status, off.body);
  if (off.status !== 503) throw new Error("expected 503 offline");

  // Connect a real bridge client if available
  console.log("\n== start bridge client ==");
  const wsUrl = BASE.replace(/^http/, "ws") + "/bridge";
  const child = spawn(
    process.execPath,
    [
      BRIDGE_CLIENT,
      `--token=${token}`,
      `--server=${wsUrl}`,
      "--node=http://127.0.0.1:9053",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  child.stdout.on("data", (d) => process.stdout.write(`[bridge] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[bridge] ${d}`));

  // Wait until connected
  let connected = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const st = await req("GET", `/status?token=${encodeURIComponent(token)}`);
    if (st.body && st.body.connected) {
      connected = true;
      console.log("status connected:", st.body);
      break;
    }
  }
  if (!connected) {
    child.kill("SIGTERM");
    throw new Error("bridge did not connect");
  }

  console.log("\n== proxy /info ==");
  const info = await req("GET", `/api/bridge/node/info`, {
    headers: { "X-Lumen-Bridge-Token": token },
  });
  console.log(info.status, typeof info.body === "object" ? {
    name: info.body.name,
    fullHeight: info.body.fullHeight,
    peers: info.body.peers,
  } : info.body);
  if (info.status !== 200 || !info.body || !info.body.fullHeight) {
    child.kill("SIGTERM");
    throw new Error("proxy /info failed");
  }

  console.log("\n== forbidden path ==");
  const bad = await req("GET", `/api/bridge/node/wallet/balances`, {
    headers: { "X-Lumen-Bridge-Token": token },
  });
  console.log(bad.status, bad.body);
  if (bad.status !== 403) {
    child.kill("SIGTERM");
    throw new Error("expected 403 forbidden");
  }

  child.kill("SIGTERM");
  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
