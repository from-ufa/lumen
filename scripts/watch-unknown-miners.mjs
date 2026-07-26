#!/usr/bin/env node
/**
 * Lumen — unknown mining-pool address watcher + auto catalog / identify
 *
 * Fetches recent blocks from the official Explorer API, compares miner.address
 * against KNOWN_MINING_POOLS in app/lib/mining-pools.ts.
 *
 * With --auto (recommended for cron):
 *   1) Match unknown block hashes against public pool APIs (brand identify)
 *   2) Auto-append new reward scripts into mining-pools.ts
 *      - brand match → "2Miners" / "HeroMiners" / …
 *      - no match    → "Pool <short8>" provisional label
 *
 * Usage:
 *   node scripts/watch-unknown-miners.mjs
 *   node scripts/watch-unknown-miners.mjs --limit=100 --auto
 *   node scripts/watch-unknown-miners.mjs --auto --telegram
 *   npm run watch:unknown-miners -- --auto --telegram
 *
 * Env:
 *   ERGO_EXPLORER_API   default https://api.ergoplatform.com/api/v1
 *   LUMEN_UNKNOWN_MINERS_OUT  default data/unknown-miners.json
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  (or source /root/.secrets)
 *   LUMEN_TG_ON_EMPTY=1  also notify when there are no unknowns
 *   LUMEN_AUTO_MINERS=1  same as --auto
 *
 * Cron example:
 *   15 *​/4 * * * cd /home/lumen && /usr/bin/node scripts/watch-unknown-miners.mjs --auto --telegram >> /var/log/lumen-unknown-miners.log 2>&1
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const EXPLORER =
  process.env.ERGO_EXPLORER_API ||
  process.env.NEXT_PUBLIC_ERGO_EXPLORER_API ||
  "https://api.ergoplatform.com/api/v1";

const OUT_PATH =
  process.env.LUMEN_UNKNOWN_MINERS_OUT ||
  path.join(ROOT, "data", "unknown-miners.json");

const POOLS_TS = path.join(ROOT, "app", "lib", "mining-pools.ts");

/** Public pool block-list sources for brand identification (hash match). */
const POOL_HASH_SOURCES = [
  {
    name: "2Miners",
    url: "https://erg.2miners.com/api/blocks",
    urlHint: "https://2miners.com/erg-mining-pool",
    extract: extract2MinersHashes,
  },
  {
    name: "HeroMiners",
    url: "https://ergo.herominers.com/api/stats",
    urlHint: "https://ergo.herominers.com",
    extract: extractHeroMinersHashes,
  },
  {
    name: "Kryptex",
    url: "https://pool.kryptex.com/erg/api/v1/pool/blocks?limit=100",
    urlHint: "https://pool.kryptex.com/erg",
    extract: extractKryptexHashes,
  },
  {
    name: "Nanopool",
    url: "https://api.nanopool.org/v1/ergo/blocks/0/50",
    urlHint: "https://ergo.nanopool.org",
    extract: extractNanopoolHashes,
  },
];

function parseArgs(argv) {
  const out = {
    limit: 100,
    telegram: false,
    quiet: false,
    help: false,
    auto: process.env.LUMEN_AUTO_MINERS === "1",
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--telegram" || a === "-t") out.telegram = true;
    else if (a === "--quiet" || a === "-q") out.quiet = true;
    else if (a === "--auto" || a === "-a") out.auto = true;
    else if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) out.limit = Math.min(500, Math.floor(n));
    }
  }
  return out;
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function shortAddr(a) {
  if (!a || a.length < 12) return a || "—";
  return a.slice(-8);
}

function classifyAddress(address) {
  if (!address) return "unknown";
  if (address.startsWith("9") && address.length >= 50) return "solo_candidate";
  if (address.startsWith("88")) return "pool_script";
  return "other";
}

function normalizeHash(h) {
  if (!h || typeof h !== "string") return null;
  const s = h.trim().toLowerCase().replace(/^0x/, "");
  if (s.length < 32) return null;
  return s;
}

