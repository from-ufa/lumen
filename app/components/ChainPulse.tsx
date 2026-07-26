"use client";

/**
 * Ergo Crystallogenesis — Apple-level cinematic block assembly
 * Live data: /api/chain/feed + txGroups · no new backend
 *
 * Visual language: Liquid Glass · cool silver/cyan · Ergo orange only at seal
 */

import React, {
  useRef,
  useMemo,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  MeshTransmissionMaterial,
  Float,
} from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import type { ChainFeed, ChainParticle, ChainTxGroup } from "@/lib/chain";

/* ═══════════════════════════════════════════════════════════════════════════
   Palette & utilities
   ═══════════════════════════════════════════════════════════════════════════ */

const ERGO_ORANGE = "#FF6B00";
const CYAN = "#A8EFFF";
const CYAN_DIM = "#5EC8E8";
const SILVER = "#C8D2E0";
const VOID = "#000000";

let softTex: THREE.CanvasTexture | null = null;
function getSoftTex(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  if (softTex) return softTex;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.12, "rgba(255,255,255,0.75)");
  g.addColorStop(0.35, "rgba(255,255,255,0.28)");
  g.addColorStop(0.65, "rgba(255,255,255,0.05)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTex = new THREE.CanvasTexture(c);
  softTex.colorSpace = THREE.SRGBColorSpace;
  softTex.needsUpdate = true;
  return softTex;
}

/** Truncated-octahedron-ish: high-detail icosa for crystal bodies */
const GEO_CRYSTAL = new THREE.IcosahedronGeometry(1, 2);
const GEO_HEX = new THREE.CylinderGeometry(1.15, 1.15, 0.55, 6);
const GEO_HEX_SHELL = new THREE.CylinderGeometry(1.22, 1.22, 0.62, 6, 1, true);
const GEO_DISC = new THREE.CylinderGeometry(1, 1, 0.07, 6);
const GEO_SPRITE = new THREE.PlaneGeometry(1, 1);
const GEO_HIT = new THREE.SphereGeometry(1, 10, 10);

function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function easeInOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeOutBack(t: number) {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeAnticipate(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (2.6 * x - 1.6) + x * (1 - x) * 0.12;
}

function formatErg(nano: string): string {
  try {
    const n = Number(BigInt(nano)) / 1e9;
    if (n >= 1000) return n.toFixed(0);
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(4);
  } catch {
    return "—";
  }
}

/* Soft points shader */
const softPointsVert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vA;
  uniform float uPR;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = max(0.4, -mv.z);
    gl_PointSize = clamp(aSize * uPR * (260.0 / d), 1.5, 72.0);
    vA = smoothstep(0.0, 2.0, aSize * 0.12);
    gl_Position = projectionMatrix * mv;
  }
`;
const softPointsFrag = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    float a = t.a * vA;
    if (a < 0.012) discard;
    gl_FragColor = vec4(vColor * t.r, a);
  }
`;

/* ─── Sound (default OFF) ───────────────────────────────────────────────── */

function playSealSound() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(540, now);
    o.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.7);
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "sine";
    o2.frequency.setValueAtTime(68, now + 0.12);
    o2.frequency.exponentialRampToValueAtTime(30, now + 0.35);
    g2.gain.setValueAtTime(0.0001, now + 0.12);
    g2.gain.exponentialRampToValueAtTime(0.06, now + 0.14);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(now + 0.12);
    o2.stop(now + 0.45);
    window.setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* silent */
  }
}

/* ─── Genesis phase ~2.6s ───────────────────────────────────────────────── */

type GenesisPhase = {
  t: number;
  capture: number;
  crystal: number;
  seal: number;
  dock: number;
  resonance: number;
  bloom: number;
  active: boolean;
  tipId: string | null;
};

function phaseFromT(t: number, tipId: string | null): GenesisPhase {
  const x = Math.min(1, Math.max(0, t));
  const capture = easeAnticipate(Math.min(1, x / 0.28));
  const crystal = easeInOutCubic(Math.min(1, Math.max(0, (x - 0.16) / 0.36)));
  const seal = easeInOutCubic(Math.min(1, Math.max(0, (x - 0.46) / 0.18)));
  const resonance = Math.sin(
    Math.min(1, Math.max(0, (x - 0.48) / 0.16)) * Math.PI
  );
  const dock = easeOutBack(Math.min(1, Math.max(0, (x - 0.62) / 0.38)));
  const bloom =
    resonance * 0.9 + crystal * 0.15 + Math.sin(Math.min(1, seal) * Math.PI) * 0.35;
  return {
    t: x,
    capture,
    crystal,
    seal,
    dock: Math.min(1, Math.max(0, dock)),
    resonance,
    bloom,
    active: x > 0 && x < 1,
    tipId,
  };
}

/* ─── Data ──────────────────────────────────────────────────────────────── */

