"use client";

/**
 * Consensus Singularity — SpaceX interstellar presentation.
 * Real Andromeda (NASA/GALEX) as photographic space backdrop.
 * Crystalline core at galactic center · refined light-point oracles ·
 * thin rings · absolute restraint. No neon, no particle spam.
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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

/* ─── Palette — restrained aerospace ────────────────────────────────────── */

const CYAN_WHITE = "#D8F4FF";
const CORE_EMIT = "#A8E4F5";
const METAL = "#1E2024";
const EDGE = "#A8B0B8";
const GREEN = "#4ADE9B";
const AMBER = "#C4A574";
const RED = "#A85858";
const VOID = "#000000";
const WHITE = "#F5F7FA";

const ANDROMEDA_TEX = "/textures/andromeda-2k.jpg";

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

function statusColor(s: FeedStatus): THREE.Color {
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

/**
 * Place nodes along dual spiral arms — reads as galactic structure,
 * not a random sphere cloud.
 */
function spiralPosition(index: number, total: number, seed: number): THREE.Vector3 {
  const arm = index % 2;
  const t = (index / Math.max(total, 1)) * Math.PI * 2.8 + arm * Math.PI;
  const r = 2.8 + (index / Math.max(total - 1, 1)) * 6.2;
  const jitter = ((seed % 20) - 10) * 0.02;
  return new THREE.Vector3(
    Math.cos(t) * (r + jitter),
    Math.sin(t * 1.7) * 0.55 + ((seed % 11) - 5) * 0.04,
    Math.sin(t) * (r + jitter) * 0.92
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
      pos: spiralPosition(i, list.length, seed),
      seed,
    };
  });
}

/* ─── Andromeda photographic sky ────────────────────────────────────────── */

function AndromedaSky({ reduced }: { reduced: boolean }) {
  const tex = useLoader(THREE.TextureLoader, ANDROMEDA_TEX);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = reduced ? 4 : 8;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }, [tex, reduced]);

  // Slow celestial drift
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.004;
  });

  return (
    <group ref={group}>
      {/* Inward-facing sphere — real photograph surrounds the scene */}
      <mesh scale={[-1, 1, 1]}>
        <sphereGeometry args={[48, reduced ? 48 : 64, reduced ? 32 : 48]} />
        <meshBasicMaterial
          ref={matRef}
          map={tex}
          side={THREE.BackSide}
          toneMapped={false}
          // slightly dim so core/HUD read cleanly
          color="#c8c8c8"
        />
      </mesh>
      {/* pure black outer void beyond photo edges feel */}
      <mesh>
        <sphereGeometry args={[52, 16, 12]} />
        <meshBasicMaterial color={VOID} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/* ─── Crystalline singularity at galactic core ──────────────────────────── */

function CrystallineCore({
  flash,
  status,
}: {
  flash: number;
  status: FeedStatus;
}) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const lattice = useRef<THREE.Mesh>(null);
  const dim = status === "offline";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = flash;
    if (outer.current) {
      outer.current.rotation.y = t * 0.035;
      outer.current.scale.setScalar(1 + f * 0.04);
    }
    if (lattice.current) {
      lattice.current.rotation.y = -t * 0.05;
    }
    if (inner.current) {
      const s = (0.42 + Math.sin(t * 0.4) * 0.008) * (1 + f * 0.08);
      inner.current.scale.setScalar(s);
      const mat = inner.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = (dim ? 0.35 : 1.5) + f * 0.8;
    }
  });

  return (
    <group>
      <pointLight
        color={CYAN_WHITE}
        intensity={dim ? 0.6 : 1.8 + flash * 1.2}
        distance={16}
        decay={2}
      />
      <pointLight color="#ffffff" intensity={0.35 + flash * 0.4} distance={6} />

      {/* dark crystalline shell */}
      <mesh ref={outer}>
        <icosahedronGeometry args={[0.72, 1]} />
        <meshStandardMaterial
          color={METAL}
          metalness={0.92}
          roughness={0.2}
          transparent
          opacity={0.78}
        />
      </mesh>

      {/* fine structure lines */}
      <mesh ref={lattice}>
        <icosahedronGeometry args={[0.74, 1]} />
        <meshBasicMaterial
          color={EDGE}
          wireframe
          transparent
          opacity={0.28}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* contained white-cyan emitter */}
      <mesh ref={inner}>
        <octahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial
          color={WHITE}
          emissive={hexToThree(CORE_EMIT)}
          emissiveIntensity={1.5}
          metalness={0.3}
          roughness={0.2}
          toneMapped={false}
        />
      </mesh>

      {/* equatorial precision ring on core */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.78, 0.006, 4, 64]} />
        <meshBasicMaterial
          color={CYAN_WHITE}
          transparent
          opacity={0.5}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ─── Minimal orbital light rings ───────────────────────────────────────── */

