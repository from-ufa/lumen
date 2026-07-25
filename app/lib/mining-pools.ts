/**
 * Ergo mining-pool identification.
 *
 * Truth for "who mined the block" is Explorer `miner.address` (reward script).
 * Peer IP is NEVER used.
 *
 * Strategy:
 * 1) If Explorer `miner.name` looks like a real pool name → use/normalize it
 * 2) Else lookup `miner.address` in KNOWN_MINING_POOLS
 * 3) Else Solo (P2PK 9…) / Unknown pool (88…) / Unknown
 *
 * Address map verified Jul 2026 by matching pool public block hashes
 * against api.ergoplatform.com block ids (not by guessing).
 */

export type KnownPool = {
  name: string;
  url?: string;
};

/**
 * miner.address → display name.
 * Verified via pool APIs (2miners / herominers / woolypooly block hashes).
 */
export const KNOWN_MINING_POOLS: Record<string, KnownPool> = {
  // 2Miners — 100% of matured/immature hashes → this reward script
  "88dhgzEuTXaRQTX5KNdnaWTTX7fEZVEQRn6qP4MJotPuRnS3QpoJxYpSaXoU1y7SHp8ZXMp92TH22DBY":
    {
      name: "2Miners",
      url: "https://2miners.com/erg-mining-pool",
    },

  // HeroMiners — majority of pool.blocks hashes
  "88dhgzEuTXaSuf5QC1TJDgdxqJMQEQAM6YaTTRqmUDrmPoVky1b16WAK5zMrq3p2mYqpUNKCyi5CLS9V":
    {
      name: "HeroMiners",
      url: "https://ergo.herominers.com",
    },
  // Also appears in HeroMiners block list (less frequent)
  "88dhgzEuTXaTYNVozfX7N4dW1hToq6cRNZByKdjeYrnp6XFovWYndHqCVpDdYv8GYatWX15juuEj4pm6":
    {
      name: "HeroMiners",
      url: "https://ergo.herominers.com",
    },

  // WoolyPooly — all recent immature/matured hashes
  "88dhgzEuTXaQ2HPUskY3hvgMA5uCbQWwZNPbMC1Hem9zM2V9U7KMah7LYWS4Hm4WECGuc22nofdQbHbY":
    {
      name: "WoolyPooly",
      url: "https://woolypooly.com/en/coin/erg",
    },

  // Kryptex — matched from pool.kryptex.com erg blocks (low sample; provisional)
  "88dhgzEuTXaTnTZomXPfuJ67oYJPbrv17yNkLjN6Nj8HxZEUf2iAdiv9gTqmnKKa2i75zmUtDnPQovBb":
    {
      name: "Kryptex",
      url: "https://pool.kryptex.com/erg",
    },
};

/**
 * Normalize free-text pool names (Explorer or future sources) to canonical labels.
 * Keys are lowercase.
 */
export const POOL_NAME_ALIASES: Record<string, string> = {
  "2miners": "2Miners",
  "2 miners": "2Miners",
  "2-miners": "2Miners",
  herominers: "HeroMiners",
  "hero miners": "HeroMiners",
  "hero-miners": "HeroMiners",
  woolypooly: "WoolyPooly",
  "wooly pooly": "WoolyPooly",
  wooly: "WoolyPooly",
  kryptex: "Kryptex",
  k1pool: "k1pool",
  "k1 pool": "k1pool",
  nanopool: "Nanopool",
  nano: "Nanopool",
  getblok: "GetBlok",
  "get blok": "GetBlok",
  sigmanauts: "Sigmanauts",
  sigmanaut: "Sigmanauts",
  leafpool: "LeafPool",
  f2pool: "F2Pool",
  "f2 pool": "F2Pool",
  baikalmine: "BaikalMine",
  ezil: "Ezil",
  cruxpool: "Cruxpool",
  solo: "Solo",
};

