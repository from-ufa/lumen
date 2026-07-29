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
    // Champagne / aerospace gold — not neon yellow
    accent: "#C9A84C",
    accentSoft: "rgba(201, 168, 76, 0.14)",
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
  /** Block-age thresholds used for this feed's status */
  statusThresholds?: { liveMax: number; staleMax: number };
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
  /** Live deltas since previous poll (posts, pool refresh, rewards) */
  liveEvents?: OracleLiveEvent[];
  /** Pool healthy flag from local oracle-core metrics (1/0), if known */
  poolHealthy?: boolean | null;
  /** Required datapoints for refresh (metrics) */
  requiredOracles?: number | null;
  /** Reward token amount in pool box (metrics) */
  poolRewardTokens?: number | null;
  /** Connected operator (My Oracle / host agent) */
  myOperator?: MyOracleOperator | null;
  /**
   * In hybrid My Oracle view:
   *  - mine = metrics from your bridge agent
   *  - network = lumen host / public pool (you did not attach this pool)
   */
  scope?: "mine" | "network" | null;
  source: "explorer" | "metrics" | "none";
  error?: string;
}

export interface OracleNodeInfo {
  address: string;
  /** Last posted box height */
  height: number | null;
  /** Last collected (into pool refresh) height when known */
  collectedHeight?: number | null;
  /** Claimable reward tokens (from oracle-core metrics) */
  rewardTokens?: number | null;
  status: OracleStatus;
  /** True when this address is the connected operator’s oracle */
  isMine?: boolean;
  /**
   * Holds an oracle key (seen in all_oracle_* metrics) but is not
   * actively posting — show as idle / red on constellation.
   */
  idleKey?: boolean;
  /** Short UI blurb (EN) */
  detail?: string | null;
}

/** Identity of the operator attached via bridge / local agent metrics */
export interface MyOracleOperator {
  address: string | null;
  /** Matched by preferred address, unique post height, or env */
  matchMethod: "address" | "post_height" | "unknown";
  isHealthy: boolean | null;
  claimableRewards: number | null;
  /** Δ claimable since previous API poll (null if first sample) */
  rewardsDelta: number | null;
  walletNanoErg: number | null;
  /** Wallet in ERG (nano / 1e9) */
  walletErg: number | null;
  postHeight: number | null;
  collectedHeight: number | null;
  postAgeBlocks: number | null;
  /** Blocks since your last collect into a pool refresh */
  collectedAgeBlocks: number | null;
  /**
   * Whether your datapoint was taken into the latest pool box
   * (collected height ≈ pool settlement).
   */
  inLastRefresh: boolean | null;
}

/** Real-time delta events since previous API poll (server-side). */
export type OracleLiveEventKind =
  | "datapoint"
  | "pool_refresh"
  | "reward"
  | "rate_change";

export interface OracleLiveEvent {
  id: string;
  t: number;
  kind: OracleLiveEventKind;
  address?: string;
  height?: number | null;
  rewardDelta?: number | null;
  message: string;
}

export interface OraclesResponse {
  generatedAt: number;
  tipHeight: number | null;
  avgBlockMs: number;
  feeds: OracleFeedSnapshot[];
  /** network = public explorer + host metrics; my = explorer + bridge operator metrics */
  view?: "network" | "my";
  bridge?: {
    connected: boolean;
    version?: string | null;
    oraclesConfigured: string[];
    error?: string;
  };
  error?: string;
}

