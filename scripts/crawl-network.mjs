#!/usr/bin/env node
/**
 * Lumen Network Indexer
 * Harvests Ergo peers from local node + REST fan-out + TCP :9030 probe.
 * Writes data/network-catalog.json for /api/peers/map.
 *
 * Usage: node scripts/crawl-network.mjs
 * Env: ERGO_NODE_URL, LUMEN_NETWORK_CATALOG (legacy AETHER_NETWORK_CATALOG),
 *      LUMEN_CRAWL_SKIP_PROBE=1 (legacy AETHER_CRAWL_SKIP_PROBE)
 */
import fs from "fs";
import path from "path";
import net from "net";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const geoip = require("geoip-lite");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ERGO = (process.env.ERGO_NODE_URL || "http://127.0.0.1:9053").replace(
  /\/$/,
  ""
);
const CATALOG_PATH =
  process.env.LUMEN_NETWORK_CATALOG ||
  process.env.AETHER_NETWORK_CATALOG ||
  path.join(ROOT, "data", "network-catalog.json");
const SKIP_PROBE =
  process.env.LUMEN_CRAWL_SKIP_PROBE === "1" ||
  process.env.AETHER_CRAWL_SKIP_PROBE === "1";
const FANOUT_CONCURRENCY = 4;
const FANOUT_TIMEOUT_MS = 8000;
const PROBE_CONCURRENCY = 25;
const PROBE_TIMEOUT_MS = 1500;
const MAX_FANOUT = 40;

const IPV4_RE = /(\d{1,3}(?:\.\d{1,3}){3})/;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function isPrivateIp(ip) {
  if (
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("0.") ||
    ip.startsWith("169.254.") ||
    ip === "255.255.255.255"
  )
    return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip)) return true;
  return false;
}

function extractIpPort(raw) {
  const m = String(raw || "").match(IPV4_RE);
  if (!m) return null;
  const ip = m[1];
  if (isPrivateIp(ip)) return null;
  const portM = String(raw).match(/:(\d{2,5})\s*$/);
  return { ip, port: portM ? portM[1] : null };
}

function lookupGeo(ip) {
  const geo = geoip.lookup(ip);
  if (!geo?.ll) return null;
  return {
    lat: geo.ll[0],
    lon: geo.ll[1],
    country: geo.country || "",
    city: geo.city || "",
  };
}

function loadCatalog() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
    if (!data?.nodes) return null;
    return data;
  } catch {
    return null;
  }
}

function emptyCatalog() {
  return { version: 1, updatedAt: 0, nodes: {} };
}

function mergePeerList(catalog, peers, source, now) {
  let added = 0;
  let updated = 0;
  for (const p of peers || []) {
    const raw = String(p.address || p.declaredAddress || "");
    const parsed = extractIpPort(raw);
    if (!parsed) continue;
    const { ip, port } = parsed;
    const existing = catalog.nodes[ip];
    const geo =
      existing?.lat != null
        ? {
            lat: existing.lat,
            lon: existing.lon,
            country: existing.country,
            city: existing.city,
          }
        : lookupGeo(ip);

    if (!existing) {
      catalog.nodes[ip] = {
        ip,
        port,
        name: p.name || "unknown",
        address: raw || `/${ip}${port ? `:${port}` : ""}`,
        restApiUrl: p.restApiUrl || undefined,
        lastHandshake: Number(p.lastHandshake) || 0,
        lastMessage: Number(p.lastMessage) || 0,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
        country: geo?.country || "",
        city: geo?.city || "",
        reachable: null,
        lastReachableAt: null,
        lastProbedAt: null,
        sources: [source],
        firstSeenAt: now,
        lastSeenAt: now,
      };
      added++;
    } else {
      existing.lastSeenAt = now;
      if (p.name) existing.name = p.name;
      if (raw) existing.address = raw;
      if (port) existing.port = port;
      if (p.restApiUrl) existing.restApiUrl = p.restApiUrl;
      if (p.lastHandshake)
        existing.lastHandshake = Number(p.lastHandshake);
      if (p.lastMessage) existing.lastMessage = Number(p.lastMessage);
      if (existing.lat == null && geo) {
        existing.lat = geo.lat;
        existing.lon = geo.lon;
        existing.country = geo.country;
        existing.city = geo.city;
      }
      if (!existing.sources.includes(source)) existing.sources.push(source);
      updated++;
    }
  }
  return { added, updated };
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "LumenNetworkIndexer/0.1", Accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 5_000_000) throw new Error("body too large");
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

/** SSRF guard: only public http(s) hosts */
function isSafeRestUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".local")) return false;
    // IPv4 host?
    if (IPV4_RE.test(host) && isPrivateIp(host)) return false;
    // bare IPv6 private-ish skip simple check
    if (host.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

function tcpProbe(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    try {
      socket.connect(port, ip);
    } catch {
      finish(false);
    }
  });
}