export function lookupKnownPool(address: string): KnownPool | null {
  if (!address) return null;
  return KNOWN_MINING_POOLS[address] ?? null;
}

/** Last 8 chars — Explorer often uses this as miner.name */
export function shortMinerAddress(address: string): string {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return address.slice(-8);
}

/**
 * True when explorerName is just a truncated address (e.g. "2TH22DBY"),
 * not a human pool label.
 */
export function isTruncatedAddressName(
  explorerName: string | null | undefined,
  address: string
): boolean {
  if (!explorerName || !address) return true;
  const n = explorerName.trim();
  if (!n) return true;
  const short = shortMinerAddress(address);
  if (n.toLowerCase() === short.toLowerCase()) return true;
  // bare base58-ish 6–12 chars that equal address suffix
  if (/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(n) && address.endsWith(n)) {
    return true;
  }
  // very short token with no letters-only word shape
  if (n.length <= 10 && address.toLowerCase().includes(n.toLowerCase())) {
    return true;
  }
  return false;
}

/** If name looks like a real pool brand, return canonical display name. */
export function normalizePoolNameFromExplorer(
  explorerName: string | null | undefined
): string | null {
  if (!explorerName) return null;
  const raw = explorerName.trim();
  if (!raw || raw.length < 2) return null;

  const key = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (POOL_NAME_ALIASES[key]) return POOL_NAME_ALIASES[key];
  if (POOL_NAME_ALIASES[raw.toLowerCase()]) {
    return POOL_NAME_ALIASES[raw.toLowerCase()];
  }

  // Contains a known brand as substring (e.g. "2Miners.com")
  for (const [alias, canonical] of Object.entries(POOL_NAME_ALIASES)) {
    if (alias.length >= 4 && key.includes(alias)) return canonical;
  }

  // Looks like a brand: has a letter word ≥ 4 chars, not pure address tail
  if (/[a-zA-Z]{4,}/.test(raw) && raw.length >= 4 && raw.length <= 32) {
    // Reject pure hex-ish
    if (/^[0-9a-fA-F]+$/.test(raw)) return null;
    // Title-case single token brands we don't know yet — still usable
    if (/^[A-Za-z][A-Za-z0-9 .+-]{3,}$/.test(raw)) {
      return raw;
    }
  }
  return null;
}

export type MinerDisplay = {
  label: string;
  kind: "pool" | "solo" | "unknown";
  short: string;
};

/**
 * Resolve display label from address + optional Explorer name.
 * Priority: real explorer name → address dictionary → Solo / Unknown pool.
 */
export function resolveMinerDisplay(
  address: string,
  explorerName?: string | null
): MinerDisplay {
  const short = shortMinerAddress(address);

  // 1) Real pool name from Explorer (when not a truncated address)
  if (!isTruncatedAddressName(explorerName, address)) {
    const fromName = normalizePoolNameFromExplorer(explorerName);
    if (fromName) {
      const kind =
        fromName.toLowerCase() === "solo"
          ? ("solo" as const)
          : ("pool" as const);
      return { label: fromName, kind, short };
    }
  }

  // 2) Curated address map
  const known = lookupKnownPool(address);
  if (known) {
    return { label: known.name, kind: "pool", short };
  }

  // 3) Heuristic by address shape
  if (address.startsWith("9") && address.length >= 50) {
    return { label: "Solo", kind: "solo", short };
  }
  if (address.startsWith("88")) {
    return { label: "Unknown pool", kind: "pool", short };
  }
  return { label: "Unknown", kind: "unknown", short };
}

/** One-line toast / boom: Block #H · Label · short */
export function formatMinerLine(
  height: number,
  address: string | null | undefined,
  explorerName?: string | null
): string {
  if (!address) return `Block #${height.toLocaleString()} · miner pending…`;
  const { label, short } = resolveMinerDisplay(address, explorerName);
  return `Block #${height.toLocaleString()} · ${label} · ${short}`;
}
