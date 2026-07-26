/**
 * Local Ergo chain feed — Stage 1a explorer shim.
 * Primary: ERGO_NODE_URL (127.0.0.1:9053). Fallback: public explorer (optional).
 */

export const NODE_URL = (
  process.env.ERGO_NODE_URL || "http://127.0.0.1:9053"
).replace(/\/$/, "");

export const EXPLORER_URL = (
  process.env.ERGO_EXPLORER_API ||
  process.env.NEXT_PUBLIC_ERGO_EXPLORER_API ||
  "https://api.ergoplatform.com/api/v1"
).replace(/\/$/, "");

export type ChainToken = {
  tokenId: string;
  amount: string;
  name?: string | null;
  decimals?: number | null;
};

export type ChainOutput = {
  boxId: string;
  value: string; // nanoERG
  assets: ChainToken[];
};

export type ChainTx = {
  id: string;
  inputs: number;
  outputs: number;
  /** Total nanoERG in outputs */
  ergNano: string;
  tokens: ChainToken[];
  /** true = still in mempool */
  pending: boolean;
  size?: number;
};

export type ChainBlock = {
  id: string;
  height: number;
  timestamp: number;
  txCount: number;
  size?: number;
  transactions: ChainTx[];
};

/** Viz lifecycle stage for timeline */
export type ParticleStage = "mempool" | "assembling" | "sealed" | "focus";

export type ChainFeed = {
  source: "local" | "mixed" | "fallback";
  node: string;
  indexedHeight: number | null;
  fullHeight: number | null;
  tip: ChainBlock | null;
  recent: ChainBlock[];
  mempool: ChainTx[];
  /** Flattened particles for viz (mempool + tip + optional address focus) */
  particles: ChainParticle[];
  /** Address focus snapshot (when ?address=) */
  focus?: AddressView | null;
  /** Token id → display name (server cache) */
  tokenNames: Record<string, string>;
  generatedAt: string;
};

export type ChainParticle = {
  id: string;
  kind: "erg" | "token";
  tokenId?: string;
  label: string;
  name?: string | null;
  amount: string;
  color: string;
  txId: string;
  pending: boolean;
  stage: ParticleStage;
  /** 0..1 weight for size */
  weight: number;
};

export type AddressView = {
  address: string;
  confirmed: {
    nanoErgs: string;
    tokens: Array<ChainToken & { name?: string | null; decimals?: number | null }>;
  };
  source: "local" | "fallback";
};

/* ─── Token metadata cache (process lifetime) ───────────────────────────── */

type TokenMeta = { name: string | null; decimals: number | null };
const tokenMetaCache = new Map<string, TokenMeta>();
const TOKEN_CACHE_MAX = 2000;

export async function resolveTokenMeta(
  tokenId: string
): Promise<TokenMeta> {
  const hit = tokenMetaCache.get(tokenId);
  if (hit) return hit;
  try {
    const t = await nodeJson<{
      name?: string;
      decimals?: number;
    }>(`/blockchain/token/byId/${tokenId}`);
    const meta: TokenMeta = {
      name: t.name ?? null,
      decimals: typeof t.decimals === "number" ? t.decimals : null,
    };
    if (tokenMetaCache.size >= TOKEN_CACHE_MAX) {
      // drop oldest insertion
      const first = tokenMetaCache.keys().next().value;
      if (first) tokenMetaCache.delete(first);
    }
    tokenMetaCache.set(tokenId, meta);
    return meta;
  } catch {
    const miss: TokenMeta = { name: null, decimals: null };
    tokenMetaCache.set(tokenId, miss);
    return miss;
  }
}

async function enrichTokenNames(
  tokenIds: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(tokenIds.filter(Boolean))].slice(0, 80);
  await Promise.all(unique.map((id) => resolveTokenMeta(id)));
  const out: Record<string, string> = {};
  for (const id of unique) {
    const m = tokenMetaCache.get(id);
    if (m?.name) out[id] = m.name;
  }
  return out;
}

function displayLabel(
  tokenId: string | undefined,
  names: Record<string, string>
): string {
  if (!tokenId || tokenId === "ERG") return "ERG";
  const n = names[tokenId];
  if (n && n.length <= 14) return n;
  if (n) return n.slice(0, 12) + "…";
  return shortToken(tokenId);
}

async function nodeFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${NODE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(12_000),
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
}

export async function nodeJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await nodeFetch(path, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`node ${res.status} ${path}: ${detail.slice(0, 160)}`);
  }
  return res.json() as Promise<T>;
}

/** Deterministic pastel/cinematic color from tokenId or "ERG" */
export function colorFromId(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const sat = 55 + ((h >>> 8) % 30);
  const lit = 58 + ((h >>> 16) % 18);
  return `hsl(${hue} ${sat}% ${lit}%)`;
}

function shortToken(id: string): string {
  if (!id) return "?";
  if (id === "ERG") return "ERG";
  return id.slice(0, 4) + "…" + id.slice(-4);
}

type RawAsset = { tokenId?: string; amount?: number | string };
type RawOutput = {
  boxId?: string;
  value?: number | string;
  assets?: RawAsset[];
};
type RawTx = {
  id?: string;
  inputs?: unknown[];
  outputs?: RawOutput[];
  size?: number;
};

