/**
 * Lumen Oracle MVP — ERG/USD + ERG/XAU network feeds (Oracle Pools V2).
 * Rates are on-chain pool-box R4 (nanoERG per unit). No personal-oracle logic.
 */

import fs from "fs";
import path from "path";

export type OracleStatus = "live" | "stale" | "offline";

export type OracleFeedId = "erg-usd" | "erg-xau";

export interface OracleFeedConfig {
  id: OracleFeedId;
  pair: string;
  title: string;
  subtitle: string;
  /** Pool NFT token id (unspent pool box) */
  poolNft: string;
  /** Epoch length in blocks (from pool config) */
  epochLength: number;
  /** Local oracle-core metrics port (optional health enrichment) */
  metricsPort?: number;
  accent: string;
  accentSoft: string;
}

export const ORACLE_FEEDS: OracleFeedConfig[] = [
  {
    id: "erg-usd",
    pair: "ERG/USD",
    title: "ERG / USD",
    subtitle: "NanoErgUsd · Oracle Pool",
    poolNft:
      "6a2b821b5727e85beb5e78b4efb9f0250d59cd48481d2ded2c23e91ba1d07c66",
    epochLength: 6,
    metricsPort: 9021,
    accent: "#10B981",
    accentSoft: "rgba(16, 185, 129, 0.14)",
  },
  {
    id: "erg-xau",
    pair: "ERG/XAU",
    title: "ERG / XAU",
    subtitle: "NanoErgXau · gold troy oz",
    poolNft:
      "3c45f29a5165b030fdb5eaf5d81f8108f9d8f507b31487dd51f4ae08fe07cf4a",
    epochLength: 30,
    metricsPort: 9011,
    accent: "#E8C547",
    accentSoft: "rgba(232, 197, 71, 0.12)",
  },
];

export interface OracleHistoryPoint {
  t: number;
  /** Display price (USD per ERG, or oz gold per ERG) */
  price: number;
  /** Raw nanoERG per unit from R4 */
  rate: number;
  height: number;
}

export interface OracleFeedSnapshot {
  id: OracleFeedId;
  pair: string;
  title: string;
  subtitle: string;
  accent: string;
  accentSoft: string;
  status: OracleStatus;
  /** Raw R4: nanoERG per 1 USD or 1 XAU oz */
  rateNano: number | null;
  /** Primary human price */
  price: number | null;
  /** Secondary display string */
  priceAlt: string | null;
  /** Formatted primary */
  priceLabel: string | null;
  unitLabel: string;
  epoch: number | null;
  epochLength: number;
  settlementHeight: number | null;
  tipHeight: number | null;
  ageBlocks: number | null;
  /** Estimated ms since last pool update (block-based) */
  ageMs: number | null;
  lastUpdatedAt: number | null;
  boxId: string | null;
  explorerUrl: string | null;
  /** Posted oracle boxes near tip (from local metrics, if available) */
  activeOracles: number | null;
  totalOracles: number | null;
  /** Individual oracle operators (from local metrics when available) */
  nodes: OracleNodeInfo[];
  history: OracleHistoryPoint[];
  source: "explorer" | "metrics" | "none";
  error?: string;
}

export interface OracleNodeInfo {
  address: string;
  /** Last posted box height */
  height: number | null;
  status: OracleStatus;
}

export interface OraclesResponse {
  generatedAt: number;
  tipHeight: number | null;
  avgBlockMs: number;
  feeds: OracleFeedSnapshot[];
}

const HISTORY_PATH = path.join(
  process.cwd(),
  "data",
  "oracle-history.json"
);
const HISTORY_MAX = 64;
/** ~2 min per block on Ergo mainnet (estimate for age labels) */
const DEFAULT_BLOCK_MS = 120_000;

const EXPLORER =
  process.env.ERGO_EXPLORER_API?.replace(/\/$/, "") ||
  "https://api.ergoplatform.com";

type HistoryFile = Partial<Record<OracleFeedId, OracleHistoryPoint[]>>;

function readHistory(): HistoryFile {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return {};
    const raw = fs.readFileSync(HISTORY_PATH, "utf8");
    return JSON.parse(raw) as HistoryFile;
  } catch {
    return {};
  }
}

function writeHistory(data: HistoryFile) {
  try {
    const dir = path.dirname(HISTORY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(data), "utf8");
  } catch {
    /* non-fatal */
  }
}

function pushHistory(
  file: HistoryFile,
  id: OracleFeedId,
  point: OracleHistoryPoint
): OracleHistoryPoint[] {
  const prev = file[id] ?? [];
  const last = prev[prev.length - 1];
  // Dedupe identical rate at same height
  if (last && last.rate === point.rate && last.height === point.height) {
    return prev;
  }
  // Throttle wall-clock samples when rate unchanged
  if (
    last &&
    last.rate === point.rate &&
    point.t - last.t < 90_000
  ) {
    return prev;
  }
  const next = [...prev, point].slice(-HISTORY_MAX);
  file[id] = next;
  return next;
}

