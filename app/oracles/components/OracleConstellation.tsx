"use client";

/**
 * Oracle Constellation — Canvas 2D visual (design preserved).
 * Driven by real /api/oracles feed props (one pool per instance).
 */

import React, { useRef, useEffect, useState, useMemo } from "react";
import type {
  OracleFeedData,
  FeedStatus,
  OracleLiveEvent,
} from "./types";

interface Oracle {
  name: string;
  address: string;
  ring: number;
  angle: number;
  speed: number;
  color: string;
  status: "Active" | "Verifying" | "Offline" | "Slashed";
  latency: number;
  accuracy: number;
  stake: number;
  reward: number;
  size: number;
  slashing: number;
  height: number | null;
  collectedHeight?: number | null;
  rewardTokens?: number | null;
  x?: number;
  y?: number;
  pulse?: number;
  /** 0–1 flash when this oracle just published a datapoint */
  publishFlash?: number;
  /** Connected operator (My Oracle bridge) — label YOU */
  isMine?: boolean;
  /** Host agent on lumen network pane — label lumen */
  isLumenHost?: boolean;
  /** Key held · not posting (red idle) */
  idleKey?: boolean;
  detail?: string | null;
}

/** Red for key holders who are not posting */
const IDLE_KEY_COLOR = "#EF4444";

interface Datapoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
  isOutlier: boolean;
  source: string;
}

interface Reward {
  x: number;
  y: number;
  tx: number;
  ty: number;
  progress: number;
  speed: number;
  size: number;
}

interface SlashPart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Ballot {
  x: number;
  y: number;
  angle: number;
  dist: number;
  speed: number;
  alpha: number;
}

interface GlowRing {
  r: number;
  a: number;
  color: string;
}

interface EpochData {
  epoch: number;
  price: number;
  sources: number;
  consensus: number;
}

