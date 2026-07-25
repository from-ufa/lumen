"use client";

/**
 * Consensus Singularity — premium fintech luxury visualizer.
 * Soft cyan plasma core · precise gravity streams · sparse elegant particles.
 * Calm intensity, controlled energy, pure black void.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
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

/* ─── Palette — restrained luxury ───────────────────────────────────────── */

const CYAN = "#5EE7FF";
const CYAN_SOFT = "#2A9BB8";
const GREEN = "#34D399";
const AMBER = "#D4A574";
const RED = "#C45C5C";
const VOID = "#000000";
const TEXT = "#E8EEF2";

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

function nodeAuraColor(s: FeedStatus, accent: string): THREE.Color {
  if (s === "live") return hexToThree(GREEN).lerp(hexToThree(accent), 0.15);
  if (s === "stale") return hexToThree(AMBER);
  return hexToThree(RED);
}

function relativeAge(
  ageMs: number | null,
  lastUpdatedAt: number | null,
  now: number
) {
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

/** Elegant depth-layered placement — not a perfect sphere */
function nodePosition(index: number, total: number, seed: number): THREE.Vector3 {
  const n = Math.max(total, 1);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(n - 1, 1)) * 2;
  const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index + (seed % 997) * 0.0015;
  // Vary depth: some closer, some farther — cinematic layering
  const depthJitter = 0.82 + ((seed % 40) / 40) * 0.45;
  const radius = (5.8 + (index % 3) * 0.35) * depthJitter;
  return new THREE.Vector3(
    Math.cos(theta) * rAtY * radius,
    y * radius * 0.48,
    Math.sin(theta) * rAtY * radius
  );
}

function buildNodes(feed: SingularityFeed, reduced: boolean): NodeLayout[] {
  let list: SingularityNode[] = feed.nodes?.length
    ? [...feed.nodes]
    : Array.from({ length: 11 }).map((_, i) => ({
        address: `virtual-${feed.id}-${i}`,
        height: null,
        status: feed.status,
      }));

  // Prompt: 11 clean nodes
  const target = reduced ? 8 : 11;
  while (list.length < target) {
    list.push({
      address: `virtual-pad-${feed.id}-${list.length}`,
      height: null,
      status:
        list.length % 7 === 0
          ? "offline"
          : list.length % 5 === 0
            ? "stale"
            : "live",
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

/* ─── Soft crystalline core ─────────────────────────────────────────────── */

function PlasmaCore({
  accent,
  flash,
  status,
}: {
  accent: string;
  flash: number;
  status: FeedStatus;
}) {
  const crystal = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const halo2 = useRef<THREE.Mesh>(null);

  const cyan = useMemo(() => hexToThree(CYAN), []);
  const accentC = useMemo(() => hexToThree(accent), [accent]);
  const dim = status === "offline";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = flash;
    const energy = dim ? 0.4 : 1;

    if (crystal.current) {
      crystal.current.rotation.y = t * 0.12;
      crystal.current.rotation.x = Math.sin(t * 0.2) * 0.08;
      const s = (0.78 + Math.sin(t * 0.7) * 0.025) * (1 + f * 0.2) * energy;
      crystal.current.scale.setScalar(s);
    }
    if (shell.current) {
      shell.current.rotation.y = -t * 0.08;
      const s = (1.2 + Math.sin(t * 0.5) * 0.03) * (1 + f * 0.25);
      shell.current.scale.setScalar(s);
      const mat = shell.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.06 : 0.14) + f * 0.15;
    }
    if (halo.current) {
      const s = (1.85 + Math.sin(t * 0.4) * 0.05) * (1 + f * 0.3);
      halo.current.scale.setScalar(s);
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.04 : 0.1) + f * 0.12;
    }
    if (halo2.current) {
      const s = (2.5 + Math.sin(t * 0.3 + 1) * 0.06) * (1 + f * 0.35);
      halo2.current.scale.setScalar(s);
      const mat = halo2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.02 : 0.05) + f * 0.08;
    }
  });

  return (
    <group>
      <pointLight
        color={cyan}
        intensity={dim ? 1.0 : 2.8 + flash * 3}
        distance={26}
        decay={2}
      />
      <pointLight
        color="#ffffff"
        intensity={0.35 + flash * 0.8}
        distance={10}
        decay={2}
      />
      <pointLight
        color={accentC}
        intensity={dim ? 0.2 : 0.6 + flash * 1.2}
        distance={16}
        decay={2}
        position={[0.3, 0.15, -0.2]}
      />

      {/* soft crystalline core */}
      <mesh ref={crystal}>
        <icosahedronGeometry args={[0.72, 2]} />
        <meshStandardMaterial
          color={cyan}
          emissive={cyan}
          emissiveIntensity={dim ? 0.5 : 1.4 + flash * 0.8}
          metalness={0.85}
          roughness={0.18}
          transparent
          opacity={0.92}
          toneMapped={false}
        />
      </mesh>

      {/* fine lattice — restrained */}
      <mesh>
        <icosahedronGeometry args={[0.78, 1]} />
        <meshBasicMaterial
          color={CYAN}
          wireframe
          transparent
          opacity={dim ? 0.08 : 0.18 + flash * 0.1}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* soft plasma shell */}
      <mesh ref={shell}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color={CYAN_SOFT}
          transparent
          opacity={0.12}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* atmospheric bloom shells */}
      <mesh ref={halo}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          color={CYAN}
          transparent
          opacity={0.1}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={halo2}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshBasicMaterial
          color={CYAN_SOFT}
          transparent
          opacity={0.05}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/* ─── Minimal orbital rings ─────────────────────────────────────────────── */

