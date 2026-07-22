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
import { toast } from "sonner";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type PeerMapState = "connected" | "reachable" | "stale";

/** DivIcon — connected (bright cyan), reachable (soft), stale (slate), boom (orange). */
function peerDivIcon(state: PeerMapState, isBoom: boolean): L.DivIcon {
  let color = "#64748B";
  let size = 10;
  let opacity = 0.5;
  let glow = "0 0 4px rgba(0,0,0,0.5)";

  if (isBoom) {
    color = "#FF7A3D";
    size = 16;
    opacity = 0.95;
    glow = "0 0 14px rgba(255,122,61,0.85)";
  } else if (state === "connected") {
    color = "#00E5FF";
    size = 13;
    opacity = 0.96;
    glow = "0 0 12px rgba(0,229,255,0.85)";
  } else if (state === "reachable") {
    color = "#38BDF8";
    size = 11;
    opacity = 0.72;
    glow = "0 0 8px rgba(56,189,248,0.45)";
  }

  const hit = 28;
  return L.divIcon({
    className: "aether-peer-marker",
    html: `<div class="aether-peer-hit" style="
      width:${hit}px;height:${hit}px;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;
    "><div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:2px solid rgba(10,10,15,0.9);
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

/** Bright orange "YOUR NODE" pin — kept outside the cluster group */
function meDivIcon(): L.DivIcon {
  const hit = 32;
  return L.divIcon({
    className: "aether-me-marker",
    html: `<div class="aether-peer-hit" style="
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
  isMe = false
): string {
  const loc =
    [m.city, m.country].filter(Boolean).join(", ") || "Unknown location";
  const state = m.state || "stale";
  const statusColor =
    state === "connected"
      ? "#10B981"
      : state === "reachable"
        ? "#38BDF8"
        : "#64748B";
  const statusLabel =
    state === "connected"
      ? "CONNECTED"
      : state === "reachable"
        ? "NETWORK · LIVE"
        : "NETWORK · STALE";
  const title = escapeHtml(m.name || (isMe ? "Ergo node" : "Peer"));
  const addr = escapeHtml(m.ip) + (m.port ? `:${escapeHtml(m.port)}` : "");
  const roleColor = isMe
    ? "#FF7A3D"
    : state === "connected"
      ? "#00E5FF"
      : "#A0A0B0";
  return `<div class="aether-peer-popup" style="min-width:180px;max-width:260px;font-size:12px;line-height:1.4;color:#E8E8F0">
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:0.15em;color:${roleColor};margin-bottom:6px">${
      isMe ? "YOUR NODE" : state === "connected" ? "YOUR PEER" : "NETWORK NODE"
    }</div>
    <div style="font-weight:600;font-size:14px;color:#fff;word-break:break-all">${title}</div>
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all;margin-top:6px;color:#E8E8F0">${addr}</div>
    <div style="color:#A0A0B0;margin-top:6px">${escapeHtml(loc)}</div>
    ${
      isMe
        ? ""
        : `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#A0A0B0;margin-top:6px">${escapeHtml(
            m.connectionType || "—"
          )} · <span style="color:${statusColor}">${statusLabel}</span></div>`
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
      const state: PeerMapState = m.state || "stale";
      const isBoom = boomIps.has(m.ip);
      const marker = L.marker([m.lat, m.lon], {
        icon: peerDivIcon(state, isBoom),
        riseOnHover: true,
        keyboard: true,
        title: m.name || m.ip,
        zIndexOffset: state === "connected" ? 500 : 0,
      });

      const tip =
        `${m.name || m.ip}` +
        (m.city || m.country
          ? ` · ${[m.city, m.country].filter(Boolean).join(", ")}`
          : "") +
        (state === "connected" ? " · LINKED" : "");

      marker.bindTooltip(tip, {
        direction: "top",
        offset: [0, -12],
        opacity: 1,
        sticky: false,
        className: "aether-map-tooltip",
      });

      marker.bindPopup(peerPopupHtml(m, false), {
        maxWidth: 300,
        className: "aether-map-popup",
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

/** Your node — outside cluster, always on top, with permanent label + popup */
function MeMarkerLayer({
  me,
  onSelect,
}: {
  me: PeerMapMarker;
  onSelect: (m: PeerMapMarker) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const marker = L.marker([me.lat, me.lon], {
      icon: ME_ICON,
      zIndexOffset: 10000,
      riseOnHover: true,
      keyboard: true,
      title: "YOUR NODE",
    });

    marker.bindTooltip("YOUR NODE", {
      permanent: true,
      direction: "top",
      offset: [0, -16],
      opacity: 1,
      className: "aether-map-tooltip",
    });

    marker.bindPopup(peerPopupHtml({ ...me, state: "connected" }, true), {
      maxWidth: 300,
      className: "aether-map-popup",
      autoPan: true,
      closeButton: true,
    });

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
  }, [map, me, onSelect]);

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
    html: `<div class="aether-cluster-bubble" style="
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
    className: "aether-cluster-icon",
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
  reachableMapped?: number;
  unmapped: number;
  countries: Record<string, number>;
  catalogUpdatedAt?: number | null;
  generatedAt: number;
};

