"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { AnimatePresence, motion } from "framer-motion";
import { Globe2, MapPin, RefreshCw, Zap } from "lucide-react";
import { fetchBlockMinerByHeight } from "../lib/miner";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** connected | live | seen | ghost (+ legacy reachable/stale normalized) */
type PeerMapState = "connected" | "live" | "seen" | "ghost";

type MapFilter = "live" | "connected" | "all";

function normalizeState(s?: string | null): PeerMapState {
  if (s === "connected" || s === "live" || s === "seen" || s === "ghost") {
    return s;
  }
  if (s === "reachable") return "live";
  if (s === "stale") return "seen";
  return "seen";
}

function stateMeta(state: PeerMapState): {
  color: string;
  label: string;
  short: string;
} {
  switch (state) {
    case "connected":
      return { color: "#00E5FF", label: "Connected", short: "CONNECTED" };
    case "live":
      return { color: "#38BDF8", label: "Live", short: "LIVE" };
    case "seen":
      return { color: "#94A3B8", label: "Seen", short: "SEEN" };
    case "ghost":
    default:
      return { color: "#475569", label: "Ghost", short: "GHOST" };
  }
}

/** DivIcon — premium hierarchy by status. */
function peerDivIcon(state: PeerMapState, isBoom: boolean): L.DivIcon {
  let color = "#475569";
  let size = 8;
  let opacity = 0.4;
  let glow = "none";
  let ring = "1.5px solid rgba(10,10,15,0.85)";

  if (isBoom) {
    color = "#FF7A3D";
    size = 16;
    opacity = 0.95;
    glow = "0 0 14px rgba(255,122,61,0.85)";
    ring = "2px solid rgba(10,10,15,0.9)";
  } else if (state === "connected") {
    color = "#00E5FF";
    size = 14;
    opacity = 1;
    glow = "0 0 14px rgba(0,229,255,0.9), 0 0 28px rgba(0,229,255,0.35)";
    ring = "2px solid rgba(10,10,15,0.95)";
  } else if (state === "live") {
    color = "#38BDF8";
    size = 11;
    opacity = 0.88;
    glow = "0 0 10px rgba(56,189,248,0.55)";
    ring = "2px solid rgba(10,10,15,0.9)";
  } else if (state === "seen") {
    color = "#64748B";
    size = 9;
    opacity = 0.55;
    glow = "0 0 4px rgba(100,116,139,0.25)";
  } else {
    // ghost
    color = "#334155";
    size = 7;
    opacity = 0.35;
    glow = "none";
  }

  const hit = 28;
  return L.divIcon({
    className: "lumen-peer-marker",
    html: `<div class="lumen-peer-hit" style="
      width:${hit}px;height:${hit}px;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;
    "><div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:${ring};
      box-shadow:${glow};
      opacity:${opacity};
      pointer-events:none;
    "></div></div>`,
    iconSize: [hit, hit],
    iconAnchor: [hit / 2, hit / 2],
    popupAnchor: [0, -hit / 2 + 2],
    tooltipAnchor: [0, -hit / 2 + 4],
  });
}

/** Bright orange center-node pin — kept outside the cluster group */
function meDivIcon(): L.DivIcon {
  const hit = 32;
  return L.divIcon({
    className: "lumen-me-marker",
    html: `<div class="lumen-peer-hit" style="
      width:${hit}px;height:${hit}px;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;
    "><div style="
      width:20px;height:20px;border-radius:50%;
      background:linear-gradient(135deg,#FF7A3D 0%,#FFB08A 100%);
      border:3px solid #0A0A0F;
      box-shadow:0 0 0 2px #FF7A3D, 0 0 18px rgba(255,122,61,0.85);
      pointer-events:none;
    "></div></div>`,
    iconSize: [hit, hit],
    iconAnchor: [hit / 2, hit / 2],
    popupAnchor: [0, -14],
    tooltipAnchor: [0, -16],
  });
}

