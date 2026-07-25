import fs from "fs";
import path from "path";
import geoip from "geoip-lite";

export const CATALOG_PATH =
  process.env.LUMEN_NETWORK_CATALOG ||
  process.env.AETHER_NETWORK_CATALOG ||
  path.join(process.cwd(), "data", "network-catalog.json");

export const IPV4_RE = /(\d{1,3}(?:\.\d{1,3}){3})/;

export type NetworkNodeRecord = {
  ip: string;
  port: string | null;
  name: string;
  address: string;
  restApiUrl?: string;
  lastHandshake: number;
  lastMessage: number;
  lat: number | null;
  lon: number | null;
  country: string;
  city: string;
  reachable: boolean | null;
  lastReachableAt: number | null;
  lastProbedAt: number | null;
  /** Optional enrichment from REST /info */
  infoHeight?: number | null;
  infoVersion?: string | null;
  lastInfoAt?: number | null;
  sources: string[];
  firstSeenAt: number;
  lastSeenAt: number;
};

export type NetworkCatalog = {
  version: 1;
  updatedAt: number;
  nodes: Record<string, NetworkNodeRecord>;
  stats?: {
    total: number;
    withGeo: number;
    reachable: number;
    unreachable: number;
    unprobed: number;
  };
};

/**
 * Map node status (Lumen Node catalog + live peers):
 * - connected — currently linked to the active data node (Lumen or My Node)
 * - live      — answering now (TCP open and/or recent REST /info)
 * - seen      — observed recently, not answering
 * - ghost     — not seen for a long time (usually hidden)
 *
 * Legacy aliases still accepted when reading older payloads:
 *   reachable → live, stale → seen
 */
export type PeerMapState = "connected" | "live" | "seen" | "ghost";

/** @deprecated use "live" */
export type PeerMapStateLegacy = "reachable" | "stale";

/** Live if reachable flag or /info / probe within this window */
export const LIVE_FRESH_MS = 2 * 60 * 60 * 1000; // 2h
/** Seen if last catalog observation within this window */
export const SEEN_FRESH_MS = 7 * 24 * 60 * 60 * 1000; // 7d

export function normalizePeerState(
  s: string | undefined | null
): PeerMapState {
  if (s === "connected" || s === "live" || s === "seen" || s === "ghost") {
    return s;
  }
  if (s === "reachable") return "live";
  if (s === "stale") return "seen";
  return "seen";
}

/** Derive status from catalog row + optional live connection. */
export function resolveCatalogNodeState(
  n: NetworkNodeRecord,
  isConnected: boolean,
  now = Date.now()
): PeerMapState {
  if (isConnected) return "connected";

  const lastLive = Math.max(
    Number(n.lastReachableAt) || 0,
    Number(n.lastInfoAt) || 0,
    n.reachable === true ? Number(n.lastProbedAt) || 0 : 0
  );
  if (n.reachable === true || (lastLive > 0 && now - lastLive < LIVE_FRESH_MS)) {
    return "live";
  }

  const lastSeen = Math.max(
    Number(n.lastSeenAt) || 0,
    Number(n.lastMessage) || 0,
    Number(n.lastHandshake) || 0,
    Number(n.firstSeenAt) || 0
  );
  if (lastSeen > 0 && now - lastSeen < SEEN_FRESH_MS) {
    return "seen";
  }
  return "ghost";
}

export function isPrivateIp(ip: string): boolean {
  if (
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("0.") ||
    ip.startsWith("169.254.") ||
    ip === "255.255.255.255"
  ) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  // CGNAT 100.64.0.0/10
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip)) return true;
  return false;
}

export function extractIpPort(
  raw: string
): { ip: string; port: string | null } | null {
  const m = String(raw || "").match(IPV4_RE);
  if (!m) return null;
  const ip = m[1];
  if (isPrivateIp(ip)) return null;
  const portM = String(raw).match(/:(\d{2,5})\s*$/);
  return { ip, port: portM ? portM[1] : null };
}