/** Load known pool addresses + names from mining-pools.ts (no TS compile needed). */
function loadKnownPoolsFromSource(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const start = src.indexOf("export const KNOWN_MINING_POOLS");
  if (start < 0) throw new Error("KNOWN_MINING_POOLS not found in " + filePath);
  const brace = src.indexOf("{", start);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(brace, end + 1);
  /** @type {Record<string, string>} */
  const map = {};
  const re =
    /"([1-9A-HJ-NP-Za-km-z]{20,})"\s*:\s*\{[^}]*?name\s*:\s*"([^"]+)"/gs;
  let m;
  while ((m = re.exec(body))) {
    map[m[1]] = m[2];
  }
  return map;
}

async function fetchJson(url, timeoutMs = 18_000) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "LumenUnknownMinersWatcher/1.1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchRecentBlocks(limit) {
  const pageSize = 100;
  /** @type {Array<{id:string,height:number,miner?:{address?:string,name?:string}}>} */
  const items = [];
  let offset = 0;
  while (items.length < limit) {
    const take = Math.min(pageSize, limit - items.length);
    const url = `${EXPLORER.replace(/\/$/, "")}/blocks?limit=${take}&offset=${offset}`;
    const data = await fetchJson(url);
    const batch = Array.isArray(data.items) ? data.items : [];
    if (!batch.length) break;
    items.push(...batch);
    offset += batch.length;
    if (batch.length < take) break;
  }
  return items.slice(0, limit);
}

function extract2MinersHashes(data) {
  /** @type {string[]} */
  const out = [];
  for (const key of ["matured", "immature", "candidates"]) {
    const arr = data?.[key];
    if (!Array.isArray(arr)) continue;
    for (const b of arr) {
      const h = normalizeHash(b?.hash);
      if (h) out.push(h);
    }
  }
  return out;
}

function extractHeroMinersHashes(data) {
  /** @type {string[]} */
  const out = [];
  const pool = data?.pool;
  const lists = [
    pool?.blocks,
    pool?.maturedBlocks,
    data?.blocks,
    data?.pool_statistics?.blocks,
  ];
  for (const arr of lists) {
    if (!Array.isArray(arr)) continue;
    for (const b of arr) {
      const h =
        normalizeHash(b?.hash) ||
        normalizeHash(b?.id) ||
        normalizeHash(b?.blockHash);
      if (h) out.push(h);
    }
  }
  // recursive light scan for hash fields (bounded)
  const stack = [data];
  let n = 0;
  while (stack.length && n < 5000) {
    const cur = stack.pop();
    n++;
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (const x of cur.slice(0, 200)) stack.push(x);
      continue;
    }
    for (const [k, v] of Object.entries(cur)) {
      if (
        (k === "hash" || k === "blockHash" || k === "id") &&
        typeof v === "string"
      ) {
        const h = normalizeHash(v);
        if (h && h.length >= 64) out.push(h);
      } else if (v && typeof v === "object") stack.push(v);
    }
  }
  return out;
}

function extractKryptexHashes(data) {
  /** @type {string[]} */
  const out = [];
  const arr = data?.results || data?.blocks || data;
  if (!Array.isArray(arr)) return out;
  for (const b of arr) {
    const h =
      normalizeHash(b?.hash) ||
      normalizeHash(b?.block_hash) ||
      normalizeHash(b?.id);
    if (h) out.push(h);
  }
  return out;
}

function extractNanopoolHashes(data) {
  /** @type {string[]} */
  const out = [];
  const arr = data?.data;
  if (!Array.isArray(arr)) return out;
  for (const b of arr) {
    const h = normalizeHash(b?.hash) || normalizeHash(b?.blockhash);
    if (h) out.push(h);
  }
  return out;
}

/**
 * Build hash → pool brand from public APIs.
 * @returns {Promise<{ hashToBrand: Map<string,string>, brandUrls: Record<string,string>, sourcesOk: string[], sourcesFail: string[] }>}
 */
