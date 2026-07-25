#!/usr/bin/env node
/**
 * Lumen Network Indexer (multi-seed)
 *
 * Harvests Ergo peers from:
 *   1) Local node (ERGO_NODE_URL)
 *   2) Curated public REST seeds (scripts/network-seeds.json)
 *   3) Official mainnet.conf knownPeers (P2P endpoints)
 *   4) REST fan-out to discovered restApiUrl hosts
 *   5) Optional /info enrichment + TCP :9030 probe
 *
 * Writes data/network-catalog.json for /api/peers/map (Lumen Node mode only).
 * My Node map is unaffected (bridge peers only).
 *
 * Usage: node scripts/crawl-network.mjs
 * Env:
 *   ERGO_NODE_URL
 *   LUMEN_NETWORK_CATALOG
 *   LUMEN_CRAWL_SKIP_PROBE=1
 *   LUMEN_NETWORK_SEEDS  path to seeds JSON
 *   LUMEN_MAX_FANOUT           default 200
 *   LUMEN_SEED_CONCURRENCY     default 4
 *   LUMEN_FANOUT_CONCURRENCY   default 8
 *   LUMEN_PRUNE_DAYS           default 21 (drop dead IPs; 0 = disable)
 *   LUMEN_PRUNE_SOFT=1         mark ghost instead of delete
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
const SEEDS_PATH =
  process.env.LUMEN_NETWORK_SEEDS ||
  path.join(ROOT, "scripts", "network-seeds.json");
const SKIP_PROBE =
  process.env.LUMEN_CRAWL_SKIP_PROBE === "1" ||
  process.env.AETHER_CRAWL_SKIP_PROBE === "1";

const SEED_CONCURRENCY = Number(process.env.LUMEN_SEED_CONCURRENCY || 4);
const SEED_TIMEOUT_MS = Number(process.env.LUMEN_SEED_TIMEOUT_MS || 9000);
const FANOUT_CONCURRENCY = Number(process.env.LUMEN_FANOUT_CONCURRENCY || 8);
const FANOUT_TIMEOUT_MS = Number(process.env.LUMEN_FANOUT_TIMEOUT_MS || 7000);
const MAX_FANOUT = Number(process.env.LUMEN_MAX_FANOUT || 200);
const INFO_CONCURRENCY = Number(process.env.LUMEN_INFO_CONCURRENCY || 8);
const INFO_TIMEOUT_MS = Number(process.env.LUMEN_INFO_TIMEOUT_MS || 5000);
const MAX_INFO_PROBES = Number(process.env.LUMEN_MAX_INFO_PROBES || 100);
const PROBE_CONCURRENCY = Number(process.env.LUMEN_PROBE_CONCURRENCY || 30);
const PROBE_TIMEOUT_MS = Number(process.env.LUMEN_PROBE_TIMEOUT_MS || 1500);
/** Drop nodes not seen for this many days (never if live/reachable recently) */
const PRUNE_DAYS = Number(
  process.env.LUMEN_PRUNE_DAYS !== undefined
    ? process.env.LUMEN_PRUNE_DAYS
    : 21
);
const PRUNE_SOFT = process.env.LUMEN_PRUNE_SOFT === "1";

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
  return { version: 1, updatedAt: 0, nodes: {}, seeds: {} };
}

function loadSeeds() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEEDS_PATH, "utf8"));
    return {
      restSeeds: Array.isArray(raw.restSeeds) ? raw.restSeeds : [],
      p2pSeeds: Array.isArray(raw.p2pSeeds) ? raw.p2pSeeds : [],
    };
  } catch (e) {
    log("seeds load FAIL", SEEDS_PATH, e.message);
    return { restSeeds: [], p2pSeeds: [] };
  }
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
      if (p.lastHandshake) existing.lastHandshake = Number(p.lastHandshake);
      if (p.lastMessage) existing.lastMessage = Number(p.lastMessage);
      if (existing.lat == null && geo) {
        existing.lat = geo.lat;
        existing.lon = geo.lon;
        existing.country = geo.country;
        existing.city = geo.city;
      }
      if (!Array.isArray(existing.sources)) existing.sources = [];
      if (!existing.sources.includes(source)) existing.sources.push(source);
      updated++;
    }
  }
  return { added, updated };
}