/** Small deterministic offset so peers in same city don't fully stack. */
export function jitter(
  lat: number,
  lon: number,
  key: string
): [number, number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const a = ((h % 1000) / 1000) * Math.PI * 2;
  const r = 0.08 + ((Math.abs(h) % 50) / 50) * 0.35;
  return [lat + Math.sin(a) * r, lon + Math.cos(a) * r];
}

export function lookupGeo(ip: string): {
  lat: number;
  lon: number;
  country: string;
  city: string;
} | null {
  const geo = geoip.lookup(ip);
  if (!geo?.ll) return null;
  return {
    lat: geo.ll[0],
    lon: geo.ll[1],
    country: geo.country || "",
    city: geo.city || "",
  };
}

export function emptyCatalog(): NetworkCatalog {
  return { version: 1, updatedAt: 0, nodes: {} };
}

export function loadCatalog(filePath = CATALOG_PATH): NetworkCatalog | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as NetworkCatalog;
    if (!data || data.version !== 1 || !data.nodes) return null;
    return data;
  } catch {
    return null;
  }
}

export function catalogAgeMs(catalog: NetworkCatalog | null): number {
  if (!catalog?.updatedAt) return Number.POSITIVE_INFINITY;
  return Date.now() - catalog.updatedAt;
}

/** Harvest peer list from Ergo REST-shaped objects into catalog nodes. */
export function mergePeerList(
  catalog: NetworkCatalog,
  peers: any[],
  source: string,
  now = Date.now()
): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  for (const p of peers || []) {
    const raw = String(p.address || p.declaredAddress || "");
    const parsed = extractIpPort(raw);
    if (!parsed) continue;
    const { ip, port } = parsed;
    const existing = catalog.nodes[ip];
    const geo =
      existing?.lat != null && existing?.lon != null
        ? {
            lat: existing.lat,
            lon: existing.lon,
            country: existing.country,
            city: existing.city,
          }
        : lookupGeo(ip);

    if (!existing) {
      catalog.nodes[ip] = {
        ip,
        port,
        name: p.name || "unknown",
        address: raw || `/${ip}${port ? `:${port}` : ""}`,
        restApiUrl: p.restApiUrl || undefined,
        lastHandshake: Number(p.lastHandshake) || 0,
        lastMessage: Number(p.lastMessage) || 0,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
        country: geo?.country || "",
        city: geo?.city || "",
        reachable: null,
        lastReachableAt: null,
        lastProbedAt: null,
        sources: [source],
        firstSeenAt: now,
        lastSeenAt: now,
      };
      added++;
    } else {
      existing.lastSeenAt = now;
      if (p.name) existing.name = p.name;
      if (raw) existing.address = raw;
      if (port) existing.port = port;
      if (p.restApiUrl) existing.restApiUrl = p.restApiUrl;
      if (p.lastHandshake) existing.lastHandshake = Number(p.lastHandshake);
      if (p.lastMessage) existing.lastMessage = Number(p.lastMessage);
      if (existing.lat == null && geo) {
        existing.lat = geo.lat;
        existing.lon = geo.lon;
        existing.country = geo.country;
        existing.city = geo.city;
      }
      if (!existing.sources.includes(source)) existing.sources.push(source);
      updated++;
    }
  }
  return { added, updated };
}

export function recomputeStats(catalog: NetworkCatalog): void {
  let withGeo = 0;
  let reachable = 0;
  let unreachable = 0;
  let unprobed = 0;
  const nodes = Object.values(catalog.nodes);
  for (const n of nodes) {
    if (n.lat != null && n.lon != null) withGeo++;
    if (n.reachable === true) reachable++;
    else if (n.reachable === false) unreachable++;
    else unprobed++;
  }
  catalog.stats = {
    total: nodes.length,
    withGeo,
    reachable,
    unreachable,
    unprobed,
  };
}