function EpochRings({
  epochLength,
  flash,
}: {
  epochLength: number;
  flash: number;
}) {
  const r1 = useRef<THREE.Group>(null);
  const r2 = useRef<THREE.Group>(null);
  const base = 3.4 + Math.min(epochLength, 40) * 0.012;

  useFrame((_, dt) => {
    // very slow — calm
    if (r1.current) r1.current.rotation.z += dt * 0.04;
    if (r2.current) r2.current.rotation.z -= dt * 0.025;
  });

  return (
    <group>
      <group ref={r1} rotation={[Math.PI / 2.3, 0.12, 0]}>
        <mesh>
          <torusGeometry args={[base, 0.008 + flash * 0.004, 8, 128]} />
          <meshBasicMaterial
            color={CYAN}
            transparent
            opacity={0.35 + flash * 0.15}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <group ref={r2} rotation={[Math.PI / 2.05, -0.35, 0.3]}>
        <mesh>
          <torusGeometry args={[base * 1.35, 0.006, 8, 128]} />
          <meshBasicMaterial
            color={CYAN_SOFT}
            transparent
            opacity={0.18 + flash * 0.1}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
  );
}

/* ─── Thin precise gravity stream ───────────────────────────────────────── */

function GravityStream({
  from,
  status,
  accent,
}: {
  from: THREE.Vector3;
  status: FeedStatus;
  accent: string;
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const col = nodeAuraColor(status, accent);

  const geometry = useMemo(() => {
    // Nearly straight with subtle bend — precise, not dramatic
    const mid = from.clone().multiplyScalar(0.5);
    mid.y += ((hashStr(from.toArray().join(",")) % 20) - 10) * 0.02;
    const curve = new THREE.QuadraticBezierCurve3(
      from.clone(),
      mid,
      new THREE.Vector3(0, 0, 0)
    );
    return new THREE.TubeGeometry(curve, 32, 0.006, 4, false);
  }, [from]);

  useFrame((state) => {
    if (!matRef.current) return;
    const t = state.clock.elapsedTime;
    const base =
      status === "live" ? 0.14 : status === "stale" ? 0.08 : 0.03;
    matRef.current.opacity = base + Math.sin(t * 1.2 + from.x) * 0.03;
  });

  if (status === "offline") return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={matRef}
        color={col}
        transparent
        opacity={0.12}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ─── Translucent geometric oracle node ─────────────────────────────────── */

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
  const body = useRef<THREE.Mesh>(null);
  const col = nodeAuraColor(node.status, accent);
  const dying = node.status === "offline";
  const stale = node.status === "stale";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = node.seed / 0xffffffff;
    if (group.current) {
      group.current.position.copy(node.pos);
      // barely perceptible drift
      group.current.position.y += Math.sin(t * 0.35 + s * 10) * 0.05;
      group.current.rotation.y = t * (0.08 + s * 0.1);
    }
    if (body.current) {
      const breathe = dying
        ? 0.95
        : 1 + Math.sin(t * 0.8 + s * 6) * 0.03;
      body.current.scale.setScalar(breathe);
    }
    if (aura.current) {
      const p = dying ? 1 : 1.05 + Math.sin(t * 1.1 + s * 4) * 0.06;
      aura.current.scale.setScalar(p);
      const mat = aura.current.material as THREE.MeshBasicMaterial;
      mat.opacity = dying ? 0.05 : stale ? 0.1 : 0.18;
    }
  });

  return (
    <group ref={group} position={node.pos}>
      <mesh ref={body}>
        <octahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={dying ? 0.15 : stale ? 0.4 : 0.75}
          metalness={0.55}
          roughness={0.2}
          transparent
          opacity={dying ? 0.5 : 0.82}
          toneMapped={false}
        />
      </mesh>
      {!reduced && (
        <mesh>
          <octahedronGeometry args={[0.3, 0]} />
          <meshBasicMaterial
            color={col}
            wireframe
            transparent
            opacity={dying ? 0.08 : 0.2}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
      <mesh ref={aura}>
        <sphereGeometry args={[0.48, reduced ? 10 : 16, reduced ? 10 : 16]} />
        <meshBasicMaterial
          color={col}
          transparent
          opacity={0.16}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight
        color={col}
        intensity={dying ? 0.08 : stale ? 0.2 : 0.45}
        distance={2.8}
        decay={2}
      />
    </group>
  );
}

/* ─── Sparse elegant particles ──────────────────────────────────────────── */

type Particle = {
  phase: "inbound" | "to-core";
  t: number;
  speed: number;
  from: THREE.Vector3;
  via: THREE.Vector3;
  trail: THREE.Vector3[];
  color: THREE.Color;
};

function ParticleField({
  nodes,
  status,
  reduced,
  flashRef,
}: {
  nodes: NodeLayout[];
  status: FeedStatus;
  reduced: boolean;
  flashRef: React.MutableRefObject<number>;
}) {
  // Sparse — luxury, not fireworks
  const headCount = reduced ? 18 : status === "offline" ? 12 : 36;
  const trailLen = reduced ? 6 : 12;
  const headRef = useRef<THREE.InstancedMesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<Particle[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cyan = useMemo(() => hexToThree(CYAN), []);

  const spawn = useCallback((): Particle | null => {
    if (!nodes.length) return null;
    const pool =
      nodes.filter((n) => n.status !== "offline").length > 0
        ? nodes.filter((n) => n.status !== "offline")
        : nodes;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const R = 14 + Math.random() * 5;
    const from = new THREE.Vector3(
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.cos(phi) * 0.38,
      R * Math.sin(phi) * Math.sin(theta)
    );
    const color = cyan.clone();
    color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
    return {
      phase: "inbound",
      t: 0,
      // slow, deliberate acceleration
      speed: 0.1 + Math.random() * 0.12,
      from,
      via: target.pos.clone(),
      trail: Array.from({ length: trailLen }, () => from.clone()),
      color,
    };
  }, [nodes, cyan, trailLen]);

  useEffect(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < headCount; i++) {
      const p = spawn();
      if (p) {
        p.t = Math.random();
        arr.push(p);
      }
    }
    particles.current = arr;
  }, [headCount, spawn]);

  useFrame((_, dt) => {
    const heads = headRef.current;
    const trails = trailRef.current;
    if (!heads) return;
    const list = particles.current;
    const rate =
      status === "live" ? 0.85 : status === "stale" ? 0.4 : 0.12;

    for (let i = 0; i < list.length; i++) {
      let p = list[i];
      if (!p) continue;
      p.t += dt * p.speed * rate;

      let pos = new THREE.Vector3();
      if (p.phase === "inbound") {
        if (p.t >= 1) {
          p.phase = "to-core";
          p.t = 0;
          p.speed = 0.18 + Math.random() * 0.15;
        } else {
          // smooth ease
          const e = p.t * p.t * (3 - 2 * p.t);
          pos.lerpVectors(p.from, p.via, e);
        }
      }
      if (p.phase === "to-core") {
        if (p.t >= 1) {
          // soft pulse only — no shockwave fireworks
          flashRef.current = Math.min(0.55, flashRef.current + 0.06);
          const next = spawn();
          if (next) list[i] = next;
          continue;
        }
        const e = p.t * p.t;
        pos.lerpVectors(p.via, new THREE.Vector3(0, 0, 0), e);
      }

      p.trail.pop();
      p.trail.unshift(pos.clone());

      const headScale =
        p.phase === "to-core"
          ? 0.04 + (1 - p.t) * 0.05
          : 0.035 + p.t * 0.02;
      dummy.position.copy(pos);
      dummy.scale.setScalar(headScale);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      heads.setColorAt(i, p.color);

      if (trails) {
        for (let k = 0; k < trailLen; k++) {
          const idx = i * trailLen + k;
          const tp = p.trail[k] || pos;
          const fade = 1 - k / trailLen;
          dummy.position.copy(tp);
          // elongated elegant trail dots
          dummy.scale.setScalar(headScale * 0.55 * fade);
          dummy.updateMatrix();
          trails.setMatrixAt(idx, dummy.matrix);
          const tc = p.color.clone().multiplyScalar(fade * 0.65);
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
          opacity={0.9}
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
          opacity={0.55}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ─── Flash (soft) ──────────────────────────────────────────────────────── */

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
      flashRef.current = 0.7;
      prev.current = priceKey;
    }
  }, [priceKey, flashRef]);

  useFrame((_, dt) => {
    if (flashRef.current > 0.001) {
      flashRef.current = Math.max(0, flashRef.current - dt * 0.7);
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
  const nodes = useMemo(() => buildNodes(feed, reduced), [feed, reduced]);

  return (
    <>
      <color attach="background" args={[VOID]} />
      {/* heavy atmosphere via fog */}
      <fog attach="fog" args={[VOID, 10, 28]} />
      <ambientLight intensity={0.06} />

      <Stars
        radius={70}
        depth={40}
        count={reduced ? 400 : 900}
        factor={2}
        saturation={0}
        fade
        speed={0.08}
      />

      <FlashController
        flashRef={flashRef}
        setFlash={setFlash}
        priceKey={`${feed.id}:${feed.priceLabel}:${feed.settlementHeight}`}
      />

      <PlasmaCore accent={feed.accent} flash={flash} status={feed.status} />
      <EpochRings epochLength={feed.epochLength} flash={flash} />

      {nodes.map((n) => (
        <React.Fragment key={n.address}>
          <OracleNodeMesh node={n} accent={feed.accent} reduced={reduced} />
          <GravityStream from={n.pos} status={n.status} accent={feed.accent} />
        </React.Fragment>
      ))}

      <ParticleField
        nodes={nodes}
        status={feed.status}
        reduced={reduced}
        flashRef={flashRef}
      />

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={reduced ? 10 : 8.5}
        maxDistance={20}
        autoRotate
        autoRotateSpeed={0.12}
        maxPolarAngle={Math.PI * 0.8}
        minPolarAngle={Math.PI * 0.2}
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
    <div className="oracle-singularity relative w-full overflow-hidden rounded-[1.25rem] sm:rounded-[1.75rem] border border-white/[0.06] bg-black">
      <div className="absolute inset-0 z-0">
        {mounted && (
          <Canvas
            dpr={reduced ? [1, 1.25] : [1, 1.75]}
            camera={{ position: [0, 2.2, 13], fov: 38, near: 0.1, far: 80 }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.95,
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

      {/* heavy atmospheric vignette */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_10%,rgba(0,0,0,0.35)_55%,rgba(0,0,0,0.92)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-black/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-t from-black via-black/80 to-transparent" />

      {/* soft cyan wash on update — controlled */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] transition-opacity duration-200"
        style={{
          opacity: flash * 0.22,
          background: `radial-gradient(circle at 50% 46%, ${CYAN}44 0%, transparent 50%)`,
        }}
      />

      {/* HUD */}
      <div className="relative z-10 flex h-full flex-col p-3 sm:p-5 pointer-events-none">
        <div className="flex items-start justify-between gap-2 pointer-events-auto">
          <div>
            <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.28em] text-white/40">
              CONSENSUS SINGULARITY
            </div>
            <div className="mt-0.5 text-[11px] sm:text-xs font-mono tracking-widest text-white/55">
              {feed.pair}
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
                      ? "border-[#5EE7FF]/40 text-[#5EE7FF] bg-[#5EE7FF]/10"
                      : "text-white/40 border-white/10 bg-black/50 hover:border-white/20 hover:text-white/70"
                  }`}
                >
                  {f.pair}
                </button>
              );
            })}
          </div>
        </div>

        {/* price — glowing pure light */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none select-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${feed.id}-${feed.priceLabel}`}
              initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
              animate={{
                opacity: 1,
                scale: 1 + flash * 0.02,
                filter: "blur(0px)",
              }}
              exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <div
                className="font-semibold tracking-[-0.04em] tabular-nums leading-none"
                style={{
                  fontSize: "clamp(2.5rem, 8vw, 4.75rem)",
                  color: TEXT,
                  textShadow: `
                    0 0 ${20 + flash * 28}px ${CYAN}99,
                    0 0 ${40 + flash * 40}px ${CYAN}44,
                    0 2px 12px rgba(0,0,0,0.9)
                  `,
                }}
              >
                {feed.priceLabel || "—"}
              </div>
              <div className="mt-2.5 font-mono text-[10px] sm:text-xs tracking-[0.28em] text-white/35">
                {feed.unitLabel}
              </div>
              {feed.priceAlt && (
                <div className="mt-1 font-mono text-[9px] sm:text-[10px] tracking-wide text-white/25">
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
            accent={CYAN}
          />
        </div>

        {isFetching && (
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 w-1.5 h-1.5 rounded-full bg-[#5EE7FF] status-dot" />
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
    <div className="rounded-xl sm:rounded-2xl border border-white/[0.06] bg-black/60 backdrop-blur-md px-2.5 sm:px-3.5 py-2 sm:py-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        {accent && (
          <span
            className={`h-1 w-1 rounded-full ${pulse ? "status-dot" : ""}`}
            style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
          />
        )}
        <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.18em] text-white/35">
          {label}
        </span>
      </div>
      <div
        className="font-mono text-sm sm:text-base tabular-nums tracking-tight"
        style={{ color: accent || TEXT }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[8px] sm:text-[9px] font-mono text-white/25 mt-0.5">
          {sub}
        </div>
      )}
      {typeof bar === "number" && (
        <div className="mt-1.5 h-px rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${bar}%`,
              background: accent || CYAN,
              boxShadow: `0 0 8px ${accent || CYAN}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