function nano(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Math.trunc(v).toString();
  if (typeof v === "string") return v;
  return "0";
}

function normalizeTx(raw: RawTx, pending: boolean): ChainTx {
  const outputs = raw.outputs || [];
  let erg = BigInt(0);
  /** @type {Map<string, bigint>} */
  const tokenMap = new Map<string, bigint>();
  for (const o of outputs) {
    try {
      erg += BigInt(nano(o.value));
    } catch {
      /* ignore */
    }
    for (const a of o.assets || []) {
      if (!a.tokenId) continue;
      try {
        const prev = tokenMap.get(a.tokenId) || BigInt(0);
        tokenMap.set(a.tokenId, prev + BigInt(nano(a.amount)));
      } catch {
        /* ignore */
      }
    }
  }
  const tokens: ChainToken[] = [...tokenMap.entries()].map(([tokenId, amount]) => ({
    tokenId,
    amount: amount.toString(),
  }));
  return {
    id: raw.id || "",
    inputs: raw.inputs?.length ?? 0,
    outputs: outputs.length,
    ergNano: erg.toString(),
    tokens,
    pending,
    size: raw.size,
  };
}

function particlesFromTx(
  tx: ChainTx,
  stage: ParticleStage,
  names: Record<string, string> = {}
): ChainParticle[] {
  const out: ChainParticle[] = [];
  // ERG particle (always)
  const ergN = BigInt(tx.ergNano || "0");
  if (ergN > BigInt(0)) {
    const w = Math.min(1, Number(ergN / BigInt(1_000_000_000)) / 50); // ~50 ERG → full
    out.push({
      id: `${tx.id}:ERG:${stage}`,
      kind: "erg",
      label: "ERG",
      name: "ERG",
      amount: tx.ergNano,
      color: "#FF7A3D",
      txId: tx.id,
      pending: tx.pending,
      stage,
      weight: 0.35 + w * 0.5,
    });
  }
  // Cap tokens per tx for viz performance
  for (const t of tx.tokens.slice(0, 8)) {
    const label = displayLabel(t.tokenId, names);
    out.push({
      id: `${tx.id}:${t.tokenId}:${stage}`,
      kind: "token",
      tokenId: t.tokenId,
      label,
      name: names[t.tokenId] || null,
      amount: t.amount,
      color: colorFromId(t.tokenId),
      txId: tx.id,
      pending: tx.pending,
      stage,
      weight:
        0.4 +
        Math.min(0.5, Math.log10(Number(BigInt(t.amount) + BigInt(1))) / 12),
    });
  }
  return out;
}

function particlesFromAddress(
  view: AddressView,
  names: Record<string, string>
): ChainParticle[] {
  const out: ChainParticle[] = [];
  const ergN = BigInt(view.confirmed.nanoErgs || "0");
  if (ergN > BigInt(0)) {
    out.push({
      id: `focus:${view.address}:ERG`,
      kind: "erg",
      label: "ERG",
      name: "ERG",
      amount: view.confirmed.nanoErgs,
      color: "#FF7A3D",
      txId: "focus",
      pending: false,
      stage: "focus",
      weight: 0.55,
    });
  }
  for (const t of view.confirmed.tokens.slice(0, 40)) {
    // prefer balance-provided name
    if (t.name && !names[t.tokenId]) names[t.tokenId] = t.name;
    const label = t.name || displayLabel(t.tokenId, names);
    out.push({
      id: `focus:${view.address}:${t.tokenId}`,
      kind: "token",
      tokenId: t.tokenId,
      label: label.length > 14 ? label.slice(0, 12) + "…" : label,
      name: t.name || names[t.tokenId] || null,
      amount: t.amount,
      color: colorFromId(t.tokenId),
      txId: "focus",
      pending: false,
      stage: "focus",
      weight: 0.5,
    });
  }
  return out;
}

export async function getChainStatus() {
  const [info, indexed] = await Promise.all([
    nodeJson<Record<string, unknown>>("/info"),
    nodeJson<{ indexedHeight?: number; fullHeight?: number }>(
      "/blockchain/indexedHeight"
    ).catch(() => null),
  ]);
  return {
    source: "local" as const,
    node: NODE_URL,
    name: info.name,
    network: info.network,
    fullHeight: (info.fullHeight as number) ?? indexed?.fullHeight ?? null,
    headersHeight: (info.headersHeight as number) ?? null,
    indexedHeight: indexed?.indexedHeight ?? null,
    peersCount: info.peersCount,
    unconfirmedCount: info.unconfirmedCount,
  };
}

