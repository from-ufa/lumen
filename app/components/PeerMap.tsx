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
import { Clock3, Globe2, MapPin, RefreshCw, Zap } from "lucide-react";
import { fetchBlockMinerByHeight } from "../lib/miner";
import NodeMapSearch, { shortVersion } from "./NodeMapSearch";

/** Ergo target block time ~2 min — soft reference for progress ring */
const ERGO_TARGET_BLOCK_MS = 120_000;

function formatBlockElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Live "time since last block" chip for the map HUD.
 * Resets when blockHeight advances or lastBlockAt updates.
 */
function BlockTimeIndicator({
  blockHeight,
  lastBlockAt,
}: {
  blockHeight: number;
  lastBlockAt?: number | null;
}) {
  const anchorRef = useRef<number | null>(null);
  const heightRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const h = blockHeight || 0;
    const ts =
      lastBlockAt && lastBlockAt > 0
        ? lastBlockAt > 1e12
          ? lastBlockAt
          : lastBlockAt * 1000
        : null;

    if (h > 0 && h !== heightRef.current) {
      // New tip: prefer honest timestamp; else "now" so the clock restarts cleanly
      heightRef.current = h;
      anchorRef.current = ts && ts <= Date.now() + 5000 ? ts : Date.now();
      return;
    }

    // First paint / prop catch-up without height change
    if (ts && (!anchorRef.current || Math.abs(ts - anchorRef.current) > 2000)) {
      if (!heightRef.current && h > 0) heightRef.current = h;
      // Only adopt explorer/node timestamp if it's not in the future and not ancient nonsense
      if (ts <= Date.now() + 5000 && Date.now() - ts < 24 * 60 * 60 * 1000) {
        anchorRef.current = ts;
      }
    }

    if (!anchorRef.current && h > 0) {
      heightRef.current = h;
      anchorRef.current = Date.now();
    }
  }, [blockHeight, lastBlockAt]);

  const anchor = anchorRef.current;
  if (!anchor || !blockHeight) return null;

  const elapsed = Math.max(0, now - anchor);
  const progress = Math.min(1, elapsed / ERGO_TARGET_BLOCK_MS);
  const overTarget = elapsed > ERGO_TARGET_BLOCK_MS;
  const label = formatBlockElapsed(elapsed);

  // SVG ring
  const size = 36;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;

  return (
    <div
      className="pointer-events-none select-none"
      title={`Time since block #${blockHeight.toLocaleString()}`}
    >
      <div
        className={`
          flex items-center gap-2.5 rounded-2xl border px-2.5 py-1.5
          bg-[#0A0A0F]/88 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.4)]
          ${
            overTarget
              ? "border-[#FF7A3D]/35"
              : "border-white/10"
          }
        `}
      >
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="block -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={overTarget ? "#FF7A3D" : "#00E5FF"}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              className="transition-[stroke-dasharray] duration-300 ease-linear"
              style={{
                filter: overTarget
                  ? "drop-shadow(0 0 4px rgba(255,122,61,0.55))"
                  : "drop-shadow(0 0 4px rgba(0,229,255,0.45))",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Clock3
              className={`w-3.5 h-3.5 ${
                overTarget ? "text-[#FF7A3D]" : "text-[#00E5FF]"
              }`}
            />
          </div>
        </div>

        <div className="min-w-0 pr-1">
          <div className="text-[9px] font-mono tracking-[0.18em] text-[#A0A0B0] leading-none">
            BLOCK TIME
          </div>
          <div
            className={`mt-1 font-mono text-base sm:text-lg tabular-nums tracking-tight leading-none ${
              overTarget ? "text-[#FF7A3D]" : "text-[#E8E8F0]"
            }`}
          >
            {label}
          </div>
          <div className="mt-0.5 text-[9px] font-mono text-[#A0A0B0]/60 tracking-wide tabular-nums">
            #{blockHeight.toLocaleString()}
            <span className="text-[#A0A0B0]/40"> · ~2m target</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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

/**
 * Status colors — premium hierarchy (not neon):
 * Connected cyan → Live emerald (node-live badge) → Seen silver → Ghost rose-red
 */
function stateMeta(state: PeerMapState): {
  color: string;
  label: string;
  short: string;
} {
  switch (state) {
    case "connected":
      return { color: "#00E5FF", label: "Connected", short: "CONNECTED" };
    case "live":
      // Same green as NODE LIVE chip — distinct from Connected cyan
      return { color: "#10B981", label: "Live", short: "LIVE" };
    case "seen":
      // Cool silver-steel — quieter than Live, still readable on dark map
      return { color: "#A8B4C8", label: "Seen", short: "SEEN" };
    case "ghost":
    default:
      // Muted rose-red — historical / inactive, not acid
      return { color: "#C45C5C", label: "Ghost", short: "GHOST" };
  }
}

/**
 * DivIcon — premium hierarchy by status.
 * Focus never overrides status color (search highlight is a separate layer).
 */
function peerDivIcon(
  state: PeerMapState,
  isBoom: boolean,
  isFocus = false
): L.DivIcon {
  let color = "#C45C5C";
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
    color = "#10B981";
    size = 11;
    opacity = 0.9;
    glow = "0 0 10px rgba(16,185,129,0.55)";
    ring = "2px solid rgba(10,10,15,0.9)";
  } else if (state === "seen") {
    // Noticeable silver — not near-invisible slate
    color = "#A8B4C8";
    size = 10;
    opacity = 0.82;
    glow = "0 0 7px rgba(168,180,200,0.4)";
    ring = "1.5px solid rgba(10,10,15,0.88)";
  } else {
    // Ghost — soft rose-red, clearly "old / history"
    color = "#C45C5C";
    size = 9;
    opacity = 0.78;
    glow = "0 0 8px rgba(196,92,92,0.45)";
    ring = "1.5px solid rgba(10,10,15,0.9)";
  }

  // Focus: keep true status color; slightly larger + soft pearl frame only
  if (isFocus && !isBoom) {
    size = Math.max(size, 12) + 2;
    opacity = Math.max(opacity, 0.92);
    ring = "2px solid rgba(10,10,15,0.95)";
  }

  const hit = isFocus ? 40 : 28;
  const focusFrame = isFocus
    ? `<div class="lumen-peer-focus-frame" style="
        position:absolute;inset:0;border-radius:50%;
        border:1.5px solid rgba(245,230,200,0.9);
        box-shadow:0 0 0 3px rgba(245,230,200,0.18), 0 0 16px rgba(232,201,122,0.45);
        pointer-events:none;
      "></div>`
    : "";

  return L.divIcon({
    className: "lumen-peer-marker",
    html: `<div class="lumen-peer-hit" style="
      position:relative;
      width:${hit}px;height:${hit}px;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;
    ">${focusFrame}<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:${ring};
      box-shadow:${glow};
      opacity:${opacity};
      pointer-events:none;
      position:relative;z-index:1;
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
    version?: string | null;
  },
  isMe = false,
  /** Active data source label for the center pin, e.g. LUMEN NODE / MY NODE */
  meRoleLabel = "lumen node"
): string {
  const loc =
    [m.city, m.country].filter(Boolean).join(", ") || "Unknown location";
  const state = normalizeState(m.state);
  const meta = stateMeta(state);
  const title = escapeHtml(m.name || (isMe ? meRoleLabel : "Peer"));
  const addr = escapeHtml(m.ip) + (m.port ? `:${escapeHtml(m.port)}` : "");
  const ver = shortVersion(m.version);
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
      ver
        ? `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#00E5FF;margin-top:4px;opacity:0.85">v${escapeHtml(ver)}</div>`
        : ""
    }
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
  focusId,
  focusIp,
}: {
  markers: PeerMapMarker[];
  boomIps: Set<string>;
  onSelect: (m: PeerMapMarker) => void;
  focusId?: string | null;
  /** Match by IP too — catalog port in id can differ from connected port */
  focusIp?: string | null;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  /** id → leaflet marker (stable across data refreshes) */
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());
  const dataMapRef = useRef<Map<string, PeerMapMarker>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const boomRef = useRef(boomIps);
  boomRef.current = boomIps;
  const focusRef = useRef({ focusId, focusIp });
  focusRef.current = { focusId, focusIp };

  const isFocused = useCallback((m: PeerMapMarker) => {
    const { focusId: fid, focusIp: fip } = focusRef.current;
    return (
      (!!fid && m.id === fid) || (!!fip && m.ip === fip && m.id !== "me")
    );
  }, []);

  const styleMarker = useCallback(
    (leafletMarker: L.Marker, m: PeerMapMarker) => {
      const state = normalizeState(m.state);
      const isBoom = boomRef.current.has(m.ip);
      const focused = isFocused(m);
      const z = focused
        ? 1200
        : state === "connected"
          ? 600
          : state === "live"
            ? 300
            : state === "seen"
              ? 100
              : 0;
      leafletMarker.setIcon(peerDivIcon(state, isBoom, focused));
      leafletMarker.setZIndexOffset(z);
      leafletMarker.setLatLng([m.lat, m.lon]);

      const statusTip = stateMeta(state).short;
      const ver = shortVersion(m.version);
      const tip =
        `${m.name || m.ip}` +
        (m.city || m.country
          ? ` · ${[m.city, m.country].filter(Boolean).join(", ")}`
          : "") +
        (ver ? ` · v${ver}` : "") +
        ` · ${statusTip}`;
      leafletMarker.unbindTooltip();
      leafletMarker.bindTooltip(tip, {
        direction: "top",
        offset: [0, -12],
        opacity: 1,
        sticky: false,
        className: "lumen-map-tooltip",
      });
      leafletMarker.unbindPopup();
      leafletMarker.bindPopup(peerPopupHtml(m, false), {
        maxWidth: 300,
        className: "lumen-map-popup",
        autoPan: true,
        closeButton: true,
        autoClose: true,
      });
    },
    [isFocused]
  );

  // Create cluster group once — never destroy on focus / data tick
  useEffect(() => {
    const group = (
      L as typeof L & {
        markerClusterGroup: (
          opts?: L.MarkerClusterGroupOptions
        ) => L.MarkerClusterGroup;
      }
    ).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 56,
      disableClusteringAtZoom: 10,
      spiderfyDistanceMultiplier: 1.4,
      // animate:true rebuilds cluster DOM every zoom step → flicker in dense areas
      animate: false,
      animateAddingMarkers: false,
      chunkedLoading: true,
      chunkInterval: 50,
      chunkDelay: 20,
      removeOutsideVisibleBounds: true,
      iconCreateFunction: createClusterIcon,
    });
    groupRef.current = group;
    map.addLayer(group);

    return () => {
      try {
        map.removeLayer(group);
        group.clearLayers();
      } catch {
        /* map already unmounted */
      }
      groupRef.current = null;
      markerMapRef.current.clear();
      dataMapRef.current.clear();
    };
  }, [map]);

  // Diff-update markers (add / remove / refresh) without full cluster rebuild
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const nextIds = new Set(markers.map((m) => m.id));
    const prev = markerMapRef.current;

    // Remove gone
    for (const [id, lm] of prev) {
      if (!nextIds.has(id)) {
        try {
          group.removeLayer(lm);
        } catch {
          /* ignore */
        }
        prev.delete(id);
        dataMapRef.current.delete(id);
      }
    }

    // Add / update
    for (const m of markers) {
      let lm = prev.get(m.id);
      if (!lm) {
        lm = L.marker([m.lat, m.lon], {
          riseOnHover: true,
          keyboard: true,
          title: m.name || m.ip,
        });
        lm.on("click", () => {
          const data = dataMapRef.current.get(m.id);
          if (data) onSelectRef.current(data);
        });
        styleMarker(lm, m);
        group.addLayer(lm);
        prev.set(m.id, lm);
      } else {
        const prevData = dataMapRef.current.get(m.id);
        const needs =
          !prevData ||
          prevData.lat !== m.lat ||
          prevData.lon !== m.lon ||
          prevData.state !== m.state ||
          prevData.name !== m.name ||
          prevData.version !== m.version ||
          prevData.ip !== m.ip;
        if (needs) styleMarker(lm, m);
      }
      dataMapRef.current.set(m.id, m);
    }
  }, [markers, styleMarker]);

  // Focus highlight only — swap icons, no cluster tear-down
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    for (const [id, lm] of markerMapRef.current) {
      const m = dataMapRef.current.get(id);
      if (m) styleMarker(lm, m);
    }
    // Refresh cluster icons without zoom thrash
    try {
      group.refreshClusters();
    } catch {
      /* ignore */
    }
  }, [focusId, focusIp, styleMarker]);

  return null;
}

