import { NextRequest, NextResponse } from "next/server";
import {
  catalogAgeMs,
  extractIpPort,
  jitter,
  loadCatalog,
  lookupGeo,
  mergePeerList,
  recomputeStats,
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

/** Catalog older than this → try inline local harvest before serving */
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

/** Build catalog from live local peers when crawler file missing/stale. */
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

function buildResponse(opts: {
  catalog: NetworkCatalog | null;
  connectedRaw: any[];
  meName: string;
  meIp: string | null;
  source: "lumen" | "bridge";
}) {
  const { catalog, connectedRaw, meName, meIp, source } = opts;
  const connectedByIp = buildConnectedMap(connectedRaw);
  const byCell = new Map<string, number>();
  const markers: PeerMapMarker[] = [];
  let unmapped = 0;

  const nodes = catalog?.nodes ? Object.values(catalog.nodes) : [];

  for (const n of nodes) {
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
    // In bridge mode we only care about currently connected peers from user's node
    if (source === "bridge" && !conn) continue;

    let state: PeerMapState = "stale";
    if (conn) state = "connected";
    else if (n.reachable === true) state = "reachable";
    else state = "stale";

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
    });
  }

  // Connected peers not yet in catalog
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
      source: source === "bridge" ? "bridge-connected" : "connected-only",
    });
  }

  // Our node pin
  let me: PeerMapMarker | null = null;
  if (meIp) {
    const geo = lookupGeo(meIp);
    if (geo) {
      me = {
        id: "me",
        ip: meIp,
        port: "9030",
        name: `${meName} (YOU)`,
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

  const countries: Record<string, number> = {};
  for (const m of markers) {
    const c = m.country || "??";
    countries[c] = (countries[c] || 0) + 1;
  }

  const connectedMapped = markers.filter((m) => m.state === "connected").length;
  const reachableMapped = markers.filter((m) => m.state === "reachable").length;
  const networkTotal = catalog ? Object.keys(catalog.nodes).length : markers.length;

  return {
    markers,
    me,
    links,
    totalPeers: connectedRaw.length,
    mapped: markers.length,
    networkTotal,
    networkMapped: markers.length,
    connectedMapped,
    reachableMapped,
    unmapped,
    countries,
    catalogUpdatedAt: catalog?.updatedAt || null,
    generatedAt: Date.now(),
    source,
    nodeName: meName,
  };
}

/**
 * GET /api/peers/map
 * Optional: ?token= or X-Lumen-Bridge-Token → peers from user's Bridge node.
 */
export async function GET(req: NextRequest) {
  try {
    const token = extractToken(req);

    // ── My Node (via Lumen Bridge) ──────────────────────────────────────
    if (token) {
      let connectedRaw: any[] = [];
      let meName = "My Node";
      try {
        const [peers, info] = await Promise.all([
          fetchViaBridge(token, "peers/connected"),
          fetchViaBridge(token, "info").catch(() => null),
        ]);
        connectedRaw = Array.isArray(peers) ? peers : [];
        if (info && typeof info.name === "string" && info.name) {
          meName = info.name;
        }
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

      // Enrich with global catalog geo when available; markers still only show
      // peers currently connected to the user's node.
      // Optional geo enrichment from crawler catalog (no local-node harvest in bridge mode)
      const catalog = loadCatalog();

      // Prefer not to pin "me" on Lumen's public IP in bridge mode.
      // Use geo of first public peer only for links origin if we can't place me.
      // meIp null → no YOU pin (links empty) unless we later know user IP.
      const payload = buildResponse({
        catalog: catalog,
        connectedRaw,
        meName,
        meIp: null,
        source: "bridge",
      });

      // Place YOU at map centroid of connected peers (visual anchor)
      if (!payload.me && payload.markers.length) {
        const connected = payload.markers.filter((m) => m.state === "connected");
        const pool = connected.length ? connected : payload.markers;
        const lat =
          pool.reduce((s, m) => s + m.lat, 0) / Math.max(1, pool.length);
        const lon =
          pool.reduce((s, m) => s + m.lon, 0) / Math.max(1, pool.length);
        payload.me = {
          id: "me",
          ip: "bridge",
          port: null,
          name: `${meName} (YOU)`,
          address: "via Lumen Bridge",
          connectionType: "Bridge",
          lastMessage: Date.now(),
          lat,
          lon,
          country: "",
          city: "",
          jittered: false,
          state: "connected",
          source: "bridge-self",
        };
        payload.links = pool
          .filter((m) => m.id !== "me")
          .map((m) => ({
            toIp: m.ip,
            toLat: m.lat,
            toLon: m.lon,
            connectionType: m.connectionType,
            lastMessage: m.lastMessage,
            name: m.name,
          }));
      }

      return NextResponse.json(payload, {
        headers: { "Cache-Control": "no-store", "X-Lumen-Map-Source": "bridge" },
      });
    }

    // ── Lumen Node (local server Ergo) ──────────────────────────────────
    let catalog = loadCatalog();
    const age = catalogAgeMs(catalog);
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

    const payload = buildResponse({
      catalog,
      connectedRaw,
      meName,
      meIp: myPublicIpGuess(),
      source: "lumen",
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store", "X-Lumen-Map-Source": "lumen" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "map error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
