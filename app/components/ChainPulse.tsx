"use client";

/**
 * Chain Pulse — Stage 1 visualization prototype
 * Mempool + token particles assemble into the tip block (local node feed).
 */

import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import type { ChainFeed, ChainParticle } from "@/lib/chain";

/* ─── Soft sprite texture ───────────────────────────────────────────────── */

let softTex: THREE.CanvasTexture | null = null;
function getSoftTex(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  if (softTex) return softTex;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.7)");
  g.addColorStop(0.5, "rgba(255,255,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTex = new THREE.CanvasTexture(c);
  softTex.needsUpdate = true;
  return softTex;
}

const GEO_SPRITE = new THREE.PlaneGeometry(1, 1);
const GEO_CORE = new THREE.IcosahedronGeometry(1, 1);

function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/* ─── Data hook ─────────────────────────────────────────────────────────── */

async function fetchFeed(): Promise<ChainFeed> {
  const res = await fetch("/api/chain/feed?blocks=4&mempool=35", {
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `feed ${res.status}`);
  }
  return res.json();
}

/* ─── Scene pieces ──────────────────────────────────────────────────────── */

function BlockCore({
  height,
  txCount,
  pulse,
}: {
  height: number | null;
  txCount: number;
  pulse: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.15;
      meshRef.current.rotation.x = Math.sin(t * 0.2) * 0.08;
      const s = 1.05 + pulse * 0.12 + Math.sin(t * 1.4) * 0.02;
      meshRef.current.scale.setScalar(s);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.35;
      ringRef.current.rotation.x = Math.PI / 2.1;
      const rs = 1.6 + pulse * 0.4;
      ringRef.current.scale.setScalar(rs);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.15 + pulse * 0.35;
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.45 + pulse * 0.8 + Math.sin(t * 2) * 0.05;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={GEO_CORE}>
        <meshStandardMaterial
          ref={matRef}
          color="#1a2233"
          emissive="#E8C48A"
          emissiveIntensity={0.5}
          metalness={0.6}
          roughness={0.35}
          wireframe={false}
        />
      </mesh>
      {/* Soft wire overlay for “block” read */}
      <mesh geometry={GEO_CORE} scale={1.02}>
        <meshBasicMaterial
          color="#E8C48A"
          wireframe
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.22, 64]} />
        <meshBasicMaterial
          color="#00E5FF"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Height label plane via sprite-ish HTML is outside; keep 3D clean */}
      <pointLight color="#E8C48A" intensity={1.2 + pulse} distance={12} />
      <pointLight color="#00E5FF" intensity={0.5} distance={8} position={[2, 1, 2]} />
    </group>
  );
}

type ParticleSlot = {
  p: ChainParticle;
  phase: number;
  speed: number;
  radius: number;
  elev: number;
  orbit: number;
};