type BoomEvent = {
  id: string;
  lat: number;
  lon: number;
  height: number;
  peerName: string;
  peerIp: string;
  country: string;
  city: string;
  createdAt: number;
};

type PeerMapProps = {
  /** Current full height from parent poll — drives NEW BLOCK detection */
  blockHeight?: number;
  /** Hide floating Boom/Refresh while a parent modal is open */
  hideControls?: boolean;
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
/** Comfortable world view that fills a wide container (no black side bars) */
const DEFAULT_ZOOM = 2.5;
/** Fallback when Your Node geo is unknown */
const EUROPE_CENTER: [number, number] = [48.5, 15];

/**
 * Default / Refresh camera: setView on Your Node (or Europe) at fixed zoom.
 * Avoids fitBounds black bars from extreme zoom-out + aspect ratio.
 */
function DefaultView({
  me,
  viewToken,
}: {
  me: { lat: number; lon: number } | null | undefined;
  /** Bump to re-apply (Refresh). 0 = initial. */
  viewToken: number;
}) {
  const map = useMap();
  const initialDone = useRef(false);
  const lastToken = useRef(0);

  useEffect(() => {
    const forced = viewToken > 0 && viewToken !== lastToken.current;
    if (initialDone.current && !forced) return;

    const center: [number, number] =
      me && Number.isFinite(me.lat) && Number.isFinite(me.lon)
        ? [me.lat, me.lon]
        : EUROPE_CENTER;

    map.invalidateSize({ animate: false });
    map.setView(center, DEFAULT_ZOOM, {
      animate: forced,
      duration: forced ? 0.45 : 0,
    });
    // Second invalidate after layout settles (aether-viz height / flex)
    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });

    initialDone.current = true;
    lastToken.current = viewToken;
  }, [map, me, viewToken]);

  return null;
}