function OrbitalRings({ flash }: { flash: number }) {
  const r1 = useRef<THREE.Group>(null);
  const r2 = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (r1.current) r1.current.rotation.z += dt * 0.022;
    if (r2.current) r2.current.rotation.z -= dt * 0.014;
  });

  return (
    <group>
      <group ref={r1} rotation={[Math.PI / 2.2, 0.06, 0]}>
        <mesh>
          <torusGeometry args={[2.4, 0.003, 3, 128]} />
          <meshBasicMaterial
            color={CYAN_WHITE}
            transparent
            opacity={0.4 + flash * 0.15}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <group ref={r2} rotation={[Math.PI / 2.05, -0.2, 0.15]}>
        <mesh>
          <torusGeometry args={[3.35, 0.0025, 3, 128]} />
          <meshBasicMaterial
            color={EDGE}
            transparent
            opacity={0.22 + flash * 0.1}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
  );
}

/* ─── Refined oracle: light point + thin crystal ────────────────────────── */

function OracleNodeMesh({
  node,
  reduced,
}: {
  node: NodeLayout;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const edge = statusColor(node.status);
  const dying = node.status === "offline";

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = node.seed / 0xffffffff;
    if (group.current) {
      group.current.position.copy(node.pos);
      group.current.position.y += Math.sin(t * 0.15 + s * 6) * 0.02;
      group.current.rotation.y = t * 0.04;
    }
  });

  return (
    <group ref={group} position={node.pos}>
      {/* tiny refined light point */}
      <mesh>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial
          color={dying ? RED : edge}
          toneMapped={false}
          transparent
          opacity={dying ? 0.35 : 0.95}
        />
      </mesh>

      {/* thin crystalline shard — small, precise */}
      {!reduced && (
        <mesh scale={[0.6, 1.2, 0.6]} position={[0, 0.08, 0]}>
          <octahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial
            color={METAL}
            metalness={0.9}
            roughness={0.25}
            transparent
            opacity={0.7}
            emissive={edge}
            emissiveIntensity={dying ? 0.05 : 0.2}
          />
        </mesh>
      )}

      {/* hard edge only */}
      {!reduced && (
        <mesh scale={[0.65, 1.25, 0.65]} position={[0, 0.08, 0]}>
          <octahedronGeometry args={[0.09, 0]} />
          <meshBasicMaterial
            color={EDGE}
            wireframe
            transparent
            opacity={0.25}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      <pointLight
        color={edge}
        intensity={dying ? 0.03 : 0.15}
        distance={1.2}
        decay={2}
      />
    </group>
  );
}

/* ─── Ultra-sparse filament (optional, only live nodes) ─────────────────── */

function ThinFilament({ from, status }: { from: THREE.Vector3; status: FeedStatus }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  const geometry = useMemo(() => {
    const mid = from.clone().multiplyScalar(0.5);
    const curve = new THREE.QuadraticBezierCurve3(
      from.clone(),
      mid,
      new THREE.Vector3(0, 0, 0)
    );
    return new THREE.TubeGeometry(curve, 20, 0.002, 3, false);
  }, [from]);

  useFrame((state) => {
    if (!matRef.current) return;
    if (status !== "live") {
      matRef.current.opacity = status === "stale" ? 0.04 : 0;
      return;
    }
    const t = state.clock.elapsedTime;
    matRef.current.opacity = 0.08 + Math.sin(t * 1.5 + from.x) * 0.02;
  });

  if (status === "offline") return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={matRef}
        color={CYAN_WHITE}
        transparent
        opacity={0.08}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
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
      flashRef.current = 0.4;
      prev.current = priceKey;
    }
  }, [priceKey, flashRef]);

  useFrame((_, dt) => {
    if (flashRef.current > 0.001) {
      flashRef.current = Math.max(0, flashRef.current - dt * 0.55);
      setFlash(flashRef.current);
    } else if (flashRef.current !== 0) {
      flashRef.current = 0;
      setFlash(0);
    }
  });
  return null;
}

