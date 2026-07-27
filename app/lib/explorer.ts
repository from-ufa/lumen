/** SigmaSpace + official Ergo Explorer links. */

export const SIGMASPACE = "https://sigmaspace.io";
export const ERGO_EXPLORER_WEB = "https://explorer.ergoplatform.com";

export function sigmaTxUrl(txId: string): string {
  return `${SIGMASPACE}/en/transaction/${txId}`;
}

/** Operator / wallet address page on SigmaSpace. */
export function sigmaAddressUrl(address: string): string {
  return `${SIGMASPACE}/en/address/${encodeURIComponent(address)}`;
}

export function openAddressOnSigmaSpace(address: string): void {
  window.open(sigmaAddressUrl(address), "_blank", "noopener,noreferrer");
}

/** Block page needs header / block id (hex), not height. */
export function sigmaBlockUrl(blockId: string): string {
  return `${SIGMASPACE}/en/block/${blockId}`;
}

export function officialExplorerBlockUrl(blockId: string): string {
  return `${ERGO_EXPLORER_WEB}/en/blocks/${blockId}`;
}

export function officialExplorerAddressUrl(address: string): string {
  return `${ERGO_EXPLORER_WEB}/en/addresses/${address}`;
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
    let token = "";
    try {
      if (headers) {
        const h = new Headers(headers as HeadersInit);
        token =
          h.get("X-Lumen-Bridge-Token") ||
          h.get("x-lumen-bridge-token") ||
          "";
      }
    } catch {
      /* ignore */
    }
    let url = `${base}/blocks/at/${height}`;
    if (token) {
      url += `?token=${encodeURIComponent(token)}`;
    }
    const res = await fetch(url, {
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
