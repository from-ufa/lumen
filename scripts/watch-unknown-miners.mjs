#!/usr/bin/env node
/**
 * Lumen — unknown mining-pool address watcher
 *
 * Fetches recent blocks from the official Explorer API, compares miner.address
 * against KNOWN_MINING_POOLS in app/lib/mining-pools.ts, and writes a report of
 * addresses that are not yet in the dictionary.
 *
 * Usage:
 *   node scripts/watch-unknown-miners.mjs
 *   node scripts/watch-unknown-miners.mjs --limit=100
 *   node scripts/watch-unknown-miners.mjs --telegram
 *   npm run watch:unknown-miners
 *
 * Env:
 *   ERGO_EXPLORER_API   default https://api.ergoplatform.com/api/v1
 *   LUMEN_UNKNOWN_MINERS_OUT  default data/unknown-miners.json
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  (or source /root/.secrets)
 *   LUMEN_TG_ON_EMPTY=1  also notify when there are no unknowns
 *
 * Cron example (do NOT enable without operator approval):
 *   # every 4 hours
 *   15 *​/4 * * * cd /home/lumen && /usr/bin/node scripts/watch-unknown-miners.mjs --telegram >> /var/log/lumen-unknown-miners.log 2>&1
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

function parseArgs(argv) {
  const out = {
    limit: 100,
    telegram: false,
    quiet: false,
    help: false,
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--telegram" || a === "-t") out.telegram = true;
    else if (a === "--quiet" || a === "-q") out.quiet = true;
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

/** Load known pool addresses + names from mining-pools.ts (no TS compile needed). */
function loadKnownPoolsFromSource(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  // Slice the KNOWN_MINING_POOLS object body
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
  // "address": { name: "Pool", ... }
  const re =
    /"([1-9A-HJ-NP-Za-km-z]{20,})"\s*:\s*\{[^}]*?name\s*:\s*"([^"]+)"/gs;
  let m;
  while ((m = re.exec(body))) {
    map[m[1]] = m[2];
  }
  return map;
}

async function fetchRecentBlocks(limit) {
  const pageSize = 100;
  /** @type {Array<{id:string,height:number,miner?:{address?:string,name?:string}}>} */
  const items = [];
  let offset = 0;
  while (items.length < limit) {
    const take = Math.min(pageSize, limit - items.length);
    const url = `${EXPLORER.replace(/\/$/, "")}/blocks?limit=${take}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "LumenUnknownMinersWatcher/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Explorer HTTP ${res.status} for ${url}`);
    const data = await res.json();
    const batch = Array.isArray(data.items) ? data.items : [];
    if (!batch.length) break;
    items.push(...batch);
    offset += batch.length;
    if (batch.length < take) break;
  }
  return items.slice(0, limit);
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

function loadSecrets() {
  const secretsPath = process.env.LUMEN_SECRETS || "/root/.secrets";
  try {
    if (!fs.existsSync(secretsPath)) return;
    const text = fs.readFileSync(secretsPath, "utf8");
    for (const line of text.split("\n")) {
      let t = line.trim();
      if (!t || t.startsWith("#")) continue;
      // support `export KEY=value` (bash-style secrets files)
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
  npm run watch:unknown-miners -- [--telegram] [--limit=100]

Options:
  --limit=N     Recent blocks to scan (default 100, max 500)
  --telegram    Send short report to Telegram
  --quiet       Less console noise
  --help        This help

Output:
  data/unknown-miners.json

Cron example (not installed by default):
  15 */4 * * * cd /home/lumen && /usr/bin/node scripts/watch-unknown-miners.mjs --telegram >> /var/log/lumen-unknown-miners.log 2>&1
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.quiet) {
    log("start", { limit: args.limit, out: OUT_PATH, explorer: EXPLORER });
  }

  const known = loadKnownPoolsFromSource(POOLS_TS);
  const knownCount = Object.keys(known).length;
  if (!args.quiet) log("known pools in dictionary:", knownCount);

  const blocks = await fetchRecentBlocks(args.limit);
  if (!blocks.length) throw new Error("No blocks returned from Explorer");

  const tip = blocks[0]?.height ?? null;
  const oldest = blocks[blocks.length - 1]?.height ?? null;

  /** @type {Map<string, { address: string, explorerName: string|null, count: number, heights: number[], kind: string }>} */
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
        kind: classifyAddress(address),
      };
      byAddr.set(address, row);
    }
    row.count++;
    if (name) row.explorerName = name;
    if (row.heights.length < 12 && typeof b.height === "number") {
      row.heights.push(b.height);
    }
  }

  const unknown = [...byAddr.values()].sort((a, b) => b.count - a.count);
  const top = unknown.slice(0, 15);

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    explorer: EXPLORER,
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
      coveragePct:
        blocks.length - missingMiner > 0
          ? Math.round(
              (1000 * knownHits) / (blocks.length - missingMiner)
            ) / 10
          : null,
    },
    unknownMiners: unknown.map((u) => ({
      address: u.address,
      short: shortAddr(u.address),
      explorerName: u.explorerName,
      count: u.count,
      kind: u.kind,
      sampleHeights: u.heights,
      /** Suggested line to paste into KNOWN_MINING_POOLS after you identify the pool */
      suggestSnippet: `  "${u.address}": { name: "/* TODO */", },`,
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
    log(`coverage of labeled miners: ${report.stats.coveragePct ?? "—"}%`);
    log(`wrote ${OUT_PATH}`);
    if (top.length) {
      console.log("\nTop unknown miner addresses:");
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
      unknown.length > 0 || process.env.LUMEN_TG_ON_EMPTY === "1";
    if (shouldSend) {
      const lines = [
        "🕵️ Lumen · unknown miners",
        `Window: last ${blocks.length} blocks (#${oldest}–#${tip})`,
        `Known hits: ${knownHits} · Unknown hits: ${unknownHits}`,
        `Unique unknown: ${unknown.length} · Coverage: ${report.stats.coveragePct ?? "—"}%`,
        "",
      ];
      if (top.length) {
        lines.push("Top unknown:");
        for (const u of top.slice(0, 10)) {
          lines.push(
            `• ${u.count}× ${shortAddr(u.address)} (${u.explorerName || "—"}) ${u.kind}`
          );
          lines.push(`  ${u.address.slice(0, 24)}…`);
        }
        lines.push("", `Full report: ${OUT_PATH}`);
      } else {
        lines.push("All miners in window are in KNOWN_MINING_POOLS.");
      }
      await sendTelegram(lines.join("\n"));
      if (!args.quiet) log("Telegram report sent");
    } else if (!args.quiet) {
      log("Telegram skipped (no unknowns; set LUMEN_TG_ON_EMPTY=1 to always send)");
    }
  }
}

main().catch((err) => {
  console.error(new Date().toISOString(), "FATAL", err.message || err);
  process.exit(1);
});