function shortAddr(a: string): string {
  if (a.length <= 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function mapStatus(
  s: FeedStatus
): "Active" | "Verifying" | "Offline" | "Slashed" {
  if (s === "live") return "Active";
  if (s === "stale") return "Verifying";
  return "Offline";
}

function statusColor(
  s: "Active" | "Verifying" | "Offline" | "Slashed"
): string {
  if (s === "Active") return "#00D4AA";
  if (s === "Verifying") return "#FBBF24";
  if (s === "Slashed") return "#EF4444";
  return "#555";
}

/** Stable 0..1 hash from address — for tiny phase jitter, not clustering. */
function addrPhase(address: string): number {
  let h = 0;
  for (let i = 0; i < address.length; i++) {
    h = (h * 33 + address.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

function buildOraclesFromFeed(feed: OracleFeedData): Oracle[] {
  const nodes = feed.nodes?.length
    ? feed.nodes
    : Array.from({ length: 8 }).map((_, i) => ({
        address: `unknown-${feed.id}-${i}`,
        height: null as number | null,
        collectedHeight: null as number | null,
        rewardTokens: null as number | null,
        status: feed.status as FeedStatus,
      }));

  /** mine bridge → YOU; lumen network host agent → lumen (never "YOU") */
  const isBridgeMine = feed.scope === "mine";
  const isLumenNetwork = feed.scope === "network" || feed.scope == null;

  // Split first so idle can be laid evenly on the outermost orbit
  type NodeRow = (typeof nodes)[number];
  const working: { node: NodeRow; i: number }[] = [];
  const idle: { node: NodeRow; i: number }[] = [];
  nodes.forEach((node, i) => {
    const st = mapStatus(node.status);
    const idleKey =
      !!(node as { idleKey?: boolean }).idleKey || st === "Offline";
    (idleKey ? idle : working).push({ node, i });
  });

  const idleN = Math.max(1, idle.length);

  function placeOne(
    node: NodeRow,
    opts: { ring: number; angle: number; idleKey: boolean; workIdx: number }
  ): Oracle {
    const st = mapStatus(node.status);
    const idleKey = opts.idleKey;
    const ring = opts.ring;
    // Same angular speed for all idle → keep even spacing forever
    const speed = idleKey
      ? 0.0007
      : ring === 1
        ? 0.004
        : ring === 2
          ? 0.0025
          : 0.0015;
    const age =
      feed.tipHeight != null && node.height != null
        ? Math.max(0, feed.tipHeight - node.height)
        : null;
    const accuracy =
      st === "Offline" || idleKey
        ? 0
        : st === "Verifying"
          ? 96 + Math.min(3, Math.max(0, 10 - (age ?? 10)))
          : 98.5 + Math.min(1.4, Math.max(0, (20 - (age ?? 0)) * 0.05));
    const size = st === "Active" ? 6 + (opts.workIdx % 3) : st === "Verifying" ? 5.5 : 4.5;

    const rawMine = !!(node as { isMine?: boolean }).isMine;
    const isYou = rawMine && isBridgeMine;
    const isLumenHost = rawMine && isLumenNetwork && !isBridgeMine;
    const isSpecial = isYou || isLumenHost;

    const mineRing = isSpecial ? 1 : ring;
    const mineSize = isSpecial ? 9 : size;
    const label = isYou
      ? "YOU"
      : isLumenHost
        ? "lumen"
        : shortAddr(node.address);
    const color = isYou
      ? "#FF7A3D"
      : isLumenHost
        ? "#00E5FF"
        : idleKey
          ? IDLE_KEY_COLOR
          : statusColor(st);
    const detail =
      (node as { detail?: string | null }).detail ??
      (idleKey ? "Keys held · not posting" : null);

    return {
      name: label,
      address: node.address,
      ring: mineRing,
      angle: opts.angle,
      speed: isSpecial ? speed * 0.85 : speed,
      color,
      status: idleKey ? "Offline" : st,
      idleKey: idleKey || undefined,
      detail,
      latency:
        age == null
          ? 0
          : st === "Offline" || idleKey
            ? 999
            : Math.min(200, 8 + age * 2),
      accuracy: Math.round(accuracy * 10) / 10,
      stake: 0,
      reward: node.rewardTokens ?? 0,
      size: mineSize,
      slashing: 0,
      height: node.height,
      collectedHeight: node.collectedHeight ?? null,
      rewardTokens: node.rewardTokens ?? null,
      pulse: Math.random() * Math.PI * 2,
      isMine: isYou,
      isLumenHost,
    };
  }

  const out: Oracle[] = [];

  // Active / working — rings 1–2, evenly spaced per ring
  working.forEach(({ node }, wi) => {
    const rawMine = !!(node as { isMine?: boolean }).isMine;
    const isSpecial =
      (rawMine && isBridgeMine) ||
      (rawMine && isLumenNetwork && !isBridgeMine);
    // ring 1 = inner (special + half of working), ring 2 = mid
    const ring = isSpecial ? 1 : (wi % 2) + 1;
    const onThisRing = working.filter((_, j) => {
      const n2 = working[j].node;
      const rm = !!(n2 as { isMine?: boolean }).isMine;
      const sp =
        (rm && isBridgeMine) || (rm && isLumenNetwork && !isBridgeMine);
      const r = sp ? 1 : (j % 2) + 1;
      return r === ring;
    });
    const idxOnRing = onThisRing.findIndex((x) => x.node.address === node.address);
    const countOnRing = Math.max(1, onThisRing.length);
    // Even spread + small stable phase from address (no packing)
    const angle =
      (idxOnRing / countOnRing) * Math.PI * 2 +
      (ring === 1 ? 0.15 : 0.9) +
      addrPhase(node.address) * 0.08;
    out.push(
      placeOne(node, {
        ring,
        angle,
        idleKey: false,
        workIdx: wi,
      })
    );
  });

  // Idle key holders — farthest orbit (ring 4), equal angular spacing
  // Same speed for all → stay evenly spaced; tiny phase only for start offset group
  idle.forEach(({ node }, ii) => {
    const angle =
      (ii / idleN) * Math.PI * 2 +
      Math.PI / idleN + // half-step so they don't align with axes as a clump
      0.35;
    out.push(
      placeOne(node, {
        ring: 4, // outermost — beyond working rings 1–3
        angle,
        idleKey: true,
        workIdx: ii,
      })
    );
  });

  return out;
}

function historyToEpochBars(feed: OracleFeedData): EpochData[] {
  const hist = feed.history || [];
  if (hist.length === 0) {
    const ep = feed.epoch ?? 0;
    const price = feed.price ?? 0;
    const sources = feed.activeOracles ?? feed.nodes?.length ?? 0;
    return Array.from({ length: 8 }).map((_, i) => ({
      epoch: Math.max(0, ep - 7 + i),
      price,
      sources,
      consensus:
        feed.status === "live" ? 98 : feed.status === "stale" ? 72 : 20,
    }));
  }
  const slice = hist.slice(-8);
  while (slice.length < 8) {
    slice.unshift(slice[0] || { t: 0, price: feed.price ?? 0, rate: 0, height: 0 });
  }
  const baseEpoch = feed.epoch ?? slice.length;
  return slice.map((h, i) => ({
    epoch: baseEpoch - (slice.length - 1 - i),
    price: h.price,
    sources: feed.activeOracles ?? feed.nodes?.length ?? 0,
    consensus:
      feed.status === "live" ? 97 : feed.status === "stale" ? 70 : 25,
  }));
}

function confidenceFromFeed(feed: OracleFeedData): number {
  if (feed.status === "live") {
    const a = feed.activeOracles ?? 0;
    const t = feed.totalOracles ?? feed.nodes?.length ?? 1;
    return Math.min(99, Math.round(70 + (a / Math.max(t, 1)) * 29));
  }
  if (feed.status === "stale") return 55 + Math.min(20, (feed.activeOracles ?? 0) * 2);
  return 15;
}

export default function OracleConstellation({
  feed,
  compact = false,
  /** When false, only canvas + tooltip — parent shell owns metrics panels */
  chrome = true,
  /** Override core/glow accent (gold for XAU, cyan for USD) */
  accentOverride,
  /** When true, omit center price readout (parent shows single price panel) */
  hideCenterPrice = false,
  /** Bubble activity log for parent shell */
  onActivity,
}: {
  feed: OracleFeedData;
  /** Tighter layout for dual-pane */
  compact?: boolean;
  chrome?: boolean;
  accentOverride?: string;
  hideCenterPrice?: boolean;
  onActivity?: (
    rows: { id: string; t: number; kind: string; message: string }[]
  ) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;
  // React hover state only when identity changes (not every mousemove)
  const [hovered, setHovered] = useState<Oracle | null>(null);
  const lastHoverAddr = useRef<string | null>(null);
  const [epoch, setEpoch] = useState(feed.epoch ?? 0);
  const [confidence, setConfidence] = useState(confidenceFromFeed(feed));
  const [activeSources, setActiveSources] = useState(
    feed.activeOracles ?? feed.nodes?.length ?? 0
  );
  const [poolStatus, setPoolStatus] = useState(feed.status);
  const [ageBlocks, setAgeBlocks] = useState(feed.ageBlocks);

  // Light feed key — skip full node string churn every 5s poll when quiet
  const feedKey = `${feed.id}:${feed.settlementHeight}:${feed.rateNano ?? ""}:${feed.status}:${feed.activeOracles ?? ""}:${feed.nodes?.length ?? 0}:${(feed.liveEvents || []).length}`;
  const clientPrevRef = useRef<{
    settlement: number | null;
    rate: number | null;
    nodes: Record<string, { h: number | null; r: number | null }>;
  } | null>(null);

  const animDataRef = useRef({
    time: 0,
    phase: "idle" as "idle" | "submit" | "collect" | "aggregate" | "distribute",
    phaseTimer: 0,
    epochProgress: 0,
    epoch: feed.epoch ?? 0,
    currentPrice: feed.price ?? 0,
    priceLabel: feed.priceLabel ?? "—",
    priceAlt: feed.priceAlt ?? "",
    pairLabel: feed.pair,
    unitLabel: feed.unitLabel,
    accent: accentOverride || feed.accent || "#00E5FF",
    confidence: confidenceFromFeed(feed),
    activeSources: feed.activeOracles ?? 0,
    totalSources: feed.totalOracles ?? feed.nodes?.length ?? 0,
    poolStatus: feed.status as FeedStatus,
    ageBlocks: feed.ageBlocks as number | null,
    tipHeight: feed.tipHeight as number | null,
    liveMax: feed.statusThresholds?.liveMax ?? 24,
    stars: [] as {
      x: number;
      y: number;
      size: number;
      alpha: number;
      twinkle: number;
    }[],
    oracles: [] as Oracle[],
    datapoints: [] as Datapoint[],
    rewards: [] as Reward[],
    slashParts: [] as SlashPart[],
    ballots: [] as Ballot[],
    glowRings: [] as GlowRing[],
    hovered: null as Oracle | null,
    mx: 0,
    my: 0,
    W: 0,
    H: 0,
    CX: 0,
    CY: 0,
    epochHistory: [] as EpochData[],
    compact: compact,
    hideCenterPrice: hideCenterPrice,
    lastSettlement: feed.settlementHeight as number | null,
    /** Real network events to animate (datapoints / rewards / refresh) */
    eventQueue: [] as OracleLiveEvent[],
    seenEventIds: new Set<string>(),
  });

  // Keep layout flags in sync without restarting the canvas loop
  useEffect(() => {
    animDataRef.current.compact = compact;
    animDataRef.current.hideCenterPrice = hideCenterPrice;
    if (accentOverride) animDataRef.current.accent = accentOverride;
  }, [compact, hideCenterPrice, accentOverride]);

  // Sync live feed → React state + queue REAL events for animation
  useEffect(() => {
    const ad = animDataRef.current;
    const nextOracles = buildOraclesFromFeed(feed);
    const prevByAddr = new Map(ad.oracles.map((o) => [o.address, o]));
    ad.oracles = nextOracles.map((o) => {
      const prev = prevByAddr.get(o.address);
      if (prev) {
        // Always keep live angle/position across 5s polls — idle used to
        // reset to buildOraclesFromFeed angles every refresh (snap-back).
        // Same angular speed + preserved angles = even spacing stays.
        o.angle = prev.angle;
        o.x = prev.x;
        o.y = prev.y;
        o.pulse = prev.pulse;
        o.publishFlash = prev.publishFlash;
        // If still idle on outer orbit, keep ring 4 even if index shuffle
        if (o.idleKey && prev.idleKey && prev.ring === 4) {
          o.ring = 4;
        }
      }
      return o;
    });

    ad.epoch = feed.epoch ?? ad.epoch;
    ad.currentPrice = feed.price ?? ad.currentPrice;
    ad.priceLabel = feed.priceLabel ?? "—";
    ad.priceAlt = feed.priceAlt ?? "";
    ad.pairLabel = feed.pair;
    ad.unitLabel = feed.unitLabel;
    ad.accent = accentOverride || feed.accent || "#00E5FF";
    ad.confidence = confidenceFromFeed(feed);
    ad.activeSources = feed.activeOracles ?? feed.nodes?.length ?? 0;
    ad.totalSources = feed.totalOracles ?? feed.nodes?.length ?? 0;
    ad.poolStatus = feed.status;
    ad.ageBlocks = feed.ageBlocks;
    ad.tipHeight = feed.tipHeight;
    ad.liveMax = feed.statusThresholds?.liveMax ?? 24;
    ad.epochHistory = historyToEpochBars(feed);

    // Dual-pane (chrome=false): keep data in anim ref only — avoid React re-render thrash
    if (chrome) {
      setEpoch(ad.epoch);
      setConfidence(ad.confidence);
      setActiveSources(ad.activeSources);
      setPoolStatus(feed.status);
      setAgeBlocks(feed.ageBlocks);
    }

    // ── Real events from API (server-side diff) ──
    const incoming: OracleLiveEvent[] = [...(feed.liveEvents || [])];

    // ── Client-side fallback diff (if server had no prev snapshot yet) ──
    const prev = clientPrevRef.current;
    if (prev && (!feed.liveEvents || feed.liveEvents.length === 0)) {
      let seq = 0;
      const now = Date.now();
      for (const n of feed.nodes || []) {
        const p = prev.nodes[n.address];
        if (p && n.height != null && p.h != null && n.height > p.h) {
          incoming.push({
            id: `cli-dp-${n.address}-${n.height}-${now}-${seq++}`,
            t: now,
            kind: "datapoint",
            address: n.address,
            height: n.height,
            message: `POST ${shortAddr(n.address)} @ ${n.height}`,
          });
        }
        if (
          p &&
          n.rewardTokens != null &&
          p.r != null &&
          n.rewardTokens > p.r
        ) {
          const delta = n.rewardTokens - p.r;
          incoming.push({
            id: `cli-rw-${n.address}-${now}-${seq++}`,
            t: now,
            kind: "reward",
            address: n.address,
            rewardDelta: delta,
            message: `REWARD +${delta} → ${shortAddr(n.address)}`,
          });
        }
      }
      if (
        feed.settlementHeight != null &&
        prev.settlement != null &&
        feed.settlementHeight > prev.settlement
      ) {
        incoming.push({
          id: `cli-pool-${feed.settlementHeight}-${now}`,
          t: now,
          kind: "pool_refresh",
          height: feed.settlementHeight,
          message: `POOL REFRESH h=${feed.settlementHeight}`,
        });
      }
      if (
        feed.rateNano != null &&
        prev.rate != null &&
        feed.rateNano !== prev.rate
      ) {
        incoming.push({
          id: `cli-rate-${now}`,
          t: now,
          kind: "rate_change",
          message: `RATE UPDATE → ${feed.priceLabel ?? feed.rateNano}`,
        });
      }
    }

    // Enqueue unseen events for the animation loop
    for (const ev of incoming) {
      if (ad.seenEventIds.has(ev.id)) continue;
      ad.seenEventIds.add(ev.id);
      // cap memory
      if (ad.seenEventIds.size > 400) {
        ad.seenEventIds = new Set(Array.from(ad.seenEventIds).slice(-200));
      }
      ad.eventQueue.push(ev);
    }

    if (incoming.length > 0 && onActivity) {
      onActivity(
        incoming.map((e) => ({
          id: e.id,
          t: e.t,
          kind: e.kind,
          message: e.message,
        }))
      );
    }

    // Remember for next client diff
    const nodeMap: Record<string, { h: number | null; r: number | null }> = {};
    for (const n of feed.nodes || []) {
      nodeMap[n.address] = {
        h: n.height,
        r: n.rewardTokens ?? null,
      };
    }
    clientPrevRef.current = {
      settlement: feed.settlementHeight,
      rate: feed.rateNano ?? null,
      nodes: nodeMap,
    };
    ad.lastSettlement = feed.settlementHeight;
  }, [feedKey, feed]);

  useEffect(() => {
    animDataRef.current.compact = compact;
  }, [compact]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const containerEl = containerRef.current;
    if (!canvasEl || !containerEl) return;
    const ctxEl = canvasEl.getContext("2d");
    if (!ctxEl) return;
    const canvas = canvasEl;
    const container = containerEl;
    const ctx = ctxEl;

    const ad = animDataRef.current;

    // Init stars once (stable baseAlpha — no cumulative jitter)
    if (ad.stars.length === 0) {
      const nStars = ad.compact ? 56 : 90;
      for (let i = 0; i < nStars; i++) {
        ad.stars.push({
          x: Math.random() * 3000,
          y: Math.random() * 2000,
          size: Math.random() * 1.5 + 0.3,
          alpha: Math.random() * 0.35 + 0.12,
          twinkle: Math.random() * 0.012 + 0.004,
        });
      }
    }

    if (ad.oracles.length === 0) {
      ad.oracles = buildOraclesFromFeed(feed);
    }

    function baseRings(): number[] {
      // Leave margin so rings sit inside corner metric chips
      // Snap radii to whole pixels — kills subpixel ring shimmer
      // Ring 4 = farthest orbit for idle key holders (away from active pack)
      const m = Math.min(ad.W, ad.H);
      const s = Math.max(0.42, Math.min(0.95, m / (ad.compact ? 560 : 680)));
      return [
        Math.round(72 * s), // 1 — core / YOU
        Math.round(118 * s), // 2 — active
        Math.round(164 * s), // 3 — active outer
        Math.round(228 * s), // 4 — idle keys only (farthest)
      ];
    }

    let lastCssW = 0;
    let lastCssH = 0;
    let lastDpr = 0;

    function resize() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      // Stable DPR (prefer integer) — fractional DPR + layout flicker = ring shake
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = Math.min(rawDpr >= 1.5 ? 2 : 1, 2);
      if (w === lastCssW && h === lastCssH && dpr === lastDpr) return;
      lastCssW = w;
      lastCssH = h;
      lastDpr = dpr;
      ad.W = w;
      ad.H = h;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Pixel-center rings/core so arcs don't shimmer
      ad.CX = Math.round(w / 2) + 0.5;
      ad.CY = Math.round(h / 2 - (ad.compact ? 8 : 16)) + 0.5;
    }
    resize();
    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    });
    ro.observe(container);

    const placeTooltip = (h: Oracle | null, x: number, y: number) => {
      const el = tooltipRef.current;
      if (!el) return;
      if (!h) {
        el.style.display = "none";
        return;
      }
      const maxX = (container.clientWidth || 400) - 220;
      el.style.display = "block";
      el.style.left = `${Math.min(x + 18, maxX)}px`;
      el.style.top = `${y + 18}px`;
    };

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      ad.mx = e.clientX - r.left;
      ad.my = e.clientY - r.top;
      let h: Oracle | null = null;
      for (const o of ad.oracles) {
        if (o.x == null || o.y == null) continue;
        const dx = ad.mx - o.x,
          dy = ad.my - o.y;
        if (dx * dx + dy * dy < (o.size + 10) ** 2) {
          h = o;
          break;
        }
      }
      ad.hovered = h;
      placeTooltip(h, ad.mx, ad.my);
      const addr = h?.address ?? null;
      if (addr !== lastHoverAddr.current) {
        lastHoverAddr.current = addr;
        setHovered(h);
      }
    };
    const onLeave = () => {
      ad.hovered = null;
      lastHoverAddr.current = null;
      placeTooltip(null, 0, 0);
      setHovered(null);
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    function glow(x: number, y: number, r: number, color: string, a: number) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const base = color.startsWith("#") ? hexToRgb(color) : color;
      g.addColorStop(0, base.replace(")", `, ${a})`).replace("rgb", "rgba"));
      g.addColorStop(
        0.5,
        base.replace(")", `, ${a * 0.3})`).replace("rgb", "rgba")
      );
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function hexToRgb(hex: string) {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
    }

    function drawHex(
      x: number,
      y: number,
      r: number,
      fill: string | CanvasGradient | null,
      stroke: string | null,
      sw = 1
    ) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = sw;
        ctx.stroke();
      }
    }

    function drawDiamond(x: number, y: number, s: number, color: string, a = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawStar(x: number, y: number, r: number, color: string, a = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(
          Math.cos(((18 + i * 72) / 180) * Math.PI) * r,
          -Math.sin(((18 + i * 72) / 180) * Math.PI) * r
        );
        ctx.lineTo(
          Math.cos(((54 + i * 72) / 180) * Math.PI) * r * 0.4,
          -Math.sin(((54 + i * 72) / 180) * Math.PI) * r * 0.4
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawTriangle(
      x: number,
      y: number,
      s: number,
      color: string,
      a = 1
    ) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.866, s * 0.5);
      ctx.lineTo(-s * 0.866, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawBg() {
      ctx.fillStyle = "#05070A";
      ctx.fillRect(0, 0, ad.W, ad.H);
      for (const s of ad.stars) {
        // Non-accumulating twinkle (old += sin drifted and shimmered)
        const a = Math.max(
          0.06,
          Math.min(0.55, s.alpha + Math.sin(ad.time * s.twinkle) * 0.08)
        );
        ctx.fillStyle = `rgba(226,232,240,${a})`;
        ctx.beginPath();
        ctx.arc(s.x % ad.W, s.y % ad.H, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawOrbits() {
      const ringR = baseRings();
      ringR.forEach((r, i) => {
        const isIdleOrbit = i === 3;
        ctx.strokeStyle = isIdleOrbit
          ? "rgba(239,68,68,0.12)"
          : `rgba(255,255,255,${0.025 + i * 0.008})`;
        ctx.lineWidth = isIdleOrbit ? 1.2 : 1;
        ctx.setLineDash(isIdleOrbit ? [2, 10] : [4, 12]);
        ctx.beginPath();
        ctx.arc(ad.CX, ad.CY, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    function hexToRgba(hex: string, a: number): string {
      const h = hex.replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return `rgba(${r},${g},${b},${a})`;
    }

    function drawCore() {
      const pulse = Math.sin(ad.time * 0.04) * 4;
      const accent = ad.accent || "#00E5FF";
      const statusGlow =
        ad.poolStatus === "live"
          ? accent
          : ad.poolStatus === "stale"
            ? "#D4A574"
            : "#EF4444";
      glow(ad.CX, ad.CY, 70 + pulse, statusGlow, 0.14);
      for (let i = 0; i < 3; i++) {
        const ph = (ad.time * 0.015 + i * 2.1) % 6;
        const rad = 35 + ph * 18;
        const a = Math.max(0, 1 - ph / 6) * 0.14;
        ctx.strokeStyle = hexToRgba(accent, a);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ad.CX, ad.CY, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      const coreR = 28 + pulse * 0.3;
      const grad = ctx.createRadialGradient(ad.CX, ad.CY, 0, ad.CX, ad.CY, coreR);
      grad.addColorStop(0, hexToRgba(accent, 0.28));
      grad.addColorStop(0.6, hexToRgba(accent, 0.08));
      grad.addColorStop(1, "transparent");
      drawHex(ad.CX, ad.CY, coreR, grad, hexToRgba(accent, 0.4), 1.5);
      drawHex(ad.CX, ad.CY, 14, null, "rgba(255,255,255,0.25)", 1);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(ad.CX, ad.CY, 5, 0, Math.PI * 2);
      ctx.fill();
      glow(ad.CX, ad.CY, 18, accent, 0.4);

      // Center price only when chrome owns the layout; dual shell has a single price panel
      if (!ad.hideCenterPrice) {
        const label = ad.priceLabel || "—";
        let display = label;
        if (display.length > 16) {
          display = display.replace(" ERG/oz", "");
        }
        const fontSize =
          display.length > 12 ? 16 : display.length > 9 ? 18 : 22;
        ctx.fillStyle = "rgba(250,250,252,0.97)";
        ctx.font = `350 ${fontSize}px "SF Mono", ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(display, ad.CX, ad.CY - 8);

        ctx.fillStyle = hexToRgba(accent, 0.7);
        ctx.font = "600 8px ui-monospace, monospace";
        ctx.fillText(
          (ad.unitLabel || ad.pairLabel || "").toUpperCase().slice(0, 22),
          ad.CX,
          ad.CY + 16
        );
      }
    }

    function drawOracle(o: Oracle) {
      const ringR = baseRings();
      o.angle += o.speed * (ad.poolStatus === "offline" ? 0.35 : 1);
      const rr = ringR[o.ring - 1] || ringR[0];
      // Subpixel positions OK for motion; round only static geometry (rings/core)
      o.x = ad.CX + Math.cos(o.angle) * rr;
      o.y = ad.CY + Math.sin(o.angle) * rr;
      o.pulse = (o.pulse || 0) + 0.05;
      if (o.publishFlash && o.publishFlash > 0) {
        o.publishFlash = Math.max(0, o.publishFlash - 0.018);
      }

      const flash = o.publishFlash || 0;

      if (o.status !== "Offline") {
        const beamA = 0.06 + flash * 0.35;
        const g = ctx.createLinearGradient(o.x, o.y, ad.CX, ad.CY);
        g.addColorStop(
          0,
          o.status === "Slashed"
            ? `rgba(239,68,68,${0.08 + flash * 0.25})`
            : `rgba(0,212,170,${beamA})`
        );
        g.addColorStop(1, "transparent");
        ctx.strokeStyle = g;
        ctx.lineWidth = 0.5 + flash * 2.2;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(ad.CX, ad.CY);
        ctx.stroke();
      }

      const mine = !!o.isMine;
      const lumenHost = !!o.isLumenHost;
      const special = mine || lumenHost;
      const specialColor = mine ? "#FF7A3D" : "#00E5FF";

      if (special)
        glow(o.x, o.y, 36 + flash * 20, specialColor, 0.35 + flash * 0.25);
      else if (o.idleKey)
        glow(o.x, o.y, 16, IDLE_KEY_COLOR, 0.12 + 0.06 * Math.sin(ad.time * 0.05));
      else if (o.status === "Active")
        glow(o.x, o.y, 22 + flash * 28, "#00D4AA", 0.18 + flash * 0.4);
      else if (o.status === "Verifying")
        glow(o.x, o.y, 18 + flash * 20, "#FBBF24", 0.12 + flash * 0.3);
      else if (o.status === "Slashed") glow(o.x, o.y, 18, "#EF4444", 0.15);

      // Expanding ring when this oracle just fired a datapoint
      if (flash > 0.05) {
        const ringExpand = (1 - flash) * 28;
        ctx.strokeStyle = hexToRgba(
          special
            ? specialColor
            : o.status === "Verifying"
              ? "#FBBF24"
              : "#00D4AA",
          flash * 0.85
        );
        ctx.lineWidth = 1.5 + flash * 1.5;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.size + 6 + ringExpand, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Persistent halo — YOU (orange) or lumen host (cyan)
      if (special) {
        ctx.strokeStyle = hexToRgba(
          specialColor,
          0.55 + 0.25 * Math.sin(ad.time * 0.06)
        );
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.size + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = hexToRgba(specialColor, 0.22);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.size + 16, 0, Math.PI * 2);
        ctx.stroke();
      }

      const isHov = ad.hovered === o;
      const sz = o.size + (isHov ? 4 : 0) + flash * 3 + (special ? 1 : 0);

      // Idle key holders: solid red (not dark gray)
      ctx.fillStyle =
        o.idleKey && !special
          ? IDLE_KEY_COLOR
          : o.status === "Offline" && !special
            ? "#333"
            : o.status === "Slashed"
              ? "#EF4444"
              : o.color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, sz, 0, Math.PI * 2);
      ctx.fill();

      if (o.idleKey && !special) {
        ctx.strokeStyle = hexToRgba(IDLE_KEY_COLOR, 0.55);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(o.x, o.y, sz + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (flash > 0.2 || special) {
        ctx.fillStyle = `rgba(255,255,255,${special ? 0.45 : flash * 0.55})`;
        ctx.beginPath();
        ctx.arc(o.x, o.y, sz * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      if (o.status === "Verifying" && !special) {
        ctx.strokeStyle = "#FBBF24";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          o.x,
          o.y,
          sz + 5,
          ad.time * 0.08,
          ad.time * 0.08 + Math.PI * 1.3
        );
        ctx.stroke();
      }

      if (isHov) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(o.x, o.y, sz + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (special || o.idleKey || o.size >= 7 || isHov || flash > 0.4) {
        ctx.fillStyle = special
          ? specialColor
          : o.idleKey
            ? hexToRgba(IDLE_KEY_COLOR, isHov ? 0.95 : 0.75)
            : flash > 0.3
              ? `rgba(226,232,240,${0.55 + flash * 0.4})`
              : "rgba(226,232,240,0.55)";
        ctx.font = special
          ? "700 11px ui-monospace, monospace"
          : o.idleKey
            ? "600 9px ui-monospace, monospace"
            : "10px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(o.name, o.x, o.y + sz + 14);
        if (special) {
          ctx.fillStyle = mine
            ? "rgba(255,122,61,0.75)"
            : "rgba(0,229,255,0.75)";
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillText(shortAddr(o.address), o.x, o.y + sz + 26);
        } else if (o.idleKey && isHov) {
          ctx.fillStyle = hexToRgba(IDLE_KEY_COLOR, 0.85);
          ctx.font = "8px -apple-system, sans-serif";
          ctx.fillText("keys · idle", o.x, o.y + sz + 24);
        }
      }
    }

    function spawnDatapoint(source: Oracle, isOutlier = false) {
      source.publishFlash = 1;
      ad.datapoints.push({
        x: source.x || 0,
        y: source.y || 0,
        tx: ad.CX,
        ty: ad.CY,
        progress: 0,
        speed: 0.012 + Math.random() * 0.01,
        color: isOutlier ? "#EF4444" : "#00D4AA",
        size: 4.5 + Math.random() * 2.5,
        isOutlier,
        source: source.name,
      });
    }

    function drawDatapoints() {
      for (let i = ad.datapoints.length - 1; i >= 0; i--) {
        const p = ad.datapoints[i];
        p.progress += p.speed;
        // Negative progress = delayed second shot (not yet visible)
        if (p.progress < 0) continue;
        if (p.progress >= 1) {
          // Hit the pool core — bright impact ring
          ad.glowRings.push({
            r: 22,
            a: 0.9,
            color: p.isOutlier ? "#EF4444" : p.color,
          });
          ad.datapoints.splice(i, 1);
          continue;
        }

        let ex = 0,
          ey = 0;
        if (p.isOutlier && p.progress > 0.3) {
          const dev = (p.progress - 0.3) * 200;
          ex = Math.cos(ad.time * 0.2) * dev;
          ey = Math.sin(ad.time * 0.2) * dev + dev * 0.5;
          if (p.progress > 0.7 && Math.random() < 0.3) {
            ad.slashParts.push({
              x: p.x + (p.tx - p.x) * p.progress + ex,
              y: p.y + (p.ty - p.y) * p.progress + ey,
              vx: (Math.random() - 0.5) * 3,
              vy: (Math.random() - 0.5) * 3,
              life: 1,
              color: "#EF4444",
              size: Math.random() * 2 + 1,
            });
          }
          if (p.progress > 0.95) {
            ad.datapoints.splice(i, 1);
            continue;
          }
        }

        const x = p.x + (p.tx - p.x) * p.progress + ex;
        const y = p.y + (p.ty - p.y) * p.progress + ey;
        const a = 1 - Math.abs(p.progress - 0.5) * 1.2;
        const alpha = Math.max(0, Math.min(1, a));
        // Brighter trail + larger diamond so publishes read clearly
        glow(x, y, 12 + p.size * 2, p.color, alpha * 0.35);
        drawDiamond(x, y, p.size * 2.4, p.color, alpha);

        const trailA = Math.floor(alpha * 90)
          .toString(16)
          .padStart(2, "0");
        ctx.strokeStyle = p.color + trailA;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - (p.tx - p.x) * 0.08, y - (p.ty - p.y) * 0.08);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    function spawnReward(target: Oracle) {
      ad.rewards.push({
        x: ad.CX,
        y: ad.CY,
        tx: target.x || 0,
        ty: target.y || 0,
        progress: 0,
        speed: 0.012,
        size: 4 + Math.random() * 2,
      });
    }

    function drawRewards() {
      for (let i = ad.rewards.length - 1; i >= 0; i--) {
        const r = ad.rewards[i];
        r.progress += r.speed;
        if (r.progress >= 1) {
          ad.rewards.splice(i, 1);
          continue;
        }
        const x = r.x + (r.tx - r.x) * r.progress;
        const y = r.y + (r.ty - r.y) * r.progress;
        drawStar(x, y, r.size, "#FFD700", 1 - r.progress);
      }
    }

    function drawSlashParts() {
      for (let i = ad.slashParts.length - 1; i >= 0; i--) {
        const p = ad.slashParts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) {
          ad.slashParts.splice(i, 1);
          continue;
        }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function drawBallots() {
      // Ballots only while a real pool_refresh is settling (short-lived markers)
      for (let i = ad.ballots.length - 1; i >= 0; i--) {
        const b = ad.ballots[i];
        b.angle += b.speed;
        b.alpha -= 0.004;
        if (b.alpha <= 0) {
          ad.ballots.splice(i, 1);
          continue;
        }
        const x = ad.CX + Math.cos(b.angle) * b.dist;
        const y = ad.CY + Math.sin(b.angle) * b.dist;
        drawTriangle(
          x,
          y,
          5,
          "#A855F7",
          Math.max(0.15, Math.min(0.8, b.alpha))
        );
      }
    }

    function drawGlowRings() {
      for (let i = ad.glowRings.length - 1; i >= 0; i--) {
        const g = ad.glowRings[i];
        g.r += 2;
        g.a -= 0.015;
        if (g.a <= 0) {
          ad.glowRings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle =
          g.color +
          Math.floor(g.a * 255)
            .toString(16)
            .padStart(2, "0");
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ad.CX, ad.CY, g.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function findOracle(address?: string): Oracle | undefined {
      if (!address) return undefined;
      return ad.oracles.find((o) => o.address === address);
    }

    /** Drain real network events → datapoints / rewards / pool glow */
    function processLiveEvents() {
      // Process a few events per frame for visual clarity
      let budget = 3;
      while (budget-- > 0 && ad.eventQueue.length > 0) {
        const ev = ad.eventQueue.shift()!;
        if (ev.kind === "datapoint") {
          const src = findOracle(ev.address);
          if (src) {
            // Ensure positions exist (may be mid-orbit)
            if (src.x == null) {
              const ringR = baseRings();
              const rr = ringR[src.ring - 1] || ringR[0];
              src.x = ad.CX + Math.cos(src.angle) * rr;
              src.y = ad.CY + Math.sin(src.angle) * rr;
            }
            spawnDatapoint(src, false);
            // Second diamond slightly delayed in progress for a clear “shot” trail
            if (Math.random() < 0.4) {
              spawnDatapoint(src, false);
              const last = ad.datapoints[ad.datapoints.length - 1];
              if (last) last.progress = -0.12;
            }
          } else if (ad.oracles.length > 0) {
            // Fallback: still show a shot if address mapping missed
            const any =
              ad.oracles.find((o) => o.status === "Active") || ad.oracles[0];
            spawnDatapoint(any, false);
          }
        } else if (ev.kind === "pool_refresh" || ev.kind === "rate_change") {
          const ac = ad.accent || "#00E5FF";
          ad.glowRings.push({ r: 28, a: 1, color: ac });
          ad.glowRings.push({ r: 42, a: 0.75, color: ac });
          ad.glowRings.push({ r: 55, a: 0.45, color: "#E8D5A3" });
          if (chromeRef.current) {
            setEpoch(ad.epoch);
            setConfidence(ad.confidence);
            setActiveSources(ad.activeSources);
          }
          // On pool refresh: reward tokens flow to live oracles that recently posted
          if (ev.kind === "pool_refresh") {
            const live = ad.oracles.filter((o) => o.status === "Active");
            for (const tgt of live) {
              spawnReward(tgt);
              // brief ballot markers around core on real refresh
              if (ad.ballots.length < 12) {
                ad.ballots.push({
                  x: ad.CX,
                  y: ad.CY,
                  angle: Math.random() * Math.PI * 2,
                  dist: 18 + Math.random() * 22,
                  speed: 0.012 + Math.random() * 0.01,
                  alpha: 0.75,
                });
              }
            }
          }
        } else if (ev.kind === "reward") {
          const tgt = findOracle(ev.address);
          if (tgt) {
            if (tgt.x == null) {
              const ringR = baseRings();
              const rr = ringR[tgt.ring - 1] || ringR[0];
              tgt.x = ad.CX + Math.cos(tgt.angle) * rr;
              tgt.y = ad.CY + Math.sin(tgt.angle) * rr;
            }
            // Multiple stars for larger reward deltas
            const n = Math.min(
              6,
              1 + Math.floor((ev.rewardDelta || 1) / 50)
            );
            for (let i = 0; i < n; i++) spawnReward(tgt);
          }
        }
      }

      // Epoch progress (anim only — no React setState)
      const thr = ad.liveMax || 24;
      const age = ad.ageBlocks ?? 0;
      ad.epochProgress = thr > 0 ? Math.min(1, age / thr) : 0;
    }

    let animFrame = 0;
    let running = true;
    function animate() {
      if (!running) return;
      // Pause when tab hidden — free main thread (do not clear when paused)
      if (document.visibilityState === "hidden") {
        animFrame = requestAnimationFrame(animate);
        return;
      }
      ad.time++;
      // Always draw after clear — never skip frames (skip after clear = flicker/shake)
      ctx.clearRect(0, 0, ad.W, ad.H);
      drawBg();
      drawOrbits();
      drawGlowRings();
      drawCore();
      drawBallots();
      ad.oracles.forEach(drawOracle);
      drawDatapoints();
      drawRewards();
      drawSlashParts();
      processLiveEvents();
      animFrame = requestAnimationFrame(animate);
    }

    animFrame = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(animFrame);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCount = useMemo(
    () =>
      (feed.nodes || []).filter((n) => n.status === "live").length ||
      feed.activeOracles ||
      0,
    [feed]
  );
  const totalCount =
    feed.totalOracles ?? feed.nodes?.length ?? activeSources;

  const statusColorHud =
    poolStatus === "live"
      ? "#00D4AA"
      : poolStatus === "stale"
        ? "#FBBF24"
        : "#EF4444";

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        height: "100%",
        background: "#05070A",
        overflow: "hidden",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Floating overlays only when chrome=true (standalone mode) */}
      {chrome && (
        <>
          <div className="oc-hud" style={hudStyle}>
            <div style={hudLabelStyle}>Network Consensus</div>
            <div className="oc-hud-value" style={hudValueStyle}>
              <span style={{ ...dotStyle, background: statusColorHud }} />
              {activeCount}/{totalCount}
            </div>
            <div style={hudSubStyle}>
              oracles · {poolStatus.toUpperCase()}
            </div>
          </div>
          <div className="oc-hud" style={{ ...hudStyle, left: 220 }}>
            <div style={hudLabelStyle}>Pool lag</div>
            <div className="oc-hud-value" style={{ ...hudValueStyle, fontSize: 18 }}>
              {ageBlocks ?? "—"} blk
            </div>
          </div>
        </>
      )}

      {/* Tooltip shell — position via DOM (no setState on mousemove) */}
      <div
        ref={tooltipRef}
        style={{ ...tooltipStyle, display: "none", left: 0, top: 0 }}
      >
        {hovered && (
          <>
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 10,
                color: "#fff",
                wordBreak: "break-all",
              }}
            >
              {hovered.address}
            </div>
            {(hovered.isMine || hovered.isLumenHost) && (
              <div
                style={{
                  ...ttRowStyle,
                  color: hovered.isMine ? "#FF7A3D" : "#00E5FF",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  fontSize: 10,
                }}
              >
                {hovered.isMine ? "YOUR ORACLE" : "LUMEN HOST"}
              </div>
            )}
            {hovered.idleKey && (
              <div
                style={{
                  ...ttRowStyle,
                  color: IDLE_KEY_COLOR,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  fontSize: 11,
                  marginBottom: 6,
                  lineHeight: 1.35,
                }}
              >
                {hovered.detail || "Keys held · not posting"}
              </div>
            )}
            <div style={ttRowStyle}>
              <span>Status:</span>
              <span
                style={{
                  color:
                    hovered.idleKey
                      ? IDLE_KEY_COLOR
                      : hovered.status === "Active"
                        ? "#00D4AA"
                        : hovered.status === "Offline"
                          ? "#777"
                          : "#FBBF24",
                }}
              >
                {hovered.idleKey ? "Idle key" : hovered.status}
              </span>
            </div>
            <div style={ttRowStyle}>
              <span>Post height:</span>
              <span>{hovered.height?.toLocaleString() ?? "—"}</span>
            </div>
            <div style={ttRowStyle}>
              <span>Age / tip:</span>
              <span>
                {hovered.latency === 999
                  ? "offline"
                  : `~${hovered.latency > 8 ? Math.round((hovered.latency - 8) / 2) : 0} blk`}
              </span>
            </div>
            <div style={ttRowStyle}>
              <span>Freshness:</span>
              <span>{hovered.accuracy}%</span>
            </div>
            {hovered.rewardTokens != null && (
              <div style={ttRowStyle}>
                <span>Claimable rewards:</span>
                <span style={{ color: "#FFD700" }}>
                  {hovered.rewardTokens.toLocaleString()}
                </span>
              </div>
            )}
            {hovered.collectedHeight != null && (
              <div style={ttRowStyle}>
                <span>Collected h:</span>
                <span>{hovered.collectedHeight.toLocaleString()}</span>
              </div>
            )}
          </>
        )}
      </div>


    </div>
  );
}

const hudStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  background: "rgba(13, 19, 33, 0.85)",
  backdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 14,
  padding: "14px 16px",
  color: "#E2E8F0",
  zIndex: 10,
  minWidth: 170,
};

const hudLabelStyle: React.CSSProperties = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 2,
  color: "rgba(226,232,240,0.35)",
  fontWeight: 600,
  marginBottom: 8,
};

const hudValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 300,
  letterSpacing: -0.5,
  fontFamily: '"SF Mono", "JetBrains Mono", monospace',
  marginBottom: 4,
};

const hudSubStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(226,232,240,0.4)",
};

const dotStyle: React.CSSProperties = {
  display: "inline-block",
  width: 7,
  height: 7,
  borderRadius: "50%",
  marginRight: 8,
  verticalAlign: "middle",
};

const epochRingStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  width: 90,
  height: 90,
  zIndex: 10,
};

const epochTextStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
  color: "#E2E8F0",
};

const tooltipStyle: React.CSSProperties = {
  position: "absolute",
  background: "rgba(5,7,10,0.95)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: "14px 16px",
  color: "#E2E8F0",
  fontSize: 12,
  pointerEvents: "none",
  zIndex: 30,
  boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  minWidth: 200,
  maxWidth: 280,
};

const ttRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 5,
  gap: 16,
};

const epochBarStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 14,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "flex-end",
  gap: 5,
  zIndex: 10,
  background: "rgba(13,19,33,0.7)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 12,
  padding: "10px 14px",
};

const legendStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 72,
  right: 14,
  background: "rgba(13,19,33,0.7)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 12,
  padding: "12px 14px",
  zIndex: 10,
};
