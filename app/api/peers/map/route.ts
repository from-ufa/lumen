import { NextRequest, NextResponse } from "next/server";
import {
  extractIpPort,
  isPrivateIp,
  jitter,
  loadCatalog,
  lookupGeo,
  mergePeerList,
  recomputeStats,
  resolveCatalogNodeState,
  type NetworkCatalog,
  type PeerMapState,
} from "@/lib/network-peers";
import { bridgeServerFetch } from "../../../lib/bridge-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = (process.env.ERGO_NODE_URL || "http://127.0.0.1:9053").replace(
  /\/$/,
  ""
);

/** Catalog older than this → try inline local harvest before serving (Lumen mode only) */
const STALE_MS = 45 * 60 * 1000;

export type PeerMapMarker = {
  id: string;
  ip: string;
  port: string | null;
  name: string;
  address: string;
  connectionType: string;
  lastMessage: number;
  lat: number;
  lon: number;
  country: string;
  city: string;
  jittered: boolean;
  state: PeerMapState;
  source?: string;
  /** Ergo node appVersion from /info when known */
  version?: string | null;
};

export type PeerLink = {
  toIp: string;
  toLat: number;
  toLon: number;
  connectionType: string;
  lastMessage: number;
  name: string;
};

function myPublicIpGuess(): string | null {
  return (
    process.env.LUMEN_PUBLIC_IP ||
    process.env.AETHER_PUBLIC_IP ||
    "80.209.232.82"
  );
}

function extractToken(req: NextRequest): string | null {
  const header =
    req.headers.get("x-lumen-bridge-token") ||
    req.headers.get("x-bridge-token");
  if (header) return header.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const q = req.nextUrl.searchParams.get("token");
  return q ? q.trim() : null;
}

/** Normalize IPv4 from WS remoteAddress or agent-reported publicIp. */
export function normalizePublicIpv4(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  // X-Forwarded-For first hop
  if (s.includes(",")) s = s.split(",")[0].trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  // Strip brackets / ports
  s = s.replace(/^\[|\]$/g, "");
  const m = s.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  if (!m) return null;
  const ip = m[1];
  if (isPrivateIp(ip)) return null;
  return ip;
}

async function fetchLocalPeers(path: string): Promise<any[]> {
  const res = await fetch(`${UPSTREAM}${path}`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`peers upstream ${res.status}`);
  return res.json();
}