async function buildPoolHashIndex() {
  /** @type {Map<string, string>} */
  const hashToBrand = new Map();
  /** @type {Record<string, string>} */
  const brandUrls = {};
  const sourcesOk = [];
  const sourcesFail = [];

  await Promise.all(
    POOL_HASH_SOURCES.map(async (src) => {
      try {
        const data = await fetchJson(src.url);
        const hashes = src.extract(data);
        let n = 0;
        for (const h of hashes) {
          if (!hashToBrand.has(h)) {
            hashToBrand.set(h, src.name);
            n++;
          }
        }
        brandUrls[src.name] = src.urlHint;
        sourcesOk.push(`${src.name}(${n})`);
      } catch (e) {
        sourcesFail.push(`${src.name}:${e.message || e}`);
      }
    })
  );

  return { hashToBrand, brandUrls, sourcesOk, sourcesFail };
}

/**
 * Append new entries to KNOWN_MINING_POOLS in mining-pools.ts
 * @param {Array<{address:string,name:string,url?:string,note?:string}>} entries
 */
function appendPoolsToSource(entries) {
  if (!entries.length) return { written: 0 };
  let src = fs.readFileSync(POOLS_TS, "utf8");
  const marker = "export const KNOWN_MINING_POOLS";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("KNOWN_MINING_POOLS not found");
  const brace = src.indexOf("{", start);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const chunks = [
    "",
    `  /* auto-catalog ${stamp} via watch-unknown-miners --auto */`,
  ];
  for (const e of entries) {
    const urlLine = e.url
      ? `\n      url: ${JSON.stringify(e.url)},`
      : "";
    const note = e.note ? `\n   * ${e.note}` : "";
    chunks.push(
      `  /*${note}`,
      `   */`,
      `  ${JSON.stringify(e.address)}: {`,
      `    name: ${JSON.stringify(e.name)},${urlLine}`,
      `  },`
    );
  }
  chunks.push("");

  const insert = chunks.join("\n");
  src = src.slice(0, end) + insert + src.slice(end);
  fs.writeFileSync(POOLS_TS, src, "utf8");
  return { written: entries.length };
}

