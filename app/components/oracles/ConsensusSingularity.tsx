"use client";

/**
 * Consensus Singularity — ultra cinematic oracle visualizer.
 * Crystalline plasma core · gravity ribbons · comet trails · shockwaves.
 * Prompt-driven aesthetic: cyan-gold energy, pure black void, living data physics.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type FeedStatus = "live" | "stale" | "offline";

export interface SingularityNode {
  address: string;
  height: number | null;
  status: FeedStatus;
}

export interface SingularityFeed {
  id: string;
  pair: string;
  title: string;
  accent: string;
  status: FeedStatus;
  priceLabel: string | null;
  priceAlt: string | null;
  unitLabel: string;
  epoch: number | null;
  epochLength: number;
  ageBlocks: number | null;
  ageMs: number | null;
  lastUpdatedAt: number | null;
  activeOracles: number | null;
  totalOracles: number | null;
  nodes: SingularityNode[];
  settlementHeight: number | null;
}

interface Props {
  feeds: SingularityFeed[];
  activeId: string;
  onSelectFeed: (id: string) => void;
  tipHeight: number | null;
  isFetching?: boolean;
  now?: number;
}

type NodeLayout = {
  address: string;
  status: FeedStatus;
  pos: THREE.Vector3;
  seed: number;
};

/* ─── Palette ───────────────────────────────────────────────────────────── */