/** HTML for Leaflet bindPopup (works reliably with markercluster) */
function peerPopupHtml(
  m: {
    name: string;
    ip: string;
    port?: string | null;
    city?: string;
    country?: string;
    connectionType?: string;
    state?: PeerMapState;
  },
  isMe = false,
  /** Active data source label for the center pin, e.g. LUMEN NODE / MY NODE */
  meRoleLabel = "LUMEN NODE"
): string {
  const loc =
    [m.city, m.country].filter(Boolean).join(", ") || "Unknown location";
  const state = normalizeState(m.state);
  const meta = stateMeta(state);
  const title = escapeHtml(m.name || (isMe ? meRoleLabel : "Peer"));
  const addr = escapeHtml(m.ip) + (m.port ? `:${escapeHtml(m.port)}` : "");
  const roleColor = isMe ? "#FF7A3D" : meta.color;
  const roleLine = isMe
    ? escapeHtml(meRoleLabel)
    : state === "connected"
      ? "CONNECTED · MY PEER"
      : state === "live"
        ? "LIVE NODE"
        : state === "seen"
          ? "SEEN · NOT ANSWERING"
          : "GHOST";
  return `<div class="lumen-peer-popup" style="min-width:180px;max-width:260px;font-size:12px;line-height:1.4;color:#E8E8F0">
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:0.15em;color:${roleColor};margin-bottom:6px">${roleLine}</div>
    <div style="font-weight:600;font-size:14px;color:#fff;word-break:break-all">${title}</div>
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;margin-top:6px;color:#E8E8F0">${addr}</div>
    <div style="color:#A0A0B0;margin-top:6px">${escapeHtml(loc)}</div>
    ${
      isMe
        ? `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#A0A0B0;margin-top:6px">Active data source</div>`
        : `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#A0A0B0;margin-top:6px">${escapeHtml(
            m.connectionType || "—"
          )} · <span style="color:${meta.color}">${meta.short}</span></div>`
    }
  </div>`;
}

/**
 * Native Leaflet cluster layer — bindPopup/bindTooltip are reliable here.
 * (react-leaflet Marker children often fail to bind inside MarkerClusterGroup)
 */
function ClusteredPeersLayer({
  markers,
  boomIps,
  onSelect,
}: {
  markers: PeerMapMarker[];
  boomIps: Set<string>;
  onSelect: (m: PeerMapMarker) => void;
}) {
  const map = useMap();

  useEffect(() => {
    // L.markerClusterGroup is provided by leaflet.markercluster side-effect import
    const group = (
      L as typeof L & {
        markerClusterGroup: (opts?: L.MarkerClusterGroupOptions) => L.MarkerClusterGroup;
      }
    ).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 56,
      disableClusteringAtZoom: 10,
      spiderfyDistanceMultiplier: 1.4,
      animate: true,
      iconCreateFunction: createClusterIcon,
    });

    for (const m of markers) {
      const state = normalizeState(m.state);
      const isBoom = boomIps.has(m.ip);
      const z =
        state === "connected"
          ? 600
          : state === "live"
            ? 300
            : state === "seen"
              ? 100
              : 0;
      const marker = L.marker([m.lat, m.lon], {
        icon: peerDivIcon(state, isBoom),
        riseOnHover: true,
        keyboard: true,
        title: m.name || m.ip,
        zIndexOffset: z,
      });

      const statusTip = stateMeta(state).short;
      const tip =
        `${m.name || m.ip}` +
        (m.city || m.country
          ? ` · ${[m.city, m.country].filter(Boolean).join(", ")}`
          : "") +
        ` · ${statusTip}`;

      marker.bindTooltip(tip, {
        direction: "top",
        offset: [0, -12],
        opacity: 1,
        sticky: false,
        className: "lumen-map-tooltip",
      });

      marker.bindPopup(peerPopupHtml(m, false), {
        maxWidth: 300,
        className: "lumen-map-popup",
        autoPan: true,
        closeButton: true,
        autoClose: true,
      });

      marker.on("click", () => {
        onSelect(m);
      });

      group.addLayer(marker);
    }

    map.addLayer(group);

    return () => {
      try {
        map.removeLayer(group);
        group.clearLayers();
      } catch {
        /* map already unmounted */
      }
    };
  }, [map, markers, boomIps, onSelect]);

  return null;
}

/** Center node pin — outside cluster, always on top, with permanent label + popup */
function MeMarkerLayer({
  me,
  onSelect,
  roleLabel = "LUMEN NODE",
}: {
  me: PeerMapMarker;
  onSelect: (m: PeerMapMarker) => void;
  /** Permanent map label: LUMEN NODE | MY NODE */
  roleLabel?: string;
}) {
  const map = useMap();

  useEffect(() => {
    const marker = L.marker([me.lat, me.lon], {
      icon: ME_ICON,
      zIndexOffset: 10000,
      riseOnHover: true,
      keyboard: true,
      title: roleLabel,
    });

    marker.bindTooltip(roleLabel, {
      permanent: true,
      direction: "top",
      offset: [0, -16],
      opacity: 1,
      className: "lumen-map-tooltip",
    });

    marker.bindPopup(
      peerPopupHtml({ ...me, state: "connected" }, true, roleLabel),
      {
        maxWidth: 300,
        className: "lumen-map-popup",
        autoPan: true,
        closeButton: true,
      }
    );

    marker.on("click", () => {
      onSelect(me);
    });

    marker.addTo(map);

    return () => {
      try {
        map.removeLayer(marker);
      } catch {
        /* ignore */
      }
    };
  }, [map, me, onSelect, roleLabel]);

  return null;
}

/** Bitnodes-style cluster bubbles — size & hue by child count */
function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  let size = 36;
  let bg = "rgba(0, 229, 255, 0.22)";
  let border = "rgba(0, 229, 255, 0.85)";
  let text = "#00E5FF";
  let glow = "0 0 16px rgba(0, 229, 255, 0.35)";

  if (count >= 50) {
    size = 54;
    bg = "rgba(255, 122, 61, 0.28)";
    border = "rgba(255, 122, 61, 0.95)";
    text = "#FF7A3D";
    glow = "0 0 22px rgba(255, 122, 61, 0.45)";
  } else if (count >= 15) {
    size = 44;
    bg = "rgba(0, 200, 230, 0.24)";
    border = "rgba(0, 210, 240, 0.9)";
    text = "#5EEBFF";
    glow = "0 0 18px rgba(0, 210, 240, 0.4)";
  }

  return L.divIcon({
    html: `<div class="lumen-cluster-bubble" style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:${bg};
      border:2px solid ${border};
      box-shadow:${glow}, inset 0 0 12px rgba(255,255,255,0.06);
      color:${text};
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      font-size:${count >= 100 ? 11 : 13}px;
      font-weight:700;
      letter-spacing:-0.02em;
      backdrop-filter:blur(6px);
    "><span>${count}</span></div>`,
    className: "lumen-cluster-icon",
    iconSize: L.point(size, size),
    iconAnchor: L.point(size / 2, size / 2),
  });
}

const ME_ICON = meDivIcon();
const EMPTY_MARKERS: PeerMapMarker[] = [];

type PeerMapMarker = {
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
  state?: PeerMapState;
  source?: string;
};

type PeerLink = {
  toIp: string;
  toLat: number;
  toLon: number;
  connectionType: string;
  lastMessage: number;
  name: string;
};

type MapPayload = {
  markers: PeerMapMarker[];
  me: PeerMapMarker | null;
  links?: PeerLink[];
  totalPeers: number;
  mapped: number;
  networkTotal?: number;
  networkMapped?: number;
  connectedMapped?: number;
  liveMapped?: number;
  reachableMapped?: number;
  seenMapped?: number;
  ghostMapped?: number;
  unmapped: number;
  countries: Record<string, number>;
  catalogUpdatedAt?: number | null;
  generatedAt: number;
};

type BoomEvent = {
  id: string;
  /** Visual epicenter only (map center / you) — NOT the miner location */
  lat: number;
  lon: number;
  height: number;
  /** Honest miner from Explorer — never a peer name */
  minerLabel: string;
  minerShort: string;
  minerAddress?: string;
  blockId?: string;
  createdAt: number;
};

type PeerMapProps = {
  /** Current full height from parent poll — drives NEW BLOCK detection */
  blockHeight?: number;
  /** Hide floating Boom/Refresh while a parent modal is open */
  hideControls?: boolean;
  /** When "my", map peers come from Bridge (user node) */
  nodeMode?: "lumen" | "my";
  bridgeToken?: string;
};

function peerLastMs(lm?: number) {
  if (!lm) return 0;
  return lm > 1e12 ? lm : lm * 1000;
}

function isActive(lm: number) {
  return Date.now() - peerLastMs(lm) < 180_000;
}

const MAP_MIN_ZOOM = 1.5;
const MAP_MAX_ZOOM = 12;
/** Fallback zoom if we only know YOU / Europe */
const DEFAULT_ZOOM = 2.2;
/** Cap so a tight peer cluster doesn't zoom in too hard on refresh */
const FIT_MAX_ZOOM = 4.25;
/** Fallback when Your Node geo is unknown */
const EUROPE_CENTER: [number, number] = [48.5, 15];


/**
 * Build LatLngBounds from me + markers, ignoring broken coords.
 * Prefer LINKED + LIVE for a tighter “active network” frame; if too few,
 * fall back to all known markers so the full catalog is in view.
 */