function loadSecrets() {
  const secretsPath = process.env.LUMEN_SECRETS || "/root/.secrets";
  try {
    if (!fs.existsSync(secretsPath)) return;
    const text = fs.readFileSync(secretsPath, "utf8");
    for (const line of text.split("\n")) {
      let t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (t.startsWith("export ")) t = t.slice(7).trim();
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

async function sendTelegram(text) {
  loadSecrets();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    log("Telegram skipped: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
    return false;
  }
  const body = new URLSearchParams({
    chat_id: chat,
    text: text.slice(0, 4000),
    disable_web_page_preview: "true",
  });
  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    { method: "POST", body, signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Telegram HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return true;
}

function printHelp() {
  console.log(`watch-unknown-miners — find miner.address not in KNOWN_MINING_POOLS

Usage:
  node scripts/watch-unknown-miners.mjs [options]
  npm run watch:unknown-miners -- [--auto] [--telegram] [--limit=100]

Options:
  --limit=N     Recent blocks to scan (default 100, max 500)
  --auto, -a    Identify brands via pool APIs + auto-append to mining-pools.ts
  --telegram    Send short report to Telegram
  --quiet       Less console noise
  --help        This help

Env:
  LUMEN_AUTO_MINERS=1   same as --auto
  LUMEN_TG_ON_EMPTY=1   Telegram even when no unknowns

Output:
  data/unknown-miners.json
  app/lib/mining-pools.ts  (only with --auto when new addresses found)

Cron:
  15 */4 * * * cd /home/lumen && /usr/bin/node scripts/watch-unknown-miners.mjs --auto --telegram >> /var/log/lumen-unknown-miners.log 2>&1
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.quiet) {
    log("start", {
      limit: args.limit,
      auto: args.auto,
      out: OUT_PATH,
      explorer: EXPLORER,
    });
  }

  let known = loadKnownPoolsFromSource(POOLS_TS);
  let knownCount = Object.keys(known).length;
  if (!args.quiet) log("known pools in dictionary:", knownCount);

  const blocks = await fetchRecentBlocks(args.limit);
  if (!blocks.length) throw new Error("No blocks returned from Explorer");

  const tip = blocks[0]?.height ?? null;
  const oldest = blocks[blocks.length - 1]?.height ?? null;

  /**
   * @type {Map<string, {
   *   address: string,
   *   explorerName: string|null,
   *   count: number,
   *   heights: number[],
   *   blockIds: string[],
   *   kind: string
   * }>}
   */
  const byAddr = new Map();
  let knownHits = 0;
  let unknownHits = 0;
  let missingMiner = 0;

  for (const b of blocks) {
    const address = b.miner?.address?.trim();
    if (!address) {
      missingMiner++;
      continue;
    }
    const name = b.miner?.name ?? null;
    if (known[address]) {
      knownHits++;
      continue;
    }
    unknownHits++;
    let row = byAddr.get(address);
    if (!row) {
      row = {
        address,
        explorerName: name,
        count: 0,
        heights: [],
        blockIds: [],
        kind: classifyAddress(address),
      };
      byAddr.set(address, row);
    }
    row.count++;
    if (name) row.explorerName = name;
    if (row.heights.length < 12 && typeof b.height === "number") {
      row.heights.push(b.height);
    }
    const bid = normalizeHash(b.id);
    if (bid && row.blockIds.length < 12 && !row.blockIds.includes(bid)) {
      row.blockIds.push(bid);
    }
  }

  let unknown = [...byAddr.values()].sort((a, b) => b.count - a.count);

  /** @type {Array<{address:string,name:string,url?:string,method:string,count:number,short:string,note?:string}>} */
  const autoAdded = [];
  /** @type {{ sourcesOk: string[], sourcesFail: string[], brandsMatched: number } | null} */
  let identifyMeta = null;

  if (args.auto && unknown.length > 0) {
    if (!args.quiet) log("auto: fetching public pool block hashes…");
    const { hashToBrand, brandUrls, sourcesOk, sourcesFail } =
      await buildPoolHashIndex();
    identifyMeta = {
      sourcesOk,
      sourcesFail,
      brandsMatched: 0,
    };
    if (!args.quiet) {
      log("auto: pool sources ok:", sourcesOk.join(", ") || "—");
      if (sourcesFail.length)
        log("auto: pool sources fail:", sourcesFail.join(" | "));
      log("auto: hash index size:", hashToBrand.size);
    }

    /** @type {Array<{address:string,name:string,url?:string,note?:string}>} */
    const toWrite = [];

    for (const u of unknown) {
      if (known[u.address]) continue;

      let brand = null;
      let matchedHash = null;
      for (const hid of u.blockIds) {
        const b = hashToBrand.get(hid);
        if (b) {
          brand = b;
          matchedHash = hid;
          break;
        }
      }

      const short = shortAddr(u.address);
      let name;
      let url;
      let method;
      let note;

      if (brand) {
        name = brand;
        url = brandUrls[brand];
        method = "hash_match";
        note = `brand via block hash ${matchedHash?.slice(0, 12)}… · ${u.count}× in window`;
        identifyMeta.brandsMatched++;
      } else {
        name = `Pool ${short}`;
        method = "provisional_short";
        note = `auto-catalog · no public pool hash match · ${u.count}× · explorer="${u.explorerName || "—"}"`;
      }

      toWrite.push({ address: u.address, name, url, note });
      autoAdded.push({
        address: u.address,
        name,
        url,
        method,
        count: u.count,
        short,
        note,
      });
    }

    if (toWrite.length) {
      const { written } = appendPoolsToSource(toWrite);
      if (!args.quiet) log(`auto: appended ${written} entries → ${POOLS_TS}`);
      // reload known + recompute hits for report honesty
      known = loadKnownPoolsFromSource(POOLS_TS);
      knownCount = Object.keys(known).length;
      knownHits = 0;
      unknownHits = 0;
      missingMiner = 0;
      byAddr.clear();
      for (const b of blocks) {
        const address = b.miner?.address?.trim();
        if (!address) {
          missingMiner++;
          continue;
        }
        if (known[address]) {
          knownHits++;
          continue;
        }
        unknownHits++;
        let row = byAddr.get(address);
        if (!row) {
          row = {
            address,
            explorerName: b.miner?.name ?? null,
            count: 0,
            heights: [],
            blockIds: [],
            kind: classifyAddress(address),
          };
          byAddr.set(address, row);
        }
        row.count++;
      }
      unknown = [...byAddr.values()].sort((a, b) => b.count - a.count);
    }
  } else if (args.auto && unknown.length === 0 && !args.quiet) {
    log("auto: no unknown addresses — dictionary already covers window");
  }

  const top = unknown.slice(0, 15);

  const report = {
    version: 2,
    generatedAt: new Date().toISOString(),
    explorer: EXPLORER,
    auto: {
      enabled: args.auto,
      added: autoAdded,
      identify: identifyMeta,
    },
    window: {
      limit: args.limit,
      scanned: blocks.length,
      tipHeight: tip,
      oldestHeight: oldest,
    },
    dictionary: {
      path: "app/lib/mining-pools.ts",
      knownAddresses: knownCount,
      known: Object.entries(known).map(([address, name]) => ({
        address,
        name,
        short: shortAddr(address),
      })),
    },
    stats: {
      blocksScanned: blocks.length,
      knownHits,
      unknownHits,
      missingMiner,
      uniqueUnknownAddresses: unknown.length,
      autoAdded: autoAdded.length,
      brandsMatched: identifyMeta?.brandsMatched ?? 0,
      coveragePct:
        blocks.length - missingMiner > 0
          ? Math.round((1000 * knownHits) / (blocks.length - missingMiner)) /
            10
          : null,
    },
    unknownMiners: unknown.map((u) => ({
      address: u.address,
      short: shortAddr(u.address),
      explorerName: u.explorerName,
      count: u.count,
      kind: u.kind,
      sampleHeights: u.heights,
      sampleBlockIds: u.blockIds,
      suggestSnippet: `  "${u.address}": { name: "Pool ${shortAddr(u.address)}", },`,
    })),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o644,
  });

  if (!args.quiet) {
    log(
      `scanned ${blocks.length} blocks · known hits ${knownHits} · unknown hits ${unknownHits} · unique unknown ${unknown.length}`
    );
    if (autoAdded.length) {
      log(`auto-added ${autoAdded.length}:`);
      for (const a of autoAdded) {
        console.log(
          `   + ${a.short} → ${a.name}  [${a.method}]  ${a.count}×`
        );
      }
    }
    log(`coverage of labeled miners: ${report.stats.coveragePct ?? "—"}%`);
    log(`wrote ${OUT_PATH}`);
    if (top.length) {
      console.log("\nStill unknown after auto:");
      for (const u of top) {
        console.log(
          `  ${String(u.count).padStart(3)}×  ${shortAddr(u.address)}  name=${u.explorerName || "—"}  ${u.kind}\n       ${u.address}`
        );
      }
      console.log("");
    } else {
      console.log("\nNo unknown miner addresses in this window ✨\n");
    }
  }

  if (args.telegram) {
    const shouldSend =
      unknown.length > 0 ||
      autoAdded.length > 0 ||
      process.env.LUMEN_TG_ON_EMPTY === "1";
    if (shouldSend) {
      const lines = [
        "🕵️ lumen · miner watch" + (args.auto ? " (auto)" : ""),
        `Window: last ${blocks.length} blocks (#${oldest}–#${tip})`,
        `Known: ${knownHits} · Unknown hits: ${unknownHits} · Unique left: ${unknown.length}`,
        `Coverage: ${report.stats.coveragePct ?? "—"}% · dict: ${knownCount}`,
        "",
      ];
      if (autoAdded.length) {
        lines.push("Auto-cataloged:");
        for (const a of autoAdded.slice(0, 12)) {
          lines.push(`• ${a.short} → ${a.name} (${a.method}, ${a.count}×)`);
        }
        lines.push("");
      }
      if (top.length) {
        lines.push("Still unknown:");
        for (const u of top.slice(0, 8)) {
          lines.push(
            `• ${u.count}× ${shortAddr(u.address)} (${u.explorerName || "—"})`
          );
        }
        lines.push("", `Report: ${OUT_PATH}`);
      } else if (!autoAdded.length) {
        lines.push("All miners in window are labeled.");
      }
      await sendTelegram(lines.join("\n"));
      if (!args.quiet) log("Telegram report sent");
    } else if (!args.quiet) {
      log(
        "Telegram skipped (no unknowns; set LUMEN_TG_ON_EMPTY=1 to always send)"
      );
    }
  }
}

main().catch((err) => {
  console.error(new Date().toISOString(), "FATAL", err.message || err);
  process.exit(1);
});