/** Insert a bare P2P seed host into catalog (no peer list yet). */
function ensureP2pSeed(catalog, host, port, source, now) {
  if (!host || isPrivateIp(host)) return false;
  const existing = catalog.nodes[host];
  if (!existing) {
    const geo = lookupGeo(host);
    catalog.nodes[host] = {
      ip: host,
      port: String(port || 9030),
      name: "seed",
      address: `/${host}:${port || 9030}`,
      lastHandshake: 0,
      lastMessage: 0,
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
    return true;
  }
  if (!existing.sources.includes(source)) existing.sources.push(source);
  existing.lastSeenAt = now;
  if (!existing.port && port) existing.port = String(port);
  return false;
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "LumenNetworkIndexer/1.1",
        Accept: "application/json",
      },
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
    // Allow loopback only for explicit local seed / ERGO_NODE_URL
    if (host === "127.0.0.1" || host === "::1") {
      return String(raw).includes("127.0.0.1") || String(raw).includes("localhost");
    }
    if (IPV4_RE.test(host) && isPrivateIp(host)) return false;
    if (host.includes(":")) return false; // skip bare IPv6
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical REST base for dedup:
 * - lowercase host
 * - strip path after host
 * - drop default ports (:80 http, :443 https)
 */
function normalizeRestBase(url) {
  try {
    let s = String(url || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    const u = new URL(s);
    let host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    let port = u.port;
    if (
      (u.protocol === "http:" && (port === "80" || !port)) ||
      (u.protocol === "https:" && (port === "443" || !port))
    ) {
      port = "";
    }
    const proto = u.protocol.toLowerCase();
    return port ? `${proto}//${host}:${port}` : `${proto}//${host}`;
  } catch {
    return String(url || "")
      .trim()
      .replace(/\/$/, "")
      .replace(/\/info$/i, "")
      .replace(/\/peers\/.*$/i, "")
      .toLowerCase();
  }
}

/** Collect unique fan-out REST targets from catalog (deduped by normalizeRestBase). */
function collectFanoutTargets(catalog, excludeBases) {
  /** @type {Map<string, { base: string, ip: string|null, score: number }>} */
  const map = new Map();
  for (const n of Object.values(catalog.nodes || {})) {
    if (!n.restApiUrl || !isSafeRestUrl(n.restApiUrl)) continue;
    const base = normalizeRestBase(n.restApiUrl);
    if (!base || excludeBases.has(base)) continue;
    // Prefer nodes that looked live recently
    const score =
      (n.reachable === true ? 100 : 0) +
      (Number(n.lastReachableAt) || 0) / 1e13 +
      (Number(n.lastInfoAt) || 0) / 1e13;
    const prev = map.get(base);
    if (!prev || score > prev.score) {
      map.set(base, { base, ip: n.ip || null, score });
    }
    // Write back normalized URL so catalog doesn't keep duplicates
    n.restApiUrl = base;
  }
  return [...map.values()]
    .sort((a, b) => b.score - a.score)
    .map((x) => x.base);
}

/**
 * Prune dead catalog entries.
 *
 * Live signals (never prune while fresh):
 *  - reachable === true
 *  - lastReachableAt / lastInfoAt within PRUNE_DAYS
 *
 * Gossip lastSeenAt alone does NOT protect a node (peer lists keep
 * recycling dead IPs forever). Age is measured from last *live* signal,
 * or firstSeenAt if never live.
 */
function pruneStaleNodes(catalog, now, _runStart) {
  const pruneMs = PRUNE_DAYS > 0 ? PRUNE_DAYS * 24 * 60 * 60 * 1000 : 0;
  if (!pruneMs) {
    return { pruned: 0, soft: 0, samples: [], disabled: true };
  }

  const samples = [];
  let pruned = 0;
  let soft = 0;
  let candidates = 0;

  for (const [ip, n] of Object.entries(catalog.nodes)) {
    // Always keep currently live / recently live
    if (n.reachable === true) continue;
    const lastLive = Math.max(
      Number(n.lastReachableAt) || 0,
      Number(n.lastInfoAt) || 0
    );
    if (lastLive > 0 && now - lastLive < pruneMs) continue;

    // Never-live: age from firstSeen; once-live: age from lastLive
    const ageFrom =
      lastLive > 0
        ? lastLive
        : Math.max(Number(n.firstSeenAt) || 0, Number(n.lastProbedAt) || 0);
    if (!ageFrom || now - ageFrom < pruneMs) continue;

    // Prefer only pruning nodes we've actually failed to reach at least once
    // (avoids deleting brand-new unprobed discoveries mid-rollout)
    if (n.reachable !== false && lastLive === 0 && !n.lastProbedAt) continue;

    candidates++;
    const rec = {
      ip,
      name: n.name,
      lastLiveAt: lastLive || null,
      firstSeenAt: n.firstSeenAt || null,
      reachable: n.reachable,
      mode: PRUNE_SOFT ? "soft" : "delete",
    };

    if (PRUNE_SOFT) {
      n.ghost = true;
      n.prunedAt = now;
      soft++;
      if (samples.length < 15) samples.push(rec);
    } else {
      if (samples.length < 15) samples.push(rec);
      delete catalog.nodes[ip];
      pruned++;
    }
  }

  return {
    pruned,
    soft,
    candidates,
    samples,
    pruneDays: PRUNE_DAYS,
    softMode: PRUNE_SOFT,
  };
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
    { length: Math.min(concurrency, Math.max(1, items.length)) },
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

/**
 * Harvest /peers/all + /peers/connected from one REST base.
 * Returns { ok, added, peersAll, peersConnected, error? }
 */
async function harvestRestSeed(catalog, base, sourceTag, now) {
  const result = {
    ok: false,
    added: 0,
    updated: 0,
    peersAll: 0,
    peersConnected: 0,
    error: null,
  };
  if (!isSafeRestUrl(base) && !base.includes("127.0.0.1")) {
    result.error = "unsafe_url";
    return result;
  }
  try {
    let all = [];
    let connected = [];
    try {
      all = await fetchJson(`${base}/peers/all`, SEED_TIMEOUT_MS);
      if (!Array.isArray(all)) all = [];
    } catch (e) {
      // some nodes hide /peers/all — try connected only
      all = [];
      result.error = `all:${e.message}`;
    }
    try {
      connected = await fetchJson(`${base}/peers/connected`, SEED_TIMEOUT_MS);
      if (!Array.isArray(connected)) connected = [];
    } catch (e) {
      connected = [];
      if (!all.length) throw e;
    }

    result.peersAll = all.length;
    result.peersConnected = connected.length;
    const m1 = mergePeerList(catalog, all, `${sourceTag}:all`, now);
    const m2 = mergePeerList(
      catalog,
      connected,
      `${sourceTag}:connected`,
      now
    );
    result.added = m1.added + m2.added;
    result.updated = m1.updated + m2.updated;
    result.ok = all.length > 0 || connected.length > 0;

    // Mark seed's connected peers as reachable
    for (const p of connected) {
      const parsed = extractIpPort(String(p.address || ""));
      if (!parsed) continue;
      const n = catalog.nodes[parsed.ip];
      if (!n) continue;
      n.reachable = true;
      n.lastReachableAt = now;
      if (p.name) n.name = p.name;
    }
  } catch (e) {
    result.error = e.message || String(e);
  }
  return result;
}

async function main() {
  const started = Date.now();
  const now = started;
  log("crawl start (multi-seed)", {
    ERGO,
    CATALOG_PATH,
    SEEDS_PATH,
    SKIP_PROBE,
    MAX_FANOUT,
  });

  const beforeTotal = Object.keys(loadCatalog()?.nodes || {}).length;
  const catalog = loadCatalog() || emptyCatalog();
  if (!catalog.seeds) catalog.seeds = {};

  const seeds = loadSeeds();
  const seedReport = {
    rest: [],
    p2pAdded: 0,
    fanout: {},
    info: {},
    probe: {},
  };

  // ─── 1) REST multi-seed harvest ─────────────────────────────────────────
  const restTargets = [];
  // Always include local first
  restTargets.push({ id: "local", url: ERGO });

  for (const s of seeds.restSeeds) {
    if (!s?.url) continue;
    if (s.id === "local") continue; // already added with ERGO override
    const url = normalizeRestBase(s.url);
    if (!url) continue;
    // skip duplicate of local
    if (url === ERGO || url === "http://127.0.0.1:9053") continue;
    restTargets.push({ id: s.id || url, url });
  }

  // Dedup by URL
  const seenUrl = new Set();
  const uniqueRest = [];
  for (const t of restTargets) {
    const u = normalizeRestBase(t.url);
    if (seenUrl.has(u)) continue;
    seenUrl.add(u);
    uniqueRest.push({ ...t, url: u });
  }

  log("rest seeds", uniqueRest.map((t) => t.id).join(", "));

  await mapPool(uniqueRest, SEED_CONCURRENCY, async (t) => {
    const r = await harvestRestSeed(
      catalog,
      t.url,
      `seed:${t.id}`,
      now
    );
    seedReport.rest.push({
      id: t.id,
      url: t.url,
      ok: r.ok,
      added: r.added,
      peersAll: r.peersAll,
      peersConnected: r.peersConnected,
      error: r.error,
    });
    if (r.ok) {
      log(
        "seed ok",
        t.id,
        "all",
        r.peersAll,
        "conn",
        r.peersConnected,
        "added",
        r.added
      );
    } else {
      log("seed fail", t.id, r.error);
    }
  });

  // ─── 2) Official P2P knownPeers ─────────────────────────────────────────
  for (const p of seeds.p2pSeeds) {
    if (!p?.host) continue;
    const added = ensureP2pSeed(
      catalog,
      p.host,
      p.port || 9030,
      `p2p-seed:${p.source || "mainnet"}`,
      now
    );
    if (added) seedReport.p2pAdded++;
  }
  log("p2p seeds added/new", seedReport.p2pAdded);

  // ─── 3) REST fan-out (deduped restApiUrl, multi-pass) ───────────────────
  // Normalize all catalog restApiUrl first (dedup keys in place)
  for (const n of Object.values(catalog.nodes)) {
    if (n.restApiUrl) {
      try {
        if (isSafeRestUrl(n.restApiUrl)) {
          n.restApiUrl = normalizeRestBase(n.restApiUrl);
        }
      } catch {
        /* ignore */
      }
    }
  }

  async function runFanoutPass(label, exclude) {
    const list = collectFanoutTargets(catalog, exclude).slice(0, MAX_FANOUT);
    log(`fan-out [${label}] targets`, list.length, "(max", MAX_FANOUT + ")");
    let ok = 0;
    let fail = 0;
    let added = 0;
    const hitBases = new Set();
    await mapPool(list, FANOUT_CONCURRENCY, async (base) => {
      try {
        let peers = [];
        try {
          peers = await fetchJson(`${base}/peers/all`, FANOUT_TIMEOUT_MS);
        } catch {
          peers = await fetchJson(
            `${base}/peers/connected`,
            FANOUT_TIMEOUT_MS
          );
        }
        if (!Array.isArray(peers)) throw new Error("not array");
        const r = mergePeerList(catalog, peers, `fanout:${label}`, now);
        added += r.added;
        ok++;
        hitBases.add(base);
        // Mark connected-looking peers if lastMessage present
        for (const p of peers) {
          if (!p?.address) continue;
          const parsed = extractIpPort(String(p.address));
          if (!parsed) continue;
          const node = catalog.nodes[parsed.ip];
          if (!node) continue;
          if (Number(p.lastMessage) > 0) {
            // recent activity on remote's peer list is a weak live signal
            node.lastSeenAt = now;
          }
        }
        if (r.added > 0) {
          log("fanout ok", label, base, "peers", peers.length, "added", r.added);
        }
      } catch {
        fail++;
      }
    });
    return { ok, fail, added, listSize: list.length, hitBases };
  }

  const fan1 = await runFanoutPass("p1", seenUrl);
  // Second pass: include newly discovered REST from pass 1 (still skip seeds)
  const fan2 = await runFanoutPass("p2", seenUrl);
  seedReport.fanout = {
    max: MAX_FANOUT,
    concurrency: FANOUT_CONCURRENCY,
    timeoutMs: FANOUT_TIMEOUT_MS,
    pass1: {
      ok: fan1.ok,
      fail: fan1.fail,
      added: fan1.added,
      targets: fan1.listSize,
    },
    pass2: {
      ok: fan2.ok,
      fail: fan2.fail,
      added: fan2.added,
      targets: fan2.listSize,
    },
    ok: fan1.ok + fan2.ok,
    fail: fan1.fail + fan2.fail,
    added: fan1.added + fan2.added,
  };
  log("fan-out total", seedReport.fanout);

  // ─── 4) /info enrichment (name, height, version) ────────────────────────
  const infoCandidates = [];
  const infoSeen = new Set();
  for (const n of Object.values(catalog.nodes)) {
    if (!n.restApiUrl || !isSafeRestUrl(n.restApiUrl)) continue;
    const base = normalizeRestBase(n.restApiUrl);
    if (infoSeen.has(base)) continue;
    infoSeen.add(base);
    infoCandidates.push({ ip: n.ip, base });
  }
  // Also probe primary seeds
  for (const t of uniqueRest) {
    if (infoSeen.has(t.url)) continue;
    infoSeen.add(t.url);
    infoCandidates.push({ ip: null, base: t.url });
  }

  const toInfo = infoCandidates.slice(0, MAX_INFO_PROBES);
  let infoOk = 0;
  let infoFail = 0;
  await mapPool(toInfo, INFO_CONCURRENCY, async ({ ip, base }) => {
    try {
      const info = await fetchJson(`${base}/info`, INFO_TIMEOUT_MS);
      infoOk++;
      // Attach to node by IP if we know it, else by matching restApiUrl
      const targets = [];
      if (ip && catalog.nodes[ip]) targets.push(catalog.nodes[ip]);
      for (const n of Object.values(catalog.nodes)) {
        if (
          n.restApiUrl &&
          normalizeRestBase(n.restApiUrl) === base &&
          !targets.includes(n)
        ) {
          targets.push(n);
        }
      }
      for (const n of targets) {
        if (info.name) n.name = info.name;
        n.infoHeight =
          info.fullHeight ?? info.headersHeight ?? n.infoHeight ?? null;
        n.infoVersion = info.appVersion || n.infoVersion || null;
        n.lastInfoAt = Date.now();
        // remember working REST
        n.restApiUrl = n.restApiUrl || base;
      }
    } catch {
      infoFail++;
    }
  });
  seedReport.info = { ok: infoOk, fail: infoFail, probed: toInfo.length };

  // ─── 4b) Open-REST scan: try http://IP:9053 on nodes without restApiUrl ─
  // Discovers hidden public APIs (many operators leave :9053 open).
  const openRestCandidates = Object.values(catalog.nodes)
    .filter((n) => n.ip && !n.restApiUrl)
    .slice(0, Number(process.env.LUMEN_OPEN_REST_MAX || 100));
  let openRestOk = 0;
  let openRestAdded = 0;
  await mapPool(openRestCandidates, 10, async (n) => {
    const base = `http://${n.ip}:9053`;
    try {
      const info = await fetchJson(`${base}/info`, 3500);
      openRestOk++;
      n.restApiUrl = base;
      if (info.name) n.name = info.name;
      n.infoHeight = info.fullHeight ?? info.headersHeight ?? null;
      n.infoVersion = info.appVersion || null;
      n.lastInfoAt = Date.now();
      n.reachable = true;
      n.lastReachableAt = Date.now();
      // harvest peers from this newly found REST
      try {
        let peers = [];
        try {
          peers = await fetchJson(`${base}/peers/all`, 5000);
        } catch {
          peers = await fetchJson(`${base}/peers/connected`, 5000);
        }
        if (Array.isArray(peers) && peers.length) {
          const r = mergePeerList(catalog, peers, `open-rest:${n.ip}`, now);
          openRestAdded += r.added;
        }
      } catch {
        /* peers optional */
      }
    } catch {
      /* closed REST — ignore */
    }
  });
  seedReport.openRest = {
    candidates: openRestCandidates.length,
    ok: openRestOk,
    peersAdded: openRestAdded,
  };
  log("open-rest scan", seedReport.openRest);

  // ─── 5) TCP probe ───────────────────────────────────────────────────────
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
      } else if (!n.lastReachableAt || n.lastReachableAt < now) {
        // don't demote if freshly marked connected this run
        n.reachable = false;
        probeFail++;
      } else {
        probeFail++;
      }
    });
  } else {
    log("probe skipped");
  }
  seedReport.probe = { ok: probeOk, fail: probeFail };

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

  // ─── 6) Prune stale / dead IPs ──────────────────────────────────────────
  const midTotal = Object.keys(catalog.nodes).length;
  const pruneReport = pruneStaleNodes(catalog, Date.now(), now);
  seedReport.prune = {
    ...pruneReport,
    before: midTotal,
    after: Object.keys(catalog.nodes).length,
  };
  log("prune", seedReport.prune);

  // Persist prune snapshot for ops
  try {
    const prunePath = path.join(ROOT, "data", "catalog-prune-last.json");
    fs.mkdirSync(path.dirname(prunePath), { recursive: true });
    fs.writeFileSync(
      prunePath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          ...seedReport.prune,
        },
        null,
        2
      ) + "\n"
    );
  } catch (e) {
    log("prune report write FAIL", e.message);
  }

  catalog.updatedAt = Date.now();
  catalog.seeds = {
    lastRunAt: catalog.updatedAt,
    report: seedReport,
  };
  recomputeStats(catalog);
  saveCatalog(catalog);

  const afterTotal = catalog.stats.total;
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  log("crawl done", {
    elapsedSec: elapsed,
    beforeTotal,
    afterTotal,
    delta: afterTotal - beforeTotal,
    pruned: pruneReport.pruned,
    prunedSoft: pruneReport.soft,
    stats: catalog.stats,
    seedsOk: seedReport.rest.filter((r) => r.ok).length,
    seedsFail: seedReport.rest.filter((r) => !r.ok).length,
    fanoutOk: seedReport.fanout?.ok,
    fanoutFail: seedReport.fanout?.fail,
    fanoutAdded: seedReport.fanout?.added,
    infoOk: seedReport.info?.ok,
    infoFail: seedReport.info?.fail,
    probeOk: seedReport.probe?.ok,
    probeFail: seedReport.probe?.fail,
    geoFilled,
    path: CATALOG_PATH,
  });
}

main().catch((e) => {
  console.error("crawl fatal", e);
  process.exit(1);
});