function boundsForMapView(
  me: { lat: number; lon: number } | null | undefined,
  markers: PeerMapMarker[]
): L.LatLngBounds | null {
  const pts: L.LatLngExpression[] = [];
  const push = (lat?: number, lon?: number) => {
    if (
      lat == null ||
      lon == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 85 ||
      Math.abs(lon) > 180
    ) {
      return;
    }
    pts.push([lat, lon]);
  };

  if (me) push(me.lat, me.lon);

  const linkedOrLive = markers.filter((m) => {
    const s = normalizeState(m.state);
    return s === "connected" || s === "live";
  });
  const pool =
    linkedOrLive.length >= 3 ? linkedOrLive : markers.length ? markers : [];

  for (const m of pool) push(m.lat, m.lon);

  // Always include YOU even if pool was empty of others
  if (pts.length === 0 && me) push(me.lat, me.lon);
  if (pts.length === 0) return null;
  if (pts.length === 1) {
    const [lat, lon] = pts[0] as [number, number];
    // Tiny pad so fitBounds still works with one point
    return L.latLngBounds(
      [lat - 12, lon - 24],
      [lat + 12, lon + 24]
    );
  }
  return L.latLngBounds(pts);
}

/**
 * Default / Refresh camera: fit the active network (or all known nodes)
 * into the visible canvas with HUD padding — not just center on YOU.
 */
function DefaultView({
  me,
  markers,
  viewToken,
}: {
  me: { lat: number; lon: number } | null | undefined;
  markers: PeerMapMarker[];
  /** Bump to re-apply (Refresh). 0 = initial. */
  viewToken: number;
}) {
  const map = useMap();
  const initialDone = useRef(false);
  /** True once we fitted with at least one network marker (not only YOU). */
  const fittedWithMarkers = useRef(false);
  const lastToken = useRef(0);

  useEffect(() => {
    const forced = viewToken > 0 && viewToken !== lastToken.current;
    const hasMarkers = markers.length > 0;

    // Still loading — wait for me or markers before first frame
    if (!initialDone.current && !hasMarkers && !me) return;

    // After first frame: only re-fit on Refresh, or one upgrade when markers arrive
    if (initialDone.current && !forced) {
      if (!(hasMarkers && !fittedWithMarkers.current)) return;
    }

    const apply = () => {
      map.invalidateSize({ animate: false });
      const bounds = boundsForMapView(me, markers);
      const size = map.getSize();
      // HUD: top chips / buttons, bottom legend — keep nodes inside safe area
      const padTop = Math.max(64, Math.round(size.y * 0.12));
      const padBottom = Math.max(88, Math.round(size.y * 0.16));
      const padX = Math.max(32, Math.round(size.x * 0.07));

      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, {
          paddingTopLeft: L.point(padX, padTop),
          paddingBottomRight: L.point(padX, padBottom),
          maxZoom: FIT_MAX_ZOOM,
          animate: forced,
          duration: forced ? 0.55 : 0,
        });
        if (map.getZoom() < MAP_MIN_ZOOM) {
          map.setZoom(MAP_MIN_ZOOM, { animate: false });
        }
      } else {
        const center: [number, number] =
          me && Number.isFinite(me.lat) && Number.isFinite(me.lon)
            ? [me.lat, me.lon]
            : EUROPE_CENTER;
        map.setView(center, DEFAULT_ZOOM, {
          animate: forced,
          duration: forced ? 0.45 : 0,
        });
      }

      requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
      });
    };

    apply();
    const t = window.setTimeout(apply, forced ? 40 : 100);

    initialDone.current = true;
    if (hasMarkers) fittedWithMarkers.current = true;
    lastToken.current = viewToken;

    return () => window.clearTimeout(t);
  }, [map, me, markers, viewToken]);

  return null;
}

/** Keep leaflet size in sync with the lumen-viz container */
function MapResizeGuard() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const run = () => {
      map.invalidateSize({ animate: false });
    };

    run();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => run())
        : null;
    ro?.observe(container);
    window.addEventListener("resize", run);
    // Late layout (fonts / sticky header)
    const t1 = window.setTimeout(run, 120);
    const t2 = window.setTimeout(run, 400);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", run);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map]);

  return null;
}

/**
 * Animated signal arcs: YOU → each currently connected peer.
 *
 * Smoothness rules (same as Leaflet.SVG / Path):
 * - Geometry lives in the map pane → CSS transform owns pan/zoom animation.
 * - Never reproject while `map._animatingZoom` (that double-transforms and jitters).
 * - Packets use *cached* SVG endpoints from the last reproject, not live
 *   latLngToContainerPoint every frame.
 */
