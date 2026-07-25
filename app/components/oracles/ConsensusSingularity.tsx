"use client";

/**
 * Consensus Singularity — SpaceX-inspired aerospace engineering aesthetic.
 * Dark glass · brushed metal · controlled cyan-white light · absolute precision.
 * No neon chaos, no soft blobs — restrained power.
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

/* ─── Aerospace palette ─────────────────────────────────────────────────── */

const CYAN_WHITE = "#B8F0FF";
const CYAN_CORE = "#7DD3F0";
const METAL = "#2A2C30";
const METAL_LIGHT = "#4A4E56";
const GLASS = "#1A1C20";
const EDGE = "#C8D0D8";
const GREEN = "#3DDC97";
const AMBER = "#C4A574";
const RED = "#B85C5C";
const VOID = "#000000";
const WHITE = "#F4F7FA";

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

function statusEdgeColor(s: FeedStatus): THREE.Color {
  if (s === "live") return hexToThree(GREEN);
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

function nodePosition(index: number, total: number, seed: number): THREE.Vector3 {
  const n = Math.max(total, 1);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(n - 1, 1)) * 2;
  const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index + (seed % 997) * 0.001;
  // Precise depth layering — engineered placement
  const depthBand = 0.88 + ((seed % 5) / 5) * 0.28;
  const radius = (6.0 + (index % 3) * 0.28) * depthBand;
  return new THREE.Vector3(
    Math.cos(theta) * rAtY * radius,
    y * radius * 0.46,
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

/* ─── Core: dark glass + brushed metal + inner cyan-white ───────────────── */

function AerospaceCore({
  flash,
  status,
}: {
  flash: number;
  status: FeedStatus;
}) {
  const outer = useRef<THREE.Mesh>(null);
  const lattice = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const dim = status === "offline";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = flash;
    // Almost static — engineering, not organic pulse
    if (outer.current) {
      outer.current.rotation.y = t * 0.04;
      const s = 1 + f * 0.06;
      outer.current.scale.setScalar(s);
    }
    if (lattice.current) {
      lattice.current.rotation.y = -t * 0.06;
      lattice.current.rotation.x = Math.sin(t * 0.15) * 0.04;
    }
    if (inner.current) {
      const s = (0.55 + Math.sin(t * 0.5) * 0.012) * (1 + f * 0.12);
      inner.current.scale.setScalar(s);
      const mat = inner.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = (dim ? 0.4 : 1.8) + f * 1.2;
    }
    if (glow.current) {
      const s = (1.15 + Math.sin(t * 0.35) * 0.02) * (1 + f * 0.15);
      glow.current.scale.setScalar(s);
      const mat = glow.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.04 : 0.1) + f * 0.1;
    }
  });

  return (
    <group>
      {/* controlled internal illumination */}
      <pointLight
        color={CYAN_WHITE}
        intensity={dim ? 0.8 : 2.4 + flash * 2}
        distance={22}
        decay={2}
      />
      <pointLight
        color="#ffffff"
        intensity={0.5 + flash * 0.6}
        distance={8}
        decay={2}
      />
      {/* cold rim fill — aerospace hangar */}
      <directionalLight
        color="#6A7A88"
        intensity={0.35}
        position={[4, 6, 3]}
      />
      <directionalLight
        color="#3A4550"
        intensity={0.2}
        position={[-5, -2, -4]}
      />

      {/* outer dark glass shell */}
      <mesh ref={outer}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial
          color={GLASS}
          metalness={0.92}
          roughness={0.22}
          transparent
          opacity={0.88}
          envMapIntensity={0.5}
          toneMapped
        />
      </mesh>

      {/* brushed metal structural lattice */}
      <mesh ref={lattice}>
        <icosahedronGeometry args={[0.98, 1]} />
        <meshBasicMaterial
          color={METAL_LIGHT}
          wireframe
          transparent
          opacity={0.45}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* inner crystalline emitter — cyan-white, contained */}
      <mesh ref={inner}>
        <octahedronGeometry args={[0.72, 2]} />
        <meshStandardMaterial
          color={CYAN_WHITE}
          emissive={hexToThree(CYAN_CORE)}
          emissiveIntensity={1.8}
          metalness={0.4}
          roughness={0.15}
          toneMapped={false}
        />
      </mesh>

      {/* tight internal glow only — not a soft blob */}
      <mesh ref={glow}>
        <sphereGeometry args={[0.85, 24, 24]} />
        <meshBasicMaterial
          color={CYAN_WHITE}
          transparent
          opacity={0.1}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* equatorial metal ring detail on core */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.02, 0.012, 6, 64]} />
        <meshStandardMaterial
          color={METAL_LIGHT}
          metalness={0.95}
          roughness={0.25}
        />
      </mesh>
    </group>
  );
}