/** nanoERG/unit → USD per ERG */
export function priceUsdPerErg(rateNano: number): number {
  if (!rateNano || rateNano <= 0) return 0;
  return 1e9 / rateNano;
}

/** nanoERG/XAU oz → troy ounces of gold per 1 ERG */
export function priceXauPerErg(rateNano: number): number {
  if (!rateNano || rateNano <= 0) return 0;
  return 1e9 / rateNano;
}

/** nanoERG/XAU oz → ERG needed for 1 troy oz */
export function ergPerXauOz(rateNano: number): number {
  if (!rateNano || rateNano <= 0) return 0;
  return rateNano / 1e9;
}

export function formatUsd(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

export function formatXauOz(ozPerErg: number): string {
  if (!Number.isFinite(ozPerErg) || ozPerErg <= 0) return "—";
  // Prefer readable scientific / compact
  if (ozPerErg < 1e-3) {
    return ozPerErg.toExponential(3).replace("e", "×10^");
  }
  return ozPerErg.toFixed(6);
}

function statusFromAge(
  ageBlocks: number | null,
  epochLength: number,
  hasData: boolean
): OracleStatus {
  if (!hasData || ageBlocks == null || ageBlocks < 0) return "offline";
  // Live: within ~2 epochs of fresh posting window
  if (ageBlocks <= epochLength * 2) return "live";
  // Stale: still recently on-chain but lagging
  if (ageBlocks <= epochLength * 10) return "stale";
  return "offline";
}

async function fetchJson(url: string, timeoutMs = 12_000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "lumen-oracles/1" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchTipHeight(): Promise<number | null> {
  // Prefer local node
  try {
    const base =
      process.env.ERGO_NODE_URL?.replace(/\/$/, "") || "http://127.0.0.1:9053";
    const info = await fetchJson(`${base}/info`, 4000);
    const h = info?.fullHeight ?? info?.headersHeight;
    if (typeof h === "number" && h > 0) return h;
  } catch {
    /* fall through */
  }
  try {
    const net = await fetchJson(`${EXPLORER}/api/v1/networkState`, 8000);
    const h = net?.height ?? net?.fullHeight;
    if (typeof h === "number" && h > 0) return h;
  } catch {
    /* */
  }
  return null;
}

async function fetchPoolBox(poolNft: string): Promise<{
  rateNano: number;
  epoch: number | null;
  settlementHeight: number;
  boxId: string;
} | null> {
  const data = await fetchJson(
    `${EXPLORER}/api/v1/boxes/unspent/byTokenId/${poolNft}`,
    12_000
  );
  const box = data?.items?.[0];
  if (!box) return null;
  const r4 = box.additionalRegisters?.R4?.renderedValue;
  const r5 = box.additionalRegisters?.R5?.renderedValue;
  const rateNano = Number(r4);
  if (!Number.isFinite(rateNano) || rateNano <= 0) return null;
  const epoch = r5 != null && r5 !== "" ? Number(r5) : null;
  const settlementHeight = Number(
    box.settlementHeight ?? box.creationHeight ?? 0
  );
  return {
    rateNano,
    epoch: Number.isFinite(epoch as number) ? (epoch as number) : null,
    settlementHeight,
    boxId: String(box.boxId || ""),
  };
}

/**
 * Optional: parse local oracle-core Prometheus metrics for per-operator health.
 * Used by Consensus Singularity to place real gravitational nodes.
 */
async function fetchMetricsHealth(
  port: number | undefined,
  tipHeight: number | null,
  epochLength: number
): Promise<{
  active: number;
  total: number;
  nodes: OracleNodeInfo[];
} | null> {
  if (!port) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`http://127.0.0.1:${port}/metrics`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const text = await res.text();
    // ergo_oracle_active_oracle_box_height{box_type="posted",oracle_address="9…"} 1836992
    const re =
      /ergo_oracle_active_oracle_box_height\{box_type="posted",oracle_address="([^"]+)"\}\s+(\d+)/g;
    let m: RegExpExecArray | null;
    const nodes: OracleNodeInfo[] = [];
    while ((m = re.exec(text))) {
      const address = m[1];
      const height = Number(m[2]);
      const age =
        tipHeight != null && Number.isFinite(height)
          ? Math.max(0, tipHeight - height)
          : null;
      let status: OracleStatus = "live";
      if (age == null) status = "live";
      else if (age <= epochLength * 2) status = "live";
      else if (age <= epochLength * 10) status = "stale";
      else status = "offline";
      nodes.push({
        address,
        height: Number.isFinite(height) ? height : null,
        status,
      });
    }
    if (nodes.length === 0) return null;
    // Stable order for deterministic 3D placement
    nodes.sort((a, b) => a.address.localeCompare(b.address));
    const active = nodes.filter((n) => n.status === "live").length;
    return { active, total: nodes.length, nodes };
  } catch {
    return null;
  }
}