/* Camera framing — look at galactic core */
function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 1.4, 11.5);
    camera.lookAt(0, 0, 0);
  }, [camera]);
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
      <fog attach="fog" args={[VOID, 18, 46]} />
      <ambientLight intensity={0.08} />
      <CameraRig />

      <Suspense fallback={null}>
        <AndromedaSky reduced={reduced} />
      </Suspense>

      <FlashController
        flashRef={flashRef}
        setFlash={setFlash}
        priceKey={`${feed.id}:${feed.priceLabel}:${feed.settlementHeight}`}
      />

      <CrystallineCore flash={flash} status={feed.status} />
      <OrbitalRings flash={flash} />

      {nodes.map((n) => (
        <React.Fragment key={n.address}>
          <OracleNodeMesh node={n} reduced={reduced} />
          {!reduced && <ThinFilament from={n.pos} status={n.status} />}
        </React.Fragment>
      ))}

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={reduced ? 8 : 7}
        maxDistance={18}
        autoRotate
        autoRotateSpeed={0.05}
        maxPolarAngle={Math.PI * 0.75}
        minPolarAngle={Math.PI * 0.25}
        target={[0, 0, 0]}
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
    <div
      className="oracle-singularity relative w-full overflow-hidden rounded-[1.25rem] sm:rounded-[1.75rem] border border-white/[0.05] bg-black"
      style={{
        // photographic fallback while WebGL mounts
        backgroundImage: `url(${ANDROMEDA_TEX})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* pure black veil so photo is deep */}
      <div className="absolute inset-0 z-0 bg-black/25" />

      <div className="absolute inset-0 z-[1]">
        {mounted && (
          <Canvas
            dpr={reduced ? [1, 1.25] : [1, 1.6]}
            camera={{ position: [0, 1.4, 11.5], fov: 38, near: 0.1, far: 100 }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.85,
            }}
            style={{ width: "100%", height: "100%", background: "transparent" }}
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

      {/* cinematic atmosphere */}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_at_center,transparent_15%,rgba(0,0,0,0.35)_60%,rgba(0,0,0,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-24 bg-gradient-to-b from-black/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-32 bg-gradient-to-t from-black/95 via-black/70 to-transparent" />

      <div
        className="pointer-events-none absolute inset-0 z-[3] transition-opacity duration-300"
        style={{
          opacity: flash * 0.12,
          background: `radial-gradient(circle at 50% 48%, ${CYAN_WHITE}22 0%, transparent 40%)`,
        }}
      />

      {/* HUD */}
      <div className="relative z-10 flex h-full flex-col p-3 sm:p-5 pointer-events-none">
        <div className="flex items-start justify-between gap-2 pointer-events-auto">
          <div>
            <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.32em] text-white/30">
              CONSENSUS SINGULARITY
            </div>
            <div className="mt-0.5 text-[11px] sm:text-xs font-mono tracking-[0.22em] text-white/50">
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
                      ? "border-white/30 text-white bg-white/[0.07]"
                      : "text-white/35 border-white/[0.08] bg-black/50 hover:border-white/18 hover:text-white/60"
                  }`}
                >
                  {f.pair}
                </button>
              );
            })}
          </div>
        </div>

        {/* Price — pure white futuristic type at galactic core */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none select-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${feed.id}-${feed.priceLabel}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <div
                className="font-light tracking-[-0.03em] tabular-nums leading-none"
                style={{
                  fontSize: "clamp(2.4rem, 7.5vw, 4.4rem)",
                  color: WHITE,
                  fontFamily:
                    "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
                  textShadow: `
                    0 0 ${14 + flash * 18}px rgba(255,255,255,0.55),
                    0 0 ${28 + flash * 24}px rgba(168,228,245,0.25),
                    0 2px 24px rgba(0,0,0,0.9)
                  `,
                }}
              >
                {feed.priceLabel || "—"}
              </div>
              <div className="mt-3 font-mono text-[10px] sm:text-[11px] tracking-[0.36em] text-white/35 uppercase">
                {feed.unitLabel}
              </div>
              {feed.priceAlt && (
                <div className="mt-1.5 font-mono text-[9px] tracking-wide text-white/22">
                  {feed.priceAlt}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pointer-events-auto grid grid-cols-2 sm:grid-cols-4 gap-2">
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

        <div className="mt-2 text-center text-[8px] sm:text-[9px] font-mono tracking-[0.18em] text-white/20">
          ANDROMEDA · NASA / GALEX · PUBLIC DOMAIN
        </div>

        {isFetching && (
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 w-1 h-1 bg-white/60" />
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
    <div className="rounded-md border border-white/[0.06] bg-black/55 backdrop-blur-md px-2.5 sm:px-3 py-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        {accent && (
          <span
            className={`h-1 w-1 ${pulse ? "status-dot" : ""}`}
            style={{
              background: accent,
              borderRadius: 0.5,
            }}
          />
        )}
        <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.2em] text-white/28">
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
        <div className="text-[8px] font-mono text-white/18 mt-0.5">{sub}</div>
      )}
      {typeof bar === "number" && (
        <div className="mt-1.5 h-px bg-white/[0.05] overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${bar}%`, background: accent || CYAN_WHITE }}
          />
        </div>
      )}
    </div>
  );
}