async function fetchBlockBundle(
  height: number
): Promise<ChainBlock | null> {
  try {
    const ids = await nodeJson<string[]>(`/blocks/at/${height}`);
    const id = ids?.[0];
    if (!id) return null;
    const [header, txBody] = await Promise.all([
      nodeJson<{
        height?: number;
        timestamp?: number;
        size?: number;
      }>(`/blocks/${id}/header`),
      nodeJson<{ transactions?: RawTx[]; size?: number }>(
        `/blocks/${id}/transactions`
      ),
    ]);
    const rawTxs = txBody.transactions || [];
    const transactions = rawTxs.map((t) => normalizeTx(t, false));
    return {
      id,
      height: header.height ?? height,
      timestamp: header.timestamp ?? Date.now(),
      txCount: transactions.length,
      size: txBody.size ?? header.size,
      transactions,
    };
  } catch {
    return null;
  }
}

export async function getRecentBlocks(limit = 6): Promise<ChainBlock[]> {
  const info = await nodeJson<{ fullHeight?: number }>("/info");
  const tip = info.fullHeight;
  if (!tip) return [];
  const heights: number[] = [];
  for (let h = tip; h > tip - limit && h > 0; h--) heights.push(h);
  const blocks = await Promise.all(heights.map((h) => fetchBlockBundle(h)));
  return blocks.filter((b): b is ChainBlock => !!b);
}

export async function getMempool(limit = 40): Promise<ChainTx[]> {
  const raw = await nodeJson<RawTx[]>(
    `/transactions/unconfirmed?limit=${Math.min(100, limit)}`
  );
  const list = Array.isArray(raw) ? raw : [];
  return list.slice(0, limit).map((t) => normalizeTx(t, true));
}

export async function getChainFeed(opts?: {
  blocks?: number;
  mempool?: number;
  address?: string | null;
}): Promise<ChainFeed> {
  const blockN = Math.min(12, Math.max(1, opts?.blocks ?? 5));
  const memN = Math.min(80, Math.max(1, opts?.mempool ?? 30));
  const address = opts?.address?.trim() || null;

  const [status, recent, mempool, focus] = await Promise.all([
    getChainStatus(),
    getRecentBlocks(blockN),
    getMempool(memN),
    address
      ? getAddress(address).catch(() => null)
      : Promise.resolve(null),
  ]);

  const tip = recent[0] || null;

  // Collect token ids for name cache
  const tokenIds: string[] = [];
  for (const tx of mempool) {
    for (const t of tx.tokens) tokenIds.push(t.tokenId);
  }
  if (tip) {
    for (const tx of tip.transactions) {
      for (const t of tx.tokens) tokenIds.push(t.tokenId);
    }
  }
  if (focus) {
    for (const t of focus.confirmed.tokens) tokenIds.push(t.tokenId);
  }
  const tokenNames = await enrichTokenNames(tokenIds);

  // Seed names from address balance (often already named)
  if (focus) {
    for (const t of focus.confirmed.tokens) {
      if (t.name) tokenNames[t.tokenId] = t.name;
    }
  }

  const particles: ChainParticle[] = [];

  // 1) Mempool — outer orbit
  for (const tx of mempool) {
    particles.push(...particlesFromTx(tx, "mempool", tokenNames));
  }
  // 2) Tip block — assembling / sealed core ring
  if (tip) {
    for (const tx of tip.transactions.slice(0, 24)) {
      particles.push(...particlesFromTx(tx, "sealed", tokenNames));
    }
  }
  // 3) Address focus — inner constellation
  if (focus) {
    particles.push(...particlesFromAddress(focus, tokenNames));
  }

  // Cap total particles for GPU
  const capped = particles.slice(0, 260);

  return {
    source: "local",
    node: NODE_URL,
    indexedHeight: status.indexedHeight,
    fullHeight: status.fullHeight,
    tip,
    recent,
    mempool,
    particles: capped,
    focus: focus || null,
    tokenNames,
    generatedAt: new Date().toISOString(),
  };
}

export async function getAddress(address: string): Promise<AddressView> {
  const body = await nodeJson<{
    confirmed?: {
      nanoErgs?: number | string;
      tokens?: Array<{
        tokenId: string;
        amount: number | string;
        name?: string;
        decimals?: number;
      }>;
    };
  }>("/blockchain/balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(address),
  });

  const c = body.confirmed || {};
  return {
    address,
    confirmed: {
      nanoErgs: nano(c.nanoErgs),
      tokens: (c.tokens || []).map((t) => ({
        tokenId: t.tokenId,
        amount: nano(t.amount),
        name: t.name ?? null,
        decimals: t.decimals ?? null,
      })),
    },
    source: "local",
  };
}

export async function getToken(tokenId: string) {
  return nodeJson(`/blockchain/token/byId/${tokenId}`);
}

export async function getBlockById(id: string): Promise<ChainBlock | null> {
  try {
    const [header, txBody] = await Promise.all([
      nodeJson<{
        height?: number;
        timestamp?: number;
        size?: number;
        id?: string;
      }>(`/blocks/${id}/header`),
      nodeJson<{ transactions?: RawTx[]; size?: number }>(
        `/blocks/${id}/transactions`
      ),
    ]);
    const transactions = (txBody.transactions || []).map((t) =>
      normalizeTx(t, false)
    );
    return {
      id,
      height: header.height ?? 0,
      timestamp: header.timestamp ?? Date.now(),
      txCount: transactions.length,
      size: txBody.size ?? header.size,
      transactions,
    };
  } catch {
    return null;
  }
}