/** Resolve latest marker by id, then IP (single source of truth for status). */
function resolveMarkerFromList(
  list: PeerMapMarker[],
  me: PeerMapMarker | null | undefined,
  ref: { id?: string; ip?: string }
): PeerMapMarker | null {
  if (ref.id === "me" && me) return me;
  if (ref.id) {
    const byId = list.find((m) => m.id === ref.id);
    if (byId) return byId;
  }
  if (ref.ip) {
    const byIp = list.find((m) => m.ip === ref.ip);
    if (byIp) return byIp;
    if (me && me.ip === ref.ip) return me;
  }
  return null;
}

/**
 * Premium search focus: champagne/pearl rings + FOUND label.
 * Color deliberately avoids Connected cyan / Live blue / Seen slate / Me orange.
 */
function FocusNodeLayer({
  target,
  focusToken,
  /** Keep rings while selection is open (search pick) */
  persistent = true,
}: {
  target: PeerMapMarker | null;
  focusToken: number;
  persistent?: boolean;
}) {
  const map = useMap();
  const lastToken = useRef(0);

  useEffect(() => {
    if (!target || !focusToken) return;
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lon)) return;

    const latlng = L.latLng(target.lat, target.lon);
    const justPicked = focusToken !== lastToken.current;
    lastToken.current = focusToken;

    if (justPicked) {
      const destZoom = Math.min(
        MAP_MAX_ZOOM,
        Math.max(map.getZoom(), target.id === "me" ? 5 : 6.75)
      );
      map.flyTo(latlng, destZoom, {
        animate: true,
        duration: 0.95,
        easeLinearity: 0.2,
      });
    } else {
      // Keep ring anchored if coords jitter slightly after refetch
      // (layer recreated below)
    }

    const size = 120;
    const ring = L.marker(latlng, {
      interactive: false,
      keyboard: false,
      zIndexOffset: 2500,
      icon: L.divIcon({
        className: "lumen-focus-ring",
        html: `<div class="lumen-focus-stage">
          <div class="lumen-focus-wave lumen-focus-wave-a"></div>
          <div class="lumen-focus-wave lumen-focus-wave-b"></div>
          <div class="lumen-focus-core"></div>
          <div class="lumen-focus-label">FOUND</div>
        </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    });
    ring.addTo(map);

    let t: number | undefined;
    if (!persistent) {
      t = window.setTimeout(() => {
        try {
          map.removeLayer(ring);
        } catch {
          /* ignore */
        }
      }, 3200);
    }

    return () => {
      if (t) window.clearTimeout(t);
      try {
        map.removeLayer(ring);
      } catch {
        /* ignore */
      }
    };
  }, [map, target, focusToken, persistent]);

  return null;
}

/** Center node pin — outside cluster, always on top, with permanent label + popup */
function MeMarkerLayer({
  me,
  onSelect,
  roleLabel = "lumen node",
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

/**
 * Cluster bubbles — one unified Lumen cyan style.
 * Size scales with child count; color never switches to orange.
 */
function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  // Size only — palette stays cyan (Connected accent)
  const size = count >= 50 ? 52 : count >= 15 ? 42 : 36;
  const fontSize = count >= 100 ? 11 : count >= 15 ? 12 : 13;
  const bg = "rgba(0, 229, 255, 0.18)";
  const border = "rgba(0, 229, 255, 0.75)";
  const text = "#00E5FF";
  const glow = "0 0 16px rgba(0, 229, 255, 0.32)";

  return L.divIcon({
    html: `<div class="lumen-cluster-bubble" style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:${bg};
      border:2px solid ${border};
      box-shadow:${glow}, inset 0 0 12px rgba(255,255,255,0.05);
      color:${text};
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      font-size:${fontSize}px;
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
  version?: string | null;
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
  /** Active known nodes (excludes Ghost) */
  discovered?: number;
  activeTotal?: number;
  /** Catalog including Ghost history */
  totalEver?: number;
  networkMapped?: number;
  withGeo?: number;
  connectedMapped?: number;
  liveMapped?: number;
  /** connected + live */
  liveTotal?: number;
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
  /** Timestamp (ms) of the tip block header — anchors live block timer */
  lastBlockAt?: number | null;
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
      // HUD: search top-left · actions top-right · stats bottom-right · regions bottom-left
      const padTop = Math.max(64, Math.round(size.y * 0.12));
      const padBottom = Math.max(100, Math.round(size.y * 0.2));
      const padLeft = Math.max(40, Math.round(size.x * 0.12));
      const padRight = Math.max(48, Math.round(size.x * 0.14));

      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, {
          paddingTopLeft: L.point(padLeft, padTop),
          paddingBottomRight: L.point(padRight, padBottom),
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
 * Stability (Leaflet L.Renderer pattern):
 * - Paths live in the map pane; pan/zoom CSS transform moves them — do NOT
 *   rewrite geometry on every `move` (that double-transforms and jitters).
 * - Full reproject only on zoomend / viewreset / resize / moveend.
 * - During zoom animation: only CSS transform on the SVG root (like L.SVG).
 * - Packets use cached endpoints; expensive SVG filters avoided for density.
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
    svgEl.style.willChange = "transform";
    pane.appendChild(svgEl);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "lumen-signal-layer");
    svgEl.appendChild(g);

    type Drawn = {
      pathGlow: SVGPathElement;
      pathCore: SVGPathElement;
      packet: SVGCircleElement | null;
      toLat: number;
      toLon: number;
      phase: number;
      speed: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      cx: number;
      cy: number;
    };
    const drawn: Drawn[] = [];

    // Cap animated packets in dense graphs (perf); keep all arc strokes
    const packetBudget = Math.min(linkList.length, 28);

    for (let i = 0; i < linkList.length; i++) {
      const link = linkList[i];
      const pathGlow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      pathGlow.setAttribute("fill", "none");
      pathGlow.setAttribute("stroke", "rgba(0,229,255,0.14)");
      pathGlow.setAttribute("stroke-width", "2");
      pathGlow.setAttribute("stroke-linecap", "round");
      pathGlow.setAttribute("vector-effect", "non-scaling-stroke");
      pathGlow.setAttribute("class", "lumen-signal-glow");
      // No SVG feGaussianBlur — blurs thrash GPU with 50+ links on zoom

      const pathCore = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      pathCore.setAttribute("fill", "none");
      pathCore.setAttribute("stroke", "rgba(0,229,255,0.38)");
      pathCore.setAttribute("stroke-width", "0.85");
      pathCore.setAttribute("stroke-linecap", "round");
      pathCore.setAttribute("vector-effect", "non-scaling-stroke");
      pathCore.setAttribute("class", "lumen-signal-core");
      // Static dash (no CSS animation) — continuous dashoffset anim + reproject = shimmer
      pathCore.setAttribute("stroke-dasharray", "4 10");

      let packet: SVGCircleElement | null = null;
      if (i < packetBudget) {
        packet = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );
        packet.setAttribute("r", "1.7");
        packet.setAttribute("fill", "rgba(224,251,255,0.8)");
        packet.setAttribute("stroke", "rgba(0,229,255,0.4)");
        packet.setAttribute("stroke-width", "0.5");
        packet.setAttribute("vector-effect", "non-scaling-stroke");
        packet.setAttribute("class", "lumen-signal-packet");
      }

      g.appendChild(pathGlow);
      g.appendChild(pathCore);
      if (packet) g.appendChild(packet);

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
        cx: 0,
        cy: 0,
      });
    }

    const curveGeom = (x1: number, y1: number, x2: number, y2: number) => {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
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
      cx: number,
      cy: number,
      x2: number,
      y2: number,
      t: number
    ): { x: number; y: number } => {
      const u = 1 - t;
      return {
        x: u * u * x1 + 2 * u * t * cx + t * t * x2,
        y: u * u * y1 + 2 * u * t * cy + t * t * y2,
      };
    };

    const mapAny = map as unknown as {
      _animatingZoom?: boolean;
      getZoomScale: (z: number, from?: number) => number;
      getSize: () => L.Point;
      containerPointToLayerPoint: (p: L.PointExpression) => L.Point;
      getCenter: () => L.LatLng;
      getZoom: () => number;
      latLngToLayerPoint: (ll: L.LatLngExpression) => L.Point;
    };

    let zoomAnim = false;
    /** Zoom level / center snapshotted at last full reproject (L.Renderer) */
    let baseZoom = map.getZoom();
    let baseCenter = map.getCenter();
    let basePos = map.containerPointToLayerPoint([0, 0]);

    const isZoomAnimating = () =>
      zoomAnim || Boolean(mapAny._animatingZoom);

    /**
     * Full geometry reproject — only when map is at rest (not mid CSS zoom).
     * Paths in container space; SVG pinned to viewport top-left in layer coords.
     */
    const reproject = () => {
      if (isZoomAnimating()) return;

      // Clear any temporary zoom transform
      svgEl.style.transform = "";
      L.DomUtil.setPosition(svgEl as unknown as HTMLElement, L.point(0, 0));

      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(svgEl as unknown as HTMLElement, topLeft);
      svgEl.setAttribute("width", String(size.x));
      svgEl.setAttribute("height", String(size.y));
      svgEl.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);

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
        const geom = curveGeom(ox, oy, x2, y2);
        d.cx = geom.cx;
        d.cy = geom.cy;
        d.pathGlow.setAttribute("d", geom.d);
        d.pathCore.setAttribute("d", geom.d);
      }

      baseZoom = map.getZoom();
      baseCenter = map.getCenter();
      basePos = topLeft;
    };

    /**
     * L.Renderer._updateTransform equivalent via zoomanim event.
     * Scales/translates existing SVG without rewriting path `d`.
     */
    const onZoomAnim = (e: L.ZoomAnimEvent) => {
      zoomAnim = true;
      const scale = map.getZoomScale(e.zoom, baseZoom);
      const viewHalf = map.getSize().multiplyBy(0.5);
      const currentCenterPoint = map.project(baseCenter, e.zoom);
      const destCenterPoint = map.project(e.center, e.zoom);
      const centerOffset = destCenterPoint.subtract(currentCenterPoint);
      const topLeftOffset = viewHalf
        .multiplyBy(-scale)
        .add(basePos)
        .add(viewHalf)
        .subtract(centerOffset);
      L.DomUtil.setTransform(
        svgEl as unknown as HTMLElement,
        topLeftOffset,
        scale
      );
    };

    const onZoomStart = () => {
      zoomAnim = true;
      baseZoom = map.getZoom();
      baseCenter = map.getCenter();
      basePos = map.containerPointToLayerPoint([0, 0]);
    };

    const onZoomEnd = () => {
      zoomAnim = false;
      svgEl.style.transform = "";
      reproject();
    };

    /**
     * Pan: Leaflet CSS-translates the whole pane. Paths stay valid until
     * moveend, when we re-pin once (never rewrite mid-drag).
     */
    const onMoveEnd = () => {
      if (isZoomAnimating()) return;
      reproject();
    };

    let raf = 0;
    let last = performance.now();
    let frame = 0;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame++;

      if (!reduceMotion && !isZoomAnimating()) {
        // Throttle packets ~30fps — polish without main-thread thrash
        if (frame % 2 === 0) {
          for (const d of drawn) {
            if (!d.packet) continue;
            d.phase = (d.phase + d.speed * dt * 2) % 1;
            const p = pointOnQuad(
              d.x1,
              d.y1,
              d.cx,
              d.cy,
              d.x2,
              d.y2,
              d.phase
            );
            d.packet.setAttribute("cx", String(p.x));
            d.packet.setAttribute("cy", String(p.y));
            const edge = Math.min(d.phase, 1 - d.phase);
            const op = edge < 0.08 ? edge / 0.08 : 1;
            d.packet.setAttribute("opacity", String(0.25 + 0.5 * op));
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    reproject();
    // Critical: no continuous `move` reproject (fought CSS pan transform → jitter)
    map.on("zoomstart", onZoomStart);
    map.on("zoomanim", onZoomAnim);
    map.on("zoomend", onZoomEnd);
    map.on("moveend", onMoveEnd);
    map.on("viewreset", reproject);
    map.on("resize", reproject);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      map.off("zoomstart", onZoomStart);
      map.off("zoomanim", onZoomAnim);
      map.off("zoomend", onZoomEnd);
      map.off("moveend", onMoveEnd);
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
  lastBlockAt = null,
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
  /** Increment to re-trigger flyTo on search pick */
  const [focusToken, setFocusToken] = useState(0);
  /** Node highlighted with premium FOUND rings (search only) */
  const [searchFocus, setSearchFocus] = useState<PeerMapMarker | null>(null);
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
    setSelected(null);
    setSearchFocus(null);
    setFocusToken(0);
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

  /** No peer-IP boom highlight — miner is not a map pin */
  const boomIps = useMemo(() => new Set<string>(), []);

  const allMarkers = data?.markers ?? EMPTY_MARKERS;

  /** Ensure filter is wide enough for a selected node to appear on the map */
  const ensureFilterForState = useCallback(
    (state: PeerMapState | string | undefined | null) => {
      if (nodeMode === "my") return;
      const s = normalizeState(state);
      setMapFilter((prev) => {
        if (s === "connected") return prev;
        if (s === "live" && prev === "connected") return "live";
        if (s === "seen" && prev !== "all") return "all";
        return prev;
      });
    },
    [nodeMode]
  );

  const handleSelectPeer = useCallback(
    (m: PeerMapMarker, opts?: { fly?: boolean }) => {
      // Always prefer the catalog/map marker so status matches pins & search
      const canonical =
        resolveMarkerFromList(allMarkers, data?.me, {
          id: m.id,
          ip: m.ip,
        }) || m;
      ensureFilterForState(canonical.state);
      setSelected(canonical);
      if (opts?.fly) {
        // Search pick: premium FOUND highlight + fly
        setSearchFocus(canonical);
        setFocusToken((t) => t + 1);
      } else {
        // Map pin click: keep status card, clear search-only highlight
        setSearchFocus(null);
      }
    },
    [allMarkers, data?.me, ensureFilterForState]
  );

  /** Keep selected / search-focus status in sync when map data refreshes */
  useEffect(() => {
    if (!selected && !searchFocus) return;
    if (selected) {
      const fresh = resolveMarkerFromList(allMarkers, data?.me, {
        id: selected.id,
        ip: selected.ip,
      });
      if (
        fresh &&
        (fresh.state !== selected.state ||
          fresh.name !== selected.name ||
          fresh.version !== selected.version ||
          fresh.lat !== selected.lat ||
          fresh.lon !== selected.lon)
      ) {
        setSelected(fresh);
      }
    }
    if (searchFocus) {
      const freshF = resolveMarkerFromList(allMarkers, data?.me, {
        id: searchFocus.id,
        ip: searchFocus.ip,
      });
      if (
        freshF &&
        (freshF.state !== searchFocus.state ||
          freshF.lat !== searchFocus.lat ||
          freshF.lon !== searchFocus.lon)
      ) {
        setSearchFocus(freshF);
      }
    }
  }, [allMarkers, data?.me, selected, searchFocus]);

  /** Apply elegant status filters (Ghost never shown). */
  const peerMarkers = useMemo(() => {
    const selectedId = selected?.id;
    const selectedIp = selected?.ip;
    return allMarkers.filter((m) => {
      const s = normalizeState(m.state);
      if (s === "ghost") return false;
      // Keep focused node visible even if filter would hide it
      if (
        selectedId &&
        selectedId !== "me" &&
        (m.id === selectedId || m.ip === selectedIp)
      ) {
        return true;
      }
      if (mapFilter === "connected") return s === "connected";
      if (mapFilter === "live") return s === "connected" || s === "live";
      return s === "connected" || s === "live" || s === "seen";
    });
  }, [allMarkers, mapFilter, selected?.id, selected?.ip]);

  /**
   * Top regions follow the active map filter (Live / Linked / All),
   * so counts match pins currently shown — not the full API snapshot.
   */
  const topCountries = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of peerMarkers) {
      const cc = (m.country || "??").toUpperCase();
      counts[cc] = (counts[cc] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }, [peerMarkers]);

  /** Search corpus: all non-ghost mapped nodes (+ me if present) */
  const searchNodes = useMemo(() => {
    const list = allMarkers.filter((m) => normalizeState(m.state) !== "ghost");
    if (data?.me && !list.some((m) => m.id === data.me!.id || m.ip === data.me!.ip)) {
      return [data.me, ...list];
    }
    return list;
  }, [allMarkers, data?.me]);

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

  /** Live network stats (full catalog, independent of filter chips) */
  const mapStats = useMemo(() => {
    const markers = allMarkers;
    let connected = 0;
    let liveOnly = 0;
    let seen = 0;
    let ghost = 0;
    for (const m of markers) {
      const s = normalizeState(m.state);
      if (s === "connected") connected++;
      else if (s === "live") liveOnly++;
      else if (s === "seen") seen++;
      else ghost++;
    }
    connected = data?.connectedMapped ?? connected;
    liveOnly = data?.liveMapped ?? data?.reachableMapped ?? liveOnly;
    seen = data?.seenMapped ?? seen;
    ghost = data?.ghostMapped ?? ghost;
    const live = data?.liveTotal ?? connected + liveOnly;
    const active =
      data?.activeTotal ?? data?.discovered ?? connected + liveOnly + seen;
    const totalEver =
      data?.totalEver ?? data?.networkTotal ?? active + ghost;
    const withGeo = data?.withGeo ?? data?.mapped ?? markers.length;
    const unmapped = data?.unmapped ?? 0;
    return {
      /** Active network memory (no Ghost) */
      discovered: active,
      active,
      live,
      liveOnly,
      connected,
      seen,
      ghost,
      totalEver,
      withGeo,
      unmapped,
      showing: peerMarkers.length,
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
              onSelect={(m) => handleSelectPeer(m, { fly: false })}
              focusId={searchFocus?.id ?? selected?.id}
              focusIp={
                (searchFocus ?? selected)?.id === "me"
                  ? null
                  : (searchFocus ?? selected)?.ip
              }
            />

            {data?.me && (
              <MeMarkerLayer
                me={data.me}
                onSelect={(m) => handleSelectPeer(m, { fly: false })}
                roleLabel={nodeMode === "my" ? "MY NODE" : "lumen node"}
              />
            )}

            {/* Champagne FOUND rings — search picks only (not status colors) */}
            <FocusNodeLayer
              target={searchFocus}
              focusToken={focusToken}
              persistent
            />

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

      {/* ── Mobile map HUD: search top · BOOM left / REFRESH right bottom ── */}
      <div className="md:hidden absolute top-0 inset-x-0 z-[40] pointer-events-none p-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] space-y-2">
        <NodeMapSearch
          nodes={searchNodes}
          selectedId={selected?.id}
          compact
          onSelect={(n) => {
            handleSelectPeer(n as PeerMapMarker, { fly: true });
          }}
          className="w-full"
        />
        <div className="flex justify-center">
          <BlockTimeIndicator
            blockHeight={blockHeight}
            lastBlockAt={lastBlockAt}
          />
        </div>
      </div>
      {!hideControls && (
        <div className="md:hidden absolute bottom-0 inset-x-0 z-[40] pointer-events-none flex items-end justify-between gap-3 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={simulateBoom}
            className="pointer-events-auto flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-2xl text-[10px] font-mono tracking-wider border border-[#FF7A3D]/50 bg-[#0A0A0F]/92 text-[#FF7A3D] shadow-lg backdrop-blur-md active:scale-[0.97]"
          >
            <Zap className="w-3.5 h-3.5 shrink-0" /> BOOM
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="pointer-events-auto flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-2xl text-[10px] font-mono tracking-wider border border-white/20 bg-[#0A0A0F]/92 text-[#E8E8F0] shadow-lg backdrop-blur-md active:scale-[0.97]"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${isFetching ? "animate-spin" : ""}`}
            />
            REFRESH
          </button>
        </div>
      )}

      {/*
        Desktop HUD layout (symmetric, premium):
        ┌ Search ──────────────┐              ┌ Refresh · Boom ┐
        │                      │              │                │
        │                      │              │                │
        └ Top Regions ─────────┘  [key]  ┌ Selected? ───────┐
                                         │ Stats panel ─────┘
      */}

      {/* Top-left: node search */}
      <div className="hidden md:flex absolute top-4 left-4 z-[40] w-[min(300px,32vw)] flex-col gap-2 pointer-events-none">
        <NodeMapSearch
          nodes={searchNodes}
          selectedId={selected?.id}
          onSelect={(n) => {
            handleSelectPeer(n as PeerMapMarker, { fly: true });
          }}
          className="w-full"
        />
      </div>

      {/* Top-center: live block timer */}
      <div className="hidden md:flex absolute top-4 left-1/2 -translate-x-1/2 z-[40] pointer-events-none">
        <BlockTimeIndicator
          blockHeight={blockHeight}
          lastBlockAt={lastBlockAt}
        />
      </div>

      {/* Top-right: actions */}
      {!hideControls && (
        <div className="hidden md:flex absolute top-4 right-4 z-[40] gap-2 pointer-events-none">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="pointer-events-auto glass px-3.5 py-2 rounded-xl text-[10px] font-mono tracking-widest border border-white/10 hover:border-[#FF7A3D]/40 flex items-center gap-1.5 text-[#E8E8F0]"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            REFRESH
          </button>
          <button
            type="button"
            onClick={simulateBoom}
            className="pointer-events-auto glass px-3.5 py-2 rounded-xl text-[10px] font-mono tracking-widest border border-[#FF7A3D]/35 bg-[#FF7A3D]/10 hover:bg-[#FF7A3D]/20 text-[#FF7A3D] flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> BOOM
          </button>
        </div>
      )}

      {/* Bottom-left: Top Regions */}
      {topRegionsBlock && (
        <div className="hidden md:block absolute bottom-4 left-4 z-[40] w-[min(280px,30vw)]">
          {topRegionsBlock}
        </div>
      )}

      {/* Bottom-center: compact color key */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[40] glass rounded-2xl px-4 py-2 text-[10px] font-mono tracking-wider border border-white/10 hidden md:flex items-center gap-3.5 text-[#A0A0B0] pointer-events-none">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF7A3D]" />{" "}
          {nodeMode === "my" ? "My Node" : "lumen"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] shadow-[0_0_6px_rgba(0,229,255,0.6)]" />{" "}
          Connected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_5px_rgba(16,185,129,0.5)]" />{" "}
          Live
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#A8B4C8] shadow-[0_0_5px_rgba(168,180,200,0.4)]" />{" "}
          Seen
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#C45C5C] shadow-[0_0_5px_rgba(196,92,92,0.4)]" />{" "}
          Ghost
        </span>
      </div>

      {/* Bottom-right: selected (if any) + ERGO NETWORK MAP stats */}
      <div className="hidden md:flex absolute bottom-4 right-4 z-[40] w-[min(300px,32vw)] flex-col gap-2 items-stretch pointer-events-none">
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto glass rounded-2xl px-4 py-3.5 border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
            >
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
                        : "lumen node"
                      : stateMeta(normalizeState(selected.state)).short}
                  </div>
                  <div className="font-semibold text-sm break-all">
                    {selected.name}
                  </div>
                  <div className="font-mono text-xs text-[#A0A0B0] mt-1 break-all">
                    {selected.ip}
                    {selected.port ? `:${selected.port}` : ""}
                  </div>
                  <div className="text-xs mt-2 text-[#E8E8F0]/90">
                    {[selected.city, selected.country]
                      .filter(Boolean)
                      .join(", ") || "Unknown location"}
                  </div>
                  {shortVersion(selected.version) && (
                    <div className="text-[10px] font-mono text-[#00E5FF]/75 mt-1">
                      v{shortVersion(selected.version)}
                    </div>
                  )}
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
                              <span className="text-[#10B981]">
                                Live · answering now
                              </span>
                            );
                          if (s === "seen")
                            return (
                              <span className="text-[#A8B4C8]">
                                Seen · not answering
                              </span>
                            );
                          return (
                            <span className="text-[#C45C5C]">
                              Ghost · history
                            </span>
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
                          ? "Active source · via lumen bridge"
                          : "Active source · this lumen server"}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setSearchFocus(null);
                  }}
                  className="text-[#A0A0B0] hover:text-white text-xs font-mono shrink-0"
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats panel */}
        <div className="pointer-events-auto glass rounded-2xl px-4 py-3.5 border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2 text-[#FF7A3D] font-mono text-[10px] tracking-[3px] mb-2.5">
            <Globe2 className="w-3.5 h-3.5" /> ERGO NETWORK MAP
          </div>

          {nodeMode === "lumen" ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-2.5 py-2.5">
                  <div className="font-mono text-lg sm:text-xl tabular-nums text-white leading-none tracking-tight">
                    {mapStats.discovered.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono tracking-wider text-[#A0A0B0] mt-1">
                    DISCOVERED
                  </div>
                </div>
                <div className="rounded-xl bg-[#10B981]/[0.08] border border-[#10B981]/25 px-2.5 py-2.5">
                  <div className="font-mono text-lg sm:text-xl tabular-nums text-[#10B981] leading-none tracking-tight">
                    {mapStats.live.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono tracking-wider text-[#A0A0B0] mt-1">
                    LIVE
                  </div>
                </div>
                <div className="rounded-xl bg-[#00E5FF]/[0.08] border border-[#00E5FF]/20 px-2.5 py-2.5">
                  <div className="font-mono text-lg sm:text-xl tabular-nums text-[#00E5FF] leading-none tracking-tight">
                    {mapStats.connected.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono tracking-wider text-[#A0A0B0] mt-1">
                    CONNECTED
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mb-3 px-0.5 text-[10px] font-mono text-[#A0A0B0]/80 tracking-wide">
                <span>
                  <span className="text-[#E8E8F0] tabular-nums">
                    {mapStats.withGeo.toLocaleString()}
                  </span>{" "}
                  on map
                  {mapStats.unmapped > 0 && (
                    <span className="text-[#A0A0B0]/50">
                      {" "}
                      · {mapStats.unmapped} no geo
                    </span>
                  )}
                </span>
                <span className="text-[#A0A0B0]/60">
                  showing{" "}
                  <span className="text-[#E8E8F0] tabular-nums">
                    {mapStats.showing}
                  </span>
                </span>
              </div>
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[10px] font-mono tracking-wide text-[#A0A0B0]">
                <span>
                  Ghost{" "}
                  <span className="text-[#C45C5C] tabular-nums">
                    {mapStats.ghost.toLocaleString()}
                  </span>
                  <span className="text-[#A0A0B0]/50"> · history</span>
                </span>
                <span>
                  Total ever{" "}
                  <span className="text-[#E8E8F0]/80 tabular-nums">
                    {mapStats.totalEver.toLocaleString()}
                  </span>
                </span>
              </div>

              <div className="flex p-0.5 rounded-xl bg-black/40 border border-white/10">
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
            </>
          ) : (
            <div className="rounded-xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.06] px-3 py-3">
              <div className="font-mono text-2xl tabular-nums text-[#00E5FF] leading-none tracking-tight">
                {mapStats.connected.toLocaleString()}
              </div>
              <div className="text-[10px] font-mono tracking-wider text-[#A0A0B0] mt-1.5">
                {mapStats.connected === 1
                  ? "PEER CONNECTED TO YOUR NODE"
                  : "PEERS CONNECTED TO YOUR NODE"}
              </div>
              {mapStats.withGeo > 0 && (
                <div className="text-[10px] font-mono text-[#A0A0B0]/70 mt-1">
                  {mapStats.withGeo.toLocaleString()} mapped · GeoIP
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Mobile: UNDER map — selected card first, then stats / regions ── */}
    <div className="md:hidden mt-3 space-y-2.5">
      {/* Node card: immediately below the map canvas */}
      {selected && (
        <div className="glass rounded-2xl px-4 py-3.5 border border-white/10 shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
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
                    : "lumen node"
                  : stateMeta(normalizeState(selected.state)).short}
              </div>
              <div className="font-semibold text-sm break-all">
                {selected.name}
              </div>
              <div className="font-mono text-xs text-[#A0A0B0] mt-1 break-all">
                {selected.ip}
                {selected.port ? `:${selected.port}` : ""}
              </div>
              <div className="text-xs mt-1.5 text-[#E8E8F0]/90">
                {[selected.city, selected.country].filter(Boolean).join(", ") ||
                  "Unknown location"}
              </div>
              {shortVersion(selected.version) && (
                <div className="text-[10px] font-mono text-[#00E5FF]/75 mt-1">
                  v{shortVersion(selected.version)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setSearchFocus(null);
              }}
              className="text-[#A0A0B0] hover:text-white text-xs font-mono flex-shrink-0"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl px-3 py-3 border border-white/10">
        {nodeMode === "lumen" ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl bg-white/5 px-2 py-2 text-center">
                <div className="font-mono text-lg tabular-nums text-white">
                  {mapStats.discovered.toLocaleString()}
                </div>
                <div className="text-[9px] font-mono text-[#A0A0B0] tracking-wider">
                  DISCOVERED
                </div>
              </div>
              <div className="rounded-xl bg-[#10B981]/10 px-2 py-2 text-center border border-[#10B981]/20">
                <div className="font-mono text-lg tabular-nums text-[#10B981]">
                  {mapStats.live.toLocaleString()}
                </div>
                <div className="text-[9px] font-mono text-[#A0A0B0] tracking-wider">
                  LIVE
                </div>
              </div>
              <div className="rounded-xl bg-[#00E5FF]/10 px-2 py-2 text-center border border-[#00E5FF]/15">
                <div className="font-mono text-lg tabular-nums text-[#00E5FF]">
                  {mapStats.connected.toLocaleString()}
                </div>
                <div className="text-[9px] font-mono text-[#A0A0B0] tracking-wider">
                  CONNECTED
                </div>
              </div>
            </div>
            <div className="text-[10px] font-mono text-[#A0A0B0] mb-2 text-center">
              {mapStats.withGeo.toLocaleString()} on map · showing{" "}
              {mapStats.showing}
            </div>
            <div className="text-[10px] font-mono text-[#A0A0B0]/80 mb-3 text-center tracking-wide">
              Ghost{" "}
              <span className="text-[#C45C5C] tabular-nums">
                {mapStats.ghost.toLocaleString()}
              </span>
              {" · total ever "}
              <span className="text-[#E8E8F0]/80 tabular-nums">
                {mapStats.totalEver.toLocaleString()}
              </span>
            </div>
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
          </>
        ) : (
          <div className="mb-3 rounded-xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.06] px-3 py-3 text-center">
            <div className="font-mono text-2xl tabular-nums text-[#00E5FF]">
              {mapStats.connected.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono tracking-wider text-[#A0A0B0] mt-1">
              PEERS CONNECTED TO YOUR NODE
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-[#FF7A3D] font-mono text-[10px] tracking-[2px] mb-2">
          <Globe2 className="w-3.5 h-3.5" /> MAP
        </div>
        <div className="space-y-1.5 text-[11px] text-[#A0A0B0]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF7A3D]" />
            <span>
              <span className="text-white">
                {nodeMode === "my" ? "My Node" : "lumen node"}
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
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>
              <span className="text-white">Live</span> — answering
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#A8B4C8]" />
            <span>
              <span className="text-white">Seen</span> — recent, quiet
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C45C5C]" />
            <span>
              <span className="text-white">Ghost</span> — history
            </span>
          </div>
        </div>
      </div>
      {topRegionsBlock}
      {nodeMode === "lumen" && (
        <div className="flex items-center justify-between px-1 text-[10px] font-mono text-[#A0A0B0] tracking-wider">
          <span>
            discovered{" "}
            <span className="text-white tabular-nums">
              {mapStats.discovered}
            </span>
            {" · live "}
            <span className="text-[#10B981] tabular-nums">{mapStats.live}</span>
            {" · connected "}
            <span className="text-[#00E5FF] tabular-nums">
              {mapStats.connected}
            </span>
          </span>
        </div>
      )}
    </div>
    </div>
  );
}
