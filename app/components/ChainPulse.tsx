"use client";

/**
 * Block Genesis v1.1.1 — soft Points · frosted glass · physical dock squash
 * Data plane: /api/chain/feed + txGroups (unchanged)
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
  Stars,
  Environment,
  MeshTransmissionMaterial,
} from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import type { ChainFeed, ChainParticle, ChainTxGroup } from "@/lib/chain";

/* ═══════════════════════════════════════════════════════════════════════════
   Soft gaussian sprite (true circular falloff — no hard spheres)
   ═══════════════════════════════════════════════════════════════════════════ */

let softTex: THREE.CanvasTexture | null = null;
function getSoftTex(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  if (softTex) return softTex;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  // Soft gaussian-ish stops
  g.addColorStop(0.0, "rgba(255,255,255,1.00)");
  g.addColorStop(0.08, "rgba(255,255,255,0.92)");
  g.addColorStop(0.22, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.18)");
  g.addColorStop(0.7, "rgba(255,255,255,0.04)");
  g.addColorStop(1.0, "rgba(255,255,255,0.00)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTex = new THREE.CanvasTexture(c);
  softTex.colorSpace = THREE.SRGBColorSpace;
  softTex.needsUpdate = true;
  return softTex;
}

const GEO_SPRITE = new THREE.PlaneGeometry(1, 1);
const GEO_CRYSTAL = new THREE.IcosahedronGeometry(1, 3);
const GEO_DISC = new THREE.CylinderGeometry(1, 1, 0.09, 48);
const GEO_HIT = new THREE.SphereGeometry(1, 12, 12);

/* Soft additive Points shader — true circular gaussian, never hard spheres */
const softPointsVert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.5, -mv.z);
    gl_PointSize = aSize * uPixelRatio * (280.0 / dist);
    gl_PointSize = clamp(gl_PointSize, 2.0, 96.0);
    vAlpha = smoothstep(0.0, 1.0, aSize * 0.15);
    gl_Position = projectionMatrix * mv;
  }
`;

const softPointsFrag = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a < 0.015) discard;
    // Additive-friendly: color * falloff
    gl_FragColor = vec4(vColor * tex.r, a);
  }
`;

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

/** Anticipation dip then smooth rise */
function easeAnticipate(t: number) {
  const x = Math.min(1, Math.max(0, t));
  // slight reverse then accelerate
  return x * x * ((1.6 + 1) * x - 1.6) + x * (1 - x) * 0.15;
}

/** Overshoot settle for dock */
function easeOutBack(t: number) {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
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
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(70, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(32, now + 0.32);
    g2.gain.setValueAtTime(0.0001, now + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.07, now + 0.12);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.45);
    window.setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    /* silent */
  }
}

/* ─── Genesis phase (2.6s climax) ───────────────────────────────────────── */

export type GenesisPhase = {
  t: number;
  /** 0–1 anticipation + capture */
  capture: number;
  crystal: number;
  seal: number;
  dock: number;
  /** bloom intensity cue */
  bloom: number;
  active: boolean;
  tipId: string | null;
};

function phaseFromT(t: number, tipId: string | null): GenesisPhase {
  const x = Math.min(1, Math.max(0, t));
  // Timeline (~2.6s wall): capture 0–0.30 · crystal 0.18–0.55 · seal 0.48–0.68 · dock 0.62–1.0
  const capture = easeAnticipate(Math.min(1, x / 0.3));
  const crystal = easeInOutCubic(Math.min(1, Math.max(0, (x - 0.18) / 0.37)));
  const seal = easeInOutCubic(Math.min(1, Math.max(0, (x - 0.48) / 0.2)));
  const dock = easeOutBack(Math.min(1, Math.max(0, (x - 0.62) / 0.38)));
  // Soft bloom pulse peaks at seal
  const bloom =
    seal > 0
      ? Math.sin(Math.min(1, seal) * Math.PI) * 0.85 + crystal * 0.15
      : crystal * 0.25;
  return {
    t: x,
    capture,
    crystal,
    seal,
    dock: Math.min(1, Math.max(0, dock)),
    bloom,
    active: x > 0 && x < 1,
    tipId,
  };
}

/* ─── Data ──────────────────────────────────────────────────────────────── */