/** Keep leaflet size in sync with the aether-viz container */
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
 * Must live in a Leaflet pane above tiles (z=200) and ideally under/near
 * markers (z=600). Sibling SVG on the container with z-index 350 was
 * completely hidden under .leaflet-pane { z-index: 400 } — only flashing
 * during zoom compositing.
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

    let pane = map.getPane("aetherSignals");
    if (!pane) {
      pane = map.createPane("aetherSignals");
    }
    // Above tiles (200) + default overlay (400), below markers (600)
    pane.style.zIndex = "550";
    pane.style.pointerEvents = "none";

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("class", "aether-signal-svg");
    svgEl.style.position = "absolute";
    svgEl.style.left = "0";
    svgEl.style.top = "0";
    svgEl.style.overflow = "visible";
    svgEl.style.pointerEvents = "none";
    pane.appendChild(svgEl);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "aether-signal-layer");
    svgEl.appendChild(g);

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    // Soft, low-energy glow — airy, not neon billboard
    const filterId = `aether-signal-glow-${Date.now().toString(36)}`;
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
      pathGlow.setAttribute("filter", `url(#${filterId})`);
      pathGlow.setAttribute("class", "aether-signal-glow");

      const pathCore = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      pathCore.setAttribute("fill", "none");
      pathCore.setAttribute("stroke", "rgba(0,229,255,0.32)");
      pathCore.setAttribute("stroke-width", "0.7");
      pathCore.setAttribute("stroke-linecap", "round");
      pathCore.setAttribute("class", "aether-signal-core");
      pathCore.style.strokeDasharray = "3 11";
      pathCore.style.animation = `aether-signal-dash ${3.2 + (i % 5) * 0.2}s linear infinite`;

      const packet = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      packet.setAttribute("r", "1.6");
      packet.setAttribute("fill", "rgba(224,251,255,0.75)");
      packet.setAttribute("stroke", "rgba(0,229,255,0.35)");
      packet.setAttribute("stroke-width", "0.5");
      packet.setAttribute(
        "style",
        "filter:drop-shadow(0 0 2.5px rgba(0,229,255,0.55))"
      );
      packet.setAttribute("class", "aether-signal-packet");

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
      });
    }

    const curveD = (
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ): string => {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const offset = Math.min(90, Math.max(18, len * 0.12));
      const cx = mx - (dy / len) * offset;
      const cy = my + (dx / len) * offset;
      return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    };

    const pointOnQuad = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      t: number
    ): { x: number; y: number } => {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const offset = Math.min(90, Math.max(18, len * 0.12));
      const cx = mx - (dy / len) * offset;
      const cy = my + (dx / len) * offset;
      const u = 1 - t;
      return {
        x: u * u * x1 + 2 * u * t * cx + t * t * x2,
        y: u * u * y1 + 2 * u * t * cy + t * t * y2,
      };
    };

    /**
     * Leaflet overlay pattern: pin SVG to viewport top-left in *layer*
     * coordinates, draw with points relative to that origin (= container pts).
     */
    const redraw = () => {
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(svgEl as unknown as HTMLElement, topLeft);
      svgEl.setAttribute("width", String(size.x));
      svgEl.setAttribute("height", String(size.y));
      svgEl.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);

      const origin = map.latLngToContainerPoint([meNode.lat, meNode.lon]);
      for (const d of drawn) {
        const dest = map.latLngToContainerPoint([d.toLat, d.toLon]);
        const path = curveD(origin.x, origin.y, dest.x, dest.y);
        d.pathGlow.setAttribute("d", path);
        d.pathCore.setAttribute("d", path);
      }
    };

    let raf = 0;
    let last = performance.now();
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduceMotion) {
        const origin = map.latLngToContainerPoint([meNode.lat, meNode.lon]);
        for (const d of drawn) {
          d.phase = (d.phase + d.speed * dt) % 1;
          const dest = map.latLngToContainerPoint([d.toLat, d.toLon]);
          const p = pointOnQuad(origin.x, origin.y, dest.x, dest.y, d.phase);
          d.packet.setAttribute("cx", String(p.x));
          d.packet.setAttribute("cy", String(p.y));
          const edge = Math.min(d.phase, 1 - d.phase);
          const op = edge < 0.08 ? edge / 0.08 : 1;
          d.packet.setAttribute("opacity", String(0.25 + 0.5 * op));
        }
      }
      raf = requestAnimationFrame(tick);
    };

    redraw();
    // zoom/move/viewreset keep arcs glued to markers while the map transforms
    map.on("zoom viewreset move zoomend moveend resize", redraw);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      map.off("zoom viewreset move zoomend moveend resize", redraw);
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
 * Boom choreography:
 * 1) Notice appears at top of map
 * 2) 3 noticeable pulse rings on hottest peer
 * 3) Notice slowly descends to the peer while pulses run
 * 4) Both fade out together
 * No bottom glass plaque.
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

  const place =
    [boom.city, boom.country].filter(Boolean).join(", ") || null;
  const nodeLabel = boom.peerName || boom.peerIp || "peer";
  const startX = mapSize.w > 0 ? mapSize.w / 2 : 0;
  const startY = 18;
  const endX = xy?.x ?? startX;
  const endY = xy?.y ?? startY + 80;

  return (
    <>
      {/* 3 pulse waves on hottest peer */}
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
            <div key={wave} className="aether-boom-wave" aria-hidden>
              <div
                className="aether-boom-ring aether-boom-ring-1"
                style={{
                  animationDelay: `${wave * BOOM_PULSE_SEC}s`,
                }}
              />
              <div
                className="aether-boom-ring aether-boom-ring-2"
                style={{
                  animationDelay: `${wave * BOOM_PULSE_SEC + 0.16}s`,
                }}
              />
              <div
                className="aether-boom-ring aether-boom-ring-3"
                style={{
                  animationDelay: `${wave * BOOM_PULSE_SEC + 0.32}s`,
                }}
              />
            </div>
          ))}
          <div
            className="aether-boom-core"
            style={{
              animationDuration: `${BOOM_TOTAL_MS}ms`,
            }}
          />
        </div>
      )}

      {/* Top notice → flies down to pulse point (synced with 3 pulses) */}
      {mapSize.w > 0 && xy && (
        <motion.div
          className="aether-boom-flight pointer-events-none absolute z-[720]"
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
          <div className="aether-boom-notice">
            <div className="text-[9px] font-mono tracking-[0.28em] text-[#00E5FF]/95">
              NEW BLOCK
            </div>
            <div className="mt-0.5 font-mono text-lg sm:text-xl tabular-nums tracking-tight text-white font-semibold">
              #{boom.height.toLocaleString()}
            </div>
            <div className="mt-1 text-[10px] sm:text-[11px] font-mono text-[#A0A0B0] max-w-[200px] truncate text-center">
              <span className="text-[#FF7A3D]">{nodeLabel}</span>
              {place && (
                <span className="text-[#00E5FF]/80"> · {place}</span>
              )}
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

function pickBoomSource(
  markers: PeerMapMarker[],
  me: PeerMapMarker | null
): PeerMapMarker | null {
  if (!markers.length) return me;
  // Prefer currently connected peers (our live links); then freshest lastMessage
  const connected = markers.filter((m) => m.state === "connected");
  const pool = connected.length ? connected : markers;
  const sorted = [...pool].sort(
    (a, b) => peerLastMs(b.lastMessage) - peerLastMs(a.lastMessage)
  );
  const fresh = sorted.find((m) => isActive(m.lastMessage)) || sorted[0];
  return fresh || me;
}

export default function PeerMap({
  blockHeight = 0,
  hideControls = false,
}: PeerMapProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["peer-map"],
    queryFn: async (): Promise<MapPayload> => {
      const res = await fetch("/api/peers/map", {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error("map api failed");
      return res.json();
    },
    refetchInterval: 12000,
  });

  const [selected, setSelected] = useState<PeerMapMarker | null>(null);
  const [booms, setBooms] = useState<BoomEvent[]>([]);
  /** Increment on Refresh to re-apply default setView */
  const [viewToken, setViewToken] = useState(0);
  const lastHeightRef = useRef<number>(0);
  const bootstrapped = useRef(false);

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

  const boomIps = useMemo(
    () => new Set(booms.map((b) => b.peerIp).filter(Boolean)),
    [booms]
  );

  const handleSelectPeer = useCallback((m: PeerMapMarker) => {
    setSelected(m);
  }, []);

  // Stable list reference for native layer (rebuild when ids/geo change)
  const peerMarkers = data?.markers ?? EMPTY_MARKERS;
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

  const fireBoom = useCallback(
    (height: number, source: PeerMapMarker | null) => {
      if (!source) return;
      const boom: BoomEvent = {
        id: `${height}-${Date.now()}`,
        lat: source.lat,
        lon: source.lon,
        height,
        peerName: source.name,
        peerIp: source.ip,
        country: source.country,
        city: source.city,
        createdAt: Date.now(),
      };
      // Single in-map choreography (notice flies top→peer + 3 pulses). No sonner, no bottom plaque.
      setBooms((prev) => [...prev.slice(-1), boom]);
    },
    []
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
      const prev = lastHeightRef.current;
      lastHeightRef.current = blockHeight;
      // Fire for each skipped height (usually 1)
      const source = pickBoomSource(data?.markers || [], data?.me || null);
      fireBoom(blockHeight, source);
      // Refresh peer geo shortly after
      setTimeout(() => refetch(), 800);
      if (blockHeight - prev > 1) {
        // only animate latest if many skipped
      }
    } else if (blockHeight < lastHeightRef.current) {
      lastHeightRef.current = blockHeight;
    }
  }, [blockHeight, data?.markers, data?.me, fireBoom, refetch]);

  const dismissBoom = useCallback((id: string) => {
    setBooms((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const simulateBoom = () => {
    const h = blockHeight || lastHeightRef.current || 0;
    const source = pickBoomSource(data?.markers || [], data?.me || null);
    if (!source) {
      toast.error("No mapped peers yet");
      return;
    }
    fireBoom(h || Date.now() % 1_000_000, source);
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
    <div className="canvas-container aether-viz relative w-full bg-[#050508] overflow-hidden">
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
            className="h-full w-full aether-map"
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
            <DefaultView me={data?.me} viewToken={viewToken} />

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
              <MeMarkerLayer me={data.me} onSelect={handleSelectPeer} />
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
        <div className="glass rounded-2xl px-4 py-3 border border-white/10 pointer-events-auto">
          <div className="flex items-center gap-2 text-[#FF7A3D] font-mono text-[10px] tracking-[3px] mb-1">
            <Globe2 className="w-3.5 h-3.5" /> ERGO NETWORK MAP
          </div>
          <div className="text-sm text-white flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>
              <span className="font-mono text-[#E8E8F0] text-lg tabular-nums">
                {data?.networkMapped ?? data?.mapped ?? "—"}
              </span>
              <span className="text-[#A0A0B0] text-[10px] ml-1.5 tracking-wider">
                KNOWN
              </span>
            </span>
            <span>
              <span className="font-mono text-[#38BDF8] text-lg tabular-nums">
                {data?.reachableMapped ?? "—"}
              </span>
              <span className="text-[#A0A0B0] text-[10px] ml-1.5 tracking-wider">
                LIVE
              </span>
            </span>
            <span>
              <span className="font-mono text-[#00E5FF] text-lg tabular-nums">
                {data?.connectedMapped ?? signalLinks.length ?? "—"}
              </span>
              <span className="text-[#A0A0B0] text-[10px] ml-1.5 tracking-wider">
                LINKED
              </span>
            </span>
          </div>
          <div className="text-[10px] text-[#A0A0B0] mt-1.5 font-mono leading-relaxed max-w-[280px]">
            {signalLinks.length} signal lines to your peers
            <br />
            <span className="opacity-70">
              KNOWN = catalog w/ geo (many offline) · LIVE ≈ port open · LINKED
              = your connections
            </span>
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
                <div className="font-mono text-[10px] tracking-[2px] text-[#00E5FF] mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{" "}
                  {selected.id === "me"
                    ? "YOUR NODE"
                    : selected.state === "connected"
                      ? "YOUR PEER"
                      : "NETWORK"}
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
                  {selected.connectionType || "—"}
                  {selected.id !== "me" && (
                    <>
                      {" · "}
                      {selected.state === "connected" ? (
                        <span className="text-[#10B981]">CONNECTED</span>
                      ) : selected.state === "reachable" ? (
                        <span className="text-[#38BDF8]">LIVE</span>
                      ) : (
                        <span className="text-[#64748B]">STALE</span>
                      )}
                    </>
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

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[40] glass rounded-2xl px-4 py-2 text-[10px] font-mono tracking-widest border border-white/10 hidden md:flex items-center gap-4 text-[#A0A0B0]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF7A3D]" /> YOU
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF]" /> LINKED
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" /> LIVE
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#64748B]" /> STALE
        </span>
        <span className="opacity-60">lines = your connections</span>
      </div>
    </div>

    {/* ── Mobile: Top Regions + selected peer UNDER the map (no center overlap) ── */}
    <div className="md:hidden mt-3 space-y-2.5">
      {topRegionsBlock}
      {selected && (
        <div className="glass rounded-2xl px-4 py-3 border border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-[2px] text-[#00E5FF] mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> PEER
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
