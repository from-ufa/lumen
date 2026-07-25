/**
 * Curated Ergo mining-pool reward addresses.
 *
 * Source of truth for block miner is always the Explorer `miner.address`
 * (reward / coinbase output). Peer IP is NEVER used.
 *
 * Addresses are the Autolykos fee / payout scripts seen on-chain
 * (often start with 88dhgz…). Add new pools as we learn them.
 *
 * Update: extend this map when a pool's reward address is confirmed.
 */

export type KnownPool = {
  name: string;
  /** Optional homepage */
  url?: string;
};

/** miner.address → pool metadata */
export const KNOWN_MINING_POOLS: Record<string, KnownPool> = {
  // Populate as community confirms reward addresses.
  // Example shape (uncomment when verified):
  // "88dhgzEuTXa…": { name: "GetBlok", url: "https://ergo.getblok.io" },
  // "88dhgzEuTXa…": { name: "Sigmanauts", url: "https://sigmanauts.com/mining" },
  // "88dhgzEuTXa…": { name: "2Miners", url: "https://2miners.com/erg-mining-pool" },
  // "88dhgzEuTXa…": { name: "HeroMiners", url: "https://erg.herominers.com" },
  // "88dhgzEuTXa…": { name: "WoolyPooly", url: "https://woolypooly.com" },
};

/**
 * Dominant recent reward scripts (mainnet, observed Jul 2026).
 * Labels are provisional until community-verified — shown as pool-style
 * only when we know them; otherwise resolveMinerDisplay uses "Unknown pool".
 *
 * We intentionally do NOT invent pool names for high-hashrate addresses.
 * Better honest "Unknown pool · …2TH22DBY" than a wrong brand.
 */
export function lookupKnownPool(address: string): KnownPool | null {
  if (!address) return null;
  return KNOWN_MINING_POOLS[address] ?? null;
}

/** Short stable id for UI (last 8 of address — matches Explorer's miner.name). */
export function shortMinerAddress(address: string): string {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return address.slice(-8);
}

/**
 * Human label for a miner address.
 * - known pool name if curated
 * - "Unknown pool" for smart-contract style rewards (88…)
 * - "Solo" for typical P2PK (9…)
 * - "Unknown" otherwise
 */
export function resolveMinerDisplay(address: string): {
  label: string;
  kind: "pool" | "solo" | "unknown";
  short: string;
} {
  const short = shortMinerAddress(address);
  const known = lookupKnownPool(address);
  if (known) {
    return { label: known.name, kind: "pool", short };
  }
  if (address.startsWith("88")) {
    return { label: "Unknown pool", kind: "pool", short };
  }
  if (address.startsWith("9")) {
    return { label: "Solo", kind: "solo", short };
  }
  return { label: "Unknown", kind: "unknown", short };
}

/** One-line toast / boom text: Block #H · Label · short */
export function formatMinerLine(
  height: number,
  address: string | null | undefined
): string {
  if (!address) return `Block #${height.toLocaleString()} · miner pending…`;
  const { label, short } = resolveMinerDisplay(address);
  return `Block #${height.toLocaleString()} · ${label} · ${short}`;
}
