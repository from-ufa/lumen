import { NextResponse } from "next/server";
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
  return process.env.AETHER_PUBLIC_IP || "80.209.232.82";
}

async function fetchPeers(path: string): Promise<any[]> {
  const res = await fetch(`${UPSTREAM}${path}`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`peers upstream ${res.status}`);
  return res.json();
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
    const all = await fetchPeers("/peers/all");
    mergePeerList(catalog, all, "local-inline", now);
  } catch {
    /* optional */
  }
  try {
    const connected = await fetchPeers("/peers/connected");
    mergePeerList(catalog, connected, "local-inline-connected", now);
  } catch {
    /* optional */
  }
  catalog.updatedAt = now;
  recomputeStats(catalog);
  return catalog;
}

export async function GET() {
  try {
    let catalog = loadCatalog();
    const age = catalogAgeMs(catalog);
    if (!catalog || age > STALE_MS) {
      catalog = await inlineLocalCatalog(catalog);
    }

    let connectedRaw: any[] = [];
    try {
      connectedRaw = await fetchPeers("/peers/connected");
    } catch {
      connectedRaw = [];
    }

    const connectedByIp = new Map<
      string,
      { name: string; address: string; connectionType: string; lastMessage: number; port: string | null }
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

    // Connected peers not yet in catalog (edge case)
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

    // Our node
    let me: PeerMapMarker | null = null;
    const myIp = myPublicIpGuess();
    if (myIp) {
      const geo = lookupGeo(myIp);
      if (geo) {
        me = {
          id: "me",
          ip: myIp,
          port: "9030",
          name: "netim_node (YOU)",
          address: `/${myIp}:9030`,
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

    // Signal links: You → each connected mapped peer
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
    const networkTotal = Object.keys(catalog.nodes).length;

    return NextResponse.json({
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
      catalogUpdatedAt: catalog.updatedAt || null,
      generatedAt: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "map error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