export type LoadOraclesOptions = {
  /** When set, use this metrics text per feed instead of local ports */
  metricsByFeed?: Partial<Record<OracleFeedId, string | null>>;
  /** Preferred operator addresses (env / bridge status) per feed */
  preferredAddressByFeed?: Partial<Record<OracleFeedId, string | null>>;
  /** Only include these feeds (e.g. personal agent with USD only) */
  onlyFeeds?: OracleFeedId[];
  tipHeightOverride?: number | null;
  view?: "network" | "my";
  bridge?: OraclesResponse["bridge"];
  /** Skip local metrics ports (used for pure explorer or bridge-only enrichment) */
  skipLocalMetrics?: boolean;
  /** Per-feed scope tags (mine vs network/lumen) */
  scopeByFeed?: Partial<Record<OracleFeedId, "mine" | "network">>;
  /**
   * When true: bridge metrics for keys in metricsByFeed, host local metrics for the rest.
   * Used by hybrid My Oracle (1 pool on bridge, other from lumen).
   */
  hybridMetrics?: boolean;
};

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

/**
 * Human gold display for ERG/XAU.
 * Primary: micro-ounces of gold per 1 ERG (readable scale).
 * Secondary lines use ergPerXauOz for "ERG per troy oz".
 */
export function formatXauOz(ozPerErg: number): string {
  if (!Number.isFinite(ozPerErg) || ozPerErg <= 0) return "—";
  const uoz = ozPerErg * 1e6; // micro-ounces
  if (uoz >= 0.01) {
    return `${uoz.toFixed(3)} μoz`;
  }
  return `${uoz.toFixed(4)} μoz`;
}

export function formatXauErgPerOz(rateNano: number): string {
  const erg = ergPerXauOz(rateNano);
  if (!Number.isFinite(erg) || erg <= 0) return "—";
  if (erg >= 1000) {
    return `${Math.round(erg).toLocaleString()} ERG/oz`;
  }
  return `${erg.toFixed(1)} ERG/oz`;
}

/**
 * Status thresholds for a pool box (tip − settlementHeight).
 *
 * Epoch length sets expected refresh cadence, but short epochs (USD = 6)
 * must not mark a still-readable on-chain price as OFFLINE after ~1h.
 *
 * - LIVE:   fresh enough vs cadence (floored so short epochs get ~30–90 min)
 * - STALE:  pool box exists, price still on-chain, consensus lagging
 * - OFFLINE: no box / unknown tip / extremely old (default: multi-hour+)
 *
 * Approximate block time used only for docs: ~2 min/block.
 */
export function poolStatusThresholds(epochLength: number): {
  liveMax: number;
  staleMax: number;
} {
  const ep = Math.max(1, epochLength || 1);
  // Live: ~3 epochs, floor 24 blk (~48m), cap 90 blk (~3h)
  const liveMax = Math.min(Math.max(ep * 3, 24), 90);
  // Stale: extended lag while box still useful; floor 120 (~4h), cap 720 (~24h)
  const staleMax = Math.min(Math.max(ep * 20, 120), 720);
  return { liveMax, staleMax };
}

