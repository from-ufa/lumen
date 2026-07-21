import { NextResponse } from "next/server";
import geoip from "geoip-lite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = (process.env.ERGO_NODE_URL || "http://127.0.0.1:9053").replace(
  /\/$/,
  ""
);

const IPV4_RE = /(\d{1,3}(?:\.\d{1,3}){3})/;

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
  /** jitter applied so stacked peers are visible */
  jittered: boolean;
};

function extractIpPort(raw: string): { ip: string; port: string | null } | null {
  const m = raw.match(IPV4_RE);
  if (!m) return null;
  const ip = m[1];
  // skip private / link-local / loopback
  if (
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("0.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  ) {
    return null;
  }
  const portM = raw.match(/:(\d{2,5})\s*$/);
  return { ip, port: portM ? portM[1] : null };
}

/** Small deterministic offset so peers in same city don't fully stack. */
function jitter(lat: number, lon: number, key: string): [number, number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const a = ((h % 1000) / 1000) * Math.PI * 2;
  const r = 0.08 + ((Math.abs(h) % 50) / 50) * 0.35; // ~0.08–0.43 deg
  return [lat + Math.sin(a) * r, lon + Math.cos(a) * r];
}

async function fetchPeers(): Promise<any[]> {
  const res = await fetch(`${UPSTREAM}/peers/connected`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`peers upstream ${res.status}`);
  return res.json();
}

function myPublicIpGuess(): string | null {
  // Host public IP from SERVER.md / node publicUrl when known
  return process.env.AETHER_PUBLIC_IP || "80.209.232.82";
}

export async function GET() {
  try {
    const peers = await fetchPeers();
    const markers: PeerMapMarker[] = [];
    let unmapped = 0;
    const byCell = new Map<string, number>();

    for (let i = 0; i < peers.length; i++) {
      const p = peers[i];
      const raw = String(p.address || p.declaredAddress || "");
      const parsed = extractIpPort(raw);
      if (!parsed) {
        unmapped++;
        continue;
      }
      const geo = geoip.lookup(parsed.ip);
      if (!geo || !geo.ll) {
        unmapped++;
        continue;
      }
      const [baseLat, baseLon] = geo.ll;
      const cell = `${baseLat.toFixed(2)},${baseLon.toFixed(2)}`;
      const stack = byCell.get(cell) || 0;
      byCell.set(cell, stack + 1);
      const key = `${parsed.ip}:${parsed.port || i}`;
      const [lat, lon] =
        stack > 0 ? jitter(baseLat, baseLon, key) : [baseLat, baseLon];

      markers.push({
        id: key,
        ip: parsed.ip,
        port: parsed.port,
        name: p.name || "unknown",
        address: raw,
        connectionType: p.connectionType || "",
        lastMessage: p.lastMessage || 0,
        lat,
        lon,
        country: geo.country || "",
        city: geo.city || "",
        jittered: stack > 0,
      });
    }

    // Our node (center of the constellation)
    let me: PeerMapMarker | null = null;
    const myIp = myPublicIpGuess();
    if (myIp) {
      const geo = geoip.lookup(myIp);
      if (geo?.ll) {
        me = {
          id: "me",
          ip: myIp,
          port: "9030",
          name: "netim_node (YOU)",
          address: `/${myIp}:9030`,
          connectionType: "Local",
          lastMessage: Date.now(),
          lat: geo.ll[0],
          lon: geo.ll[1],
          country: geo.country || "",
          city: geo.city || "",
          jittered: false,
        };
      }
    }

    // Country histogram
    const countries: Record<string, number> = {};
    for (const m of markers) {
      const c = m.country || "??";
      countries[c] = (countries[c] || 0) + 1;
    }

    return NextResponse.json({
      markers,
      me,
      totalPeers: peers.length,
      mapped: markers.length,
      unmapped,
      countries,
      generatedAt: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "map error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
