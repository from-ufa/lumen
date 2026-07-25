/**
 * Honest Ergo block miner attribution via official Explorer API.
 * Never infers miner from P2P peers / map pins.
 */

import {
  formatMinerLine,
  resolveMinerDisplay,
  shortMinerAddress,
} from "./mining-pools";

export const ERGO_EXPLORER_API =
  process.env.NEXT_PUBLIC_ERGO_EXPLORER_API ||
  "https://api.ergoplatform.com/api/v1";

export const ERGO_EXPLORER_WEB =
  process.env.NEXT_PUBLIC_ERGO_EXPLORER_WEB ||
  "https://explorer.ergoplatform.com";

export type BlockMinerInfo = {
  height: number;
  blockId: string;
  address: string;
  /** Explorer's raw miner.name (often last 8 chars of address) */
  explorerName: string | null;
  /** Resolved display: 2Miners / HeroMiners / Solo / … */
  label: string;
  kind: "pool" | "solo" | "unknown";
  short: string;
  line: string;
};

export function explorerBlockUrl(blockId: string): string {
  return `${ERGO_EXPLORER_WEB}/en/blocks/${blockId}`;
}

export function explorerAddressUrl(address: string): string {
  return `${ERGO_EXPLORER_WEB}/en/addresses/${address}`;
}

type ExplorerBlockItem = {
  id?: string;
  height?: number;
  miner?: { address?: string; name?: string | null };
};

function toMinerInfo(item: ExplorerBlockItem): BlockMinerInfo | null {
  const address = item.miner?.address?.trim();
  if (!address || !item.id) return null;
  const height = Number(item.height) || 0;
  const explorerName = item.miner?.name ?? null;
  const disp = resolveMinerDisplay(address, explorerName);
  return {
    height,
    blockId: item.id,
    address,
    explorerName,
    label: disp.label,
    kind: disp.kind,
    short: disp.short || shortMinerAddress(address),
    line: formatMinerLine(height, address, explorerName),
  };
}

async function fetchBlocksPage(
  limit: number,
  offset: number,
  signal?: AbortSignal
): Promise<ExplorerBlockItem[]> {
  const url = `${ERGO_EXPLORER_API}/blocks?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    signal: signal ?? AbortSignal.timeout(12_000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: ExplorerBlockItem[];
    total?: number;
  };
  return data.items || [];
}

/**
 * Fetch miner for a block height from Explorer.
 * Note: `?height=` is unreliable on the public API — use tip window + offset.
 */
export async function fetchBlockMinerByHeight(
  height: number,
  opts?: { signal?: AbortSignal }
): Promise<BlockMinerInfo | null> {
  if (!height || height <= 0) return null;
  const signal = opts?.signal;

  try {
    // 1) Recent tip window (fast path for live tip)
    const tipItems = await fetchBlocksPage(40, 0, signal);
    const tipHit = tipItems.find((b) => b.height === height);
    if (tipHit) return toMinerInfo(tipHit);

    const tipHeight = tipItems[0]?.height;
    if (tipHeight && tipHeight > height) {
      // 2) Jump near target via offset ≈ tip - height
      const offset = Math.max(0, tipHeight - height - 2);
      const page = await fetchBlocksPage(20, offset, signal);
      const hit = page.find((b) => b.height === height);
      if (hit) return toMinerInfo(hit);
      // small neighborhood scan
      for (const delta of [-10, 10, -30, 30]) {
        const o = Math.max(0, offset + delta);
        const more = await fetchBlocksPage(20, o, signal);
        const h2 = more.find((b) => b.height === height);
        if (h2) return toMinerInfo(h2);
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Fetch miner when block id is known. */
export async function fetchBlockMinerById(
  blockId: string,
  heightHint?: number,
  opts?: { signal?: AbortSignal }
): Promise<BlockMinerInfo | null> {
  if (!blockId) return null;
  const id = blockId.toLowerCase();

  if (heightHint && heightHint > 0) {
    const byH = await fetchBlockMinerByHeight(heightHint, opts);
    if (byH) return byH;
  }

  try {
    // Scan recent pages for id
    for (const offset of [0, 40, 80, 120]) {
      const page = await fetchBlocksPage(40, offset, opts?.signal);
      const hit = page.find((b) => (b.id || "").toLowerCase() === id);
      if (hit) return toMinerInfo(hit);
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Attach honest Explorer miner labels to a list of recent blocks.
 * One tip-window request covers most tips; missing heights are filled
 * with limited concurrency (never blocks the list forever).
 */
export async function enrichBlocksWithMiners<
  T extends {
    height: number;
    id?: string;
    minerAddress?: string;
    minerLabel?: string;
    minerShort?: string;
  },
>(blocks: T[], opts?: { signal?: AbortSignal }): Promise<T[]> {
  if (!blocks.length) return blocks;

  const byHeight = new Map<number, BlockMinerInfo>();

  // Already-known stay
  for (const b of blocks) {
    if (b.minerLabel && b.minerAddress) {
      /* keep; still allow explorer to refresh if we get a hit */
    }
  }

  try {
    // Bulk: recent tip pages (cheap — covers typical Recent Blocks window)
    for (const offset of [0, 40]) {
      const page = await fetchBlocksPage(50, offset, opts?.signal);
      for (const item of page) {
        const m = toMinerInfo(item);
        if (m) byHeight.set(m.height, m);
      }
    }
  } catch {
    /* explorer optional */
  }

  const missing = blocks.filter(
    (b) => !byHeight.has(b.height) && !b.minerLabel
  );

  // Fill gaps (max 6 parallel) without hammering Explorer
  const concurrency = 4;
  for (let i = 0; i < missing.length; i += concurrency) {
    const slice = missing.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (b) => {
        try {
          const m = b.id
            ? await fetchBlockMinerById(b.id, b.height, opts)
            : await fetchBlockMinerByHeight(b.height, opts);
          if (m) byHeight.set(b.height, m);
        } catch {
          /* ignore one height */
        }
      })
    );
  }

  return blocks.map((b) => {
    const m = byHeight.get(b.height);
    if (!m) return b;
    return {
      ...b,
      minerLabel: m.label,
      minerAddress: m.address,
      minerShort: m.short,
      id: b.id || m.blockId,
    };
  });
}

export { formatMinerLine, resolveMinerDisplay, shortMinerAddress };