export function statusFromAge(
  ageBlocks: number | null,
  epochLength: number,
  hasData: boolean
): OracleStatus {
  if (!hasData || ageBlocks == null || !Number.isFinite(ageBlocks) || ageBlocks < 0) {
    return "offline";
  }
  const { liveMax, staleMax } = poolStatusThresholds(epochLength);
  if (ageBlocks <= liveMax) return "live";
  if (ageBlocks <= staleMax) return "stale";
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

type MetricsHealth = {
  active: number;
  total: number;
  nodes: OracleNodeInfo[];
  poolHealthy: boolean | null;
  requiredOracles: number | null;
  poolRewardTokens: number | null;
  /** Official ergo_oracle_active_oracle_count from protocol */
  protocolActive?: number | null;
  myOperator?: MyOracleOperator | null;
};

function gauge(text: string, name: string): number | null {
  const m = text.match(new RegExp(`^${name}\\s+(\\S+)`, "m"));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** e.g. ergo_oracle_oracle_box_height{box_type="posted"} 123 */
function gaugeWithLabel(
  text: string,
  name: string,
  labelKey: string,
  labelVal: string
): number | null {
  const re = new RegExp(
    `^${name}\\{[^}]*${labelKey}="${labelVal}"[^}]*\\}\\s+(\\S+)`,
    "m"
  );
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse oracle-core Prometheus metrics text (local port or bridge-proxied).
 * Detects "this oracle" via ergo_oracle_oracle_* and marks isMine on the node.
 */
/** Claimable rewards from previous poll — for Δ display */
const prevClaimableByKey = new Map<string, number>();

export function parseMetricsHealth(
  text: string,
  tipHeight: number | null,
  epochLength: number,
  opts?: {
    preferredAddress?: string | null;
    /** Pool settlement height — detect if YOU were in last refresh */
    poolSettlementHeight?: number | null;
    /** Stable key for rewards Δ (e.g. feed id) */
    rewardDeltaKey?: string | null;
  }
): MetricsHealth | null {
  if (!text || typeof text !== "string") return null;

  /** Active set (currently posting into the pool). */
  const activePosted = new Map<string, number>();
  const activeCollected = new Map<string, number>();
  /** Full key-holder set (all_oracle_*) — includes dormant keys. */
  const allPosted = new Map<string, number>();
  const allCollected = new Map<string, number>();
  const rewards = new Map<string, number>();

  let m: RegExpExecArray | null;
  const reActivePosted =
    /ergo_oracle_active_oracle_box_height\{box_type="posted",oracle_address="([^"]+)"\}\s+(\d+)/g;
  while ((m = reActivePosted.exec(text))) {
    activePosted.set(m[1], Number(m[2]));
  }
  const reActiveCollected =
    /ergo_oracle_active_oracle_box_height\{box_type="collected",oracle_address="([^"]+)"\}\s+(\d+)/g;
  while ((m = reActiveCollected.exec(text))) {
    activeCollected.set(m[1], Number(m[2]));
  }
  // Prefer all_* when present (superset); fall back to active-only feeds
  const reAllPosted =
    /ergo_oracle_all_oracle_box_height\{box_type="posted",oracle_address="([^"]+)"\}\s+(\d+)/g;
  while ((m = reAllPosted.exec(text))) {
    allPosted.set(m[1], Number(m[2]));
  }
  const reAllCollected =
    /ergo_oracle_all_oracle_box_height\{box_type="collected",oracle_address="([^"]+)"\}\s+(\d+)/g;
  while ((m = reAllCollected.exec(text))) {
    allCollected.set(m[1], Number(m[2]));
  }
  const reReward =
    /ergo_oracle_all_oracle_claimable_rewards\{oracle_address="([^"]+)"\}\s+(\d+(?:\.\d+)?)/g;
  while ((m = reReward.exec(text))) {
    rewards.set(m[1], Number(m[2]));
  }

  // Merged heights: active wins when both exist (fresher path)
  const posted = new Map<string, number>(allPosted);
  for (const [a, h] of activePosted) posted.set(a, h);
  const collected = new Map<string, number>(allCollected);
  for (const [a, h] of activeCollected) collected.set(a, h);

  // Local agent identity (no address label — match by height / preferred)
  const myPostH = gaugeWithLabel(
    text,
    "ergo_oracle_oracle_box_height",
    "box_type",
    "posted"
  );
  const myCollH = gaugeWithLabel(
    text,
    "ergo_oracle_oracle_box_height",
    "box_type",
    "collected"
  );
  const myClaimable = gauge(text, "ergo_oracle_oracle_claimable_rewards");
  const myHealthyN = gauge(text, "ergo_oracle_oracle_is_healthy");
  const myWallet = gauge(text, "ergo_oracle_oracle_node_wallet_nano_erg");
  const preferred = (opts?.preferredAddress || "").trim() || null;

  let mineAddress: string | null = preferred;
  let matchMethod: MyOracleOperator["matchMethod"] = preferred
    ? "address"
    : "unknown";

  if (!mineAddress && myPostH != null) {
    const byPost = [...posted.entries()].filter(([, h]) => h === myPostH);
    if (byPost.length === 1) {
      mineAddress = byPost[0][0];
      matchMethod = "post_height";
    } else if (byPost.length > 1 && myCollH != null) {
      const byBoth = byPost.filter(([addr]) => collected.get(addr) === myCollH);
      if (byBoth.length === 1) {
        mineAddress = byBoth[0][0];
        matchMethod = "post_height";
      }
    }
  }
  // Unique claimable rewards often disambiguate when several posts share a height
  if (!mineAddress && myClaimable != null) {
    const byReward = [...rewards.entries()].filter(
      ([, r]) => Math.abs(r - myClaimable) < 1e-6
    );
    if (byReward.length === 1) {
      mineAddress = byReward[0][0];
      matchMethod = "post_height";
    }
  }

  const addresses = new Set<string>([
    ...posted.keys(),
    ...collected.keys(),
    ...rewards.keys(),
    ...activePosted.keys(),
    ...activeCollected.keys(),
  ]);
  if (mineAddress) addresses.add(mineAddress);
  if (addresses.size === 0 && !text.includes("ergo_oracle_")) return null;

  /** In active_* series = currently participating (or recently). */
  const isActiveKey = (address: string) =>
    activePosted.has(address) || activeCollected.has(address);

  const nodes: OracleNodeInfo[] = [];
  for (const address of addresses) {
    const height = posted.has(address) ? posted.get(address)! : null;
    const coll = collected.has(address) ? collected.get(address)! : null;
    const reward = rewards.has(address) ? rewards.get(address)! : null;
    const age =
      tipHeight != null && height != null && Number.isFinite(height)
        ? Math.max(0, tipHeight - height)
        : null;
    const inActiveSet = isActiveKey(address);
    // Key holders not in active_* → idle keys (even if ancient posted height)
    let status: OracleStatus;
    if (!inActiveSet) {
      status = "offline";
    } else if (height == null) {
      status = "offline";
    } else if (age == null) {
      status = "live";
    } else {
      status = statusFromAge(age, epochLength, true);
    }
    const idleKey =
      !inActiveSet ||
      (status === "offline" && (reward != null || height != null || coll != null));
    const isMine = !!(mineAddress && address === mineAddress);
    const detail = idleKey
      ? "Keys held · not posting"
      : status === "live"
        ? "Posting"
        : status === "stale"
          ? "Lagging"
          : null;
    nodes.push({
      address,
      height: height != null && Number.isFinite(height) ? height : null,
      collectedHeight: coll != null && Number.isFinite(coll) ? coll : null,
      rewardTokens:
        isMine && myClaimable != null
          ? myClaimable
          : reward != null && Number.isFinite(reward)
            ? reward
            : null,
      status,
      isMine,
      idleKey: idleKey || undefined,
      detail,
    });
  }
  // Working first, then idle keys; mine always first
  nodes.sort((a, b) => {
    if (a.isMine && !b.isMine) return -1;
    if (!a.isMine && b.isMine) return 1;
    if (!!a.idleKey !== !!b.idleKey) return a.idleKey ? 1 : -1;
    if (a.status !== b.status) {
      const rank = { live: 0, stale: 1, offline: 2 } as const;
      return rank[a.status] - rank[b.status];
    }
    return a.address.localeCompare(b.address);
  });
  const active = nodes.filter((n) => n.status === "live").length;

  const poolHealthyN = gauge(text, "ergo_oracle_pool_is_healthy");
  const requiredOracles = gauge(text, "ergo_oracle_required_oracle_count");
  const protocolActive = gauge(text, "ergo_oracle_active_oracle_count");
  const poolRewardTokens = gauge(
    text,
    "ergo_oracle_pool_box_reward_token_amount"
  );

  const resolvedPostH =
    myPostH ?? (mineAddress ? posted.get(mineAddress) ?? null : null);
  const resolvedCollH =
    myCollH ?? (mineAddress ? collected.get(mineAddress) ?? null : null);

  const postAgeBlocks =
    tipHeight != null && resolvedPostH != null
      ? Math.max(0, tipHeight - resolvedPostH)
      : null;
  const collectedAgeBlocks =
    tipHeight != null && resolvedCollH != null
      ? Math.max(0, tipHeight - resolvedCollH)
      : null;

  const poolH = opts?.poolSettlementHeight ?? null;
  const inLastRefresh =
    resolvedCollH != null && poolH != null && Number.isFinite(poolH)
      ? Math.abs(resolvedCollH - poolH) <= 2
      : null;

  let rewardsDelta: number | null = null;
  if (myClaimable != null && opts?.rewardDeltaKey) {
    const prev = prevClaimableByKey.get(opts.rewardDeltaKey);
    if (prev != null && Number.isFinite(prev)) {
      rewardsDelta = myClaimable - prev;
    }
    prevClaimableByKey.set(opts.rewardDeltaKey, myClaimable);
  }

  const walletErg =
    myWallet != null && Number.isFinite(myWallet) ? myWallet / 1e9 : null;

  const myOperator: MyOracleOperator | null =
    myPostH != null || myClaimable != null || mineAddress || myWallet != null
      ? {
          address: mineAddress,
          matchMethod,
          isHealthy:
            myHealthyN == null ? null : myHealthyN >= 1 ? true : false,
          claimableRewards: myClaimable,
          rewardsDelta,
          walletNanoErg: myWallet,
          walletErg,
          postHeight: resolvedPostH,
          collectedHeight: resolvedCollH,
          postAgeBlocks,
          collectedAgeBlocks,
          inLastRefresh,
        }
      : null;

  return {
    active,
    total: nodes.length || (protocolActive != null ? protocolActive : 0),
    nodes,
    poolHealthy:
      poolHealthyN == null ? null : poolHealthyN >= 1 ? true : false,
    requiredOracles,
    poolRewardTokens,
    protocolActive: protocolActive ?? null,
    myOperator,
  };
}