function SignalLinesLayer({
  me,
  links,
  linksKey,
}: {
  me: PeerMapMarker | null | undefined;
  links: PeerLink[];
  linksKey: string;
}) {
  const map = useMap();
  const linksRef = useRef(links);
  linksRef.current = links;

  useEffect(() => {
    const meNode = me;
    const linkList = linksRef.current;
    if (!meNode || !linkList.length) return;

    let pane = map.getPane("lumenSignals");
    if (!pane) {
      pane = map.createPane("lumenSignals");
    }
    pane.style.zIndex = "550";
    pane.style.pointerEvents = "none";

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("class", "lumen-signal-svg");
    svgEl.style.position = "absolute";
    svgEl.style.left = "0";
    svgEl.style.top = "0";
    svgEl.style.overflow = "visible";
    svgEl.style.pointerEvents = "none";
    // Keep stroke width stable while the pane is CSS-scaled mid-zoom
    svgEl.style.vectorEffect = "non-scaling-stroke";
    pane.appendChild(svgEl);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "lumen-signal-layer");
    svgEl.appendChild(g);

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const filterId = `lumen-signal-glow-${Date.now().toString(36)}`;
    defs.innerHTML = `
      <filter id="${filterId}" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="1.1" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    g.appendChild(defs);

    type Drawn = {
      pathGlow: SVGPathElement;
      pathCore: SVGPathElement;
      packet: SVGCircleElement;
      toLat: number;
      toLon: number;
      phase: number;
      speed: number;
      /** Cached SVG-local endpoints from last reproject */
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
    const drawn: Drawn[] = [];

    for (let i = 0; i < linkList.length; i++) {
      const link = linkList[i];
      const pathGlow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      pathGlow.setAttribute("fill", "none");
      pathGlow.setAttribute("stroke", "rgba(0,229,255,0.10)");
      pathGlow.setAttribute("stroke-width", "1.6");
      pathGlow.setAttribute("stroke-linecap", "round");
      pathGlow.setAttribute("vector-effect", "non-scaling-stroke");
      pathGlow.setAttribute("filter", `url(#${filterId})`);
      pathGlow.setAttribute("class", "lumen-signal-glow");

      const pathCore = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      pathCore.setAttribute("fill", "none");
      pathCore.setAttribute("stroke", "rgba(0,229,255,0.32)");
      pathCore.setAttribute("stroke-width", "0.7");
      pathCore.setAttribute("stroke-linecap", "round");
      pathCore.setAttribute("vector-effect", "non-scaling-stroke");
      pathCore.setAttribute("class", "lumen-signal-core");
      pathCore.style.strokeDasharray = "3 11";
      pathCore.style.animation = `lumen-signal-dash ${3.2 + (i % 5) * 0.2}s linear infinite`;

      const packet = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      packet.setAttribute("r", "1.6");
      packet.setAttribute("fill", "rgba(224,251,255,0.75)");
      packet.setAttribute("stroke", "rgba(0,229,255,0.35)");
      packet.setAttribute("stroke-width", "0.5");
      packet.setAttribute("vector-effect", "non-scaling-stroke");
      packet.setAttribute(
        "style",
        "filter:drop-shadow(0 0 2.5px rgba(0,229,255,0.55))"
      );
      packet.setAttribute("class", "lumen-signal-packet");

      g.appendChild(pathGlow);
      g.appendChild(pathCore);
      g.appendChild(packet);

      drawn.push({
        pathGlow,
        pathCore,
        packet,
        toLat: link.toLat,
        toLon: link.toLon,
        phase: (i * 0.17) % 1,
        speed: 0.14 + (i % 7) * 0.01,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
      });
    }

    const curveGeom = (x1: number, y1: number, x2: number, y2: number) => {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      // Arc bulge in *screen-ish* px; clamp so zoom-out stays subtle
      const offset = Math.min(48, Math.max(10, len * 0.1));
      const cx = mx - (dy / len) * offset;
      const cy = my + (dx / len) * offset;
      return {
        d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
        cx,
        cy,
      };
    };

    const pointOnQuad = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      t: number
    ): { x: number; y: number } => {
      const { cx, cy } = curveGeom(x1, y1, x2, y2);
      const u = 1 - t;
      return {
        x: u * u * x1 + 2 * u * t * cx + t * t * x2,
        y: u * u * y1 + 2 * u * t * cy + t * t * y2,
      };
    };

    const isZoomAnimating = () =>
      Boolean((map as unknown as { _animatingZoom?: boolean })._animatingZoom);

    /**
     * Same strategy as L.SVG._update:
     * pin container to layer top-left of viewport; paths in local (container) space.
     * Skip entirely while Leaflet is CSS-scaling the map pane for zoom.
     */
    const reproject = () => {
      if (isZoomAnimating()) return;

      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(svgEl as unknown as HTMLElement, topLeft);
      svgEl.setAttribute("width", String(size.x));
      svgEl.setAttribute("height", String(size.y));
      svgEl.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);

      // layer − topLeft ≡ container point (stable when not mid-zoom-anim)
      const meLayer = map.latLngToLayerPoint([meNode.lat, meNode.lon]);
      const ox = meLayer.x - topLeft.x;
      const oy = meLayer.y - topLeft.y;

      for (const d of drawn) {
        const dest = map.latLngToLayerPoint([d.toLat, d.toLon]);
        const x2 = dest.x - topLeft.x;
        const y2 = dest.y - topLeft.y;
        d.x1 = ox;
        d.y1 = oy;
        d.x2 = x2;
        d.y2 = y2;
        const { d: pathD } = curveGeom(ox, oy, x2, y2);
        d.pathGlow.setAttribute("d", pathD);
        d.pathCore.setAttribute("d", pathD);
      }
    };

    /** Pan without zoom: only re-pin SVG origin (cheap); skip mid zoom-anim. */
    const onMove = () => {
      if (isZoomAnimating()) return;
      reproject();
    };

    const onZoomEnd = () => {
      // After CSS zoom transform resets, reproject at the new scale once
      reproject();
    };

    let raf = 0;
    let last = performance.now();
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Freeze packets during zoom anim — pane CSS transform moves them with lines
      if (!reduceMotion && !isZoomAnimating()) {
        for (const d of drawn) {
          d.phase = (d.phase + d.speed * dt) % 1;
          const p = pointOnQuad(d.x1, d.y1, d.x2, d.y2, d.phase);
          d.packet.setAttribute("cx", String(p.x));
          d.packet.setAttribute("cy", String(p.y));
          const edge = Math.min(d.phase, 1 - d.phase);
          const op = edge < 0.08 ? edge / 0.08 : 1;
          d.packet.setAttribute("opacity", String(0.25 + 0.5 * op));
        }
      }
      raf = requestAnimationFrame(tick);
    };

    reproject();
    // Do NOT listen to "zoom" — that fights Leaflet's animated CSS transform.
    map.on("move", onMove);
    map.on("moveend", reproject);
    map.on("zoomend", onZoomEnd);
    map.on("viewreset", reproject);
    map.on("resize", reproject);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      map.off("move", onMove);
      map.off("moveend", reproject);
      map.off("zoomend", onZoomEnd);
      map.off("viewreset", reproject);
      map.off("resize", reproject);
      try {
        svgEl.remove();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- linksKey captures links geometry
  }, [map, me?.lat, me?.lon, me?.ip, linksKey]);

  return null;
}

/** One pulse wave = ~1.25s; 3 waves; toast flies for same window */
const BOOM_PULSE_SEC = 1.25;
const BOOM_PULSE_COUNT = 3;
const BOOM_TOTAL_MS = Math.round(BOOM_PULSE_SEC * BOOM_PULSE_COUNT * 1000); // 3750
const BOOM_FLIGHT_SEC = BOOM_PULSE_SEC * BOOM_PULSE_COUNT - 0.35; // travel while pulsing

/**
 * Boom choreography (honest — no peer-as-miner):
 * 1) Notice at top with Explorer miner attribution
 * 2) Decorative pulse at map center (or optional visual pin) — not "the miner"
 * 3) Notice drifts toward the pulse and fades
 */