function displayForFeed(
  id: OracleFeedId,
  rateNano: number
): {
  price: number;
  priceLabel: string;
  priceAlt: string;
  unitLabel: string;
} {
  if (id === "erg-usd") {
    const price = priceUsdPerErg(rateNano);
    return {
      price,
      priceLabel: formatUsd(price),
      priceAlt: `${rateNano.toLocaleString()} nanoERG / USD`,
      unitLabel: "USD / ERG",
    };
  }
  const oz = priceXauPerErg(rateNano);
  const ergOz = ergPerXauOz(rateNano);
  return {
    price: oz,
    priceLabel: formatXauOz(oz),
    priceAlt: `${ergOz.toLocaleString(undefined, { maximumFractionDigits: 0 })} ERG / oz XAU`,
    unitLabel: "oz XAU / ERG",
  };
}

export async function loadOraclesSnapshot(): Promise<OraclesResponse> {
  const generatedAt = Date.now();
  const tipHeight = await fetchTipHeight();
  const historyFile = readHistory();
  let historyDirty = false;

  const feeds: OracleFeedSnapshot[] = await Promise.all(
    ORACLE_FEEDS.map(async (cfg) => {
      const base: OracleFeedSnapshot = {
        id: cfg.id,
        pair: cfg.pair,
        title: cfg.title,
        subtitle: cfg.subtitle,
        accent: cfg.accent,
        accentSoft: cfg.accentSoft,
        status: "offline",
        rateNano: null,
        price: null,
        priceAlt: null,
        priceLabel: null,
        unitLabel: cfg.id === "erg-usd" ? "USD / ERG" : "oz XAU / ERG",
        epoch: null,
        epochLength: cfg.epochLength,
        settlementHeight: null,
        tipHeight,
        ageBlocks: null,
        ageMs: null,
        lastUpdatedAt: null,
        boxId: null,
        explorerUrl: `https://explorer.ergoplatform.com/en/token/${cfg.poolNft}`,
        activeOracles: null,
        totalOracles: null,
        nodes: [],
        history: historyFile[cfg.id] ?? [],
        source: "none",
      };

      try {
        const box = await fetchPoolBox(cfg.poolNft);
        if (!box) {
          base.error = "Pool box not found";
          return base;
        }

        const disp = displayForFeed(cfg.id, box.rateNano);
        const ageBlocks =
          tipHeight != null && box.settlementHeight > 0
            ? Math.max(0, tipHeight - box.settlementHeight)
            : null;
        const ageMs =
          ageBlocks != null ? ageBlocks * DEFAULT_BLOCK_MS : null;
        const lastUpdatedAt =
          ageMs != null ? generatedAt - ageMs : generatedAt;

        const point: OracleHistoryPoint = {
          t: generatedAt,
          price: disp.price,
          rate: box.rateNano,
          height: box.settlementHeight,
        };
        const hist = pushHistory(historyFile, cfg.id, point);
        if (hist !== base.history) historyDirty = true;

        const health = await fetchMetricsHealth(
          cfg.metricsPort,
          tipHeight,
          cfg.epochLength
        );

        return {
          ...base,
          status: statusFromAge(ageBlocks, cfg.epochLength, true),
          rateNano: box.rateNano,
          price: disp.price,
          priceAlt: disp.priceAlt,
          priceLabel: disp.priceLabel,
          unitLabel: disp.unitLabel,
          epoch: box.epoch,
          settlementHeight: box.settlementHeight,
          ageBlocks,
          ageMs,
          lastUpdatedAt,
          boxId: box.boxId,
          explorerUrl: box.boxId
            ? `https://explorer.ergoplatform.com/en/boxes/${box.boxId}`
            : base.explorerUrl,
          activeOracles: health?.active ?? null,
          totalOracles: health?.total ?? null,
          nodes: health?.nodes ?? [],
          history: hist,
          source: "explorer" as const,
        };
      } catch (e: any) {
        return {
          ...base,
          error: e?.message || "Fetch failed",
          status: "offline" as const,
        };
      }
    })
  );

  if (historyDirty) writeHistory(historyFile);

  return {
    generatedAt,
    tipHeight,
    avgBlockMs: DEFAULT_BLOCK_MS,
    feeds,
  };
}