/**
 * Optional: fetch local oracle-core Prometheus metrics for per-operator
 * posts, rewards, and pool health — drives live constellation events.
 */
async function fetchMetricsHealth(
  port: number | undefined,
  tipHeight: number | null,
  epochLength: number,
  preferredAddress?: string | null,
  extra?: {
    poolSettlementHeight?: number | null;
    rewardDeltaKey?: string | null;
  }
): Promise<MetricsHealth | null> {
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
    return parseMetricsHealth(text, tipHeight, epochLength, {
      preferredAddress,
      poolSettlementHeight: extra?.poolSettlementHeight,
      rewardDeltaKey: extra?.rewardDeltaKey,
    });
  } catch {
    return null;
  }
}

/** Previous poll snapshot for live event diffs (in-process). */
type PrevFeedSnap = {
  settlementHeight: number | null;
  rateNano: number | null;
  epoch: number | null;
  nodes: Record<
    string,
    { height: number | null; reward: number | null }
  >;
};
const prevFeedSnaps = new Map<OracleFeedId, PrevFeedSnap>();

function computeLiveEvents(
  id: OracleFeedId,
  snap: {
    settlementHeight: number | null;
    rateNano: number | null;
    epoch: number | null;
    nodes: OracleNodeInfo[];
  },
  now: number
): OracleLiveEvent[] {
  const prev = prevFeedSnaps.get(id);
  const events: OracleLiveEvent[] = [];
  let seq = 0;
  const push = (
    kind: OracleLiveEventKind,
    message: string,
    extra?: Partial<OracleLiveEvent>
  ) => {
    events.push({
      id: `${id}-${now}-${seq++}`,
      t: now,
      kind,
      message,
      ...extra,
    });
  };

  if (prev) {
    for (const n of snap.nodes) {
      const p = prev.nodes[n.address];
      if (
        p &&
        n.height != null &&
        p.height != null &&
        n.height > p.height
      ) {
        push(
          "datapoint",
          `POST ${n.address.slice(0, 6)}…${n.address.slice(-4)} @ ${n.height}`,
          { address: n.address, height: n.height }
        );
      } else if (!p && n.height != null) {
        // First time we see this operator — soft announce as post if live
        if (n.status === "live") {
          push(
            "datapoint",
            `SEEN ${n.address.slice(0, 6)}…${n.address.slice(-4)} @ ${n.height}`,
            { address: n.address, height: n.height }
          );
        }
      }
      if (
        p &&
        n.rewardTokens != null &&
        p.reward != null &&
        n.rewardTokens > p.reward
      ) {
        const delta = n.rewardTokens - p.reward;
        push(
          "reward",
          `REWARD +${delta} → ${n.address.slice(0, 6)}…${n.address.slice(-4)}`,
          { address: n.address, rewardDelta: delta, height: n.height }
        );
      }
    }

    if (
      snap.settlementHeight != null &&
      prev.settlementHeight != null &&
      snap.settlementHeight > prev.settlementHeight
    ) {
      push(
        "pool_refresh",
        `POOL REFRESH h=${snap.settlementHeight}` +
          (snap.epoch != null ? ` epoch=${snap.epoch}` : ""),
        { height: snap.settlementHeight }
      );
    }
    if (
      snap.rateNano != null &&
      prev.rateNano != null &&
      snap.rateNano !== prev.rateNano
    ) {
      push(
        "rate_change",
        `RATE ${prev.rateNano} → ${snap.rateNano}`,
        { height: snap.settlementHeight }
      );
    }
  }

  // Store snapshot for next poll
  const nodeMap: PrevFeedSnap["nodes"] = {};
  for (const n of snap.nodes) {
    nodeMap[n.address] = {
      height: n.height,
      reward: n.rewardTokens ?? null,
    };
  }
  prevFeedSnaps.set(id, {
    settlementHeight: snap.settlementHeight,
    rateNano: snap.rateNano,
    epoch: snap.epoch,
    nodes: nodeMap,
  });

  return events;
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
  // Human-first: ERG per troy oz is immediately intuitive; μoz as secondary
  return {
    price: oz,
    priceLabel: formatXauErgPerOz(rateNano),
    priceAlt: `${formatXauOz(oz)} gold per ERG`,
    unitLabel: "per troy oz XAU",
  };
}