async function fetchFeed(address: string | null): Promise<ChainFeed> {
  const q = new URLSearchParams({ blocks: "7", mempool: "36" });
  if (address) q.set("address", address);
  const res = await fetch(`/api/chain/feed?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.text()) || `feed ${res.status}`);
  return res.json();
}

type Selection =
  | { kind: "tx"; txId: string }
  | { kind: "block"; blockId: string; height: number; txCount?: number; ergNano?: string }
  | null;

/* ─── TX layout ─────────────────────────────────────────────────────────── */

type TxSlot = {
  group: ChainTxGroup;
  home: THREE.Vector3;
  phase: number;
  speed: number;
};

function layoutTxHomes(groups: ChainTxGroup[], focusMode: boolean): TxSlot[] {
  const mem = groups.filter((g) => g.stage === "mempool" || g.pending);
  const sealed = groups.filter((g) => g.stage === "sealed" && !g.pending);
  const show = [
    ...mem.slice(0, 14),
    ...sealed.slice(0, focusMode ? 3 : 7),
  ];
  return show.map((group, i) => {
    const n = show.length || 1;
    const ring = group.pending ? 4.4 : 2.4;
    const elev = (hash01(group.txId, 3) - 0.5) * (group.pending ? 2.2 : 1.0);
    const ang = (i / n) * Math.PI * 2 + hash01(group.txId, 1) * 0.35;
    return {
      group,
      home: new THREE.Vector3(
        Math.cos(ang) * ring,
        elev,
        Math.sin(ang) * ring
      ),
      phase: hash01(group.txId, 7) * Math.PI * 2,
      speed: 0.12 + hash01(group.txId, 8) * 0.22,
    };
  });
}

/* ─── TX Constellations ─────────────────────────────────────────────────── */

function TxConstellations({
  slots,
  particles,
  genesis,
  selection,
  onSelectTx,
  focusMode,
}: {
  slots: TxSlot[];
  particles: ChainParticle[];
  genesis: GenesisPhase;
  selection: Selection;
  onSelectTx: (txId: string, world: THREE.Vector3) => void;
  focusMode: boolean;
}) {
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const partsByTx = useMemo(() => {
    const m = new Map<string, ChainParticle[]>();
    for (const p of particles) {
      if (!p.txId || p.txId === "focus") continue;
      const arr = m.get(p.txId) || [];
      arr.push(p);
      m.set(p.txId, arr);
    }
    return m;
  }, [particles]);

  const map = useMemo(() => getSoftTex(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const _tmp = useMemo(() => new THREE.Vector3(), []);
  const _axis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const { gl } = useThree();

  const flatParts = useMemo(() => {
    const out: Array<{
      p: ChainParticle;
      txId: string;
      localR: number;
      localPhase: number;
      localSpeed: number;
      elev: number;
    }> = [];
    for (const s of slots) {
      const parts = (partsByTx.get(s.group.txId) || []).slice(0, 10);
      parts.forEach((p, i) => {
        out.push({
          p,
          txId: s.group.txId,
          localR: 0.32 + hash01(p.id, 2) * 0.58,
          localPhase: hash01(p.id, 3) * Math.PI * 2 + i * 0.7,
          localSpeed: 0.7 + hash01(p.id, 4) * 1.5,
          elev: (hash01(p.id, 5) - 0.5) * 0.38,
        });
      });
    }
    return out;
  }, [slots, partsByTx]);

  const count = Math.max(1, flatParts.length);
  const posArr = useMemo(() => new Float32Array(count * 3), [count]);
  const colArr = useMemo(() => new Float32Array(count * 3), [count]);
  const sizeArr = useMemo(() => new Float32Array(count), [count]);

  const pointsGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(colArr, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizeArr, 1));
    g.setDrawRange(0, flatParts.length);
    return g;
  }, [posArr, colArr, sizeArr, flatParts.length]);

  const pointsMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uPixelRatio: { value: Math.min(2, gl.getPixelRatio()) },
      },
      vertexShader: softPointsVert,
      fragmentShader: softPointsFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  }, [map, gl]);

  useEffect(
    () => () => {
      pointsGeo.dispose();
      pointsMat.dispose();
    },
    [pointsGeo, pointsMat]
  );

  const centers = useRef<Map<string, THREE.Vector3>>(new Map());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const camQ = state.camera.quaternion;
    const cap = genesis.capture;
    const cry = genesis.crystal;
    pointsMat.uniforms.uPixelRatio.value = Math.min(2, state.gl.getPixelRatio());

    // Only mempool groups fully capture; sealed dim & partially draw in
    for (const s of slots) {
      const g = groupRefs.current.get(s.group.txId);
      if (!g) continue;
      const isMem = s.group.pending || s.group.stage === "mempool";
      const capW = isMem ? cap : cap * 0.25;
      const cryW = isMem ? cry : cry * 0.35;

      // Home drift
      _tmp.copy(s.home).applyAxisAngle(_axis, t * s.speed * 0.12);
      _tmp.y = s.home.y + Math.sin(t * 0.45 + s.phase) * 0.1;

      // Anticipation: slight outward before capture bites
      const anti = genesis.t < 0.08 ? 1 + (0.08 - genesis.t) * 1.2 : 1;
      _tmp.multiplyScalar(anti);

      // Gravitational capture of whole group
      _tmp.multiplyScalar(1 - capW * 0.94);
      // Dissolve into crystal
      _tmp.multiplyScalar(1 - cryW * 0.88);

      // Smooth lerp (weighted, physical)
      g.position.lerp(_tmp, 0.14);
      centers.current.set(s.group.txId, g.position.clone());

      const glow = g.children.find((c) => c.name === "glow") as
        | THREE.Mesh
        | undefined;
      const sel =
        selection?.kind === "tx" && selection.txId === s.group.txId;
      if (glow) {
        (glow.material as THREE.MeshBasicMaterial).opacity =
          (sel ? 0.55 : 0.28) * (1 - cryW) * (isMem ? 1 : 0.5);
        glow.scale.setScalar((sel ? 0.55 : 0.38) * (1 - cryW * 0.55));
        glow.quaternion.copy(camQ);
      }
      g.visible = cryW < 0.97;
    }

    // Soft Points — molecular cloud around each TX center
    const n = flatParts.length;
    for (let i = 0; i < n; i++) {
      const fp = flatParts[i];
      const center = centers.current.get(fp.txId) || _tmp.set(0, 0, 0);
      const isMem = fp.p.pending;
      const cryW = isMem ? cry : cry * 0.35;
      const capW = isMem ? cap : cap * 0.25;
      const ang = fp.localPhase + t * fp.localSpeed;
      const localScale = Math.max(0, 1 - cryW * 0.98);
      const lr = fp.localR * localScale * (1 - capW * 0.35);
      const spiral = 1 - capW * 0.55;
      const o = i * 3;
      posArr[o] = center.x + Math.cos(ang) * lr * spiral;
      posArr[o + 1] = center.y + fp.elev * localScale;
      posArr[o + 2] = center.z + Math.sin(ang) * lr * spiral;

      const size =
        (8 + fp.p.weight * 14) *
        (1 + Math.sin(t * 2.5 + fp.localPhase) * 0.08) *
        localScale *
        (focusMode && fp.p.stage !== "focus" ? 0.7 : 1) *
        (1 + genesis.bloom * 0.2);
      sizeArr[i] = Math.max(1.5, size);

      color.set(fp.p.color);
      const mul =
        (fp.p.pending ? 1.25 : 0.7) *
        (1 - cryW * 0.45) *
        (1 + genesis.bloom * 0.3);
      colArr[o] = Math.min(1, color.r * mul);
      colArr[o + 1] = Math.min(1, color.g * mul);
      colArr[o + 2] = Math.min(1, color.b * mul);
    }
    pointsGeo.setDrawRange(0, n);
    const posAttr = pointsGeo.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = pointsGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const sizeAttr = pointsGeo.getAttribute("aSize") as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  });

  return (
    <group>
      {slots.map((s) => {
        const selected =
          selection?.kind === "tx" && selection.txId === s.group.txId;
        const accent = s.group.pending ? "#7EF5D4" : "#8EBBFF";
        return (
          <group
            key={s.group.txId}
            ref={(el) => {
              if (el) groupRefs.current.set(s.group.txId, el);
              else groupRefs.current.delete(s.group.txId);
            }}
            position={s.home}
          >
            {/* Soft gaussian nucleus only — no hard sphere */}
            <mesh name="glow" scale={0.42} geometry={GEO_SPRITE} renderOrder={2}>
              <meshBasicMaterial
                map={map}
                color={selected ? "#F5E0B0" : accent}
                transparent
                opacity={selected ? 0.55 : 0.3}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh
              geometry={GEO_HIT}
              scale={0.52}
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

      {flatParts.length > 0 && (
        <points
          geometry={pointsGeo}
          material={pointsMat}
          frustumCulled={false}
          renderOrder={3}
        />
      )}
    </group>
  );
}

/* ─── Address focus shell ───────────────────────────────────────────────── */

function FocusShell({
  particles,
  highlight,
}: {
  particles: ChainParticle[];
  highlight: boolean;
}) {
  const { gl } = useThree();
  const color = useMemo(() => new THREE.Color(), []);
  const map = useMemo(() => getSoftTex(), []);
  const focus = useMemo(
    () => particles.filter((p) => p.stage === "focus"),
    [particles]
  );
  const count = Math.max(1, focus.length);
  const posArr = useMemo(() => new Float32Array(count * 3), [count]);
  const colArr = useMemo(() => new Float32Array(count * 3), [count]);
  const sizeArr = useMemo(() => new Float32Array(count), [count]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(colArr, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizeArr, 1));
    g.setDrawRange(0, focus.length);
    return g;
  }, [posArr, colArr, sizeArr, focus.length]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uPixelRatio: { value: Math.min(2, gl.getPixelRatio()) },
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
    if (focus.length === 0) return;
    const t = state.clock.elapsedTime;
    mat.uniforms.uPixelRatio.value = Math.min(2, state.gl.getPixelRatio());
    for (let i = 0; i < focus.length; i++) {
      const p = focus[i];
      const ang =
        hash01(p.id, 1) * Math.PI * 2 + t * (0.32 + hash01(p.id, 2) * 0.35);
      const R = 0.65 + hash01(p.id, 3) * 1.25;
      const y = 0.45 + (hash01(p.id, 4) - 0.5) * 1.1;
      const pull = highlight ? 0.82 : 1;
      const o = i * 3;
      posArr[o] = Math.cos(ang) * R * pull;
      posArr[o + 1] = y;
      posArr[o + 2] = Math.sin(ang) * R * pull;
      sizeArr[i] =
        (10 + p.weight * 16) * (1 + Math.sin(t * 2 + i) * 0.08) * (highlight ? 1.15 : 1);
      color.set(p.color);
      color.multiplyScalar(highlight ? 1.45 : 1.15);
      colArr[o] = color.r;
      colArr[o + 1] = color.g;
      colArr[o + 2] = color.b;
    }
    geo.setDrawRange(0, focus.length);
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
  });

  if (focus.length === 0) return null;
  return (
    <points geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />
  );
}

/* ─── Crystal core + dock + stack ───────────────────────────────────────── */

function GenesisCrystal({
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
  const crystalRef = useRef<THREE.Group>(null!);
  const bloomRef = useRef<THREE.Mesh>(null!);
  const dockGroup = useRef<THREE.Group>(null!);
  const stackRef = useRef<THREE.Group>(null!);
  /** Impulse 0..1 then damps — drives visible squash */
  const stackSquash = useRef(0);
  const landedRef = useRef(false);
  const map = useMemo(() => getSoftTex(), []);

  // Reset land latch when a new cycle starts
  useEffect(() => {
    if (genesis.active && genesis.t < 0.05) landedRef.current = false;
  }, [genesis.active, genesis.t, genesis.tipId]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(0.05, state.clock.getDelta());
    const cry = genesis.crystal;
    const seal = genesis.seal;
    const dock = genesis.dock;
    const bloom = genesis.bloom;

    if (crystalRef.current) {
      // Glass volume grows; wireframe stays secondary (static child scale)
      const grow = genesis.active
        ? 0.18 + cry * 1.05 + seal * 0.12
        : 1.04 + Math.sin(t * 1.15) * 0.02;
      const lift = genesis.active
        ? Math.sin(
            Math.min(1, Math.max(0, (genesis.t - 0.52) / 0.14)) * Math.PI
          ) *
          0.32 *
          (1 - dock)
        : 0;
      crystalRef.current.position.y = lift;
      crystalRef.current.scale.setScalar(grow * (1 - dock * 0.12));
      crystalRef.current.rotation.y = t * 0.16 + seal * 0.55;
      crystalRef.current.rotation.x = Math.sin(t * 0.26) * 0.06;
      crystalRef.current.visible = dock < 0.92 || !genesis.active;
    }

    if (bloomRef.current) {
      const s = 2.4 + bloom * 3.4 + cry * 0.8 + seal * 0.5;
      bloomRef.current.scale.setScalar(s);
      (bloomRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.05 + bloom * 0.38 + seal * 0.12;
      bloomRef.current.quaternion.copy(state.camera.quaternion);
    }

    if (dockGroup.current) {
      const startY = 0.2;
      const endY = -2.12;
      // dock already easeOutBack → overshoot past end then recover
      const y = THREE.MathUtils.lerp(startY, endY, Math.min(1.08, dock));
      const sxy = THREE.MathUtils.lerp(0.2, 1.2, Math.min(1, dock * 1.2));
      // Vertical squash of disc on impact
      const impact = dock > 0.88 ? Math.sin((dock - 0.88) / 0.12 * Math.PI) : 0;
      dockGroup.current.position.y = y;
      dockGroup.current.scale.set(sxy * (1 + impact * 0.08), 1 - impact * 0.35, sxy * (1 + impact * 0.08));
      dockGroup.current.visible = genesis.active && dock > 0.02;

      // Fire stack squash impulse once near landing
      if (dock >= 0.9 && !landedRef.current) {
        landedRef.current = true;
        stackSquash.current = 1;
      }
    }

    // Damped recovery of stack squash
    stackSquash.current = THREE.MathUtils.damp(stackSquash.current, 0, 5.5, dt);

    if (stackRef.current) {
      const sq = stackSquash.current;
      // Visible physical weight: compress Y, bulge XZ, slight drop
      stackRef.current.scale.set(
        1 + sq * 0.12,
        1 - sq * 0.22,
        1 + sq * 0.12
      );
      stackRef.current.position.y = -2.32 - sq * 0.06;
    }
  });

  return (
    <group>
      {/* Soft bloom pulse (seal climax) */}
      <mesh ref={bloomRef} geometry={GEO_SPRITE} renderOrder={0}>
        <meshBasicMaterial
          map={map}
          color="#E8C48A"
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Frosted glass volume — transmission dominates */}
      <group ref={crystalRef}>
        <mesh geometry={GEO_CRYSTAL}>
          <MeshTransmissionMaterial
            backside
            samples={6}
            resolution={384}
            transmission={0.96}
            roughness={0.08 + genesis.seal * 0.18}
            thickness={0.85}
            ior={1.5}
            chromaticAberration={0.04}
            anisotropy={0.15}
            anisotropicBlur={0.2}
            distortion={0.08}
            distortionScale={0.2}
            temporalDistortion={0.04}
            color={genesis.seal > 0.4 ? "#e8eef8" : "#c5d6f0"}
            attenuationColor="#E8C48A"
            attenuationDistance={0.55}
            clearcoat={0.6 + genesis.seal * 0.35}
            clearcoatRoughness={0.12}
          />
        </mesh>
        {/* Soft internal glow fill */}
        <mesh geometry={GEO_CRYSTAL} scale={0.72}>
          <meshBasicMaterial
            color="#E8C48A"
            transparent
            opacity={0.08 + genesis.bloom * 0.18}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Secondary structure only — never dominates */}
        <mesh geometry={GEO_CRYSTAL} scale={1.02}>
          <meshBasicMaterial
            color="#E8C48A"
            wireframe
            transparent
            opacity={0.035 + genesis.seal * 0.025}
            depthWrite={false}
          />
        </mesh>
      </group>

      <pointLight
        color="#F0D4A0"
        intensity={0.9 + genesis.bloom * 1.4 + genesis.seal * 0.5}
        distance={14}
      />
      <pointLight
        color="#7EC8FF"
        intensity={0.35 + genesis.seal * 0.45}
        distance={11}
        position={[2.6, 1.8, 2.4]}
      />

      {/* Docking disc */}
      <group ref={dockGroup}>
        <mesh geometry={GEO_DISC}>
          <meshStandardMaterial
            color="#1a2233"
            emissive="#E8C48A"
            emissiveIntensity={0.7 + genesis.seal * 0.3}
            metalness={0.8}
            roughness={0.18}
          />
        </mesh>
        <mesh geometry={GEO_DISC} scale={[1.04, 1.5, 1.04]}>
          <meshBasicMaterial
            color="#E8C48A"
            transparent
            opacity={0.18}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {/* Sealed stack — responds physically to dock */}
      <group ref={stackRef} position={[0, -2.32, 0]}>
        {stackHeights.map((h, i) => {
          const isTip = tipHeight != null && h === tipHeight && i === 0;
          const bid = i === 0 && tipId ? tipId : `h-${h}`;
          const selected =
            selectedBlockId === bid ||
            (isTip && selectedBlockId === tipId);
          return (
            <group key={`${h}-${i}`} position={[0, -i * 0.22, 0]}>
              <mesh
                geometry={GEO_DISC}
                scale={[1.16 - i * 0.03, 1, 1.16 - i * 0.03]}
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
                  color={selected ? "#2a384f" : isTip ? "#1e283c" : "#10151f"}
                  emissive={
                    selected ? "#F0D4A0" : isTip ? "#C9A86C" : "#2a4060"
                  }
                  emissiveIntensity={selected ? 0.5 : isTip ? 0.28 : 0.08}
                  metalness={0.65}
                  roughness={isTip ? 0.26 : 0.4}
                  transparent
                  opacity={0.94 - i * 0.06}
                />
              </mesh>
              <mesh
                geometry={GEO_DISC}
                scale={[1.18 - i * 0.03, 0.35, 1.18 - i * 0.03]}
              >
                <meshBasicMaterial
                  color={isTip ? "#E8C48A" : "#4a6a90"}
                  transparent
                  opacity={isTip ? 0.14 : 0.045}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/* ─── Camera: dolly + graceful home ─────────────────────────────────────── */

function GenesisCamera({
  flyTo,
  homeRequest,
  genesis,
  focusMode,
  selected,
}: {
  flyTo: THREE.Vector3 | null;
  homeRequest: number;
  genesis: GenesisPhase;
  focusMode: boolean;
  selected: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const homePos = useMemo(
    () => new THREE.Vector3(0, focusMode ? 2.9 : 3.5, focusMode ? 7.8 : 9.8),
    [focusMode]
  );
  const homeTarget = useMemo(() => new THREE.Vector3(0, 0.05, 0), []);
  const fly = useRef<{
    active: boolean;
    t0: number;
    dur: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
  } | null>(null);

  // Dolly to selection
  useEffect(() => {
    if (!flyTo) return;
    const dir = flyTo.clone().normalize();
    const to = flyTo
      .clone()
      .add(dir.multiplyScalar(2.4))
      .add(new THREE.Vector3(0, 1.0, 0.6));
    if (to.length() < 4.2) to.setLength(4.5);
    fly.current = {
      active: true,
      t0: performance.now(),
      dur: 1200,
      from: camera.position.clone(),
      to,
      fromT: controlsRef.current?.target?.clone() ?? homeTarget.clone(),
      toT: flyTo.clone(),
    };
  }, [flyTo, camera, homeTarget]);

  // Graceful return home
  useEffect(() => {
    if (!homeRequest) return;
    fly.current = {
      active: true,
      t0: performance.now(),
      dur: 1000,
      from: camera.position.clone(),
      to: homePos.clone(),
      fromT: controlsRef.current?.target?.clone() ?? homeTarget.clone(),
      toT: homeTarget.clone(),
    };
  }, [homeRequest, camera, homePos, homeTarget]);

  useFrame(() => {
    const f = fly.current;
    if (f?.active) {
      const u = easeInOutCubic(
        Math.min(1, (performance.now() - f.t0) / f.dur)
      );
      camera.position.lerpVectors(f.from, f.to, u);
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(f.fromT, f.toT, u);
        controlsRef.current.update();
      }
      if (u >= 1) f.active = false;
      return;
    }

    if (!selected && !genesis.active) {
      const t = performance.now() / 1000;
      const target = homePos.clone();
      target.z += Math.sin(t * 0.18) * 0.22;
      target.y += Math.sin(t * 0.14) * 0.08;
      // Subtle push-back during seal
      camera.position.lerp(target, 0.025);
    } else if (genesis.dock > 0.15) {
      const target = homePos.clone();
      target.z += 0.9 * genesis.dock;
      target.y += 0.15 * genesis.dock;
      camera.position.lerp(target, 0.05);
    } else if (genesis.seal > 0.2) {
      // Micro push-in at seal for drama
      const target = homePos.clone();
      target.z -= 0.35 * genesis.bloom;
      camera.position.lerp(target, 0.06);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={4}
      maxDistance={20}
      enableDamping
      dampingFactor={0.048}
      autoRotate={!selected && !focusMode && !genesis.active}
      autoRotateSpeed={0.18}
      target={[0, 0.05, 0]}
      maxPolarAngle={Math.PI * 0.84}
      minPolarAngle={0.22}
    />
  );
}

/* ─── World ─────────────────────────────────────────────────────────────── */

function GenesisWorld({
  feed,
  genesis,
  selection,
  setSelection,
  flyTarget,
  setFlyTarget,
  homeRequest,
  focusMode,
  tipErg,
}: {
  feed: ChainFeed;
  genesis: GenesisPhase;
  selection: Selection;
  setSelection: (s: Selection) => void;
  flyTarget: THREE.Vector3 | null;
  setFlyTarget: (v: THREE.Vector3 | null) => void;
  homeRequest: number;
  focusMode: boolean;
  tipErg: string;
}) {
  const slots = useMemo(
    () => layoutTxHomes(feed.txGroups || [], focusMode),
    [feed.txGroups, focusMode]
  );
  const stackHeights = useMemo(
    () => feed.recent.map((b) => b.height).slice(0, 7),
    [feed.recent]
  );

  const onSelectTx = useCallback(
    (txId: string, world: THREE.Vector3) => {
      setSelection({ kind: "tx", txId });
      setFlyTarget(world.clone());
    },
    [setSelection, setFlyTarget]
  );

  const onSelectBlock = useCallback(
    (
      blockId: string,
      height: number,
      world: THREE.Vector3,
      txCount?: number,
      ergNano?: string
    ) => {
      setSelection({
        kind: "block",
        blockId,
        height,
        txCount,
        ergNano,
      });
      setFlyTarget(world.clone());
    },
    [setSelection, setFlyTarget]
  );

  return (
    <>
      <color attach="background" args={["#000108"]} />
      <fog attach="fog" args={["#000108", 11, 32]} />
      <ambientLight intensity={0.14} color="#6a7a98" />
      {/* Soft key */}
      <directionalLight
        position={[4.5, 8, 5]}
        intensity={0.55}
        color="#fff5ea"
      />
      {/* Cool rim */}
      <directionalLight
        position={[-5, 2, -4]}
        intensity={0.28}
        color="#4a7ab5"
      />
      <Environment preset="night" environmentIntensity={0.35} />

      <Stars
        radius={70}
        depth={48}
        count={2800}
        factor={2.2}
        saturation={0.08}
        fade
        speed={0.08}
      />

      <mesh position={[-12, 4, -18]} scale={15}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          color="#0c0620"
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[11, -3, -16]} scale={12}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial
          color="#040e1c"
          transparent
          opacity={0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <GenesisCrystal
        genesis={genesis}
        stackHeights={stackHeights}
        tipHeight={feed.tip?.height ?? null}
        tipId={feed.tip?.id ?? null}
        tipTxCount={feed.tip?.txCount ?? 0}
        tipErg={tipErg}
        onSelectBlock={onSelectBlock}
        selectedBlockId={
          selection?.kind === "block" ? selection.blockId : null
        }
      />

      <TxConstellations
        slots={slots}
        particles={feed.particles}
        genesis={genesis}
        selection={selection}
        onSelectTx={onSelectTx}
        focusMode={focusMode}
      />

      <FocusShell particles={feed.particles} highlight={focusMode} />

      <GenesisCamera
        flyTo={flyTarget}
        homeRequest={homeRequest}
        genesis={genesis}
        focusMode={focusMode}
        selected={!!selection}
      />
    </>
  );
}

/* ─── Shell ─────────────────────────────────────────────────────────────── */

function findTx(feed: ChainFeed, txId: string): ChainTxGroup | null {
  return (feed.txGroups || []).find((g) => g.txId === txId) || null;
}

export default function ChainPulse() {
  const [addressInput, setAddressInput] = useState("");
  const [focusAddress, setFocusAddress] = useState<string | null>(null);
  /** Sound default OFF per v1.1 spec */
  const [soundOn, setSoundOn] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [flyTarget, setFlyTarget] = useState<THREE.Vector3 | null>(null);
  const [homeRequest, setHomeRequest] = useState(0);
  const [genesisT, setGenesisT] = useState(0);
  const [genesisTip, setGenesisTip] = useState<string | null>(null);
  const prevTip = useRef<string | null>(null);

  const { data, error, isLoading, dataUpdatedAt, refetch, isFetching } =
    useQuery({
      queryKey: ["chain-feed-genesis", focusAddress || ""],
      queryFn: () => fetchFeed(focusAddress),
      refetchInterval: 4000,
      staleTime: 2000,
    });

  // ~2.6s seal choreography on new tip
  useEffect(() => {
    const id = data?.tip?.id ?? null;
    if (!id) return;
    if (prevTip.current && prevTip.current !== id) {
      if (soundOn) playSealSound();
      setGenesisTip(id);
      setGenesisT(0.001);
      const t0 = performance.now();
      const DUR = 2600;
      let raf = 0;
      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / DUR);
        setGenesisT(u);
        if (u < 1) raf = requestAnimationFrame(tick);
        else {
          setGenesisT(0);
          setGenesisTip(null);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    prevTip.current = id;
  }, [data?.tip?.id, soundOn]);

  const genesis = useMemo(
    () => phaseFromT(genesisT, genesisTip),
    [genesisT, genesisTip]
  );

  const applyFocus = useCallback(() => {
    const a = addressInput.trim();
    setFocusAddress(a || null);
    setSelection(null);
    setFlyTarget(null);
  }, [addressInput]);

  const clearFocus = useCallback(() => {
    setAddressInput("");
    setFocusAddress(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setFlyTarget(null);
    setHomeRequest((n) => n + 1);
  }, []);

  // ESC → return
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  const focusMode = !!focusAddress && !!data?.focus;
  const selectedTx =
    data && selection?.kind === "tx"
      ? findTx(data, selection.txId)
      : null;

  const mempoolN = (data?.txGroups || []).filter((g) => g.pending).length;
  const sealedN = (data?.txGroups || []).filter((g) => !g.pending).length;

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
      setWebglOk(
        !!(c.getContext("webgl") || c.getContext("experimental-webgl"))
      );
    } catch {
      setWebglOk(false);
    }
  }, []);

  return (
    <div className="w-full space-y-2.5">
      <div className="canvas-container lumen-viz relative w-full bg-[#000108] overflow-hidden rounded-2xl border border-white/[0.07]">
        <div className="absolute inset-0 w-full h-full min-h-[440px] md:min-h-[580px]">
          {data && webglOk ? (
            <Canvas
              camera={{ position: [0, 3.5, 9.8], fov: 36 }}
              dpr={[1, 1.5]}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
                preserveDrawingBuffer: true,
              }}
              className="!absolute !inset-0 !h-full !w-full"
              onPointerMissed={() => {
                if (selection) clearSelection();
              }}
            >
              <GenesisWorld
                feed={data}
                genesis={genesis}
                selection={selection}
                setSelection={setSelection}
                flyTarget={flyTarget}
                setFlyTarget={setFlyTarget}
                homeRequest={homeRequest}
                focusMode={focusMode}
                tipErg={tipErg}
              />
            </Canvas>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-mono text-[11px] tracking-widest text-[#A0A0B0] p-6 text-center">
              {isLoading
                ? "CRYSTALLIZING…"
                : !webglOk
                  ? "WebGL unavailable"
                  : "CHAIN UNAVAILABLE"}
            </div>
          )}
        </div>

        {/* HUD — almost invisible until needed */}
        <div className="pointer-events-none absolute inset-0 z-10 p-3 md:p-5 flex flex-col justify-between gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="rounded-2xl bg-black/35 backdrop-blur-xl border border-white/[0.06] px-3.5 py-2.5 max-w-[min(100%,340px)]">
              <div className="text-[9px] font-mono tracking-[0.32em] text-white/40 mb-1">
                BLOCK GENESIS
              </div>
              <div className="text-[13px] font-mono text-white/90 tabular-nums tracking-wide">
                <span className="text-[#E8C48A]">
                  {data?.tip?.height?.toLocaleString() ?? "—"}
                </span>
                <span className="text-white/30 text-[11px] ml-2">
                  {mempoolN} live · {sealedN} sealed
                </span>
              </div>
              {genesis.active && (
                <div className="mt-2 h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7EF5D4] via-[#E8C48A] to-[#FF7A3D]"
                    style={{ width: `${Math.round(genesis.t * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => setSoundOn((v) => !v)}
                className="rounded-full bg-black/35 backdrop-blur-xl border border-white/[0.06] w-9 h-9 text-[11px] text-white/40 hover:text-white/80 transition-colors"
                title={soundOn ? "Sound on" : "Sound off"}
              >
                {soundOn ? "♪" : "♩"}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-full bg-black/35 backdrop-blur-xl border border-white/[0.06] w-9 h-9 text-[12px] text-white/40 hover:text-white/80"
              >
                {isFetching ? "…" : "↻"}
              </button>
            </div>
          </div>

          {/* Address — minimal */}
          <div className="pointer-events-auto rounded-2xl bg-black/30 backdrop-blur-xl border border-white/[0.06] px-3 py-2 w-full max-w-[min(100%,380px)]">
            <div className="flex gap-2 items-center">
              <input
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFocus()}
                placeholder="address focus"
                spellCheck={false}
                className="lumen-search-input flex-1 min-w-0 bg-transparent outline-none border-0 text-white/85 font-mono text-[12px] placeholder:text-white/25"
              />
              <button
                type="button"
                onClick={applyFocus}
                className="text-[10px] font-mono tracking-widest text-[#E8C48A]/80 px-1.5"
              >
                FOCUS
              </button>
              {focusAddress && (
                <button
                  type="button"
                  onClick={clearFocus}
                  className="text-[10px] font-mono text-white/35 px-1"
                >
                  ✕
                </button>
              )}
            </div>
            {focusMode && data?.focus && (
              <div className="mt-1 text-[10px] font-mono text-white/40">
                {formatErg(data.focus.confirmed.nanoErgs)} ERG ·{" "}
                {data.focus.confirmed.tokens.length} tokens
              </div>
            )}
          </div>

          {/* Storyboard / timeline */}
          <div className="flex flex-wrap items-end justify-between gap-2">
            {selectedTx ? (
              <div className="pointer-events-auto rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/[0.08] px-4 py-3.5 max-w-[min(100%,320px)] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[9px] font-mono tracking-[0.28em] text-white/35">
                    TRANSACTION
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[9px] font-mono tracking-widest text-white/30 hover:text-white/70"
                  >
                    ESC
                  </button>
                </div>
                <div className="text-[12px] font-mono text-white/90 tracking-wide mb-2.5">
                  {selectedTx.txId.slice(0, 10)}…{selectedTx.txId.slice(-6)}
                </div>
                <div className="flex items-center gap-2.5 text-[11px] font-mono text-white/50 mb-2.5">
                  <span>
                    <span className="text-[#7EF5D4]">{selectedTx.inputs}</span>
                    <span className="text-white/25"> in</span>
                  </span>
                  <span className="text-white/20">→</span>
                  <span>
                    <span className="text-[#E8C48A]">{selectedTx.outputs}</span>
                    <span className="text-white/25"> out</span>
                  </span>
                  <span className="ml-auto text-[#FF8A4A]">
                    {formatErg(selectedTx.ergNano)} ERG
                  </span>
                </div>
                {selectedTx.tokens.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTx.tokens.slice(0, 8).map((t) => (
                      <span
                        key={t.tokenId}
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[9px] font-mono text-white/70"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: t.color,
                            boxShadow: `0 0 6px ${t.color}`,
                          }}
                        />
                        {t.label || t.name || t.tokenId.slice(0, 6)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 text-[9px] font-mono tracking-[0.18em] text-white/25">
                  {selectedTx.pending ? "MEMPOOL" : "SEALED"}
                </div>
              </div>
            ) : selection?.kind === "block" ? (
              <div className="pointer-events-auto rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/[0.08] px-4 py-3.5 max-w-[min(100%,280px)] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                <div className="flex justify-between mb-2">
                  <div className="text-[9px] font-mono tracking-[0.28em] text-white/35">
                    BLOCK
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[9px] font-mono tracking-widest text-white/30 hover:text-white/70"
                  >
                    ESC
                  </button>
                </div>
                <div className="text-[18px] font-mono text-white/90 tabular-nums tracking-tight">
                  #{selection.height.toLocaleString()}
                </div>
                {(selection.txCount != null || selection.ergNano) && (
                  <div className="text-[11px] font-mono text-white/45 mt-1">
                    {selection.txCount != null && (
                      <span>{selection.txCount} tx</span>
                    )}
                    {selection.ergNano && (
                      <span>
                        {selection.txCount != null ? " · " : ""}
                        {formatErg(selection.ergNano)} ERG
                      </span>
                    )}
                  </div>
                )}
                <div className="text-[10px] font-mono text-white/25 mt-1.5 break-all">
                  {selection.blockId.slice(0, 18)}…
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-black/25 backdrop-blur-xl border border-white/[0.05] px-3 py-2 text-[9px] font-mono tracking-[0.14em] text-white/30 max-w-[min(100%,380px)]">
                <div className="flex flex-wrap gap-2 items-center">
                  <span
                    className={
                      genesis.capture > 0.05 ? "text-[#7EF5D4]" : ""
                    }
                  >
                    CAPTURE
                  </span>
                  <span className="opacity-30">→</span>
                  <span
                    className={
                      genesis.crystal > 0.05 ? "text-[#E8C48A]" : ""
                    }
                  >
                    CRYSTAL
                  </span>
                  <span className="opacity-30">→</span>
                  <span
                    className={genesis.seal > 0.05 ? "text-[#FF8A4A]" : ""}
                  >
                    SEAL
                  </span>
                  <span className="opacity-30">→</span>
                  <span
                    className={genesis.dock > 0.05 ? "text-[#8EBBFF]" : ""}
                  >
                    DOCK
                  </span>
                </div>
                <div className="mt-1 opacity-50 normal-case tracking-normal text-white/25">
                  tap a constellation · watch a block being born
                </div>
              </div>
            )}

            {data?.tip && !selection && (
              <div className="rounded-2xl bg-black/25 backdrop-blur-xl border border-white/[0.05] px-3 py-2 text-[10px] font-mono text-right text-white/40">
                <div className="text-[9px] tracking-[0.2em] text-white/25">
                  TIP
                </div>
                <div className="text-white/70 tabular-nums">
                  {data.tip.txCount} tx
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-0.5 text-[10px] font-mono tracking-wider text-white/25">
        <span>
          {error
            ? `error: ${error instanceof Error ? error.message : "failed"}`
            : data
              ? `genesis · ${new Date(dataUpdatedAt).toLocaleTimeString()}`
              : "…"}
        </span>
        <span className="opacity-60">
          {mempoolN} constellations · thin explorer
        </span>
      </div>
    </div>
  );
}
