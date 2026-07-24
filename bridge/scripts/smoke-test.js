#!/usr/bin/env node
/**
 * Smoke test: unit-check allowlist + optional live node GET + mock server roundtrip.
 */

"use strict";

const assert = require("assert");
const http = require("http");
const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const path = require("path");
const {
  isPathAllowed,
  normalizePath,
  nodeGet,
  BRIDGE_VERSION,
} = require("../bridge.js");

const ROOT = path.join(__dirname, "..");

function section(title) {
  console.log(`\n== ${title} ==`);
}

async function testAllowlist() {
  section("allowlist");
  assert.strictEqual(normalizePath("/info"), "/info");
  assert.strictEqual(normalizePath("info"), "/info");
  assert.strictEqual(normalizePath("/blocks/lastHeaders/10"), "/blocks/lastHeaders/10");
  assert.strictEqual(normalizePath("/blocks/../wallet"), null);

  const ok = [
    "/info",
    "/peers/connected",
    "/transactions/unconfirmed",
    "/blocks/at/100",
    "/blocks/lastHeaders/100",
    "/blocks",
  ];
  const blocked = [
    "/wallet/balances",
    "/utils/seed",
    "/mining/candidate",
    "/peers/all",
    "/transactions",
    "/info/../wallet",
    "/blocks/../../etc/passwd",
  ];

  for (const p of ok) {
    assert.strictEqual(isPathAllowed(p), true, `should allow ${p}`);
  }
  for (const p of blocked) {
    assert.strictEqual(isPathAllowed(p), false, `should block ${p}`);
  }
  console.log("allowlist OK");
}

async function testNodeOptional() {
  section("optional live node GET /info");
  try {
    const res = await nodeGet("http://127.0.0.1:9053", "/info", 3000);
    console.log(`node /info status=${res.status} name=${res.body && res.body.name}`);
  } catch (err) {
    console.log(`node not reachable (skip live check): ${err.message}`);
  }
}

async function testRoundtrip() {
  section("mock server roundtrip");

  const port = 19099;
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: "/bridge" });

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("roundtrip timeout"));
    }, 12_000);

    let child;
    function cleanup() {
      clearTimeout(timeout);
      try {
        wss.close();
      } catch {
        /* */
      }
      try {
        server.close();
      } catch {
        /* */
      }
      if (child && !child.killed) child.kill("SIGTERM");
    }

    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === "hello") {
          ws.send(JSON.stringify({ type: "hello_ack", ok: true }));
          ws.send(
            JSON.stringify({
              type: "request",
              id: "t1",
              method: "GET",
              path: "/info",
            })
          );
          ws.send(
            JSON.stringify({
              type: "request",
              id: "t2",
              method: "GET",
              path: "/wallet/balances",
            })
          );
          return;
        }
        if (msg.type === "response" && msg.id === "t1") {
          // /info should succeed or upstream error — not forbidden
          assert.notStrictEqual(msg.status, undefined);
          console.log(`roundtrip /info → status ${msg.status}`);
        }
        if (msg.type === "error" && msg.id === "t2") {
          assert.strictEqual(msg.error, "forbidden");
          console.log("roundtrip /wallet/balances correctly forbidden");
          cleanup();
          resolve(true);
        }
      });
    });

    server.listen(port, "127.0.0.1", () => {
      child = spawn(
        process.execPath,
        [
          path.join(ROOT, "bridge.js"),
          "--token=lumen_smoke_test",
          `--server=ws://127.0.0.1:${port}/bridge`,
          "--node=http://127.0.0.1:9053",
        ],
        { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
      );
      child.stdout.on("data", (d) => process.stdout.write(`[bridge] ${d}`));
      child.stderr.on("data", (d) => process.stderr.write(`[bridge] ${d}`));
      child.on("error", (err) => {
        cleanup();
        reject(err);
      });
    });
  });

  assert.ok(result);
  console.log("roundtrip OK");
}

(async () => {
  console.log(`Lumen Bridge smoke test (v${BRIDGE_VERSION})`);
  await testAllowlist();
  await testNodeOptional();
  await testRoundtrip();
  console.log("\nAll smoke checks passed.");
  process.exit(0);
})().catch((err) => {
  console.error("\nSMOKE TEST FAILED:", err);
  process.exit(1);
});