/** Short in-process cache for public network snapshot (cuts cold UI wait). */
const SNAPSHOT_CACHE_MS = 4_000;
let networkSnapshotCache: {
  at: number;
  data: OraclesResponse;
} | null = null;

function cacheKeyForOpts(opts: LoadOraclesOptions): string | null {
  // Only cache pure network host view (no bridge metrics / hybrid / tip override)
  if (opts.view === "my") return null;
  if (opts.metricsByFeed) return null;
  if (opts.hybridMetrics) return null;
  if (opts.tipHeightOverride !== undefined) return null;
  if (opts.skipLocalMetrics) return null;
  if (opts.onlyFeeds?.length) return null;
  return "network";
}

export async function loadOraclesSnapshot(
  opts: LoadOraclesOptions = {}
): Promise<OraclesResponse> {
  const ck = cacheKeyForOpts(opts);
  if (ck && networkSnapshotCache) {
    const age = Date.now() - networkSnapshotCache.at;
    if (age >= 0 && age < SNAPSHOT_CACHE_MS) {
      return {
        ...networkSnapshotCache.data,
        generatedAt: Date.now(),
      };
    }
  }

  const generatedAt = Date.now();
  // Tip shares one promise across both feeds — no serial tip-then-boxes waterfall
  const tipPromise: Promise<number | null> =
    opts.tipHeightOverride !== undefined
      ? Promise.resolve(opts.tipHeightOverride)
      : fetchTipHeight();

  const historyFile = readHistory();
  let historyDirty = false;

  const feedCfgs = opts.onlyFeeds?.length
    ? ORACLE_FEEDS.filter((c) => opts.onlyFeeds!.includes(c.id))
    : ORACLE_FEEDS;

  const feeds: OracleFeedSnapshot[] = await Promise.all(
    feedCfgs.map(async (cfg) => {
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
        tipHeight: null,
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
        // Box + tip in parallel; metrics after box (needs settlement height)
        const [tipHeight, box] = await Promise.all([
          tipPromise,
          fetchPoolBox(cfg.poolNft),
        ]);
        base.tipHeight = tipHeight;

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

        let health: MetricsHealth | null = null;
        const preferred = opts.preferredAddressByFeed?.[cfg.id] ?? null;
        const injected = opts.metricsByFeed?.[cfg.id];
        const hasBridgeMetrics =
          typeof injected === "string" && injected.length > 0;
        if (hasBridgeMetrics) {
          health = parseMetricsHealth(injected!, tipHeight, cfg.epochLength, {
            preferredAddress: preferred,
            poolSettlementHeight: box.settlementHeight,
            rewardDeltaKey: `${cfg.id}:mine`,
          });
        } else if (!opts.skipLocalMetrics || opts.hybridMetrics) {
          // Host / lumen metrics (network pane or hybrid fallback)
          const allowMine =
            !(opts.hybridMetrics || opts.view === "my") || false;
          health = await fetchMetricsHealth(
            cfg.metricsPort,
            tipHeight,
            cfg.epochLength,
            allowMine ? preferred : null,
            {
              poolSettlementHeight: box.settlementHeight,
              rewardDeltaKey: allowMine ? `${cfg.id}:host` : null,
            }
          );
          // In hybrid My Oracle, network panes must not claim YOUR ORACLE
          if ((opts.hybridMetrics || opts.view === "my") && health?.nodes) {
            // Only strip mine if this feed is not a bridge-mine scope
            const scopeHint = opts.scopeByFeed?.[cfg.id];
            if (scopeHint !== "mine") {
              health = {
                ...health,
                nodes: health.nodes.map((n) => ({ ...n, isMine: false })),
                myOperator: null,
              };
            }
          }
        }

        const scope: "mine" | "network" | null =
          opts.scopeByFeed?.[cfg.id] ??
          (hasBridgeMetrics
            ? "mine"
            : opts.view === "my"
              ? "network"
              : null);

        const nodes = health?.nodes ?? [];
        const liveEvents = computeLiveEvents(
          cfg.id,
          {
            settlementHeight: box.settlementHeight,
            rateNano: box.rateNano,
            epoch: box.epoch,
            nodes,
          },
          generatedAt
        );

        // Consensus chip: prefer protocol active when known; else live-by-age count
        const activeOracles =
          health?.protocolActive != null
            ? health.protocolActive
            : health?.active ?? null;

        return {
          ...base,
          tipHeight,
          status: statusFromAge(ageBlocks, cfg.epochLength, true),
          statusThresholds: poolStatusThresholds(cfg.epochLength),
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
          activeOracles,
          totalOracles: health?.total ?? null,
          nodes,
          liveEvents,
          poolHealthy: health?.poolHealthy ?? null,
          requiredOracles: health?.requiredOracles ?? null,
          poolRewardTokens: health?.poolRewardTokens ?? null,
          myOperator:
            scope === "network" ? null : health?.myOperator ?? null,
          scope,
          history: hist,
          source: health ? ("metrics" as const) : ("explorer" as const),
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

  // Resolve tip once for response envelope (feeds already have tipHeight)
  const tipHeight =
    opts.tipHeightOverride !== undefined
      ? opts.tipHeightOverride
      : feeds.find((f) => f.tipHeight != null)?.tipHeight ??
        (await tipPromise);

  const result: OraclesResponse = {
    generatedAt,
    tipHeight,
    avgBlockMs: DEFAULT_BLOCK_MS,
    feeds,
    view: opts.view || "network",
    bridge: opts.bridge,
  };

  if (ck) {
    networkSnapshotCache = { at: Date.now(), data: result };
  }

  return result;
}