function BoomLabel({ boom, onDone }: { boom: BoomEvent; onDone: () => void }) {
  const map = useMap();
  const [xy, setXy] = useState<{ x: number; y: number } | null>(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      const p = map.latLngToContainerPoint([boom.lat, boom.lon]);
      const size = map.getSize();
      setXy({ x: p.x, y: p.y });
      setMapSize({ w: size.x, h: size.y });
    };
    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("moveend", update);
    map.on("resize", update);
    const t = setTimeout(onDone, BOOM_TOTAL_MS + 200);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("moveend", update);
      map.off("resize", update);
      clearTimeout(t);
    };
  }, [map, boom, onDone]);

  const minerLine = `${boom.minerLabel} · ${boom.minerShort}`;
  const startX = mapSize.w > 0 ? mapSize.w / 2 : 0;
  const startY = 18;
  const endX = xy?.x ?? startX;
  const endY = xy?.y ?? startY + 80;

  return (
    <>
      {/* Decorative pulse — visual only, not miner geolocation */}
      {xy && (
        <div
          className="pointer-events-none absolute z-[700]"
          style={{
            left: xy.x,
            top: xy.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          {Array.from({ length: BOOM_PULSE_COUNT }, (_, wave) => (
            <div key={wave} className="lumen-boom-wave" aria-hidden>
              <div
                className="lumen-boom-ring lumen-boom-ring-1"
                style={{
                  animationDelay: `${wave * BOOM_PULSE_SEC}s`,
                }}
              />
              <div
                className="lumen-boom-ring lumen-boom-ring-2"
                style={{
                  animationDelay: `${wave * BOOM_PULSE_SEC + 0.16}s`,
                }}
              />
              <div
                className="lumen-boom-ring lumen-boom-ring-3"
                style={{
                  animationDelay: `${wave * BOOM_PULSE_SEC + 0.32}s`,
                }}
              />
            </div>
          ))}
          <div
            className="lumen-boom-core"
            style={{
              animationDuration: `${BOOM_TOTAL_MS}ms`,
            }}
          />
        </div>
      )}

      {mapSize.w > 0 && xy && (
        <motion.div
          className="lumen-boom-flight pointer-events-none absolute z-[720]"
          initial={{
            left: startX,
            top: startY,
            x: "-50%",
            y: 0,
            opacity: 0,
            scale: 0.94,
          }}
          animate={{
            left: endX,
            top: endY,
            x: "-50%",
            y: "-50%",
            opacity: [0, 1, 1, 1, 0],
            scale: [0.94, 1, 1, 0.96, 0.9],
          }}
          transition={{
            left: {
              duration: BOOM_FLIGHT_SEC,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.2,
            },
            top: {
              duration: BOOM_FLIGHT_SEC,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.2,
            },
            x: { duration: 0 },
            y: {
              duration: BOOM_FLIGHT_SEC,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.2,
            },
            opacity: {
              duration: BOOM_TOTAL_MS / 1000,
              times: [0, 0.06, 0.72, 0.88, 1],
              ease: "easeInOut",
            },
            scale: {
              duration: BOOM_TOTAL_MS / 1000,
              times: [0, 0.08, 0.7, 0.9, 1],
              ease: "easeOut",
            },
          }}
        >
          <div className="lumen-boom-notice">
            <div className="text-[9px] font-mono tracking-[0.28em] text-[#00E5FF]/95">
              NEW BLOCK
            </div>
            <div className="mt-0.5 font-mono text-lg sm:text-xl tabular-nums tracking-tight text-white font-semibold">
              #{boom.height.toLocaleString()}
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] font-mono text-[#A0A0B0] max-w-[220px] truncate text-center">
              <span className="text-[#FF7A3D]">{minerLine}</span>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}

function BoomLayer({
  booms,
  onDone,
}: {
  booms: BoomEvent[];
  onDone: (id: string) => void;
}) {
  return <BoomLabelsHost booms={booms} onDone={onDone} />;
}

function BoomLabelsHost({
  booms,
  onDone,
}: {
  booms: BoomEvent[];
  onDone: (id: string) => void;
}) {
  return (
    <>
      {booms.map((b) => (
        <BoomLabelPortal
          key={`lbl-${b.id}`}
          boom={b}
          onDone={() => onDone(b.id)}
        />
      ))}
    </>
  );
}

function BoomLabelPortal({
  boom,
  onDone,
}: {
  boom: BoomEvent;
  onDone: () => void;
}) {
  const map = useMap();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = map.getContainer();
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
    setHost(el);
  }, [map]);

  if (!host) return null;

  return createPortal(<BoomLabel boom={boom} onDone={onDone} />, host);
}

export default function PeerMap({
  blockHeight = 0,
  hideControls = false,
  nodeMode = "lumen",
  bridgeToken = "",
}: PeerMapProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["peer-map", nodeMode, bridgeToken || ""],
    queryFn: async (): Promise<MapPayload> => {
      const headers: Record<string, string> = { Accept: "application/json" };
      let url = "/api/peers/map";
      if (nodeMode === "my" && bridgeToken) {
        headers["X-Lumen-Bridge-Token"] = bridgeToken;
        url = `/api/peers/map?token=${encodeURIComponent(bridgeToken)}`;
      }
      const res = await fetch(url, {
        signal: AbortSignal.timeout(nodeMode === "my" ? 16000 : 12000),
        headers,
        cache: "no-store",
      });
      if (!res.ok) throw new Error("map api failed");
      return res.json();
    },
    enabled: nodeMode === "lumen" || !!bridgeToken,
    refetchInterval: 12000,
  });

  const [selected, setSelected] = useState<PeerMapMarker | null>(null);
  const [booms, setBooms] = useState<BoomEvent[]>([]);
  /** Increment on Refresh to re-apply default setView */
  const [viewToken, setViewToken] = useState(0);
  /**
   * Map display filter:
   * - live (default Lumen): Connected + Live
   * - connected: only peers linked to the active node
   * - all: + Seen (Ghost still hidden)
   */
  const [mapFilter, setMapFilter] = useState<MapFilter>(
    nodeMode === "my" ? "connected" : "live"
  );
  const lastHeightRef = useRef<number>(0);
  const bootstrapped = useRef(false);

  // Reset sensible default when switching Lumen / My Node
  useEffect(() => {
    setMapFilter(nodeMode === "my" ? "connected" : "live");
  }, [nodeMode]);

  /** Refresh peer geo + reset camera to default framed view */
  const handleRefresh = useCallback(async () => {
    try {
      await refetch();
    } finally {
      requestAnimationFrame(() => {
        setViewToken((t) => t + 1);
      });
    }
  }, [refetch]);

  const topCountries = useMemo(() => {
    if (!data?.countries) return [];
    return Object.entries(data.countries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [data]);

  /** No peer-IP boom highlight — miner is not a map pin */
  const boomIps = useMemo(() => new Set<string>(), []);

  const handleSelectPeer = useCallback((m: PeerMapMarker) => {
    setSelected(m);
  }, []);

  const allMarkers = data?.markers ?? EMPTY_MARKERS;

  /** Apply elegant status filters (Ghost never shown). */
  const peerMarkers = useMemo(() => {
    return allMarkers.filter((m) => {
      const s = normalizeState(m.state);
      if (s === "ghost") return false;
      if (mapFilter === "connected") return s === "connected";
      if (mapFilter === "live") return s === "connected" || s === "live";
      // all: connected + live + seen
      return s === "connected" || s === "live" || s === "seen";
    });
  }, [allMarkers, mapFilter]);

  const signalLinks = useMemo(() => data?.links ?? [], [data?.links]);
  // Stable identity: IPs only (coords can jitter slightly; geometry updates via redraw)
  const signalLinksKey = useMemo(
    () =>
      signalLinks
        .map((l) => l.toIp)
        .sort()
        .join("|"),
    [signalLinks]
  );

  /** Counts from full catalog (not just filtered view) */
  const mapStats = useMemo(() => {
    const markers = allMarkers;
    let connected = 0;
    let live = 0;
    let seen = 0;
    let ghost = 0;
    for (const m of markers) {
      const s = normalizeState(m.state);
      if (s === "connected") connected++;
      else if (s === "live") live++;
      else if (s === "seen") seen++;
      else ghost++;
    }
    // Prefer API counts when present
    connected = data?.connectedMapped ?? connected;
    live = data?.liveMapped ?? data?.reachableMapped ?? live;
    seen = data?.seenMapped ?? seen;
    ghost = data?.ghostMapped ?? ghost;
    const onMap = connected + live + seen; // default visible pool
    const catalogTotal = data?.networkMapped ?? data?.mapped ?? markers.length;
    return {
      catalogTotal,
      onMap,
      connected,
      live,
      seen,
      ghost,
      showing: peerMarkers.length,
      myPeers: connected,
      online: connected + live,
    };
  }, [allMarkers, data, peerMarkers.length]);

  /**
   * Visual epicenter for boom pulses — map "you" pin if known, else geometric
   * center of markers. Never implies this peer mined the block.
   */
  const visualBoomCenter = useCallback((): { lat: number; lon: number } => {
    if (data?.me && Number.isFinite(data.me.lat) && Number.isFinite(data.me.lon)) {
      return { lat: data.me.lat, lon: data.me.lon };
    }
    // Fallback: Ergo-ish default view center
    return { lat: 30, lon: 20 };
  }, [data?.me]);

  const fireBoom = useCallback(
    async (height: number) => {
      const epicenter = visualBoomCenter();
      // Optimistic boom; fill miner when Explorer answers
      const id = `${height}-${Date.now()}`;
      const pending: BoomEvent = {
        id,
        lat: epicenter.lat,
        lon: epicenter.lon,
        height,
        minerLabel: "…",
        minerShort: "fetching",
        createdAt: Date.now(),
      };
      setBooms((prev) => [...prev.slice(-1), pending]);

      try {
        const miner = await fetchBlockMinerByHeight(height);
        if (miner) {
          setBooms((prev) =>
            prev.map((b) =>
              b.id === id
                ? {
                    ...b,
                    minerLabel: miner.label,
                    minerShort: miner.short,
                    minerAddress: miner.address,
                    blockId: miner.blockId,
                  }
                : b
            )
          );
          // Toast is fired from the dashboard (page) so it also shows in 3D view
        } else {
          setBooms((prev) =>
            prev.map((b) =>
              b.id === id
                ? { ...b, minerLabel: "Unknown", minerShort: "—" }
                : b
            )
          );
        }
      } catch {
        setBooms((prev) =>
          prev.map((b) =>
            b.id === id
              ? { ...b, minerLabel: "Unknown", minerShort: "—" }
              : b
          )
        );
      }
    },
    [visualBoomCenter]
  );

  // Detect new blocks from parent height
  useEffect(() => {
    if (!blockHeight || blockHeight <= 0) return;
    if (!bootstrapped.current) {
      lastHeightRef.current = blockHeight;
      bootstrapped.current = true;
      return;
    }
    if (blockHeight > lastHeightRef.current) {
      lastHeightRef.current = blockHeight;
      void fireBoom(blockHeight);
      setTimeout(() => refetch(), 800);
    } else if (blockHeight < lastHeightRef.current) {
      lastHeightRef.current = blockHeight;
    }
  }, [blockHeight, fireBoom, refetch]);

  const dismissBoom = useCallback((id: string) => {
    setBooms((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const simulateBoom = () => {
    const h = blockHeight || lastHeightRef.current || 0;
    void fireBoom(h || Date.now() % 1_000_000);
  };

  const topRegionsBlock =
    topCountries.length > 0 ? (
      <div className="glass rounded-2xl px-3 sm:px-4 py-3 border border-white/10">
        <div className="text-[10px] font-mono tracking-[2px] text-[#A0A0B0] mb-2">
          TOP REGIONS
        </div>
        <div className="flex flex-wrap gap-1.5">
          {topCountries.map(([cc, n]) => (
            <span
              key={cc}
              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono"
            >
              <span className="text-[#00E5FF]">{cc}</span>{" "}
              <span className="text-[#A0A0B0]">{n}</span>
            </span>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="w-full">
    <div className="canvas-container lumen-viz relative w-full bg-[#050508] overflow-hidden">
      <div className="absolute inset-0 z-[1]">
        {!isLoading && !isError && (
          <MapContainer
            center={
              data?.me
                ? [data.me.lat, data.me.lon]
                : EUROPE_CENTER
            }
            zoom={DEFAULT_ZOOM}
            minZoom={MAP_MIN_ZOOM}
            maxZoom={MAP_MAX_ZOOM}
            zoomSnap={0.25}
            zoomDelta={0.5}
            zoomAnimation={true}
            markerZoomAnimation={true}
            fadeAnimation={true}
            className="h-full w-full lumen-map"
            style={{
              background: "#0A0A0F",
              height: "100%",
              width: "100%",
              zIndex: 1,
            }}
            zoomControl={true}
            attributionControl={true}
            worldCopyJump={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={MAP_MAX_ZOOM}
            />
            <MapResizeGuard />
            <DefaultView
              me={data?.me}
              markers={peerMarkers}
              viewToken={viewToken}
            />

            {/* YOU → connected peers: thin arcs + flying signal packets */}
            <SignalLinesLayer
              me={data?.me}
              links={signalLinks}
              linksKey={signalLinksKey}
            />

            {/* Native Leaflet cluster + bindPopup/bindTooltip (reliable) */}
            <ClusteredPeersLayer
              markers={peerMarkers}
              boomIps={boomIps}
              onSelect={handleSelectPeer}
            />

            {data?.me && (
              <MeMarkerLayer
                me={data.me}
                onSelect={handleSelectPeer}
                roleLabel={nodeMode === "my" ? "MY NODE" : "LUMEN NODE"}
              />
            )}

            {/* Boom: 3 pulses on peer + flying notice top→peer */}
            <BoomLayer booms={booms} onDone={dismissBoom} />
          </MapContainer>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-[#A0A0B0] font-mono text-xs tracking-[3px]">
            MAPPING NETWORK…
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center text-[#EF4444] font-mono text-xs tracking-[2px]">
            MAP DATA UNAVAILABLE
          </div>
        )}
      </div>

      {/* ── Mobile (< md): only Simulate (left) + Refresh (right) on the map ── */}
      {!hideControls && (
        <div className="md:hidden absolute top-0 inset-x-0 z-[40] flex items-start justify-between gap-2 pointer-events-none p-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={simulateBoom}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono tracking-wider border border-[#FF7A3D]/50 bg-[#0A0A0F]/90 text-[#FF7A3D] shadow-lg backdrop-blur-md active:scale-[0.97]"
          >
            <Zap className="w-3.5 h-3.5" /> BOOM
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono tracking-wider border border-white/20 bg-[#0A0A0F]/90 text-[#E8E8F0] shadow-lg backdrop-blur-md active:scale-[0.97]"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            REFRESH
          </button>
        </div>
      )}

      {/* ── Desktop: full HUD on map ── */}
      <div className="hidden md:flex absolute top-4 left-4 right-4 z-[40] flex-wrap items-start justify-between gap-3 pointer-events-none">
        <div className="glass rounded-2xl px-4 py-3.5 border border-white/10 pointer-events-auto max-w-[320px]">
          <div className="flex items-center gap-2 text-[#FF7A3D] font-mono text-[10px] tracking-[3px] mb-2.5">
            <Globe2 className="w-3.5 h-3.5" /> ERGO NETWORK MAP
          </div>

          {/* Lumen: status filters · My Node: only connected peers — no filter chrome */}
          {nodeMode === "lumen" ? (
            <div className="flex p-0.5 rounded-xl bg-black/40 border border-white/10 mb-3">
              {(
                [
                  { id: "live" as const, label: "Live" },
                  { id: "connected" as const, label: "Linked" },
                  { id: "all" as const, label: "All" },
                ] as const
              ).map((f) => {
                const active = mapFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMapFilter(f.id)}
                    className={`flex-1 px-2 py-1.5 rounded-[10px] text-[10px] font-mono tracking-widest transition-all ${
                      active
                        ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                        : "text-[#A0A0B0] hover:text-[#E8E8F0]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mb-3 rounded-xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.06] px-3 py-2.5">
              <div className="font-mono text-[11px] tracking-wide text-[#E8E8F0] leading-snug">
                <span className="text-[#00E5FF] tabular-nums font-semibold">
                  {mapStats.connected.toLocaleString()}
                </span>
                {mapStats.connected === 1
                  ? " peer connected to your node"
                  : " peers connected to your node"}
              </div>
            </div>
          )}

          {/* Numbers */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">
            <div>
              <div className="font-mono text-xl tabular-nums text-white leading-none">
                {mapStats.showing}
              </div>
              <div className="text-[10px] text-[#A0A0B0] mt-0.5">showing</div>
            </div>
            <div>
              <div className="font-mono text-xl tabular-nums text-[#00E5FF] leading-none">
                {mapStats.connected}
              </div>
              <div className="text-[10px] text-[#A0A0B0] mt-0.5">connected</div>
            </div>
            <div>
              <div className="font-mono text-xl tabular-nums text-[#38BDF8] leading-none">
                {mapStats.live}
              </div>
              <div className="text-[10px] text-[#A0A0B0] mt-0.5">live</div>
            </div>
            <div>
              <div className="font-mono text-xl tabular-nums text-[#94A3B8] leading-none">
                {mapStats.seen}
              </div>
              <div className="text-[10px] text-[#A0A0B0] mt-0.5">seen</div>
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-white/10 pt-2.5 space-y-1.5 text-[11px] leading-snug">
            <div className="flex items-start gap-2">
              <span className="mt-1 w-2 h-2 rounded-full bg-[#FF7A3D] shrink-0 shadow-[0_0_6px_rgba(255,122,61,0.7)]" />
              <span>
                <span className="text-white font-medium">
                  {nodeMode === "my" ? "My Node" : "Lumen Node"}
                </span>
                <span className="text-[#A0A0B0]">
                  {nodeMode === "my" ? " — via Bridge" : " — center"}
                </span>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 w-2 h-2 rounded-full bg-[#00E5FF] shrink-0 shadow-[0_0_6px_rgba(0,229,255,0.7)]" />
              <span>
                <span className="text-white font-medium">Connected</span>
                <span className="text-[#A0A0B0]"> — linked to you</span>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 w-2 h-2 rounded-full bg-[#38BDF8] shrink-0 shadow-[0_0_4px_rgba(56,189,248,0.5)]" />
              <span>
                <span className="text-white font-medium">Live</span>
                <span className="text-[#A0A0B0]"> — answering now</span>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 w-2 h-2 rounded-full bg-[#64748B] shrink-0" />
              <span>
                <span className="text-white font-medium">Seen</span>
                <span className="text-[#A0A0B0]"> — recent, quiet</span>
              </span>
            </div>
          </div>
        </div>

        {!hideControls && (
          <div className="flex flex-col gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="glass px-4 py-2 rounded-xl text-xs font-mono tracking-widest border border-white/10 hover:border-[#FF7A3D]/40 flex items-center gap-2"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              REFRESH
            </button>
            <button
              type="button"
              onClick={simulateBoom}
              className="glass px-4 py-2 rounded-xl text-xs font-mono tracking-widest border border-[#FF7A3D]/35 bg-[#FF7A3D]/10 hover:bg-[#FF7A3D]/20 text-[#FF7A3D] flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5" /> SIMULATE BOOM
            </button>
          </div>
        )}
      </div>

      {/* Top Regions: desktop overlay bottom-left */}
      {topRegionsBlock && (
        <div className="hidden md:block absolute bottom-4 left-4 z-[40] max-w-[280px]">
          {topRegionsBlock}
        </div>
      )}

      {/* Selected peer: desktop overlay only (mobile renders below map) */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="hidden md:block absolute bottom-4 right-4 z-[40] glass rounded-2xl px-5 py-4 border border-white/10 min-w-[220px] max-w-[300px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className="font-mono text-[10px] tracking-[2px] mb-1 flex items-center gap-1"
                  style={{
                    color:
                      selected.id === "me"
                        ? "#FF7A3D"
                        : stateMeta(normalizeState(selected.state)).color,
                  }}
                >
                  <MapPin className="w-3 h-3" />{" "}
                  {selected.id === "me"
                    ? nodeMode === "my"
                      ? "MY NODE"
                      : "LUMEN NODE"
                    : stateMeta(normalizeState(selected.state)).short}
                </div>
                <div className="font-semibold text-sm break-all">
                  {selected.name}
                </div>
                <div className="font-mono text-xs text-[#A0A0B0] mt-1 break-all">
                  {selected.ip}
                  {selected.port ? `:${selected.port}` : ""}
                </div>
                <div className="text-xs mt-2">
                  {[selected.city, selected.country]
                    .filter(Boolean)
                    .join(", ") || "Unknown location"}
                </div>
                <div className="text-[10px] font-mono text-[#A0A0B0] mt-1">
                  {selected.id !== "me" && (
                    <>
                      {(() => {
                        const s = normalizeState(selected.state);
                        if (s === "connected")
                          return (
                            <span className="text-[#00E5FF]">
                              Connected · linked to you
                            </span>
                          );
                        if (s === "live")
                          return (
                            <span className="text-[#38BDF8]">
                              Live · answering now
                            </span>
                          );
                        if (s === "seen")
                          return (
                            <span className="text-[#94A3B8]">
                              Seen · not answering
                            </span>
                          );
                        return (
                          <span className="text-[#64748B]">Ghost · stale</span>
                        );
                      })()}
                      {selected.connectionType
                        ? ` · ${selected.connectionType}`
                        : ""}
                    </>
                  )}
                  {selected.id === "me" && (
                    <span className="text-[#FF7A3D]">
                      {nodeMode === "my"
                        ? "Active source · via Lumen Bridge"
                        : "Active source · this Lumen server"}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[#A0A0B0] hover:text-white text-xs font-mono"
              >
                CLOSE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact color key */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[40] glass rounded-2xl px-4 py-2 text-[10px] font-mono tracking-wider border border-white/10 hidden md:flex items-center gap-3.5 text-[#A0A0B0]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF7A3D]" />{" "}
          {nodeMode === "my" ? "My Node" : "Lumen"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] shadow-[0_0_6px_rgba(0,229,255,0.6)]" />{" "}
          Connected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" /> Live
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#64748B]" /> Seen
        </span>
      </div>
    </div>

    {/* ── Mobile: filters + legend UNDER the map ── */}
    <div className="md:hidden mt-3 space-y-2.5">
      <div className="glass rounded-2xl px-3 py-3 border border-white/10">
        {nodeMode === "lumen" ? (
          <div className="flex p-0.5 rounded-xl bg-black/40 border border-white/10 mb-3">
            {(
              [
                { id: "live" as const, label: "Live" },
                { id: "connected" as const, label: "Linked" },
                { id: "all" as const, label: "All" },
              ] as const
            ).map((f) => {
              const active = mapFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMapFilter(f.id)}
                  className={`flex-1 px-2 py-2 rounded-[10px] text-[10px] font-mono tracking-widest transition-all ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-[#A0A0B0]"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.06] px-3 py-2.5">
            <div className="font-mono text-[11px] tracking-wide text-[#E8E8F0]">
              <span className="text-[#00E5FF] tabular-nums font-semibold">
                {mapStats.connected.toLocaleString()}
              </span>
              {mapStats.connected === 1
                ? " peer connected to your node"
                : " peers connected to your node"}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-[#FF7A3D] font-mono text-[10px] tracking-[2px] mb-2">
          <Globe2 className="w-3.5 h-3.5" /> MAP
        </div>
        <div className="grid grid-cols-2 gap-2 text-center mb-3">
          <div className="rounded-xl bg-white/5 px-2 py-2">
            <div className="font-mono text-lg tabular-nums text-white">
              {mapStats.showing}
            </div>
            <div className="text-[10px] text-[#A0A0B0]">showing</div>
          </div>
          <div className="rounded-xl bg-white/5 px-2 py-2">
            <div className="font-mono text-lg tabular-nums text-[#00E5FF]">
              {mapStats.connected}
            </div>
            <div className="text-[10px] text-[#A0A0B0]">connected</div>
          </div>
          <div className="rounded-xl bg-white/5 px-2 py-2">
            <div className="font-mono text-lg tabular-nums text-[#38BDF8]">
              {mapStats.live}
            </div>
            <div className="text-[10px] text-[#A0A0B0]">live</div>
          </div>
          <div className="rounded-xl bg-white/5 px-2 py-2">
            <div className="font-mono text-lg tabular-nums text-[#94A3B8]">
              {mapStats.seen}
            </div>
            <div className="text-[10px] text-[#A0A0B0]">seen</div>
          </div>
        </div>
        <div className="space-y-1.5 text-[11px] text-[#A0A0B0]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF7A3D]" />
            <span>
              <span className="text-white">
                {nodeMode === "my" ? "My Node" : "Lumen Node"}
              </span>
              {nodeMode === "my" ? " — via Bridge" : " — center"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00E5FF]" />
            <span>
              <span className="text-white">Connected</span> — linked
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
            <span>
              <span className="text-white">Live</span> — answering
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#64748B]" />
            <span>
              <span className="text-white">Seen</span> — recent, quiet
            </span>
          </div>
        </div>
      </div>
      {topRegionsBlock}
      {selected && (
        <div className="glass rounded-2xl px-4 py-3 border border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="font-mono text-[10px] tracking-[2px] mb-1 flex items-center gap-1"
                style={{
                  color:
                    selected.id === "me"
                      ? "#FF7A3D"
                      : stateMeta(normalizeState(selected.state)).color,
                }}
              >
                <MapPin className="w-3 h-3" />{" "}
                {selected.id === "me"
                  ? nodeMode === "my"
                    ? "MY NODE"
                    : "LUMEN NODE"
                  : stateMeta(normalizeState(selected.state)).short}
              </div>
              <div className="font-semibold text-sm break-all">{selected.name}</div>
              <div className="font-mono text-xs text-[#A0A0B0] mt-1 break-all">
                {selected.ip}
                {selected.port ? `:${selected.port}` : ""}
              </div>
              <div className="text-xs mt-1.5">
                {[selected.city, selected.country].filter(Boolean).join(", ") ||
                  "Unknown location"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[#A0A0B0] hover:text-white text-xs font-mono flex-shrink-0"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
      {/* Compact mapped stats on mobile */}
      <div className="flex items-center justify-between px-1 text-[10px] font-mono text-[#A0A0B0] tracking-wider">
        <span>
          <span className="text-[#00E5FF] tabular-nums">{data?.mapped ?? "—"}</span>
          {" mapped / "}
          {data?.totalPeers ?? "—"} peers
        </span>
        {(data?.unmapped ?? 0) > 0 && (
          <span>{data!.unmapped} unmapped</span>
        )}
      </div>
    </div>
    </div>
  );
}