async function mapPool(items, concurrency, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function recomputeStats(catalog) {
  let withGeo = 0;
  let reachable = 0;
  let unreachable = 0;
  let unprobed = 0;
  const nodes = Object.values(catalog.nodes);
  for (const n of nodes) {
    if (n.lat != null && n.lon != null) withGeo++;
    if (n.reachable === true) reachable++;
    else if (n.reachable === false) unreachable++;
    else unprobed++;
  }
  catalog.stats = {
    total: nodes.length,
    withGeo,
    reachable,
    unreachable,
    unprobed,
  };
}

function saveCatalog(catalog) {
  const dir = path.dirname(CATALOG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = CATALOG_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(catalog, null, 2));
  fs.renameSync(tmp, CATALOG_PATH);
}

async function main() {
  const started = Date.now();
  const now = started;
  log("crawl start", { ERGO, CATALOG_PATH, SKIP_PROBE });

  const catalog = loadCatalog() || emptyCatalog();
  // Preserve probe history; refresh discovery

  // 1) Local harvest
  let localAll = [];
  let localConnected = [];
  try {
    localAll = await fetchJson(`${ERGO}/peers/all`, 12000);
    log("local /peers/all", localAll.length);
  } catch (e) {
    log("local /peers/all FAIL", e.message);
  }
  try {
    localConnected = await fetchJson(`${ERGO}/peers/connected`, 12000);
    log("local /peers/connected", localConnected.length);
  } catch (e) {
    log("local /peers/connected FAIL", e.message);
  }

  const m1 = mergePeerList(catalog, localAll, "local", now);
  const m2 = mergePeerList(catalog, localConnected, "local-connected", now);
  log("merge local", { ...m1, connectedUpdated: m2.updated });

  // Mark currently connected as reachable without TCP (we are talking to them)
  for (const p of localConnected) {
    const parsed = extractIpPort(String(p.address || ""));
    if (!parsed) continue;
    const n = catalog.nodes[parsed.ip];
    if (!n) continue;
    n.reachable = true;
    n.lastReachableAt = now;
    n.lastMessage = Number(p.lastMessage) || n.lastMessage;
    n.lastHandshake = Number(p.lastHandshake) || n.lastHandshake;
    if (p.name) n.name = p.name;
  }

  // 2) REST fan-out
  const restUrls = new Map();
  for (const n of Object.values(catalog.nodes)) {
    if (n.restApiUrl && isSafeRestUrl(n.restApiUrl)) {
      const base = String(n.restApiUrl).replace(/\/$/, "");
      restUrls.set(base, n.ip);
    }
  }
  // Also from raw localAll entries
  for (const p of [...localAll, ...localConnected]) {
    if (p.restApiUrl && isSafeRestUrl(p.restApiUrl)) {
      restUrls.set(String(p.restApiUrl).replace(/\/$/, ""), "raw");
    }
  }

  const fanoutList = [...restUrls.keys()].slice(0, MAX_FANOUT);
  log("fan-out targets", fanoutList.length);

  let fanoutOk = 0;
  let fanoutFail = 0;
  let fanoutAdded = 0;
  await mapPool(fanoutList, FANOUT_CONCURRENCY, async (base) => {
    try {
      const peers = await fetchJson(`${base}/peers/all`, FANOUT_TIMEOUT_MS);
      if (!Array.isArray(peers)) throw new Error("not array");
      const r = mergePeerList(catalog, peers, "fanout", now);
      fanoutAdded += r.added;
      fanoutOk++;
      log("fanout ok", base, "peers", peers.length, "added", r.added);
    } catch (e) {
      fanoutFail++;
      log("fanout fail", base, e.message);
    }
  });

  // 3) TCP probe (skip private already filtered)
  let probeOk = 0;
  let probeFail = 0;
  if (!SKIP_PROBE) {
    const toProbe = Object.values(catalog.nodes).filter((n) => n.ip);
    log("probing TCP", toProbe.length);
    await mapPool(toProbe, PROBE_CONCURRENCY, async (n) => {
      const port = Number(n.port) || 9030;
      const ok = await tcpProbe(n.ip, port, PROBE_TIMEOUT_MS);
      n.lastProbedAt = Date.now();
      if (ok) {
        n.reachable = true;
        n.lastReachableAt = n.lastProbedAt;
        probeOk++;
      } else {
        // Don't demote currently-connected (already set true this run)
        if (n.reachable !== true || n.lastReachableAt < now - 1000) {
          // if we marked connected this run, lastReachableAt >= now roughly
        }
        // Only set false if not freshly marked connected
        if (!n.lastReachableAt || n.lastReachableAt < now) {
          n.reachable = false;
        }
        probeFail++;
      }
    });
    // Re-assert connected peers as reachable (probe may have raced)
    for (const p of localConnected) {
      const parsed = extractIpPort(String(p.address || ""));
      if (!parsed) continue;
      const n = catalog.nodes[parsed.ip];
      if (!n) continue;
      n.reachable = true;
      n.lastReachableAt = Date.now();
    }
  } else {
    log("probe skipped (LUMEN_CRAWL_SKIP_PROBE=1)");
  }

  // Fill missing geo
  let geoFilled = 0;
  for (const n of Object.values(catalog.nodes)) {
    if (n.lat == null) {
      const g = lookupGeo(n.ip);
      if (g) {
        n.lat = g.lat;
        n.lon = g.lon;
        n.country = g.country;
        n.city = g.city;
        geoFilled++;
      }
    }
  }

  catalog.updatedAt = Date.now();
  recomputeStats(catalog);
  saveCatalog(catalog);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  log("crawl done", {
    elapsedSec: elapsed,
    stats: catalog.stats,
    fanoutOk,
    fanoutFail,
    fanoutAdded,
    probeOk,
    probeFail,
    geoFilled,
    path: CATALOG_PATH,
  });
}

main().catch((e) => {
  console.error("crawl fatal", e);
  process.exit(1);
});