/* ─── Sharp orbital rings of pure light ─────────────────────────────────── */

function PrecisionRings({
  epochLength,
  flash,
}: {
  epochLength: number;
  flash: number;
}) {
  const r1 = useRef<THREE.Group>(null);
  const r2 = useRef<THREE.Group>(null);
  const base = 3.5 + Math.min(epochLength, 40) * 0.01;

  useFrame((_, dt) => {
    if (r1.current) r1.current.rotation.z += dt * 0.03;
    if (r2.current) r2.current.rotation.z -= dt * 0.018;
  });

  return (
    <group>
      <group ref={r1} rotation={[Math.PI / 2.25, 0.08, 0]}>
        <mesh>
          {/* razor-thin ring */}
          <torusGeometry args={[base, 0.004 + flash * 0.002, 4, 160]} />
          <meshBasicMaterial
            color={CYAN_WHITE}
            transparent
            opacity={0.55 + flash * 0.2}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <group ref={r2} rotation={[Math.PI / 2.05, -0.28, 0.2]}>
        <mesh>
          <torusGeometry args={[base * 1.32, 0.003, 4, 160]} />
          <meshBasicMaterial
            color={EDGE}
            transparent
            opacity={0.28 + flash * 0.12}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
  );
}

/* ─── Thin luminous filament (node → core) ──────────────────────────────── */

function DataFilament({
  from,
  status,
}: {
  from: THREE.Vector3;
  status: FeedStatus;
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const edge = statusEdgeColor(status);

  const geometry = useMemo(() => {
    // Near-linear — absolute precision, minimal bend
    const mid = from.clone().multiplyScalar(0.52);
    const curve = new THREE.QuadraticBezierCurve3(
      from.clone(),
      mid,
      new THREE.Vector3(0, 0, 0)
    );
    return new THREE.TubeGeometry(curve, 28, 0.0035, 3, false);
  }, [from]);

  useFrame((state) => {
    if (!matRef.current) return;
    const t = state.clock.elapsedTime;
    const base =
      status === "live" ? 0.22 : status === "stale" ? 0.1 : 0.0;
    if (status === "offline") {
      matRef.current.opacity = 0;
      return;
    }
    // subtle energy flow shimmer
    matRef.current.opacity = base + Math.sin(t * 2.2 + from.length()) * 0.04;
  });

  if (status === "offline") return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={matRef}
        color={status === "live" ? CYAN_WHITE : edge}
        transparent
        opacity={0.2}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ─── Machined oracle node: anodized metal + frosted glass ──────────────── */

function OracleNodeMesh({
  node,
  reduced,
}: {
  node: NodeLayout;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const edge = statusEdgeColor(node.status);
  const dying = node.status === "offline";
  const stale = node.status === "stale";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = node.seed / 0xffffffff;
    if (group.current) {
      group.current.position.copy(node.pos);
      // micro-stable — almost fixed, slight engineered drift
      group.current.position.y += Math.sin(t * 0.2 + s * 8) * 0.03;
      group.current.rotation.y = t * 0.05;
    }
  });

  return (
    <group ref={group} position={node.pos}>
      {/* dark anodized metal body */}
      <mesh>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial
          color={METAL}
          metalness={0.95}
          roughness={0.28}
          emissive={edge}
          emissiveIntensity={dying ? 0.05 : stale ? 0.12 : 0.22}
        />
      </mesh>

      {/* frosted glass inset face */}
      <mesh scale={0.92}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial
          color={GLASS}
          metalness={0.35}
          roughness={0.55}
          transparent
          opacity={0.55}
          emissive={hexToThree(CYAN_CORE)}
          emissiveIntensity={dying ? 0.02 : 0.15}
        />
      </mesh>

      {/* precise edge lighting — wireframe rim only, not a blob */}
      <mesh scale={1.04}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshBasicMaterial
          color={dying ? RED : stale ? AMBER : EDGE}
          wireframe
          transparent
          opacity={dying ? 0.15 : 0.4}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* status indicator — tiny hard light, not volumetric sphere */}
      {!reduced && (
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.04]} />
          <meshBasicMaterial
            color={edge}
            toneMapped={false}
            transparent
            opacity={dying ? 0.3 : 0.95}
          />
        </mesh>
      )}

      <pointLight
        color={edge}
        intensity={dying ? 0.05 : stale ? 0.12 : 0.28}
        distance={1.8}
        decay={2}
      />
    </group>
  );
}