function TokenParticles({
  particles,
  assemble,
}: {
  particles: ChainParticle[];
  /** 0 idle orbit · 1 fully pulled into block */
  assemble: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const map = useMemo(() => getSoftTex(), []);
  const count = particles.length;

  const slots = useMemo<ParticleSlot[]>(() => {
    return particles.map((p) => ({
      p,
      phase: hash01(p.id, 1) * Math.PI * 2,
      speed: 0.25 + hash01(p.id, 2) * 0.55,
      radius: 2.4 + hash01(p.id, 3) * 3.2 + (p.pending ? 0.6 : 0),
      elev: (hash01(p.id, 4) - 0.5) * 2.2,
      orbit: hash01(p.id, 5) * Math.PI * 2,
    }));
  }, [particles]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    const t = state.clock.elapsedTime;
    const camQ = state.camera.quaternion;
    const a = THREE.MathUtils.clamp(assemble, 0, 1);
    // smoothstep assemble
    const ease = a * a * (3 - 2 * a);

    for (let i = 0; i < count; i++) {
      const s = slots[i];
      const ang = s.orbit + t * s.speed * (s.p.pending ? 1 : 0.45);
      const breathe = 1 + Math.sin(t * 2.1 + s.phase) * 0.08;
      // Orbit position
      const ox = Math.cos(ang) * s.radius;
      const oy = s.elev + Math.sin(t * 0.7 + s.phase) * 0.25;
      const oz = Math.sin(ang) * s.radius;
      // Pull toward origin (block core) as assemble → 1
      const x = ox * (1 - ease * 0.92);
      const y = oy * (1 - ease * 0.92);
      const z = oz * (1 - ease * 0.92);

      const size =
        (0.1 + s.p.weight * 0.14) *
        breathe *
        (s.p.pending ? 1 : 0.85) *
        (1 - ease * 0.35);

      dummy.position.set(x, y, z);
      dummy.quaternion.copy(camQ);
      dummy.scale.setScalar(Math.max(0.02, size));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.set(s.p.color);
      // Pending = brighter; sealed = slightly dimmer
      const mul = (s.p.pending ? 1.15 : 0.75) * (0.85 + (1 - ease) * 0.25);
      color.multiplyScalar(mul);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[GEO_SPRITE, undefined, count]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        map={map}
        color="#ffffff"
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

function ChainWorld({
  feed,
  assemble,
}: {
  feed: ChainFeed;
  assemble: number;
}) {
  const tip = feed.tip;
  return (
    <>
      <color attach="background" args={["#03040a"]} />
      <fog attach="fog" args={["#03040a", 18, 42]} />
      <ambientLight intensity={0.25} />
      <Stars
        radius={60}
        depth={40}
        count={2500}
        factor={2.5}
        saturation={0.1}
        fade
        speed={0.2}
      />
      <BlockCore
        height={tip?.height ?? null}
        txCount={tip?.txCount ?? 0}
        pulse={assemble}
      />
      <TokenParticles particles={feed.particles} assemble={assemble} />
      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={22}
        enableDamping
        dampingFactor={0.06}
        autoRotate
        autoRotateSpeed={0.35}
        target={[0, 0, 0]}
      />
    </>
  );
}

/* ─── Outer shell ───────────────────────────────────────────────────────── */

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

export default function ChainPulse() {
  const { data, error, isLoading, dataUpdatedAt, refetch, isFetching } =
    useQuery({
      queryKey: ["chain-feed"],
      queryFn: fetchFeed,
      refetchInterval: 4000,
      staleTime: 2000,
    });

  const [assemble, setAssemble] = useState(0);
  const prevTip = useRef<string | null>(null);

  // On new tip block → assemble pulse
  useEffect(() => {
    const id = data?.tip?.id ?? null;
    if (!id) return;
    if (prevTip.current && prevTip.current !== id) {
      setAssemble(1);
      const t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / 2200);
        // rise then settle
        const wave = u < 0.45 ? u / 0.45 : 1 - (u - 0.45) / 0.55;
        setAssemble(Math.max(0, wave));
        if (u < 1) raf = requestAnimationFrame(tick);
        else setAssemble(0);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    prevTip.current = id;
  }, [data?.tip?.id]);

  const pendingN = data?.mempool?.length ?? 0;
  const tokenN =
    data?.particles?.filter((p) => p.kind === "token" && p.pending).length ?? 0;
  const tipErg = data?.tip
    ? data.tip.transactions.reduce((s, t) => {
        try {
          return s + BigInt(t.ergNano);
        } catch {
          return s;
        }
      }, BigInt(0))
    : BigInt(0);

  return (
    <div className="w-full">
      <div className="canvas-container lumen-viz relative w-full bg-[#03040a] overflow-hidden rounded-2xl border border-white/10">
        <div className="absolute inset-0 w-full h-full min-h-[360px] md:min-h-[480px]">
          {data ? (
            <Canvas
              camera={{ position: [0, 3.2, 9], fov: 42 }}
              dpr={[1, 1.5]}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
              }}
              className="!absolute !inset-0 !h-full !w-full"
            >
              <ChainWorld feed={data} assemble={assemble} />
            </Canvas>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-widest text-[#A0A0B0]">
              {isLoading ? "LOADING LOCAL CHAIN…" : "CHAIN UNAVAILABLE"}
            </div>
          )}
        </div>

        {/* HUD */}
        <div className="pointer-events-none absolute inset-0 z-10 p-3 md:p-4 flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="glass rounded-2xl border border-white/10 px-3 py-2 max-w-[min(100%,320px)]">
              <div className="text-[9px] font-mono tracking-[0.22em] text-[#E8C48A] mb-1">
                CHAIN PULSE · LOCAL NODE
              </div>
              <div className="text-[11px] font-mono text-[#E8E8F0] tabular-nums">
                tip{" "}
                <span className="text-[#FF7A3D]">
                  {data?.tip?.height?.toLocaleString() ?? "—"}
                </span>
                {data?.indexedHeight != null && (
                  <span className="text-[#A0A0B0]">
                    {" "}
                    · idx {data.indexedHeight.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono text-[#A0A0B0] mt-0.5">
                {data?.source ?? "—"} · mempool {pendingN} tx · {tokenN} token
                trails
              </div>
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              className="pointer-events-auto glass rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white hover:border-white/25 transition-all"
            >
              {isFetching ? "SYNC…" : "REFRESH"}
            </button>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="glass rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-mono tracking-wide text-[#A0A0B0] max-w-[min(100%,380px)]">
              <div className="text-[#00E5FF]/90 mb-1 tracking-[0.18em]">
                LEGEND
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#FF7A3D] mr-1" />
                  ERG
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#5EFFD0] mr-1" />
                  tokens (color = id)
                </span>
                <span className="opacity-70">bright = mempool · dim = sealed</span>
              </div>
              <div className="mt-1.5 text-[9px] opacity-60">
                particles orbit → pull into block on new tip
              </div>
            </div>

            {data?.tip && (
              <div className="glass rounded-2xl border border-[#E8C48A]/25 px-3 py-2 text-[10px] font-mono text-right">
                <div className="text-[9px] tracking-[0.18em] text-[#E8C48A] mb-0.5">
                  TIP BLOCK
                </div>
                <div className="text-[#E8E8F0] tabular-nums">
                  {data.tip.txCount} tx · {formatErg(tipErg.toString())} ERG
                </div>
                <div className="text-[#A0A0B0] text-[9px] mt-0.5 truncate max-w-[200px]">
                  {data.tip.id.slice(0, 12)}…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status strip */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[10px] font-mono tracking-wider text-[#A0A0B0]">
        <span>
          {error
            ? `error: ${error instanceof Error ? error.message : "failed"}`
            : data
              ? `live · updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
              : "…"}
        </span>
        <span className="opacity-50">
          API /api/chain/feed · local ergonode
        </span>
      </div>
    </div>
  );
}
