/** SigmaSpace explorer links (Ergo). */

export const SIGMASPACE = "https://sigmaspace.io";

export function sigmaTxUrl(txId: string): string {
  return `${SIGMASPACE}/en/transaction/${txId}`;
}

/** Block page needs header / block id (hex), not height. */
export function sigmaBlockUrl(blockId: string): string {
  return `${SIGMASPACE}/en/block/${blockId}`;
}

/**
 * Resolve best block id at height via node REST, then open SigmaSpace.
 * Uses same-origin proxy path if nodeUrl is relative (e.g. /api/node).
 */
export async function openBlockOnSigmaSpace(
  height: number,
  nodeUrl: string,
  knownId?: string,
  headers?: HeadersInit
): Promise<void> {
  let id = knownId;
  if (!id) {
    const base = nodeUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/blocks/at/${height}`, {
      signal: AbortSignal.timeout(8000),
      headers: headers ?? { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Could not resolve block id");
    const ids: string[] = await res.json();
    id = ids?.[0];
  }
  if (!id) throw new Error("No block id at this height");
  window.open(sigmaBlockUrl(id), "_blank", "noopener,noreferrer");
}

export function openTxOnSigmaSpace(txId: string): void {
  window.open(sigmaTxUrl(txId), "_blank", "noopener,noreferrer");
}