/** Fetch allowlisted path via bridge-server (user's node). */
async function fetchViaBridge(token: string, ergoPath: string): Promise<any> {
  const path = ergoPath.startsWith("/") ? ergoPath.slice(1) : ergoPath;
  const upstream = await bridgeServerFetch(`/api/bridge/node/${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Lumen-Bridge-Token": token,
    },
    timeoutMs: 15_000,
  });
  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    throw new Error(
      errBody.error || errBody.message || `bridge ${upstream.status}`
    );
  }
  return upstream.json();
}

async function fetchBridgeStatus(token: string): Promise<{
  connected?: boolean;
  remoteAddress?: string | null;
  publicIp?: string | null;
  node?: string | null;
}> {
  try {
    const res = await bridgeServerFetch(
      `/status?token=${encodeURIComponent(token)}`,
      {
        headers: { Accept: "application/json" },
        timeoutMs: 8_000,
      }
    );
    if (!res.ok) return {};
    return (await res.json()) as {
      connected?: boolean;
      remoteAddress?: string | null;
      publicIp?: string | null;
      node?: string | null;
    };
  } catch {
    return {};
  }
}

/** Build catalog from live local peers when crawler file missing/stale. Lumen only. */
async function inlineLocalCatalog(
  existing: NetworkCatalog | null
): Promise<NetworkCatalog> {
  const catalog: NetworkCatalog = existing
    ? {
        version: 1,
        updatedAt: existing.updatedAt,
        nodes: { ...existing.nodes },
        stats: existing.stats,
      }
    : { version: 1, updatedAt: 0, nodes: {} };

  const now = Date.now();
  try {
    const all = await fetchLocalPeers("/peers/all");
    mergePeerList(catalog, all, "local-inline", now);
  } catch {
    /* optional */
  }
  try {
    const connected = await fetchLocalPeers("/peers/connected");
    mergePeerList(catalog, connected, "local-inline-connected", now);
  } catch {
    /* optional */
  }
  catalog.updatedAt = now;
  recomputeStats(catalog);
  return catalog;
}

function buildConnectedMap(connectedRaw: any[]) {
  const connectedByIp = new Map<
    string,
    {
      name: string;
      address: string;
      connectionType: string;
      lastMessage: number;
      port: string | null;
    }
  >();
  for (const p of connectedRaw) {
    const raw = String(p.address || p.declaredAddress || "");
    const parsed = extractIpPort(raw);
    if (!parsed) continue;
    connectedByIp.set(parsed.ip, {
      name: p.name || "unknown",
      address: raw,
      connectionType: p.connectionType || "",
      lastMessage: Number(p.lastMessage) || 0,
      port: parsed.port,
    });
  }
  return connectedByIp;
}

/**
 * My Node map: ONLY peers from Bridge + server-side GeoIP.
 * No Lumen network catalog. No local Ergo harvest.
 */
function buildUserOwnedMap(opts: {
  connectedRaw: any[];
  meName: string;
  meIp: string | null;
  mePublicIpSource: string | null;
}) {
  const { connectedRaw, meName, meIp, mePublicIpSource } = opts;
  const connectedByIp = buildConnectedMap(connectedRaw);
  const byCell = new Map<string, number>();
  const markers: PeerMapMarker[] = [];
  let unmapped = 0;

  for (const [ip, conn] of connectedByIp) {
    // Don't put the user's own public IP in the peer cloud if it appears
    if (meIp && ip === meIp) continue;

    const g = lookupGeo(ip);
    if (!g) {
      unmapped++;
      continue;
    }
    const key = `${ip}:${conn.port || "9030"}`;
    const cell = `${g.lat.toFixed(2)},${g.lon.toFixed(2)}`;
    const stack = byCell.get(cell) || 0;
    byCell.set(cell, stack + 1);
    const [jLat, jLon] =
      stack > 0 ? jitter(g.lat, g.lon, key) : [g.lat, g.lon];

    markers.push({
      id: key,
      ip,
      port: conn.port,
      name: conn.name,
      address: conn.address,
      connectionType: conn.connectionType,
      lastMessage: conn.lastMessage,
      lat: jLat,
      lon: jLon,
      country: g.country,
      city: g.city,
      jittered: stack > 0,
      state: "connected",
      source: "bridge-connected",
    });
  }

  let me: PeerMapMarker | null = null;
  if (meIp) {
    const geo = lookupGeo(meIp);
    if (geo) {
      me = {
        id: "me",
        ip: meIp,
        port: "9030",
        name: meName,
        address: `/${meIp}:9030`,
        connectionType: "Bridge",
        lastMessage: Date.now(),
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        city: geo.city,
        jittered: false,
        state: "connected",
        source: mePublicIpSource || "bridge-public-ip",
      };
    }
  }

  const links: PeerLink[] = [];
  if (me) {
    for (const m of markers) {
      if (m.state !== "connected") continue;
      if (m.ip === me.ip) continue;
      links.push({
        toIp: m.ip,
        toLat: m.lat,
        toLon: m.lon,
        connectionType: m.connectionType,
        lastMessage: m.lastMessage,
        name: m.name,
      });
    }
  }

  // Top Regions: only user-node peers that have geo
  const countries: Record<string, number> = {};
  for (const m of markers) {
    const c = m.country || "??";
    countries[c] = (countries[c] || 0) + 1;
  }

  const connectedMapped = markers.length;

  return {
    markers,
    me,
    links,
    totalPeers: connectedRaw.length,
    mapped: markers.length,
    /** User-owned: no global catalog */
    networkTotal: connectedRaw.length,
    discovered: connectedRaw.length,
    networkMapped: markers.length,
    withGeo: markers.length,
    connectedMapped,
    liveMapped: 0,
    liveTotal: connectedMapped,
    reachableMapped: 0,
    seenMapped: 0,
    ghostMapped: 0,
    unmapped,
    countries,
    catalogUpdatedAt: null as number | null,
    generatedAt: Date.now(),
    source: "bridge" as const,
    nodeName: meName,
    mePublicIp: meIp,
    mePublicIpSource,
  };
}

/** Lumen Node map: local Ergo + network catalog (unchanged product behaviour). */
function buildLumenMap(opts: {
  catalog: NetworkCatalog;
  connectedRaw: any[];
  meName: string;
  meIp: string | null;
}) {
  const { catalog, connectedRaw, meName, meIp } = opts;
  const connectedByIp = buildConnectedMap(connectedRaw);
  const byCell = new Map<string, number>();
  const markers: PeerMapMarker[] = [];
  let unmapped = 0;

  for (const n of Object.values(catalog.nodes)) {
    let lat = n.lat;
    let lon = n.lon;
    let country = n.country || "";
    let city = n.city || "";

    if (lat == null || lon == null) {
      const g = lookupGeo(n.ip);
      if (!g) {
        unmapped++;
        continue;
      }
      lat = g.lat;
      lon = g.lon;
      country = g.country;
      city = g.city;
    }

    const conn = connectedByIp.get(n.ip);
    const state: PeerMapState = resolveCatalogNodeState(n, !!conn);

    const cell = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
    const stack = byCell.get(cell) || 0;
    byCell.set(cell, stack + 1);
    const key = `${n.ip}:${n.port || "9030"}`;
    const [jLat, jLon] =
      stack > 0
        ? jitter(Number(lat), Number(lon), key)
        : [Number(lat), Number(lon)];

    markers.push({
      id: key,
      ip: n.ip,
      port: conn?.port ?? n.port,
      name: conn?.name || n.name || "unknown",
      address: conn?.address || n.address,
      connectionType: conn?.connectionType || "",
      lastMessage: conn?.lastMessage || n.lastMessage || 0,
      lat: jLat,
      lon: jLon,
      country,
      city,
      jittered: stack > 0,
      state,
      source: n.sources?.[0],
      version: n.infoVersion || null,
    });
  }

  for (const [ip, conn] of connectedByIp) {
    if (markers.some((m) => m.ip === ip)) continue;
    const g = lookupGeo(ip);
    if (!g) {
      unmapped++;
      continue;
    }
    const key = `${ip}:${conn.port || "9030"}`;
    const cell = `${g.lat.toFixed(2)},${g.lon.toFixed(2)}`;
    const stack = byCell.get(cell) || 0;
    byCell.set(cell, stack + 1);
    const [jLat, jLon] =
      stack > 0 ? jitter(g.lat, g.lon, key) : [g.lat, g.lon];
    markers.push({
      id: key,
      ip,
      port: conn.port,
      name: conn.name,
      address: conn.address,
      connectionType: conn.connectionType,
      lastMessage: conn.lastMessage,
      lat: jLat,
      lon: jLon,
      country: g.country,
      city: g.city,
      jittered: stack > 0,
      state: "connected",
      source: "connected-only",
    });
  }

  let me: PeerMapMarker | null = null;
  if (meIp) {
    const geo = lookupGeo(meIp);
    if (geo) {
      me = {
        id: "me",
        ip: meIp,
        port: "9030",
        name: meName,
        address: `/${meIp}:9030`,
        connectionType: "Local",
        lastMessage: Date.now(),
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        city: geo.city,
        jittered: false,
        state: "connected",
        source: "self",
      };
    }
  }

  const links: PeerLink[] = [];
  if (me) {
    for (const m of markers) {
      if (m.state !== "connected") continue;
      if (m.ip === me.ip) continue;
      links.push({
        toIp: m.ip,
        toLat: m.lat,
        toLon: m.lon,
        connectionType: m.connectionType,
        lastMessage: m.lastMessage,
        name: m.name,
      });
    }
  }

  // Full-catalog status counts (not only geo-mapped markers)
  let catalogConnected = 0;
  let catalogLive = 0;
  let catalogSeen = 0;
  let catalogGhost = 0;
  for (const n of Object.values(catalog.nodes)) {
    const st = resolveCatalogNodeState(n, connectedByIp.has(n.ip));
    if (st === "connected") catalogConnected++;
    else if (st === "live") catalogLive++;
    else if (st === "seen") catalogSeen++;
    else catalogGhost++;
  }

  // Map markers: Ghost excluded so the default map stays clean
  const visibleMarkers = markers.filter((m) => m.state !== "ghost");

  const countries: Record<string, number> = {};
  for (const m of visibleMarkers) {
    const c = m.country || "??";
    countries[c] = (countries[c] || 0) + 1;
  }

  const connectedMapped = visibleMarkers.filter((m) => m.state === "connected")
    .length;
  const liveOnlyMapped = visibleMarkers.filter((m) => m.state === "live").length;
  const seenMapped = visibleMarkers.filter((m) => m.state === "seen").length;
  const networkTotal = Object.keys(catalog.nodes).length;
  /** Active catalog = not ghost (connected + live + seen) */
  const activeTotal = catalogConnected + catalogLive + catalogSeen;
  /** Live network = connected + answering */
  const liveTotal = catalogConnected + catalogLive;
  /** Full history including Ghost */
  const totalEver = networkTotal;
  const ghostMapped = catalogGhost;

  return {
    markers: visibleMarkers,
    me,
    links,
    totalPeers: connectedRaw.length,
    mapped: visibleMarkers.length,
    /** Full catalog including Ghost history */
    networkTotal,
    totalEver,
    /** Active known nodes (excludes Ghost) — primary “Discovered” figure */
    discovered: activeTotal,
    activeTotal,
    networkMapped: visibleMarkers.length,
    withGeo: visibleMarkers.length,
    connectedMapped,
    /** Answering but not in local connected set */
    liveMapped: liveOnlyMapped,
    /** connected + live — “who’s up” (catalog-level) */
    liveTotal,
    /** @deprecated alias */
    reachableMapped: liveOnlyMapped,
    seenMapped,
    /** Historical nodes kept in catalog (hidden from map) */
    ghostMapped,
    unmapped,
    countries,
    catalogUpdatedAt: catalog.updatedAt || null,
    generatedAt: Date.now(),
    source: "lumen" as const,
    nodeName: meName,
  };
}

/**
 * GET /api/peers/map
 * Optional: ?token= or X-Lumen-Bridge-Token → user-owned map via Bridge.
 */
export async function GET(req: NextRequest) {
  try {
    const token = extractToken(req);

    // ── My Node (fully user-owned) ──────────────────────────────────────
    if (token) {
      let connectedRaw: any[] = [];
      let meName = "My Node";
      let status: Awaited<ReturnType<typeof fetchBridgeStatus>> = {};

      try {
        const [peers, info, st] = await Promise.all([
          fetchViaBridge(token, "peers/connected"),
          fetchViaBridge(token, "info").catch(() => null),
          fetchBridgeStatus(token),
        ]);
        connectedRaw = Array.isArray(peers) ? peers : [];
        if (info && typeof info.name === "string" && info.name) {
          meName = info.name;
        }
        status = st;
      } catch (err) {
        const message = err instanceof Error ? err.message : "bridge_map_failed";
        return NextResponse.json(
          {
            error: message,
            source: "bridge",
            hint: "Bridge offline or token unknown",
          },
          { status: 503 }
        );
      }

      // Prefer agent-reported publicIp, then TCP remote of the Bridge session
      const fromAgent = normalizePublicIpv4(status.publicIp);
      const fromTcp = normalizePublicIpv4(status.remoteAddress ?? undefined);
      const meIp = fromAgent || fromTcp;
      const mePublicIpSource = fromAgent
        ? "agent-publicIp"
        : fromTcp
          ? "ws-remoteAddress"
          : null;

      const payload = buildUserOwnedMap({
        connectedRaw,
        meName,
        meIp,
        mePublicIpSource,
      });

      return NextResponse.json(payload, {
        headers: {
          "Cache-Control": "no-store",
          "X-Lumen-Map-Source": "bridge",
        },
      });
    }

    // ── Lumen Node (local server Ergo + catalog) ────────────────────────
    let catalog = loadCatalog();
    const age = catalog
      ? Date.now() - (catalog.updatedAt || 0)
      : Number.POSITIVE_INFINITY;
    if (!catalog || age > STALE_MS) {
      catalog = await inlineLocalCatalog(catalog);
    }

    let connectedRaw: any[] = [];
    try {
      connectedRaw = await fetchLocalPeers("/peers/connected");
    } catch {
      connectedRaw = [];
    }

    let meName = "Lumen Node";
    try {
      const infoRes = await fetch(`${UPSTREAM}/info`, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info?.name) meName = String(info.name);
      }
    } catch {
      /* keep default */
    }

    const payload = buildLumenMap({
      catalog,
      connectedRaw,
      meName,
      meIp: myPublicIpGuess(),
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "X-Lumen-Map-Source": "lumen",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "map error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
