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
  /** Explorer's raw miner.name (often last 8 chars) */
  explorerName: string | null;
  /** Resolved display: pool name / Solo / Unknown pool */
  label: string;
  kind: "pool" | "solo" | "unknown";
  short: string;
  /** Full one-liner for toast */
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
  const disp = resolveMinerDisplay(address);
  return {
    height,
    blockId: item.id,
    address,
    explorerName: item.miner?.name ?? null,
    label: disp.label,
    kind: disp.kind,
    short: disp.short || shortMinerAddress(address),
    line: formatMinerLine(height, address),
  };
}

/**
 * Fetch miner for a block height from Explorer.
 * Preferred: GET /blocks?height={h} (includes miner.address).
 */
export async function fetchBlockMinerByHeight(
  height: number,
  opts?: { signal?: AbortSignal }
): Promise<BlockMinerInfo | null> {
  if (!height || height <= 0) return null;

  try {
    const url = `${ERGO_EXPLORER_API}/blocks?height=${height}&limit=5`;
    const res = await fetch(url, {
      signal: opts?.signal ?? AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: ExplorerBlockItem[] };
    const hit =
      (data.items || []).find((b) => b.height === height) || data.items?.[0];
    if (hit) return toMinerInfo(hit);
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Fetch miner when block id is known.
 * Full /blocks/{id} payload has no miner field — use list filter by height or id.
 */
export async function fetchBlockMinerById(
  blockId: string,
  heightHint?: number,
  opts?: { signal?: AbortSignal }
): Promise<BlockMinerInfo | null> {
  if (!blockId) return null;

  if (heightHint && heightHint > 0) {
    const byH = await fetchBlockMinerByHeight(heightHint, opts);
    if (byH && (byH.blockId === blockId || !blockId)) return byH;
    if (byH) return byH;
  }

  try {
    // Recent tip scan as fallback
    const res = await fetch(`${ERGO_EXPLORER_API}/blocks?limit=40`, {
      signal: opts?.signal ?? AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: ExplorerBlockItem[] };
    const hit = (data.items || []).find((b) => b.id === blockId);
    if (hit) return toMinerInfo(hit);
  } catch {
    /* ignore */
  }

  return null;
}

export { formatMinerLine, resolveMinerDisplay, shortMinerAddress };