const CYAN = "#00E5FF";
const GOLD = "#E8C547";
const GREEN = "#10B981";
const RED = "#EF4444";
const AMBER = "#F59E0B";
const VOID = "#020205";

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hexToThree(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function statusColor(s: FeedStatus): string {
  if (s === "live") return GREEN;
  if (s === "stale") return AMBER;
  return RED;
}

function nodeAuraColor(s: FeedStatus, accent: string): THREE.Color {
  if (s === "live") return hexToThree(GREEN).lerp(hexToThree(accent), 0.25);
  if (s === "stale") return hexToThree(AMBER);
  return hexToThree(RED);
}

function relativeAge(ageMs: number | null, lastUpdatedAt: number | null, now: number) {
  const ms =
    ageMs != null
      ? ageMs
      : lastUpdatedAt != null
        ? Math.max(0, now - lastUpdatedAt)
        : null;
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function nodePosition(index: number, total: number, seed: number): THREE.Vector3 {
  const n = Math.max(total, 1);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(n - 1, 1)) * 2;
  const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index + (seed % 997) * 0.002;
  const radius = 5.6 + ((seed + index * 19) % 50) * 0.025;
  return new THREE.Vector3(
    Math.cos(theta) * rAtY * radius,
    y * radius * 0.52,
    Math.sin(theta) * rAtY * radius
  );
}

function buildNodes(feed: SingularityFeed, reduced: boolean): NodeLayout[] {
  let list: SingularityNode[] = feed.nodes?.length
    ? [...feed.nodes]
    : Array.from({ length: 13 }).map((_, i) => ({
        address: `virtual-${feed.id}-${i}`,
        height: null,
        status: feed.status,
      }));

  // Cinematic cast: prefer ~13 nodes (prompt); pad with virtual if short
  const target = reduced ? 9 : 13;
  while (list.length < target) {
    list.push({
      address: `virtual-pad-${feed.id}-${list.length}`,
      height: null,
      status: list.length % 5 === 0 ? "offline" : list.length % 4 === 0 ? "stale" : "live",
    });
  }
  list = list.slice(0, target);

  return list.map((n, i) => {
    const seed = hashStr(n.address + String(i));
    return {
      address: n.address,
      status: n.status,
      pos: nodePosition(i, list.length, seed),
      seed,
    };
  });
}

/* ─── Shockwave pool ────────────────────────────────────────────────────── */

type Shock = { t: number; max: number; color: THREE.Color };

function Shockwaves({
  shocksRef,
}: {
  shocksRef: React.MutableRefObject<Shock[]>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const MAX = 12;

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const list = shocksRef.current;
    // prune
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].t += dt;
      if (list[i].t > list[i].max) list.splice(i, 1);
    }
    for (let i = 0; i < MAX; i++) {
      const s = list[i];
      if (!s) {
        dummy.scale.set(0.001, 0.001, 0.001);
        dummy.position.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, new THREE.Color(0, 0, 0));
        continue;
      }
      const u = s.t / s.max;
      const r = 0.4 + u * 4.5;
      dummy.position.set(0, 0, 0);
      dummy.scale.set(r, r, r);
      dummy.rotation.set(Math.PI / 2, 0, u * 1.2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const c = s.color.clone();
      // fade encoded in color brightness (additive)
      c.multiplyScalar(1 - u);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <ringGeometry args={[0.92, 1.0, 64]} />
      <meshBasicMaterial
        transparent
        opacity={0.55}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

/* ─── Crystalline plasma core ───────────────────────────────────────────── */

function PlasmaCore({
  accent,
  flash,
  status,
}: {
  accent: string;
  flash: number;
  status: FeedStatus;
}) {
  const group = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Mesh>(null);
  const plasma = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const halo2 = useRef<THREE.Mesh>(null);
  const rays = useRef<THREE.Group>(null);

  const cyan = useMemo(() => hexToThree(CYAN), []);
  const gold = useMemo(() => hexToThree(GOLD), []);
  const accentC = useMemo(() => hexToThree(accent), [accent]);
  const dim = status === "offline";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const energy = dim ? 0.35 : 1;
    const f = flash;

    if (crystal.current) {
      crystal.current.rotation.y = t * 0.35;
      crystal.current.rotation.x = Math.sin(t * 0.4) * 0.15;
      const s = (0.72 + Math.sin(t * 1.6) * 0.04) * (1 + f * 0.45) * energy;
      crystal.current.scale.setScalar(s);
    }
    if (plasma.current) {
      plasma.current.rotation.y = -t * 0.55;
      plasma.current.rotation.z = t * 0.2;
      const s = (1.15 + Math.sin(t * 2.1) * 0.08) * (1 + f * 0.7);
      plasma.current.scale.setScalar(s);
      const mat = plasma.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.12 : 0.28) + f * 0.4;
    }
    if (halo.current) {
      const s = (1.9 + Math.sin(t * 0.9) * 0.12) * (1 + f * 0.9);
      halo.current.scale.setScalar(s);
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.06 : 0.16) + f * 0.35;
    }
    if (halo2.current) {
      const s = (2.6 + Math.sin(t * 0.55 + 1) * 0.15) * (1 + f * 1.1);
      halo2.current.scale.setScalar(s);
      const mat = halo2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.03 : 0.09) + f * 0.25;
    }
    if (rays.current) {
      rays.current.rotation.z = t * 0.08;
      rays.current.rotation.y = t * 0.05;
    }
  });

  // God-ray cones
  const rayCount = 6;

  return (
    <group ref={group}>
      <pointLight
        color={cyan}
        intensity={dim ? 1.2 : 4.5 + flash * 10}
        distance={32}
        decay={2}
      />
      <pointLight
        color={gold}
        intensity={dim ? 0.5 : 2.2 + flash * 6}
        distance={22}
        decay={2}
        position={[0.4, 0.2, -0.3]}
      />
      <pointLight
        color="#ffffff"
        intensity={0.8 + flash * 3}
        distance={12}
        decay={2}
      />

      {/* crystalline core */}
      <mesh ref={crystal}>
        <icosahedronGeometry args={[0.85, 2]} />
        <meshStandardMaterial
          color={cyan}
          emissive={accentC}
          emissiveIntensity={dim ? 0.6 : 2.4 + flash * 2}
          metalness={0.9}
          roughness={0.12}
          transparent
          opacity={0.95}
          toneMapped={false}
        />
      </mesh>

      {/* inner gold lattice */}
      <mesh>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshBasicMaterial
          color={gold}
          wireframe
          transparent
          opacity={dim ? 0.15 : 0.45 + flash * 0.3}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* plasma shell */}
      <mesh ref={plasma}>
        <icosahedronGeometry args={[1.0, 1]} />
        <meshBasicMaterial
          color={cyan}
          wireframe
          transparent
          opacity={0.28}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* volumetric-ish halos */}
      <mesh ref={halo}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color={cyan}
          transparent
          opacity={0.16}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={halo2}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          color={gold}
          transparent
          opacity={0.09}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* god rays */}
      <group ref={rays}>
        {Array.from({ length: rayCount }).map((_, i) => {
          const a = (i / rayCount) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.2, Math.sin(a * 1.3) * 0.15, Math.sin(a) * 0.2]}
              rotation={[Math.PI / 2, 0, a]}
            >
              <coneGeometry args={[0.55, 5.5, 12, 1, true]} />
              <meshBasicMaterial
                color={i % 2 === 0 ? cyan : gold}
                transparent
                opacity={dim ? 0.02 : 0.045}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/* ─── Epoch light rings ─────────────────────────────────────────────────── */

function EpochRings({
  epochLength,
  flash,
}: {
  epochLength: number;
  flash: number;
}) {
  const r1 = useRef<THREE.Group>(null);
  const r2 = useRef<THREE.Group>(null);
  const r3 = useRef<THREE.Group>(null);
  const r4 = useRef<THREE.Group>(null);
  const base = 3.0 + Math.min(epochLength, 40) * 0.018;

  useFrame((_, dt) => {
    if (r1.current) r1.current.rotation.z += dt * 0.12;
    if (r2.current) r2.current.rotation.z -= dt * 0.07;
    if (r3.current) {
      r3.current.rotation.x += dt * 0.04;
      r3.current.rotation.y += dt * 0.05;
    }
    if (r4.current) r4.current.rotation.z += dt * 0.03;
  });

  const Ring = ({
    radius,
    color,
    opacity,
    tube = 0.018,
  }: {
    radius: number;
    color: string;
    opacity: number;
    tube?: number;
  }) => (
    <mesh>
      <torusGeometry args={[radius, tube + flash * 0.01, 12, 128]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity + flash * 0.2}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );

  return (
    <group>
      <group ref={r1} rotation={[Math.PI / 2.35, 0.15, 0]}>
        <Ring radius={base} color={CYAN} opacity={0.55} tube={0.022} />
      </group>
      <group ref={r2} rotation={[Math.PI / 2.05, -0.4, 0.35]}>
        <Ring radius={base * 1.28} color={GOLD} opacity={0.35} tube={0.016} />
      </group>
      <group ref={r3} rotation={[0.95, 0.55, 0.25]}>
        <Ring radius={base * 1.55} color={CYAN} opacity={0.2} tube={0.012} />
      </group>
      <group ref={r4} rotation={[Math.PI / 2.6, 0.5, -0.2]}>
        <Ring radius={base * 1.85} color={GOLD} opacity={0.12} tube={0.01} />
      </group>
    </group>
  );
}

/* ─── Gravity plasma ribbon (node → core) ───────────────────────────────── */

function GravityRibbon({
  from,
  status,
  accent,
  reduced,
}: {
  from: THREE.Vector3;
  status: FeedStatus;
  accent: string;
  reduced: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const col = nodeAuraColor(status, accent);

  const geometry = useMemo(() => {
    // Bezier bulge for cinematic curve
    const mid = from.clone().multiplyScalar(0.45);
    mid.y += (hashStr(from.toArray().join(",")) % 100) / 100 - 0.5;
    mid.x += 0.3;
    const curve = new THREE.QuadraticBezierCurve3(
      from.clone(),
      mid,
      new THREE.Vector3(0, 0, 0)
    );
    return new THREE.TubeGeometry(curve, reduced ? 24 : 48, 0.018, 6, false);
  }, [from, reduced]);

  useFrame((state) => {
    if (!matRef.current) return;
    const t = state.clock.elapsedTime;
    const pulse =
      status === "live"
        ? 0.22 + Math.sin(t * 3 + from.x) * 0.1
        : status === "stale"
          ? 0.1
          : 0.04;
    matRef.current.opacity = pulse;
  });

  return (
    <mesh ref={mesh} geometry={geometry}>
      <meshBasicMaterial
        ref={matRef}
        color={col}
        transparent
        opacity={0.2}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ─── Oracle node ───────────────────────────────────────────────────────── */

function OracleNodeMesh({
  node,
  accent,
  reduced,
}: {
  node: NodeLayout;
  accent: string;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh>(null);
  const aura2 = useRef<THREE.Mesh>(null);
  const body = useRef<THREE.Mesh>(null);
  const col = nodeAuraColor(node.status, accent);
  const dying = node.status === "offline";
  const stale = node.status === "stale";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = node.seed / 0xffffffff;
    if (group.current) {
      group.current.position.copy(node.pos);
      group.current.position.y += Math.sin(t * 0.65 + s * 12) * 0.1;
      group.current.rotation.y = t * (0.25 + s * 0.4);
      group.current.rotation.x = Math.sin(t * 0.35 + s * 5) * 0.2;
    }
    if (body.current) {
      const breathe = dying
        ? 0.9 + Math.sin(t * 0.5) * 0.03
        : 1 + Math.sin(t * 1.8 + s * 8) * 0.06;
      body.current.scale.setScalar(breathe);
    }
    if (aura.current) {
      const p = dying
        ? 1 + Math.sin(t * 0.6) * 0.04
        : 1.1 + Math.sin(t * 2.4 + s * 6) * 0.18;
      aura.current.scale.setScalar(p);
      const mat = aura.current.material as THREE.MeshBasicMaterial;
      mat.opacity = dying ? 0.08 : stale ? 0.16 : 0.32;
    }
    if (aura2.current) {
      aura2.current.scale.setScalar(1.4 + Math.sin(t * 1.2 + s) * 0.1);
      const mat = aura2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = dying ? 0.04 : 0.12;
    }
  });

  return (
    <group ref={group} position={node.pos}>
      <mesh ref={body}>
        <octahedronGeometry args={[0.32, dying ? 0 : 1]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={dying ? 0.25 : stale ? 0.7 : 1.6}
          metalness={0.75}
          roughness={dying ? 0.45 : 0.12}
          transparent
          opacity={dying ? 0.55 : 0.92}
          toneMapped={false}
        />
      </mesh>
      {!reduced && (
        <mesh>
          <icosahedronGeometry args={[0.38, 0]} />
          <meshBasicMaterial
            color={col}
            wireframe
            transparent
            opacity={dying ? 0.12 : 0.35}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* volumetric aura stack */}
      <mesh ref={aura}>
        <sphereGeometry args={[0.62, reduced ? 10 : 20, reduced ? 10 : 20]} />
        <meshBasicMaterial
          color={col}
          transparent
          opacity={0.28}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {!reduced && (
        <mesh ref={aura2}>
          <sphereGeometry args={[0.95, 16, 16]} />
          <meshBasicMaterial
            color={col}
            transparent
            opacity={0.1}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      <pointLight
        color={col}
        intensity={dying ? 0.15 : stale ? 0.45 : 1.1}
        distance={3.5}
        decay={2}
      />
    </group>
  );
}

/* ─── Comet field with trails ───────────────────────────────────────────── */

type Comet = {
  phase: "inbound" | "to-core";
  t: number;
  speed: number;
  from: THREE.Vector3;
  via: THREE.Vector3;
  trail: THREE.Vector3[];
  color: THREE.Color;
};

function CometField({
  nodes,
  accent,
  status,
  reduced,
  flashRef,
  shocksRef,
}: {
  nodes: NodeLayout[];
  accent: string;
  status: FeedStatus;
  reduced: boolean;
  flashRef: React.MutableRefObject<number>;
  shocksRef: React.MutableRefObject<Shock[]>;
}) {
  const headCount = reduced ? 48 : status === "offline" ? 40 : 160;
  const trailLen = reduced ? 5 : 10;
  const headRef = useRef<THREE.InstancedMesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  const comets = useRef<Comet[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const accentC = useMemo(() => hexToThree(accent), [accent]);
  const cyan = useMemo(() => hexToThree(CYAN), []);
  const gold = useMemo(() => hexToThree(GOLD), []);

  const spawn = useCallback((): Comet | null => {
    if (!nodes.length) return null;
    const pool =
      nodes.filter((n) => n.status !== "offline").length > 0
        ? nodes.filter((n) => n.status !== "offline")
        : nodes;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const R = 16 + Math.random() * 8;
    const from = new THREE.Vector3(
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.cos(phi) * 0.4,
      R * Math.sin(phi) * Math.sin(theta)
    );
    const color = Math.random() > 0.45 ? cyan.clone() : gold.clone();
    color.lerp(accentC, 0.2);
    if (target.status === "stale") color.lerp(hexToThree(AMBER), 0.4);
    if (target.status === "offline") color.lerp(hexToThree(RED), 0.55);
    return {
      phase: "inbound",
      t: 0,
      speed: 0.22 + Math.random() * 0.35,
      from,
      via: target.pos.clone(),
      trail: Array.from({ length: trailLen }, () => from.clone()),
      color,
    };
  }, [nodes, accentC, cyan, gold, trailLen]);

  useEffect(() => {
    const arr: Comet[] = [];
    for (let i = 0; i < headCount; i++) {
      const c = spawn();
      if (c) {
        c.t = Math.random();
        arr.push(c);
      }
    }
    comets.current = arr;
  }, [headCount, spawn]);

  useFrame((_, dt) => {
    const heads = headRef.current;
    const trails = trailRef.current;
    if (!heads) return;
    const list = comets.current;
    const rate =
      status === "live" ? 1.15 : status === "stale" ? 0.5 : 0.15;

    for (let i = 0; i < list.length; i++) {
      let c = list[i];
      if (!c) continue;
      c.t += dt * c.speed * rate;

      let pos = new THREE.Vector3();
      if (c.phase === "inbound") {
        if (c.t >= 1) {
          c.phase = "to-core";
          c.t = 0;
          c.speed = 0.45 + Math.random() * 0.5;
        } else {
          const e = c.t * c.t * (3 - 2 * c.t);
          pos.lerpVectors(c.from, c.via, e);
        }
      }
      if (c.phase === "to-core") {
        if (c.t >= 1) {
          flashRef.current = Math.min(1, flashRef.current + 0.12);
          if (shocksRef.current.length < 10) {
            shocksRef.current.push({
              t: 0,
              max: 0.55 + Math.random() * 0.35,
              color: c.color.clone(),
            });
          }
          const next = spawn();
          if (next) list[i] = next;
          continue;
        }
        // accelerate into singularity
        const e = c.t * c.t * c.t;
        pos.lerpVectors(c.via, new THREE.Vector3(0, 0, 0), e);
      }

      // trail history
      c.trail.pop();
      c.trail.unshift(pos.clone());

      const headScale =
        c.phase === "to-core"
          ? 0.07 + (1 - c.t) * 0.12
          : 0.055 + c.t * 0.05;
      dummy.position.copy(pos);
      dummy.scale.setScalar(headScale);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      heads.setColorAt(i, c.color);

      if (trails) {
        for (let k = 0; k < trailLen; k++) {
          const idx = i * trailLen + k;
          const tp = c.trail[k] || pos;
          const fade = 1 - k / trailLen;
          dummy.position.copy(tp);
          dummy.scale.setScalar(headScale * 0.7 * fade);
          dummy.updateMatrix();
          trails.setMatrixAt(idx, dummy.matrix);
          const tc = c.color.clone().multiplyScalar(fade * 0.85);
          trails.setColorAt(idx, tc);
        }
      }
    }
    heads.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    if (trails) {
      trails.instanceMatrix.needsUpdate = true;
      if (trails.instanceColor) trails.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, headCount]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          transparent
          opacity={0.95}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={trailRef}
        args={[undefined, undefined, headCount * trailLen]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 5, 5]} />
        <meshBasicMaterial
          transparent
          opacity={0.7}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ─── Flash decay ───────────────────────────────────────────────────────── */

function FlashController({
  flashRef,
  setFlash,
  priceKey,
}: {
  flashRef: React.MutableRefObject<number>;
  setFlash: (v: number) => void;
  priceKey: string;
}) {
  const prev = useRef(priceKey);
  useEffect(() => {
    if (prev.current !== priceKey && priceKey) {
      flashRef.current = 1;
      prev.current = priceKey;
    }
  }, [priceKey, flashRef]);

  useFrame((_, dt) => {
    if (flashRef.current > 0.001) {
      flashRef.current = Math.max(0, flashRef.current - dt * 0.95);
      setFlash(flashRef.current);
    } else if (flashRef.current !== 0) {
      flashRef.current = 0;
      setFlash(0);
    }
  });
  return null;
}

/* ─── Scene ─────────────────────────────────────────────────────────────── */

function SceneRoot({
  feed,
  reduced,
  flash,
  setFlash,
  flashRef,
}: {
  feed: SingularityFeed;
  reduced: boolean;
  flash: number;
  setFlash: (v: number) => void;
  flashRef: React.MutableRefObject<number>;
}) {
  const shocksRef = useRef<Shock[]>([]);
  const nodes = useMemo(() => buildNodes(feed, reduced), [feed, reduced]);

  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 14, 38]} />
      <ambientLight intensity={0.08} />

      <Stars
        radius={80}
        depth={50}
        count={reduced ? 900 : 2800}
        factor={reduced ? 2.8 : 4}
        saturation={0}
        fade
        speed={0.15}
      />

      {!reduced && (
        <Sparkles
          count={80}
          scale={18}
          size={2.2}
          speed={0.35}
          opacity={0.45}
          color={CYAN}
        />
      )}

      <FlashController
        flashRef={flashRef}
        setFlash={setFlash}
        priceKey={`${feed.id}:${feed.priceLabel}:${feed.settlementHeight}`}
      />

      <PlasmaCore accent={feed.accent} flash={flash} status={feed.status} />
      <EpochRings epochLength={feed.epochLength} flash={flash} />
      <Shockwaves shocksRef={shocksRef} />

      {nodes.map((n) => (
        <React.Fragment key={n.address}>
          <OracleNodeMesh node={n} accent={feed.accent} reduced={reduced} />
          {(n.status !== "offline" || !reduced) && (
            <GravityRibbon
              from={n.pos}
              status={n.status}
              accent={feed.accent}
              reduced={reduced}
            />
          )}
        </React.Fragment>
      ))}

      <CometField
        nodes={nodes}
        accent={feed.accent}
        status={feed.status}
        reduced={reduced}
        flashRef={flashRef}
        shocksRef={shocksRef}
      />

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={reduced ? 10 : 8}
        maxDistance={24}
        autoRotate
        autoRotateSpeed={feed.status === "offline" ? 0.12 : 0.28}
        maxPolarAngle={Math.PI * 0.82}
        minPolarAngle={Math.PI * 0.18}
      />
    </>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

export default function ConsensusSingularity({
  feeds,
  activeId,
  onSelectFeed,
  tipHeight,
  isFetching,
  now = Date.now(),
}: Props) {
  const feed = feeds.find((f) => f.id === activeId) || feeds[0];
  const [flash, setFlash] = useState(0);
  const flashRef = useRef(0);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setReduced(isMobileViewport() || prefersReducedMotion());
    const onResize = () =>
      setReduced(isMobileViewport() || prefersReducedMotion());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!feed) {
    return (
      <div className="oracle-singularity flex items-center justify-center font-mono text-xs tracking-[3px] text-[#A0A0B0]">
        NO FEEDS
      </div>
    );
  }

  const stColor =
    feed.status === "live"
      ? GREEN
      : feed.status === "stale"
        ? AMBER
        : RED;

  const healthPct = (() => {
    if (feed.status === "offline") return 12;
    if (feed.status === "stale") return 48;
    if (feed.activeOracles != null && feed.totalOracles) {
      return Math.round(50 + (feed.activeOracles / feed.totalOracles) * 50);
    }
    return 90;
  })();

  return (
    <div className="oracle-singularity relative w-full overflow-hidden rounded-[1.25rem] sm:rounded-[1.75rem] border border-white/[0.07] bg-[#020205]">
      <div className="absolute inset-0 z-0">
        {mounted && (
          <Canvas
            dpr={reduced ? [1, 1.35] : [1, 2]}
            camera={{ position: [0, 2.6, 13.5], fov: 40, near: 0.1, far: 100 }}
            gl={{
              antialias: !reduced,
              alpha: false,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.15,
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(VOID);
            }}
            style={{ width: "100%", height: "100%" }}
          >
            <SceneRoot
              feed={feed}
              reduced={reduced}
              flash={flash}
              setFlash={setFlash}
              flashRef={flashRef}
            />
          </Canvas>
        )}
      </div>

      {/* cinematic vignette — pure void edges */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,2,5,0.2)_50%,rgba(2,2,5,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-36 bg-gradient-to-b from-[#020205]/95 via-[#020205]/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-44 bg-gradient-to-t from-[#020205] via-[#020205]/70 to-transparent" />

      {/* cyan-gold flash wash */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] transition-opacity duration-75"
        style={{
          opacity: flash * 0.45,
          background: `radial-gradient(circle at 50% 46%, ${CYAN}66 0%, ${GOLD}33 28%, transparent 58%)`,
        }}
      />

      {/* HUD */}
      <div className="relative z-10 flex h-full flex-col p-3 sm:p-5 pointer-events-none">
        <div className="flex items-start justify-between gap-2 pointer-events-auto">
          <div>
            <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.28em] text-[#A0A0B0]/90">
              CONSENSUS SINGULARITY
            </div>
            <div className="mt-0.5 text-[11px] sm:text-xs font-mono tracking-widest text-white/70">
              {feed.pair} · LIVING DATA PHYSICS
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {feeds.map((f) => {
              const on = f.id === feed.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onSelectFeed(f.id)}
                  className={`px-2.5 sm:px-3.5 py-1.5 rounded-full text-[9px] sm:text-[10px] font-mono tracking-[0.16em] border transition-all ${
                    on
                      ? "text-white border-white/25 bg-white/10"
                      : "text-[#A0A0B0] border-white/10 bg-black/40 hover:border-white/20"
                  }`}
                  style={
                    on
                      ? {
                          borderColor: `${f.accent}77`,
                          color: f.accent,
                          background: `${f.accent}1a`,
                          boxShadow: `0 0 24px ${f.accent}33`,
                        }
                      : undefined
                  }
                >
                  {f.pair}
                </button>
              );
            })}
          </div>
        </div>

        {/* price as pure light */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none select-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${feed.id}-${feed.priceLabel}`}
              initial={{ opacity: 0, scale: 0.92, filter: "blur(8px)" }}
              animate={{
                opacity: 1,
                scale: 1 + flash * 0.05,
                filter: "blur(0px)",
              }}
              exit={{ opacity: 0, scale: 1.04, filter: "blur(6px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <div
                className="font-semibold tracking-[-0.045em] tabular-nums leading-none"
                style={{
                  fontSize: "clamp(2.5rem, 8.5vw, 5rem)",
                  color: "#F8FBFF",
                  textShadow: `
                    0 0 ${18 + flash * 50}px ${CYAN},
                    0 0 ${36 + flash * 70}px ${GOLD}99,
                    0 0 4px rgba(0,0,0,0.9)
                  `,
                }}
              >
                {feed.priceLabel || "—"}
              </div>
              <div className="mt-2.5 font-mono text-[10px] sm:text-xs tracking-[0.28em] text-[#A0A0B0]">
                {feed.unitLabel}
              </div>
              {feed.priceAlt && (
                <div className="mt-1 font-mono text-[9px] sm:text-[10px] tracking-wide text-[#A0A0B0]/50">
                  {feed.priceAlt}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pointer-events-auto grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <HudCell
            label="STATUS"
            value={feed.status.toUpperCase()}
            accent={stColor}
            pulse={feed.status === "live"}
          />
          <HudCell
            label="LAST UPDATE"
            value={relativeAge(feed.ageMs, feed.lastUpdatedAt, now)}
          />
          <HudCell
            label="EPOCH"
            value={feed.epoch != null ? feed.epoch.toLocaleString() : "—"}
            sub={`Δ ${feed.epochLength} blk`}
          />
          <HudCell
            label="CONSENSUS"
            value={
              feed.activeOracles != null && feed.totalOracles != null
                ? `${feed.activeOracles}/${feed.totalOracles}`
                : `${healthPct}%`
            }
            sub={
              tipHeight != null
                ? `tip ${tipHeight.toLocaleString()}`
                : undefined
            }
            bar={healthPct}
            accent={feed.accent}
          />
        </div>

        {isFetching && (
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 w-1.5 h-1.5 rounded-full bg-[#00E5FF] status-dot" />
        )}
      </div>
    </div>
  );
}

function HudCell({
  label,
  value,
  sub,
  accent,
  pulse,
  bar,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  pulse?: boolean;
  bar?: number;
}) {
  return (
    <div className="rounded-xl sm:rounded-2xl border border-white/[0.07] bg-black/55 backdrop-blur-md px-2.5 sm:px-3.5 py-2 sm:py-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        {accent && (
          <span
            className={`h-1 w-1 rounded-full ${pulse ? "status-dot" : ""}`}
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
        )}
        <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.18em] text-[#A0A0B0]/80">
          {label}
        </span>
      </div>
      <div
        className="font-mono text-sm sm:text-base tabular-nums tracking-tight"
        style={{ color: accent || "#E8E8F0" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[8px] sm:text-[9px] font-mono text-[#A0A0B0]/50 mt-0.5">
          {sub}
        </div>
      )}
      {typeof bar === "number" && (
        <div className="mt-1.5 h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${bar}%`,
              background: accent || GREEN,
              boxShadow: `0 0 10px ${accent || GREEN}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