async function fetchFeed(address: string | null): Promise<ChainFeed> {
  const q = new URLSearchParams({ blocks: "8", mempool: "40" });
  if (address) q.set("address", address);
  const res = await fetch(`/api/chain/feed?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()) || `feed ${res.status}`);
  return res.json();
}

type Selection =
  | { kind: "tx"; txId: string }
  | {
      kind: "block";
      blockId: string;
      height: number;
      txCount?: number;
      ergNano?: string;
    }
  | null;

/* ─── Layout ────────────────────────────────────────────────────────────── */

type TxSlot = {
  group: ChainTxGroup;
  home: THREE.Vector3;
  phase: number;
  speed: number;
  scale: number;
};

function layoutSlots(groups: ChainTxGroup[], focusMode: boolean): TxSlot[] {
  const mem = groups.filter((g) => g.pending || g.stage === "mempool");
  const sealed = groups.filter((g) => !g.pending && g.stage === "sealed");
  const show = [...mem.slice(0, 16), ...sealed.slice(0, focusMode ? 3 : 6)];
  return show.map((group, i) => {
    const n = show.length || 1;
    const ring = group.pending ? 5.2 : 2.6;
    const elev = (hash01(group.txId, 3) - 0.5) * (group.pending ? 2.8 : 1.2);
    const ang = (i / n) * Math.PI * 2 + hash01(group.txId, 1) * 0.5;
    // Size ~ value (ERG weight)
    let erg = 0;
    try {
      erg = Number(BigInt(group.ergNano)) / 1e9;
    } catch {
      erg = 1;
    }
    const scale = 0.14 + Math.min(0.22, Math.log10(erg + 1) * 0.08);
    return {
      group,
      home: new THREE.Vector3(Math.cos(ang) * ring, elev, Math.sin(ang) * ring),
      phase: hash01(group.txId, 7) * Math.PI * 2,
      speed: 0.08 + hash01(group.txId, 8) * 0.14,
      scale,
    };
  });
}

/* ─── Soft dust Points cloud ────────────────────────────────────────────── */

function SoftDust({
  particles,
  slots,
  genesis,
  focusMode,
}: {
  particles: ChainParticle[];
  slots: TxSlot[];
  genesis: GenesisPhase;
  focusMode: boolean;
}) {
  const { gl } = useThree();
  const map = useMemo(() => getSoftTex(), []);
  const partsByTx = useMemo(() => {
    const m = new Map<string, ChainParticle[]>();
    for (const p of particles) {
      if (!p.txId || p.txId === "focus") continue;
      const a = m.get(p.txId) || [];
      a.push(p);
      m.set(p.txId, a);
    }
    return m;
  }, [particles]);

  const flat = useMemo(() => {
    const out: Array<{
      p: ChainParticle;
      txId: string;
      r: number;
      ph: number;
      sp: number;
      elev: number;
    }> = [];
    for (const s of slots) {
      const list = (partsByTx.get(s.group.txId) || []).slice(0, 12);
      list.forEach((p, i) => {
        out.push({
          p,
          txId: s.group.txId,
          r: 0.22 + hash01(p.id, 2) * 0.55,
          ph: hash01(p.id, 3) * Math.PI * 2 + i,
          sp: 0.5 + hash01(p.id, 4) * 1.2,
          elev: (hash01(p.id, 5) - 0.5) * 0.3,
        });
      });
    }
    return out;
  }, [slots, partsByTx]);

  const n = Math.max(1, flat.length);
  const pos = useMemo(() => new Float32Array(n * 3), [n]);
  const col = useMemo(() => new Float32Array(n * 3), [n]);
  const siz = useMemo(() => new Float32Array(n), [n]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    g.setDrawRange(0, flat.length);
    return g;
  }, [pos, col, siz, flat.length]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uPR: { value: Math.min(2, gl.getPixelRatio()) },
        },
        vertexShader: softPointsVert,
        fragmentShader: softPointsFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [map, gl]
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );

  const centers = useRef<Map<string, THREE.Vector3>>(new Map());
  // Updated by parent crystals via window-less shared ref — we'll compute same layout
  const _t = useMemo(() => new THREE.Vector3(), []);
  const _ax = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    mat.uniforms.uPR.value = Math.min(2, state.gl.getPixelRatio());
    const cap = genesis.capture;
    const cry = genesis.crystal;

    // Recompute centers (mirror crystal body motion)
    for (const s of slots) {
      const isMem = s.group.pending;
      const capW = isMem ? cap : cap * 0.22;
      const cryW = isMem ? cry : cry * 0.3;
      _t.copy(s.home).applyAxisAngle(_ax, t * s.speed * 0.1);
      _t.y = s.home.y + Math.sin(t * 0.4 + s.phase) * 0.08;
      const anti = genesis.t < 0.07 ? 1 + (0.07 - genesis.t) * 1.4 : 1;
      _t.multiplyScalar(anti * (1 - capW * 0.94) * (1 - cryW * 0.9));
      centers.current.set(s.group.txId, _t.clone());
    }

    const c = new THREE.Color();
    for (let i = 0; i < flat.length; i++) {
      const fp = flat[i];
      const center = centers.current.get(fp.txId) || _t.set(0, 0, 0);
      const isMem = fp.p.pending;
      const cryW = isMem ? cry : cry * 0.3;
      const capW = isMem ? cap : cap * 0.22;
      const ang = fp.ph + t * fp.sp;
      const ls = Math.max(0, 1 - cryW * 0.98);
      const lr = fp.r * ls * (1 - capW * 0.4);
      const spiral = 1 - capW * 0.5;
      const o = i * 3;
      pos[o] = center.x + Math.cos(ang) * lr * spiral;
      pos[o + 1] = center.y + fp.elev * ls;
      pos[o + 2] = center.z + Math.sin(ang) * lr * spiral;
      // Cool cyan-white for inclusions with token hue desaturated
      c.set(fp.p.color);
      c.lerp(new THREE.Color(CYAN), 0.45);
      const mul =
        (isMem ? 1.15 : 0.55) * (1 - cryW * 0.5) * (1 + genesis.bloom * 0.35);
      col[o] = Math.min(1, c.r * mul);
      col[o + 1] = Math.min(1, c.g * mul);
      col[o + 2] = Math.min(1, c.b * mul);
      siz[i] =
        (7 + fp.p.weight * 12) *
        ls *
        (1 + Math.sin(t * 2.2 + fp.ph) * 0.08) *
        (focusMode && fp.p.stage !== "focus" ? 0.65 : 1);
    }
    geo.setDrawRange(0, flat.length);
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
  });

  if (flat.length === 0) return null;
  return (
    <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />
  );
}

/* ─── Mempool crystalline polyhedra ─────────────────────────────────────── */

function CrystalBodies({
  slots,
  genesis,
  selection,
  onSelectTx,
}: {
  slots: TxSlot[];
  genesis: GenesisPhase;
  selection: Selection;
  onSelectTx: (txId: string, w: THREE.Vector3) => void;
}) {
  const refs = useRef<Map<string, THREE.Group>>(new Map());
  const _t = useMemo(() => new THREE.Vector3(), []);
  const _ax = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const cap = genesis.capture;
    const cry = genesis.crystal;
    for (const s of slots) {
      const g = refs.current.get(s.group.txId);
      if (!g) continue;
      const isMem = s.group.pending;
      const capW = isMem ? cap : cap * 0.22;
      const cryW = isMem ? cry : cry * 0.3;
      _t.copy(s.home).applyAxisAngle(_ax, t * s.speed * 0.1);
      _t.y = s.home.y + Math.sin(t * 0.4 + s.phase) * 0.08;
      const anti = genesis.t < 0.07 ? 1 + (0.07 - genesis.t) * 1.4 : 1;
      _t.multiplyScalar(anti * (1 - capW * 0.94) * (1 - cryW * 0.9));
      g.position.lerp(_t, 0.13);
      g.rotation.y = t * 0.12 + s.phase;
      g.rotation.x = Math.sin(t * 0.2 + s.phase) * 0.15;
      const sc = s.scale * (1 - cryW * 0.85) * (1 + Math.sin(t * 1.5 + s.phase) * 0.03);
      g.scale.setScalar(Math.max(0.001, sc));
      g.visible = cryW < 0.96;
    }
  });

  return (
    <group>
      {slots.map((s) => {
        const sel = selection?.kind === "tx" && selection.txId === s.group.txId;
        const ghost = s.group.inputs > 4; // proxy for data-heavy / multi-input
        return (
          <group
            key={s.group.txId}
            ref={(el) => {
              if (el) refs.current.set(s.group.txId, el);
              else refs.current.delete(s.group.txId);
            }}
            position={s.home}
          >
            <Float speed={0.6} rotationIntensity={0.15} floatIntensity={0.2}>
              <mesh
                geometry={GEO_CRYSTAL}
                onClick={(e: ThreeEvent<MouseEvent>) => {
                  e.stopPropagation();
                  const w = new THREE.Vector3();
                  e.object.getWorldPosition(w);
                  onSelectTx(s.group.txId, w);
                }}
              >
                <MeshTransmissionMaterial
                  backside
                  samples={3}
                  resolution={128}
                  transmission={ghost ? 0.97 : 0.88}
                  roughness={0.14}
                  thickness={0.45}
                  ior={1.48}
                  chromaticAberration={0.02}
                  anisotropy={0.08}
                  color={sel ? "#E8F4FF" : SILVER}
                  attenuationColor={CYAN_DIM}
                  attenuationDistance={0.9}
                  transparent
                  opacity={ghost ? 0.35 : 0.75}
                />
              </mesh>
              {/* Internal value glow */}
              <mesh geometry={GEO_CRYSTAL} scale={0.55}>
                <meshBasicMaterial
                  color={s.group.pending ? CYAN : SILVER}
                  transparent
                  opacity={0.12 + Math.min(0.2, s.scale)}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              {/* Token inclusion points as micro glow */}
              <mesh geometry={GEO_CRYSTAL} scale={1.02}>
                <meshBasicMaterial
                  color={CYAN}
                  wireframe
                  transparent
                  opacity={0.04}
                  depthWrite={false}
                />
              </mesh>
            </Float>
            <mesh
              geometry={GEO_HIT}
              scale={1.4}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                const w = new THREE.Vector3();
                e.object.getWorldPosition(w);
                onSelectTx(s.group.txId, w);
              }}
            >
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ─── Merkle light tree ─────────────────────────────────────────────────── */

function MerkleThreads({
  slots,
  genesis,
}: {
  slots: TxSlot[];
  genesis: GenesisPhase;
}) {
  const lineRef = useRef<THREE.LineSegments>(null!);
  const maxPairs = 48;
  const pos = useMemo(() => new Float32Array(maxPairs * 2 * 3), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [pos]);
  useEffect(() => () => geo.dispose(), [geo]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Grow during crystal phase
    const grow = genesis.active
      ? Math.min(1, genesis.crystal * 1.2)
      : 0.15 + Math.sin(t * 0.3) * 0.05;
    const leaves = slots.slice(0, 16);
    let k = 0;
    // Connect neighboring leaves + upward to root (origin)
    for (let i = 0; i < leaves.length && k < maxPairs; i++) {
      const a = leaves[i].home;
      // branch up to mid then root — animated by grow
      const midY = a.y * (1 - grow * 0.5) + 1.2 * grow;
      const midX = a.x * (1 - grow * 0.55);
      const midZ = a.z * (1 - grow * 0.55);
      // leaf → mid
      let o = k * 6;
      pos[o] = a.x;
      pos[o + 1] = a.y;
      pos[o + 2] = a.z;
      pos[o + 3] = midX;
      pos[o + 4] = midY;
      pos[o + 5] = midZ;
      k++;
      if (k >= maxPairs) break;
      // mid → root
      o = k * 6;
      pos[o] = midX;
      pos[o + 1] = midY;
      pos[o + 2] = midZ;
      pos[o + 3] = 0;
      pos[o + 4] = 0.3 * grow;
      pos[o + 5] = 0;
      k++;
    }
    geo.setDrawRange(0, k * 2);
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    if (lineRef.current) {
      const m = lineRef.current.material as THREE.LineBasicMaterial;
      m.opacity = 0.08 + grow * 0.45 + genesis.resonance * 0.25;
    }
  });

  return (
    <lineSegments ref={lineRef} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial
        color={CYAN}
        transparent
        opacity={0.2}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
}

/* ─── Autolykos memory matrix + 32-point path ───────────────────────────── */

function AutolykosMatrix({ genesis }: { genesis: GenesisPhase }) {
  const N = 420;
  const pathN = 32;
  const map = useMemo(() => getSoftTex(), []);
  const { gl } = useThree();
  const base = useMemo(() => {
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // disk/volume around core
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = 1.8 + Math.random() * 3.5;
      p[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
      p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }, []);
  // Deterministic 32 indices
  const pathIdx = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < pathN; i++) {
      arr.push(Math.floor(hash01("autolykos", i) * N));
    }
    return arr;
  }, []);

  const pos = useMemo(() => new Float32Array(N * 3), []);
  const col = useMemo(() => new Float32Array(N * 3), []);
  const siz = useMemo(() => new Float32Array(N), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    return g;
  }, [pos, col, siz]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uPR: { value: Math.min(2, gl.getPixelRatio()) },
        },
        vertexShader: softPointsVert,
        fragmentShader: softPointsFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [map, gl]
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );

  // Path line
  const pathPos = useMemo(() => new Float32Array(pathN * 3), []);
  const pathGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pathPos, 3));
    return g;
  }, [pathPos]);
  useEffect(() => () => pathGeo.dispose(), [pathGeo]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    mat.uniforms.uPR.value = Math.min(2, state.gl.getPixelRatio());
    // Visibility: rises during crystal→seal
    const vis =
      genesis.active
        ? Math.min(1, genesis.crystal * 1.3) * (1 - genesis.dock * 0.7)
        : 0.12;
    const pathProg = genesis.active
      ? Math.min(1, Math.max(0, (genesis.t - 0.35) / 0.22))
      : 0;
    const res = genesis.resonance;

    for (let i = 0; i < N; i++) {
      const o = i * 3;
      // slight drift
      pos[o] = base[o] + Math.sin(t * 0.15 + i) * 0.02;
      pos[o + 1] = base[o + 1] + Math.cos(t * 0.12 + i * 0.7) * 0.02;
      pos[o + 2] = base[o + 2];
      const onPath = pathIdx.includes(i) && pathProg > pathIdx.indexOf(i) / pathN;
      const bright = onPath ? 1.4 + res * 1.2 : 0.25 + vis * 0.35;
      // Cool cyan-white, orange flash on resonance for path points
      if (onPath && res > 0.3) {
        col[o] = 1.0;
        col[o + 1] = 0.45 + res * 0.2;
        col[o + 2] = 0.05;
      } else {
        col[o] = 0.55 * bright * vis;
        col[o + 1] = 0.85 * bright * vis;
        col[o + 2] = 0.95 * bright * vis;
      }
      siz[i] = (onPath ? 9 : 3.2) * (0.5 + vis) * (1 + res * 0.4);
    }
    // Path line through selected points in order
    for (let i = 0; i < pathN; i++) {
      const idx = pathIdx[i];
      const o = i * 3;
      pathPos[o] = pos[idx * 3];
      pathPos[o + 1] = pos[idx * 3 + 1];
      pathPos[o + 2] = pos[idx * 3 + 2];
    }
    pathGeo.setDrawRange(0, Math.floor(pathProg * pathN));
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (pathGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;
  });

  return (
    <group>
      <points geometry={geo} material={mat} frustumCulled={false} />
      <lineSegments geometry={pathGeo}>
        <lineBasicMaterial
          color={ERGO_ORANGE}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}

/* ─── Core hex crystal + seal shell + dock + chain ──────────────────────── */

function CoreGenesis({
  genesis,
  stackHeights,
  tipHeight,
  tipId,
  tipTxCount,
  tipErg,
  onSelectBlock,
  selectedBlockId,
}: {
  genesis: GenesisPhase;
  stackHeights: number[];
  tipHeight: number | null;
  tipId: string | null;
  tipTxCount: number;
  tipErg: string;
  onSelectBlock: (
    id: string,
    height: number,
    world: THREE.Vector3,
    txCount?: number,
    ergNano?: string
  ) => void;
  selectedBlockId: string | null;
}) {
  const coreRef = useRef<THREE.Group>(null!);
  const hexRef = useRef<THREE.Group>(null!);
  const bloomRef = useRef<THREE.Mesh>(null!);
  const dockRef = useRef<THREE.Group>(null!);
  const stackRef = useRef<THREE.Group>(null!);
  const threadRef = useRef<THREE.LineSegments>(null!);
  const squash = useRef(0);
  const landed = useRef(false);
  const map = useMemo(() => getSoftTex(), []);
  const threadPos = useMemo(() => new Float32Array(6), []);
  const threadGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(threadPos, 3));
    return g;
  }, [threadPos]);

  useEffect(() => {
    if (genesis.active && genesis.t < 0.05) landed.current = false;
  }, [genesis.active, genesis.t, genesis.tipId]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(0.05, state.clock.getDelta());
    const cry = genesis.crystal;
    const seal = genesis.seal;
    const dock = genesis.dock;
    const res = genesis.resonance;

    if (coreRef.current) {
      const grow = genesis.active
        ? 0.2 + cry * 1.05 + seal * 0.15
        : 1.05 + Math.sin(t * 1.1) * 0.015;
      const lift =
        genesis.active && seal > 0
          ? Math.sin(Math.min(1, (genesis.t - 0.5) / 0.14) * Math.PI) *
            0.35 *
            (1 - dock)
          : 0;
      coreRef.current.position.y = lift;
      coreRef.current.scale.setScalar(grow * (1 - dock * 0.1));
      coreRef.current.rotation.y = t * 0.12 + seal * 0.3;
      coreRef.current.visible = dock < 0.9 || !genesis.active;
    }

    // Hex shell forms on seal
    if (hexRef.current) {
      const hs = seal * (1 - dock * 0.2);
      hexRef.current.scale.setScalar(Math.max(0.001, 0.85 + seal * 0.35));
      hexRef.current.visible = seal > 0.05 && dock < 0.85;
      const mats = hexRef.current.children;
      mats.forEach((ch) => {
        if ((ch as THREE.Mesh).material) {
          const m = (ch as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (m.opacity !== undefined) m.opacity = 0.15 + seal * 0.55;
          if (m.emissiveIntensity !== undefined)
            m.emissiveIntensity = 0.2 + seal * 0.6 + res * 0.8;
        }
      });
      hexRef.current.rotation.y = t * 0.05;
    }

    if (bloomRef.current) {
      bloomRef.current.scale.setScalar(2.5 + genesis.bloom * 4 + res * 2);
      (bloomRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.04 + genesis.bloom * 0.35 + res * 0.25;
      (bloomRef.current.material as THREE.MeshBasicMaterial).color.set(
        res > 0.4 ? ERGO_ORANGE : CYAN
      );
      bloomRef.current.quaternion.copy(state.camera.quaternion);
    }

    // Dock
    if (dockRef.current) {
      const y = THREE.MathUtils.lerp(0.25, -2.15, Math.min(1.05, dock));
      const sxy = THREE.MathUtils.lerp(0.2, 1.15, Math.min(1, dock * 1.15));
      const impact =
        dock > 0.88 ? Math.sin(((dock - 0.88) / 0.12) * Math.PI) : 0;
      dockRef.current.position.y = y;
      dockRef.current.scale.set(
        sxy * (1 + impact * 0.1),
        1 - impact * 0.4,
        sxy * (1 + impact * 0.1)
      );
      dockRef.current.visible = genesis.active && dock > 0.02;
      if (dock >= 0.9 && !landed.current) {
        landed.current = true;
        squash.current = 1;
      }
    }

    squash.current = THREE.MathUtils.damp(squash.current, 0, 5.2, dt);
    if (stackRef.current) {
      const sq = squash.current;
      stackRef.current.scale.set(1 + sq * 0.14, 1 - sq * 0.26, 1 + sq * 0.14);
      stackRef.current.position.y = -2.35 - sq * 0.08;
    }

    // Cyan dock thread from core to top of stack
    if (threadRef.current) {
      const topY = dockRef.current?.visible
        ? dockRef.current.position.y
        : -2.15;
      threadPos[0] = 0;
      threadPos[1] = 0.2;
      threadPos[2] = 0;
      threadPos[3] = 0;
      threadPos[4] = topY;
      threadPos[5] = 0;
      (threadGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
        true;
      const m = threadRef.current.material as THREE.LineBasicMaterial;
      m.opacity = genesis.active && dock > 0.05 ? 0.25 + dock * 0.45 : 0.06;
    }
  });

  return (
    <group>
      <mesh ref={bloomRef} geometry={GEO_SPRITE} renderOrder={0}>
        <meshBasicMaterial
          map={map}
          color={CYAN}
          transparent
          opacity={0.06}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Core frosted crystal */}
      <group ref={coreRef}>
        <mesh geometry={GEO_CRYSTAL}>
          <MeshTransmissionMaterial
            backside
            samples={6}
            resolution={384}
            transmission={0.97}
            roughness={0.06 + genesis.seal * 0.2}
            thickness={1.0}
            ior={1.52}
            chromaticAberration={0.035}
            anisotropy={0.12}
            anisotropicBlur={0.25}
            distortion={0.06}
            distortionScale={0.18}
            temporalDistortion={0.03}
            color={genesis.seal > 0.5 ? "#eef4fc" : "#c8daf0"}
            attenuationColor={genesis.resonance > 0.3 ? ERGO_ORANGE : CYAN_DIM}
            attenuationDistance={0.45}
            clearcoat={0.75 + genesis.seal * 0.2}
            clearcoatRoughness={0.08}
          />
        </mesh>
        <mesh geometry={GEO_CRYSTAL} scale={0.62}>
          <meshBasicMaterial
            color={genesis.resonance > 0.35 ? ERGO_ORANGE : CYAN}
            transparent
            opacity={0.06 + genesis.bloom * 0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Micro facet hint — secondary only */}
        <mesh geometry={GEO_CRYSTAL} scale={1.015}>
          <meshBasicMaterial
            color={SILVER}
            wireframe
            transparent
            opacity={0.025}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Hexagonal seal shell */}
      <group ref={hexRef}>
        <mesh geometry={GEO_HEX}>
          <meshStandardMaterial
            color="#1a2030"
            metalness={0.85}
            roughness={0.2}
            emissive={ERGO_ORANGE}
            emissiveIntensity={0.15}
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh geometry={GEO_HEX_SHELL}>
          <meshStandardMaterial
            color={SILVER}
            metalness={0.9}
            roughness={0.15}
            emissive={CYAN}
            emissiveIntensity={0.25}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      <pointLight
        color={genesis.resonance > 0.3 ? ERGO_ORANGE : "#D8E8FF"}
        intensity={0.8 + genesis.bloom * 1.6}
        distance={16}
      />
      <pointLight
        color={CYAN}
        intensity={0.3 + genesis.seal * 0.4}
        distance={12}
        position={[2.5, 2, 2.5]}
      />

      {/* Docking hex block */}
      <group ref={dockRef}>
        <mesh geometry={GEO_DISC}>
          <meshStandardMaterial
            color="#141a28"
            metalness={0.85}
            roughness={0.18}
            emissive={ERGO_ORANGE}
            emissiveIntensity={0.45 + genesis.seal * 0.4}
          />
        </mesh>
        <mesh geometry={GEO_DISC} scale={[1.05, 1.6, 1.05]}>
          <meshBasicMaterial
            color={CYAN}
            transparent
            opacity={0.15}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {/* Cyan integration thread */}
      <lineSegments ref={threadRef} geometry={threadGeo}>
        <lineBasicMaterial
          color={CYAN}
          transparent
          opacity={0.15}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>

      {/* Infinite crystalline chain stack */}
      <group ref={stackRef} position={[0, -2.35, 0]}>
        {stackHeights.map((h, i) => {
          const isTip = tipHeight != null && h === tipHeight && i === 0;
          const bid = i === 0 && tipId ? tipId : `h-${h}`;
          const selected =
            selectedBlockId === bid ||
            (isTip && selectedBlockId === tipId);
          return (
            <group key={`${h}-${i}`} position={[0, -i * 0.2, 0]}>
              <mesh
                geometry={GEO_DISC}
                scale={[1.12 - i * 0.025, 1, 1.12 - i * 0.025]}
                onClick={(e: ThreeEvent<MouseEvent>) => {
                  e.stopPropagation();
                  const w = new THREE.Vector3();
                  e.object.getWorldPosition(w);
                  onSelectBlock(
                    isTip && tipId ? tipId : bid,
                    h,
                    w,
                    isTip ? tipTxCount : undefined,
                    isTip ? tipErg : undefined
                  );
                }}
              >
                <meshStandardMaterial
                  color={selected ? "#243044" : isTip ? "#1a2232" : "#0c1018"}
                  metalness={0.78}
                  roughness={0.28}
                  emissive={selected ? ERGO_ORANGE : isTip ? CYAN_DIM : "#1a3048"}
                  emissiveIntensity={selected ? 0.4 : isTip ? 0.18 : 0.05}
                  transparent
                  opacity={0.95 - i * 0.07}
                />
              </mesh>
              {/* Luminous link to next */}
              {i < stackHeights.length - 1 && (
                <mesh position={[0, -0.1, 0]} scale={[0.04, 0.12, 0.04]}>
                  <cylinderGeometry args={[1, 1, 1, 6]} />
                  <meshBasicMaterial
                    color={CYAN}
                    transparent
                    opacity={0.2}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              )}
            </group>
          );
        })}
        {/* Ghost chain into infinity */}
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={`ghost-${i}`}
            position={[0, -(stackHeights.length + i) * 0.2 - 0.05, 0]}
            geometry={GEO_DISC}
            scale={[1.0 - i * 0.04, 1, 1.0 - i * 0.04]}
          >
            <meshBasicMaterial
              color={SILVER}
              transparent
              opacity={0.04 - i * 0.008}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ─── Focus shell ───────────────────────────────────────────────────────── */

function FocusShell({
  particles,
  on,
}: {
  particles: ChainParticle[];
  on: boolean;
}) {
  const { gl } = useThree();
  const map = useMemo(() => getSoftTex(), []);
  const focus = useMemo(
    () => particles.filter((p) => p.stage === "focus"),
    [particles]
  );
  const n = Math.max(1, focus.length);
  const pos = useMemo(() => new Float32Array(n * 3), [n]);
  const col = useMemo(() => new Float32Array(n * 3), [n]);
  const siz = useMemo(() => new Float32Array(n), [n]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    g.setDrawRange(0, focus.length);
    return g;
  }, [pos, col, siz, focus.length]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uPR: { value: Math.min(2, gl.getPixelRatio()) },
        },
        vertexShader: softPointsVert,
        fragmentShader: softPointsFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [map, gl]
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );

  useFrame((state) => {
    if (!focus.length) return;
    const t = state.clock.elapsedTime;
    mat.uniforms.uPR.value = Math.min(2, state.gl.getPixelRatio());
    const c = new THREE.Color();
    for (let i = 0; i < focus.length; i++) {
      const p = focus[i];
      const ang = hash01(p.id, 1) * Math.PI * 2 + t * 0.35;
      const R = 0.7 + hash01(p.id, 2) * 1.1;
      const pull = on ? 0.8 : 1;
      const o = i * 3;
      pos[o] = Math.cos(ang) * R * pull;
      pos[o + 1] = 0.5 + (hash01(p.id, 3) - 0.5) * 1.0;
      pos[o + 2] = Math.sin(ang) * R * pull;
      c.set(p.color).lerp(new THREE.Color(CYAN), 0.4);
      c.multiplyScalar(on ? 1.4 : 1.1);
      col[o] = c.r;
      col[o + 1] = c.g;
      col[o + 2] = c.b;
      siz[i] = 11 + p.weight * 14;
    }
    geo.setDrawRange(0, focus.length);
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
  });

  if (!focus.length) return null;
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/* ─── Camera ────────────────────────────────────────────────────────────── */

function CineCamera({
  flyTo,
  homeReq,
  genesis,
  focusMode,
  selected,
}: {
  flyTo: THREE.Vector3 | null;
  homeReq: number;
  genesis: GenesisPhase;
  focusMode: boolean;
  selected: boolean;
}) {
  const { camera } = useThree();
  const ctrl = useRef<any>(null);
  const home = useMemo(
    () => new THREE.Vector3(0, focusMode ? 2.6 : 3.2, focusMode ? 8.5 : 11),
    [focusMode]
  );
  const homeT = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const fly = useRef<{
    on: boolean;
    t0: number;
    dur: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    if (!flyTo) return;
    const to = flyTo
      .clone()
      .add(flyTo.clone().normalize().multiplyScalar(2.6))
      .add(new THREE.Vector3(0, 0.9, 0.5));
    if (to.length() < 4) to.setLength(4.5);
    fly.current = {
      on: true,
      t0: performance.now(),
      dur: 1400,
      from: camera.position.clone(),
      to,
      fromT: ctrl.current?.target?.clone() ?? homeT.clone(),
      toT: flyTo.clone(),
    };
  }, [flyTo, camera, homeT]);

  useEffect(() => {
    if (!homeReq) return;
    fly.current = {
      on: true,
      t0: performance.now(),
      dur: 1200,
      from: camera.position.clone(),
      to: home.clone(),
      fromT: ctrl.current?.target?.clone() ?? homeT.clone(),
      toT: homeT.clone(),
    };
  }, [homeReq, camera, home, homeT]);

  useFrame(() => {
    const f = fly.current;
    if (f?.on) {
      const u = easeInOutCubic(Math.min(1, (performance.now() - f.t0) / f.dur));
      camera.position.lerpVectors(f.from, f.to, u);
      if (ctrl.current) {
        ctrl.current.target.lerpVectors(f.fromT, f.toT, u);
        ctrl.current.update();
      }
      if (u >= 1) f.on = false;
      return;
    }
    if (!selected && !genesis.active) {
      const t = performance.now() / 1000;
      const target = home.clone();
      target.z += Math.sin(t * 0.12) * 0.35;
      target.y += Math.sin(t * 0.09) * 0.12;
      target.x += Math.cos(t * 0.08) * 0.15;
      camera.position.lerp(target, 0.02);
    } else if (genesis.resonance > 0.2) {
      // Micro push-in on resonance
      const target = home.clone();
      target.z -= 0.55 * genesis.resonance;
      camera.position.lerp(target, 0.06);
    } else if (genesis.dock > 0.15) {
      const target = home.clone();
      target.z += 1.1 * genesis.dock;
      target.y += 0.2 * genesis.dock;
      camera.position.lerp(target, 0.05);
    }
  });

  return (
    <OrbitControls
      ref={ctrl}
      enablePan={false}
      minDistance={4.5}
      maxDistance={22}
      enableDamping
      dampingFactor={0.045}
      autoRotate={!selected && !focusMode && !genesis.active}
      autoRotateSpeed={0.12}
      target={[0, 0, 0]}
      maxPolarAngle={Math.PI * 0.82}
      minPolarAngle={0.25}
    />
  );
}

/* ─── World ─────────────────────────────────────────────────────────────── */

function CrystallogenesisWorld({
  feed,
  genesis,
  selection,
  setSelection,
  flyTo,
  setFlyTo,
  homeReq,
  focusMode,
  tipErg,
}: {
  feed: ChainFeed;
  genesis: GenesisPhase;
  selection: Selection;
  setSelection: (s: Selection) => void;
  flyTo: THREE.Vector3 | null;
  setFlyTo: (v: THREE.Vector3 | null) => void;
  homeReq: number;
  focusMode: boolean;
  tipErg: string;
}) {
  const slots = useMemo(
    () => layoutSlots(feed.txGroups || [], focusMode),
    [feed.txGroups, focusMode]
  );
  const stack = useMemo(
    () => feed.recent.map((b) => b.height).slice(0, 8),
    [feed.recent]
  );

  const onSelectTx = useCallback(
    (txId: string, w: THREE.Vector3) => {
      setSelection({ kind: "tx", txId });
      setFlyTo(w.clone());
    },
    [setSelection, setFlyTo]
  );

  const onSelectBlock = useCallback(
    (
      id: string,
      height: number,
      w: THREE.Vector3,
      txCount?: number,
      ergNano?: string
    ) => {
      setSelection({ kind: "block", blockId: id, height, txCount, ergNano });
      setFlyTo(w.clone());
    },
    [setSelection, setFlyTo]
  );

  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 10, 34]} />
      <ambientLight intensity={0.1} color="#6a7a90" />
      <directionalLight position={[5, 9, 6]} intensity={0.45} color="#f0f4ff" />
      <directionalLight position={[-6, 1, -3]} intensity={0.35} color="#4a80b0" />
      <directionalLight position={[0, -4, 2]} intensity={0.12} color="#203040" />
      <Environment preset="night" environmentIntensity={0.28} />

      {/* Subtle void volume */}
      <mesh position={[0, 0, -20]} scale={25}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color="#03060c"
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>

      <CoreGenesis
        genesis={genesis}
        stackHeights={stack}
        tipHeight={feed.tip?.height ?? null}
        tipId={feed.tip?.id ?? null}
        tipTxCount={feed.tip?.txCount ?? 0}
        tipErg={tipErg}
        onSelectBlock={onSelectBlock}
        selectedBlockId={
          selection?.kind === "block" ? selection.blockId : null
        }
      />

      <CrystalBodies
        slots={slots}
        genesis={genesis}
        selection={selection}
        onSelectTx={onSelectTx}
      />

      <SoftDust
        particles={feed.particles}
        slots={slots}
        genesis={genesis}
        focusMode={focusMode}
      />

      <MerkleThreads slots={slots} genesis={genesis} />
      <AutolykosMatrix genesis={genesis} />
      <FocusShell particles={feed.particles} on={focusMode} />

      <CineCamera
        flyTo={flyTo}
        homeReq={homeReq}
        genesis={genesis}
        focusMode={focusMode}
        selected={!!selection}
      />
    </>
  );
}

/* ─── Shell UI ──────────────────────────────────────────────────────────── */

function findTx(feed: ChainFeed, id: string) {
  return (feed.txGroups || []).find((g) => g.txId === id) || null;
}

export default function ChainPulse() {
  const [addressInput, setAddressInput] = useState("");
  const [focusAddress, setFocusAddress] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [flyTo, setFlyTo] = useState<THREE.Vector3 | null>(null);
  const [homeReq, setHomeReq] = useState(0);
  const [gT, setGT] = useState(0);
  const [gTip, setGTip] = useState<string | null>(null);
  const prevTip = useRef<string | null>(null);

  const { data, error, isLoading, dataUpdatedAt, refetch, isFetching } =
    useQuery({
      queryKey: ["crystallogenesis", focusAddress || ""],
      queryFn: () => fetchFeed(focusAddress),
      refetchInterval: 4000,
      staleTime: 2000,
    });

  useEffect(() => {
    const id = data?.tip?.id ?? null;
    if (!id) return;
    if (prevTip.current && prevTip.current !== id) {
      if (soundOn) playSealSound();
      setGTip(id);
      setGT(0.001);
      const t0 = performance.now();
      const DUR = 2600;
      let raf = 0;
      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / DUR);
        setGT(u);
        if (u < 1) raf = requestAnimationFrame(tick);
        else {
          setGT(0);
          setGTip(null);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    prevTip.current = id;
  }, [data?.tip?.id, soundOn]);

  const genesis = useMemo(() => phaseFromT(gT, gTip), [gT, gTip]);

  const applyFocus = useCallback(() => {
    setFocusAddress(addressInput.trim() || null);
    setSelection(null);
    setFlyTo(null);
  }, [addressInput]);

  const clearFocus = useCallback(() => {
    setAddressInput("");
    setFocusAddress(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setFlyTo(null);
    setHomeReq((n) => n + 1);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [clearSelection]);

  const focusMode = !!focusAddress && !!data?.focus;
  const selectedTx =
    data && selection?.kind === "tx" ? findTx(data, selection.txId) : null;
  const mempoolN = (data?.txGroups || []).filter((g) => g.pending).length;

  const tipErg = data?.tip
    ? data.tip.transactions
        .reduce((s, t) => {
          try {
            return s + BigInt(t.ergNano);
          } catch {
            return s;
          }
        }, BigInt(0))
        .toString()
    : "0";

  const [webglOk, setWebglOk] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      setWebglOk(!!(c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch {
      setWebglOk(false);
    }
  }, []);

  return (
    <div className="w-full space-y-2">
      <div className="canvas-container lumen-viz relative w-full bg-black overflow-hidden rounded-2xl border border-white/[0.05]">
        <div className="absolute inset-0 w-full h-full min-h-[460px] md:min-h-[600px]">
          {data && webglOk ? (
            <Canvas
              camera={{ position: [0, 3.2, 11], fov: 34 }}
              dpr={[1, 1.5]}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
                preserveDrawingBuffer: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.05,
              }}
              className="!absolute !inset-0 !h-full !w-full"
              onPointerMissed={() => selection && clearSelection()}
            >
              <CrystallogenesisWorld
                feed={data}
                genesis={genesis}
                selection={selection}
                setSelection={setSelection}
                flyTo={flyTo}
                setFlyTo={setFlyTo}
                homeReq={homeReq}
                focusMode={focusMode}
                tipErg={tipErg}
              />
            </Canvas>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-[0.3em] text-white/30">
              {isLoading ? "CRYSTALLOGENESIS…" : "UNAVAILABLE"}
            </div>
          )}
        </div>

        {/* Ultra-minimal HUD */}
        <div className="pointer-events-none absolute inset-0 z-10 p-4 md:p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start gap-2">
            <div className="rounded-full bg-black/40 backdrop-blur-2xl border border-white/[0.06] px-4 py-2">
              <div className="text-[10px] font-mono tracking-[0.35em] text-white/35">
                ERGO CRYSTALLOGENESIS
              </div>
              <div className="text-[13px] font-mono text-white/80 tabular-nums mt-0.5">
                <span className="text-[#A8EFFF]">
                  {data?.tip?.height?.toLocaleString() ?? "—"}
                </span>
                <span className="text-white/25 text-[10px] ml-2">
                  {mempoolN} forming
                </span>
              </div>
              {genesis.active && (
                <div className="mt-1.5 h-[1px] w-28 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#A8EFFF] via-white to-[#FF6B00]"
                    style={{ width: `${Math.round(genesis.t * 100)}%` }}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => setSoundOn((v) => !v)}
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-2xl border border-white/[0.06] text-white/30 hover:text-white/70 text-[11px]"
              >
                {soundOn ? "♪" : "♩"}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-2xl border border-white/[0.06] text-white/30 hover:text-white/70 text-[12px]"
              >
                {isFetching ? "…" : "↻"}
              </button>
            </div>
          </div>

          <div className="pointer-events-auto max-w-[min(100%,360px)]">
            <div className="rounded-full bg-black/35 backdrop-blur-2xl border border-white/[0.06] px-3 py-1.5 flex items-center gap-2">
              <input
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFocus()}
                placeholder="focus address"
                spellCheck={false}
                className="lumen-search-input flex-1 bg-transparent border-0 outline-none font-mono text-[11px] text-white/70 placeholder:text-white/20"
              />
              <button
                type="button"
                onClick={applyFocus}
                className="text-[9px] font-mono tracking-[0.2em] text-[#A8EFFF]/70"
              >
                FOCUS
              </button>
              {focusAddress && (
                <button
                  type="button"
                  onClick={clearFocus}
                  className="text-white/25 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
            {focusMode && data?.focus && (
              <div className="mt-1.5 px-3 text-[10px] font-mono text-white/30">
                {formatErg(data.focus.confirmed.nanoErgs)} ERG ·{" "}
                {data.focus.confirmed.tokens.length} tokens
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2">
            {selectedTx ? (
              <div className="pointer-events-auto rounded-2xl bg-black/55 backdrop-blur-2xl border border-white/[0.07] px-4 py-3.5 max-w-[min(100%,300px)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
                <div className="flex justify-between mb-2">
                  <span className="text-[9px] font-mono tracking-[0.3em] text-white/30">
                    CRYSTAL
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[9px] font-mono tracking-widest text-white/25"
                  >
                    ESC
                  </button>
                </div>
                <div className="text-[12px] font-mono text-white/85 mb-2">
                  {selectedTx.txId.slice(0, 8)}…{selectedTx.txId.slice(-6)}
                </div>
                <div className="flex gap-3 text-[11px] font-mono text-white/40 mb-2">
                  <span>
                    <span className="text-[#A8EFFF]">{selectedTx.inputs}</span>→
                    <span className="text-white/70">{selectedTx.outputs}</span>
                  </span>
                  <span className="text-[#FF6B00]/90">
                    {formatErg(selectedTx.ergNano)} ERG
                  </span>
                </div>
                {selectedTx.tokens.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedTx.tokens.slice(0, 8).map((tk) => (
                      <span
                        key={tk.tokenId}
                        className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-white/[0.06] text-white/55"
                      >
                        {tk.label || tk.name || tk.tokenId.slice(0, 6)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : selection?.kind === "block" ? (
              <div className="pointer-events-auto rounded-2xl bg-black/55 backdrop-blur-2xl border border-white/[0.07] px-4 py-3.5 max-w-[min(100%,260px)]">
                <div className="flex justify-between mb-1">
                  <span className="text-[9px] font-mono tracking-[0.3em] text-white/30">
                    BLOCK
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[9px] font-mono text-white/25"
                  >
                    ESC
                  </button>
                </div>
                <div className="text-[20px] font-mono text-white/90 tabular-nums">
                  #{selection.height.toLocaleString()}
                </div>
                {(selection.txCount != null || selection.ergNano) && (
                  <div className="text-[11px] font-mono text-white/35 mt-1">
                    {selection.txCount != null && `${selection.txCount} tx`}
                    {selection.ergNano &&
                      ` · ${formatErg(selection.ergNano)} ERG`}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[9px] font-mono tracking-[0.2em] text-white/20 max-w-sm leading-relaxed">
                {genesis.active ? (
                  <span className="text-white/40">
                    {genesis.capture > 0.05 && genesis.crystal < 0.2 && "CAPTURE  "}
                    {genesis.crystal > 0.1 && genesis.seal < 0.2 && "CRYSTAL  "}
                    {genesis.seal > 0.05 && genesis.dock < 0.2 && "SEAL  "}
                    {genesis.dock > 0.05 && "DOCK"}
                  </span>
                ) : (
                  "tap a crystal · watch value crystallize into the chain"
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-0.5 text-[10px] font-mono tracking-wider text-white/20">
        {error
          ? `error: ${error instanceof Error ? error.message : "failed"}`
          : data
            ? `crystallogenesis · ${new Date(dataUpdatedAt).toLocaleTimeString()}`
            : "…"}
      </div>
    </div>
  );
}