/* ─── Sparse particles, long clean trails ───────────────────────────────── */

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
  const headCount = reduced ? 14 : status === "offline" ? 10 : 28;
  const trailLen = reduced ? 8 : 14;
  const headRef = useRef<THREE.InstancedMesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<Particle[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const white = useMemo(() => hexToThree(CYAN_WHITE), []);

  const spawn = useCallback((): Particle | null => {
    if (!nodes.length) return null;
    const pool =
      nodes.filter((n) => n.status !== "offline").length > 0
        ? nodes.filter((n) => n.status !== "offline")
        : nodes;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const R = 13 + Math.random() * 4;
    const from = new THREE.Vector3(
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.cos(phi) * 0.36,
      R * Math.sin(phi) * Math.sin(theta)
    );
    return {
      phase: "inbound",
      t: 0,
      speed: 0.09 + Math.random() * 0.1,
      from,
      via: target.pos.clone(),
      trail: Array.from({ length: trailLen }, () => from.clone()),
      color: white.clone(),
    };
  }, [nodes, white, trailLen]);

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
      status === "live" ? 0.75 : status === "stale" ? 0.35 : 0.1;

    for (let i = 0; i < list.length; i++) {
      let p = list[i];
      if (!p) continue;
      p.t += dt * p.speed * rate;

      let pos = new THREE.Vector3();
      if (p.phase === "inbound") {
        if (p.t >= 1) {
          p.phase = "to-core";
          p.t = 0;
          p.speed = 0.16 + Math.random() * 0.12;
        } else {
          const e = p.t * p.t * (3 - 2 * p.t);
          pos.lerpVectors(p.from, p.via, e);
        }
      }
      if (p.phase === "to-core") {
        if (p.t >= 1) {
          flashRef.current = Math.min(0.45, flashRef.current + 0.05);
          const next = spawn();
          if (next) list[i] = next;
          continue;
        }
        // clean acceleration
        const e = p.t * p.t;
        pos.lerpVectors(p.via, new THREE.Vector3(0, 0, 0), e);
      }

      p.trail.pop();
      p.trail.unshift(pos.clone());

      const headScale =
        p.phase === "to-core"
          ? 0.028 + (1 - p.t) * 0.035
          : 0.025 + p.t * 0.015;
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
          dummy.scale.setScalar(headScale * 0.45 * fade);
          dummy.updateMatrix();
          trails.setMatrixAt(idx, dummy.matrix);
          const tc = p.color.clone().multiplyScalar(fade * 0.5);
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
        <sphereGeometry args={[1, 6, 6]} />
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
        <sphereGeometry args={[1, 4, 4]} />
        <meshBasicMaterial
          transparent
          opacity={0.5}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ─── Flash ─────────────────────────────────────────────────────────────── */

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
      flashRef.current = 0.55;
      prev.current = priceKey;
    }
  }, [priceKey, flashRef]);

  useFrame((_, dt) => {
    if (flashRef.current > 0.001) {
      flashRef.current = Math.max(0, flashRef.current - dt * 0.65);
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
      <fog attach="fog" args={[VOID, 9, 26]} />
      <ambientLight intensity={0.04} />

      <Stars
        radius={80}
        depth={35}
        count={reduced ? 300 : 700}
        factor={1.6}
        saturation={0}
        fade
        speed={0.05}
      />

      <FlashController
        flashRef={flashRef}
        setFlash={setFlash}
        priceKey={`${feed.id}:${feed.priceLabel}:${feed.settlementHeight}`}
      />

      <AerospaceCore flash={flash} status={feed.status} />
      <PrecisionRings epochLength={feed.epochLength} flash={flash} />

      {nodes.map((n) => (
        <React.Fragment key={n.address}>
          <OracleNodeMesh node={n} reduced={reduced} />
          <DataFilament from={n.pos} status={n.status} />
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
        minDistance={reduced ? 10 : 9}
        maxDistance={20}
        autoRotate
        autoRotateSpeed={0.08}
        maxPolarAngle={Math.PI * 0.78}
        minPolarAngle={Math.PI * 0.22}
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
    <div className="oracle-singularity relative w-full overflow-hidden rounded-[1.25rem] sm:rounded-[1.75rem] border border-white/[0.05] bg-black">
      <div className="absolute inset-0 z-0">
        {mounted && (
          <Canvas
            dpr={reduced ? [1, 1.25] : [1, 1.75]}
            camera={{ position: [0, 2.0, 13.2], fov: 36, near: 0.1, far: 80 }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.88,
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

      {/* heavy volumetric vignette — hangar depth */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_8%,rgba(0,0,0,0.4)_52%,rgba(0,0,0,0.95)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-28 bg-gradient-to-b from-black to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-36 bg-gradient-to-t from-black via-black/85 to-transparent" />

      {/* restrained flash */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] transition-opacity duration-250"
        style={{
          opacity: flash * 0.18,
          background: `radial-gradient(circle at 50% 46%, ${CYAN_WHITE}33 0%, transparent 45%)`,
        }}
      />

      {/* HUD — sparse, engineering */}
      <div className="relative z-10 flex h-full flex-col p-3 sm:p-5 pointer-events-none">
        <div className="flex items-start justify-between gap-2 pointer-events-auto">
          <div>
            <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-white/30">
              CONSENSUS SINGULARITY
            </div>
            <div className="mt-0.5 text-[11px] sm:text-xs font-mono tracking-[0.2em] text-white/50">
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
                  className={`px-2.5 sm:px-3.5 py-1.5 rounded-md text-[9px] sm:text-[10px] font-mono tracking-[0.16em] border transition-all ${
                    on
                      ? "border-[#B8F0FF]/35 text-[#B8F0FF] bg-white/[0.06]"
                      : "text-white/35 border-white/[0.08] bg-black/60 hover:border-white/20 hover:text-white/60"
                  }`}
                >
                  {f.pair}
                </button>
              );
            })}
          </div>
        </div>

        {/* price — pure white light */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none select-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${feed.id}-${feed.priceLabel}`}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{
                opacity: 1,
                scale: 1 + flash * 0.015,
              }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <div
                className="font-semibold tracking-[-0.035em] tabular-nums leading-none"
                style={{
                  fontSize: "clamp(2.5rem, 8vw, 4.6rem)",
                  color: WHITE,
                  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  textShadow: `
                    0 0 ${16 + flash * 24}px ${CYAN_WHITE}88,
                    0 0 ${32 + flash * 30}px rgba(184,240,255,0.25),
                    0 2px 16px rgba(0,0,0,0.95)
                  `,
                }}
              >
                {feed.priceLabel || "—"}
              </div>
              <div className="mt-3 font-mono text-[10px] sm:text-[11px] tracking-[0.32em] text-white/30">
                {feed.unitLabel}
              </div>
              {feed.priceAlt && (
                <div className="mt-1.5 font-mono text-[9px] tracking-wide text-white/20">
                  {feed.priceAlt}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pointer-events-auto grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
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
            accent={CYAN_WHITE}
          />
        </div>

        {isFetching && (
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 w-1 h-1 rounded-sm bg-[#B8F0FF]" />
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
    <div className="rounded-lg border border-white/[0.06] bg-black/65 backdrop-blur-md px-2.5 sm:px-3 py-2 sm:py-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        {accent && (
          <span
            className={`h-1 w-1 ${pulse ? "status-dot" : ""}`}
            style={{
              background: accent,
              boxShadow: `0 0 4px ${accent}`,
              borderRadius: 1,
            }}
          />
        )}
        <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.2em] text-white/30">
          {label}
        </span>
      </div>
      <div
        className="font-mono text-sm sm:text-[15px] tabular-nums tracking-tight"
        style={{ color: accent || WHITE }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[8px] font-mono text-white/20 mt-0.5">{sub}</div>
      )}
      {typeof bar === "number" && (
        <div className="mt-1.5 h-px bg-white/[0.06] overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${bar}%`,
              background: accent || CYAN_WHITE,
            }}
          />
        </div>
      )}
    </div>
  );
}
