"use client";

/**
 * Consensus Singularity — premium 3D oracle consensus visualizer.
 * External data (comets) → oracle gravity wells → luminous singularity (price).
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

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function statusColor(s: FeedStatus, accent: string): string {
  if (s === "live") return accent;
  if (s === "stale") return "#F59E0B";
  return "#EF4444";
}

function hexToThree(hex: string): THREE.Color {
  return new THREE.Color(hex);
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
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ─── Layout: oracle positions on a soft ellipsoid ──────────────────────── */

function nodePosition(index: number, total: number, seed: number): THREE.Vector3 {
  // Fibonacci sphere with slight vertical squash + radius jitter
  const n = Math.max(total, 1);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(n - 1, 1)) * 2;
  const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index + (seed % 1000) * 0.001;
  const radius = 5.2 + ((seed + index * 17) % 40) * 0.02;
  return new THREE.Vector3(
    Math.cos(theta) * rAtY * radius,
    y * radius * 0.55,
    Math.sin(theta) * rAtY * radius
  );
}

/* ─── Singularity core ──────────────────────────────────────────────────── */

function SingularityCore({
  accent,
  flash,
  status,
}: {
  accent: string;
  flash: number;
  status: FeedStatus;
}) {
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const shell2 = useRef<THREE.Mesh>(null);
  const color = useMemo(() => hexToThree(accent), [accent]);
  const dim = status === "offline";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const breathe = 1 + Math.sin(t * 1.4) * 0.04 + flash * 0.35;
    if (core.current) {
      core.current.scale.setScalar(breathe);
      const mat = core.current.material as THREE.MeshBasicMaterial;
      mat.opacity = dim ? 0.35 : 0.95 + flash * 0.05;
    }
    if (shell.current) {
      const s = 1.35 + Math.sin(t * 0.9) * 0.06 + flash * 0.5;
      shell.current.scale.setScalar(s);
      shell.current.rotation.y = t * 0.15;
      shell.current.rotation.z = t * 0.08;
      const mat = shell.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.08 : 0.18) + flash * 0.25;
    }
    if (shell2.current) {
      const s = 1.85 + Math.sin(t * 0.55 + 1) * 0.08 + flash * 0.65;
      shell2.current.scale.setScalar(s);
      shell2.current.rotation.y = -t * 0.1;
      const mat = shell2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (dim ? 0.04 : 0.1) + flash * 0.2;
    }
  });

  return (
    <group>
      {/* point light pulls the scene toward the center */}
      <pointLight
        color={color}
        intensity={dim ? 0.6 : 2.4 + flash * 6}
        distance={28}
        decay={2}
      />
      <pointLight color="#ffffff" intensity={0.35 + flash * 1.5} distance={10} />

      <mesh ref={core}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.95}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          wireframe
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={shell2}>
        <sphereGeometry args={[1.1, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/* ─── Epoch rings ───────────────────────────────────────────────────────── */

function EpochRings({
  accent,
  epochLength,
  flash,
}: {
  accent: string;
  epochLength: number;
  flash: number;
}) {
  const g1 = useRef<THREE.Group>(null);
  const g2 = useRef<THREE.Group>(null);
  const g3 = useRef<THREE.Group>(null);
  const color = useMemo(() => hexToThree(accent), [accent]);
  // Ring scale subtly encodes epoch length
  const r0 = 3.2 + Math.min(epochLength, 40) * 0.02;

  useFrame((_, dt) => {
    if (g1.current) g1.current.rotation.z += dt * 0.08;
    if (g2.current) g2.current.rotation.z -= dt * 0.05;
    if (g3.current) {
      g3.current.rotation.x += dt * 0.03;
      g3.current.rotation.y += dt * 0.04;
    }
  });

  const ringMat = (opacity: number) => (
    <meshBasicMaterial
      color={color}
      transparent
      opacity={opacity + flash * 0.15}
      side={THREE.DoubleSide}
      depthWrite={false}
      toneMapped={false}
      blending={THREE.AdditiveBlending}
    />
  );

  return (
    <group>
      <group ref={g1} rotation={[Math.PI / 2.4, 0.2, 0]}>
        <mesh>
          <ringGeometry args={[r0, r0 + 0.035, 96]} />
          {ringMat(0.35)}
        </mesh>
      </group>
      <group ref={g2} rotation={[Math.PI / 2.1, -0.35, 0.4]}>
        <mesh>
          <ringGeometry args={[r0 * 1.22, r0 * 1.22 + 0.028, 96]} />
          {ringMat(0.22)}
        </mesh>
      </group>
      <group ref={g3} rotation={[0.9, 0.6, 0.2]}>
        <mesh>
          <ringGeometry args={[r0 * 1.48, r0 * 1.48 + 0.02, 80]} />
          {ringMat(0.12)}
        </mesh>
      </group>
    </group>
  );
}

/* ─── Oracle gravity node ───────────────────────────────────────────────── */

function OracleNodeMesh({
  position,
  status,
  accent,
  label,
  reduced,
}: {
  position: THREE.Vector3;
  status: FeedStatus;
  accent: string;
  label: string;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh>(null);
  const col = statusColor(status, accent);
  const color = useMemo(() => hexToThree(col), [col]);
  const seed = useMemo(() => hashStr(label) / 0xffffffff, [label]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.position.copy(position);
      // gentle bob
      group.current.position.y += Math.sin(t * 0.7 + seed * 10) * 0.08;
      group.current.rotation.y = t * (0.2 + seed * 0.3);
      group.current.rotation.x = Math.sin(t * 0.3 + seed) * 0.15;
    }
    if (aura.current) {
      const pulse =
        status === "live"
          ? 1 + Math.sin(t * 2.2 + seed * 6) * 0.12
          : status === "stale"
            ? 1 + Math.sin(t * 0.8) * 0.05
            : 1;
      aura.current.scale.setScalar(pulse);
      const mat = aura.current.material as THREE.MeshBasicMaterial;
      mat.opacity =
        status === "live" ? 0.22 : status === "stale" ? 0.12 : 0.05;
    }
  });

  return (
    <group ref={group} position={position}>
      {/* glass body */}
      <mesh>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={status === "live" ? 0.85 : status === "stale" ? 0.35 : 0.08}
          metalness={0.65}
          roughness={0.18}
          transparent
          opacity={0.92}
          toneMapped={false}
        />
      </mesh>
      {!reduced && (
        <mesh>
          <octahedronGeometry args={[0.32, 0]} />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={0.25}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh ref={aura}>
        <sphereGeometry args={[0.55, reduced ? 8 : 16, reduced ? 8 : 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/* ─── Data comets / particles ───────────────────────────────────────────── */

type Comet = {
  phase: "inbound" | "to-core"; // outer→oracle, then oracle→center
  t: number; // 0..1 progress
  speed: number;
  from: THREE.Vector3;
  via: THREE.Vector3; // oracle
  to: THREE.Vector3; // center
  color: THREE.Color;
};

function DataStreams({
  nodes,
  accent,
  status,
  reduced,
  flashRef,
}: {
  nodes: { pos: THREE.Vector3; status: FeedStatus }[];
  accent: string;
  status: FeedStatus;
  reduced: boolean;
  flashRef: React.MutableRefObject<number>;
}) {
  const count = reduced ? 28 : status === "offline" ? 12 : 72;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const comets = useRef<Comet[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const accentColor = useMemo(() => hexToThree(accent), [accent]);

  const spawn = useCallback((): Comet | null => {
    if (!nodes.length) return null;
    const liveNodes = nodes.filter((n) => n.status !== "offline");
    const pool = liveNodes.length ? liveNodes : nodes;
    const target = pool[Math.floor(Math.random() * pool.length)];
    // Spawn on a far sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const R = 14 + Math.random() * 6;
    const from = new THREE.Vector3(
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.cos(phi) * 0.45,
      R * Math.sin(phi) * Math.sin(theta)
    );
    const c = accentColor.clone();
    if (target.status === "stale") c.lerp(new THREE.Color("#F59E0B"), 0.5);
    if (target.status === "offline") c.lerp(new THREE.Color("#EF4444"), 0.6);
    return {
      phase: "inbound",
      t: 0,
      speed: 0.18 + Math.random() * 0.22,
      from,
      via: target.pos.clone(),
      to: new THREE.Vector3(0, 0, 0),
      color: c,
    };
  }, [nodes, accentColor]);

  // Init pool
  useEffect(() => {
    const arr: Comet[] = [];
    for (let i = 0; i < count; i++) {
      const c = spawn();
      if (c) {
        c.t = Math.random(); // staggered
        arr.push(c);
      }
    }
    comets.current = arr;
  }, [count, spawn]);

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const list = comets.current;
    const rateMul =
      status === "live" ? 1 : status === "stale" ? 0.45 : 0.12;

    for (let i = 0; i < list.length; i++) {
      let c = list[i];
      if (!c) {
        c = spawn() || list[i];
        if (!c) continue;
        list[i] = c;
      }

      c.t += dt * c.speed * rateMul;

      let pos = dummy.position;
      if (c.phase === "inbound") {
        if (c.t >= 1) {
          c.phase = "to-core";
          c.t = 0;
          c.speed = 0.35 + Math.random() * 0.35;
        } else {
          // ease into oracle
          const e = c.t * c.t * (3 - 2 * c.t);
          pos.lerpVectors(c.from, c.via, e);
        }
      }
      if (c.phase === "to-core") {
        if (c.t >= 1) {
          // absorbed — consensus pulse tick
          flashRef.current = Math.min(1, flashRef.current + 0.08);
          const next = spawn();
          if (next) list[i] = next;
          continue;
        }
        const e = c.t * c.t;
        pos.lerpVectors(c.via, c.to, e);
      }

      const scale =
        c.phase === "to-core"
          ? 0.06 + (1 - c.t) * 0.1
          : 0.05 + c.t * 0.04;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // color via instance color
      mesh.setColorAt(i, c.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        transparent
        opacity={0.9}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/* ─── Soft flash decay ──────────────────────────────────────────────────── */

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
    if (flashRef.current > 0) {
      flashRef.current = Math.max(0, flashRef.current - dt * 1.1);
      setFlash(flashRef.current);
    }
  });

  return null;
}

/* ─── Scene root ────────────────────────────────────────────────────────── */

function SceneRoot(props: {
  feed: SingularityFeed;
  reduced: boolean;
  flash: number;
  setFlash: (v: number) => void;
  flashRef: React.MutableRefObject<number>;
}) {
  const { feed, reduced, flash, setFlash, flashRef } = props;
  const nodes = useMemo(() => {
    let list = feed.nodes?.length
      ? feed.nodes
      : Array.from({ length: 8 }).map((_, i) => ({
          address: `virtual-${feed.id}-${i}`,
          height: null as number | null,
          status: feed.status as FeedStatus,
        }));
    const max = reduced ? 8 : 14;
    if (list.length > max) list = list.slice(0, max);
    return list.map((n, i) => {
      const seed = hashStr(n.address);
      const pos = nodePosition(i, list.length, seed);
      return { ...n, pos };
    });
  }, [feed.nodes, feed.id, feed.status, reduced]);

  return (
    <>
      <color attach="background" args={["#050508"]} />
      <fog attach="fog" args={["#050508", 18, 42]} />
      <ambientLight intensity={0.18} />

      <Stars
        radius={60}
        depth={40}
        count={reduced ? 600 : 1800}
        factor={reduced ? 2.5 : 3.2}
        saturation={0}
        fade
        speed={0.2}
      />

      <FlashController
        flashRef={flashRef}
        setFlash={setFlash}
        priceKey={`${feed.id}:${feed.priceLabel}:${feed.settlementHeight}`}
      />

      <SingularityCore
        accent={feed.accent}
        flash={flash}
        status={feed.status}
      />
      <EpochRings
        accent={feed.accent}
        epochLength={feed.epochLength}
        flash={flash}
      />

      {nodes.map((n) => (
        <OracleNodeMesh
          key={n.address}
          position={n.pos}
          status={n.status}
          accent={feed.accent}
          label={n.address}
          reduced={reduced}
        />
      ))}

      <DataStreams
        nodes={nodes.map((n) => ({ pos: n.pos, status: n.status }))}
        accent={feed.accent}
        status={feed.status}
        reduced={reduced}
        flashRef={flashRef}
      />

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={reduced ? 9 : 7}
        maxDistance={22}
        autoRotate
        autoRotateSpeed={feed.status === "offline" ? 0.15 : 0.35}
        maxPolarAngle={Math.PI * 0.85}
        minPolarAngle={Math.PI * 0.15}
      />
    </>
  );
}

/* ─── Main export ───────────────────────────────────────────────────────── */

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
    const onResize = () => setReduced(isMobileViewport() || prefersReducedMotion());
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
      ? "#10B981"
      : feed.status === "stale"
        ? "#F59E0B"
        : "#EF4444";

  const healthPct = (() => {
    if (feed.status === "offline") return 12;
    if (feed.status === "stale") return 48;
    if (feed.activeOracles != null && feed.totalOracles) {
      return Math.round(50 + (feed.activeOracles / feed.totalOracles) * 50);
    }
    return 90;
  })();

  return (
    <div className="oracle-singularity relative w-full overflow-hidden rounded-[1.25rem] sm:rounded-[1.75rem] border border-white/[0.08] bg-[#050508]">
      {/* 3D canvas */}
      <div className="absolute inset-0 z-0">
        {mounted && (
          <Canvas
            dpr={reduced ? [1, 1.25] : [1, 1.75]}
            camera={{ position: [0, 2.2, 12.5], fov: 42, near: 0.1, far: 80 }}
            gl={{
              antialias: !reduced,
              alpha: false,
              powerPreference: "high-performance",
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

      {/* vignette + top gradient for HUD legibility */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,5,8,0.15)_55%,rgba(5,5,8,0.75)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-[#050508]/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-t from-[#050508]/95 via-[#050508]/50 to-transparent" />

      {/* flash wash */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] transition-opacity duration-100"
        style={{
          opacity: flash * 0.35,
          background: `radial-gradient(circle at 50% 48%, ${feed.accent}55 0%, transparent 55%)`,
        }}
      />

      {/* ── HUD ── */}
      <div className="relative z-10 flex h-full flex-col p-3 sm:p-5 pointer-events-none">
        {/* top bar */}
        <div className="flex items-start justify-between gap-2 pointer-events-auto">
          <div>
            <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.28em] text-[#A0A0B0]/90">
              CONSENSUS SINGULARITY
            </div>
            <div className="mt-0.5 text-[11px] sm:text-xs font-mono tracking-widest text-white/70">
              {feed.pair} · ON-CHAIN
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
                      ? "text-white border-white/25 bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                      : "text-[#A0A0B0] border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                  style={
                    on
                      ? {
                          borderColor: `${f.accent}66`,
                          color: f.accent,
                          background: `${f.accent}18`,
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

        {/* center price */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none select-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${feed.id}-${feed.priceLabel}`}
              initial={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1 + flash * 0.04, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <div
                className="font-semibold tracking-[-0.04em] tabular-nums leading-none"
                style={{
                  fontSize: "clamp(2.4rem, 8vw, 4.75rem)",
                  color: "#F7F7FC",
                  textShadow: `0 0 ${24 + flash * 40}px ${feed.accent}88, 0 0 2px rgba(0,0,0,0.8)`,
                }}
              >
                {feed.priceLabel || "—"}
              </div>
              <div className="mt-2 font-mono text-[10px] sm:text-xs tracking-[0.22em] text-[#A0A0B0]">
                {feed.unitLabel}
              </div>
              {feed.priceAlt && (
                <div className="mt-1 font-mono text-[9px] sm:text-[10px] tracking-wide text-[#A0A0B0]/55">
                  {feed.priceAlt}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* bottom meta dock */}
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
            value={
              feed.epoch != null ? feed.epoch.toLocaleString() : "—"
            }
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
    <div className="rounded-xl sm:rounded-2xl border border-white/[0.07] bg-black/45 backdrop-blur-md px-2.5 sm:px-3.5 py-2 sm:py-2.5">
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
              background: accent || "#10B981",
              boxShadow: `0 0 8px ${accent || "#10B981"}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
