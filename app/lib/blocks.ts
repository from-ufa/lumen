import type { RecentBlock } from "../types/ergo";

/**
 * Ergo node returns block transactions as:
 *   { headerId, transactions: Transaction[], blockVersion, size }
 * NOT a bare array. Older code treated the body as array → always fell
 * back to a random fake count.
 */
export function countTxsFromNodePayload(payload: unknown): number {
  if (!payload) return 0;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.transactions)) return o.transactions.length;
    // full block shape
    const bt = o.blockTransactions;
    if (bt && typeof bt === "object") {
      const txs = (bt as { transactions?: unknown }).transactions;
      if (Array.isArray(txs)) return txs.length;
    }
  }
  return 0;
}

export async function fetchBlockDetails(
  nodeUrl: string,
  height: number,
  headers?: HeadersInit
): Promise<RecentBlock | null> {
  const base = nodeUrl.replace(/\/$/, "");
  const req = (path: string) =>
    fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      headers: headers ?? { Accept: "application/json" },
    });
  try {
    const atRes = await req(`/blocks/at/${height}`);
    if (!atRes.ok) return null;
    const ids: string[] = await atRes.json();
    const id = ids?.[0];
    if (!id) return null;

    // Parallel: header (timestamp) + transactions (real count)
    const [hRes, tRes] = await Promise.all([
      req(`/blocks/${id}/header`),
      req(`/blocks/${id}/transactions`),
    ]);

    let timestamp = Date.now();
    if (hRes.ok) {
      const header = await hRes.json();
      if (typeof header.timestamp === "number") {
        // Ergo timestamps are ms already on modern nodes
        timestamp =
          header.timestamp > 1e12
            ? header.timestamp
            : header.timestamp * 1000;
      }
    }

    let txCount = 0;
    if (tRes.ok) {
      const body = await tRes.json();
      txCount = countTxsFromNodePayload(body);
    }

    return { height, id, timestamp, txCount };
  } catch {
    return null;
  }
}

/** Load last `count` blocks with real tx counts from the node. */
export async function fetchRecentBlocks(
  nodeUrl: string,
  tipHeight: number,
  count = 9,
  headers?: HeadersInit
): Promise<RecentBlock[]> {
  if (!tipHeight || tipHeight <= 0) return [];
  const heights: number[] = [];
  for (let h = tipHeight; h > tipHeight - count && h > 0; h--) {
    heights.push(h);
  }
  // sequential-ish in small batches to avoid hammering node
  const out: RecentBlock[] = [];
  const batch = 3;
  for (let i = 0; i < heights.length; i += batch) {
    const slice = heights.slice(i, i + batch);
    const parts = await Promise.all(
      slice.map((h) => fetchBlockDetails(nodeUrl, h, headers))
    );
    for (const b of parts) {
      if (b) out.push(b);
    }
  }
  // newest first
  out.sort((a, b) => b.height - a.height);
  return out;
}

export type AvgBlockTimeResult = {
  /** Mean interval in whole seconds */
  avgSeconds: number;
  /** Number of intervals used (= headers - 1) */
  samples: number;
  /** Window size requested (header count) */
  window: number;
};

/**
 * Real average block time from node headers.
 * Source: GET /blocks/lastHeaders/{n} — one request, no fakes.
 * Uses header.timestamp differences between consecutive heights.
 */
export async function fetchAvgBlockTime(
  nodeUrl: string,
  window = 100,
  reqHeaders?: HeadersInit
): Promise<AvgBlockTimeResult | null> {
  const base = nodeUrl.replace(/\/$/, "");
  const n = Math.max(2, Math.min(200, Math.floor(window)));
  try {
    const res = await fetch(`${base}/blocks/lastHeaders/${n}`, {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
      headers: reqHeaders ?? { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const headers: Array<{ height?: number; timestamp?: number }> =
      await res.json();
    if (!Array.isArray(headers) || headers.length < 2) return null;

    // newest → oldest by height
    const sorted = [...headers]
      .filter(
        (h) =>
          typeof h.height === "number" && typeof h.timestamp === "number"
      )
      .sort((a, b) => (b.height as number) - (a.height as number));

    if (sorted.length < 2) return null;

    const deltasSec: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const newer = sorted[i].timestamp as number;
      const older = sorted[i + 1].timestamp as number;
      // Ergo node timestamps are milliseconds
      const newerMs = newer > 1e12 ? newer : newer * 1000;
      const olderMs = older > 1e12 ? older : older * 1000;
      const sec = (newerMs - olderMs) / 1000;
      // drop absurd gaps (reorg/stall/clock) — keep 5s…30min
      if (sec >= 5 && sec <= 1800) deltasSec.push(sec);
    }

    if (!deltasSec.length) return null;

    const avg = deltasSec.reduce((a, b) => a + b, 0) / deltasSec.length;
    return {
      avgSeconds: Math.round(avg),
      samples: deltasSec.length,
      window: sorted.length,
    };
  } catch {
    return null;
  }
}
