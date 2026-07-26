"use client";

/**
 * Chain Pulse — cinematic local-chain visualization
 * 1) Address focus  2) Token names  3) Timeline stages  4) Polish
 */

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import type {
  ChainFeed,
  ChainParticle,
  ParticleStage,
} from "@/lib/chain";

/* ─── Soft sprite ───────────────────────────────────────────────────────── */

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
  g.addColorStop(0.18, "rgba(255,255,255,0.75)");
  g.addColorStop(0.48, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTex = new THREE.CanvasTexture(c);
  softTex.needsUpdate = true;
  return softTex;
}

const GEO_SPRITE = new THREE.PlaneGeometry(1, 1);
const GEO_CORE = new THREE.IcosahedronGeometry(1, 1);
const GEO_DISC = new THREE.CylinderGeometry(1, 1, 0.08, 32);

function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/* ─── Soft block chime (WebAudio, no asset file) ────────────────────────── */

function playSealChime() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
    window.setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* autoplay policy / silent */
  }
}

/* ─── Data ──────────────────────────────────────────────────────────────── */

async function fetchFeed(address: string | null): Promise<ChainFeed> {
  const q = new URLSearchParams({
    blocks: "6",
    mempool: "40",
  });
  if (address) q.set("address", address);
  const res = await fetch(`/api/chain/feed?${q}`, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `feed ${res.status}`);
  }
  return res.json();
}

/* ─── Scene: sealed block stack (timeline history) ──────────────────────── */

function SealedStack({
  heights,
  tipHeight,
}: {
  heights: number[];
  tipHeight: number | null;
}) {
  const group = useRef<THREE.Group>(null!);
  useFrame((s) => {
    if (group.current) {
      group.current.rotation.y = s.clock.elapsedTime * 0.04;
    }
  });

  // stack behind / below main core
  return (
    <group ref={group} position={[0, -2.35, -0.4]}>
      {heights.map((h, i) => {
        const y = -i * 0.22;
        const isTip = tipHeight != null && h === tipHeight;
        return (
          <mesh
            key={`${h}-${i}`}
            position={[0, y, 0]}
            geometry={GEO_DISC}
            scale={[1.15 - i * 0.04, 1, 1.15 - i * 0.04]}
          >
            <meshStandardMaterial
              color={isTip ? "#2a3348" : "#151a24"}
              emissive={isTip ? "#E8C48A" : "#3d5a80"}
              emissiveIntensity={isTip ? 0.35 : 0.12}
              metalness={0.5}
              roughness={0.45}
              transparent
              opacity={0.85 - i * 0.08}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ─── Scene: tip block core ─────────────────────────────────────────────── */

function BlockCore({ pulse }: { pulse: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const haloRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.18;
      meshRef.current.rotation.x = Math.sin(t * 0.22) * 0.1;
      const s = 1.08 + pulse * 0.18 + Math.sin(t * 1.5) * 0.025;
      meshRef.current.scale.setScalar(s);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.4;
      ringRef.current.rotation.x = Math.PI / 2.15;
      ringRef.current.scale.setScalar(1.65 + pulse * 0.55);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.18 + pulse * 0.4;
    }
    if (haloRef.current) {
      haloRef.current.scale.setScalar(2.4 + pulse * 0.8 + Math.sin(t * 1.2) * 0.05);
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.06 + pulse * 0.12;
    }
    if (matRef.current) {
      matRef.current.emissiveIntensity =
        0.5 + pulse * 1.1 + Math.sin(t * 2.2) * 0.06;
    }
  });

  return (
    <group position={[0, 0.15, 0]}>
      <mesh ref={haloRef} geometry={GEO_SPRITE} renderOrder={0}>
        <meshBasicMaterial
          map={getSoftTex()}
          color="#E8C48A"
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={meshRef} geometry={GEO_CORE}>
        <meshStandardMaterial
          ref={matRef}
          color="#141c2a"
          emissive="#E8C48A"
          emissiveIntensity={0.55}
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>
      <mesh geometry={GEO_CORE} scale={1.025}>
        <meshBasicMaterial
          color="#E8C48A"
          wireframe
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[1.12, 1.2, 72]} />
        <meshBasicMaterial
          color="#00E5FF"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight color="#E8C48A" intensity={1.4 + pulse} distance={14} />
      <pointLight
        color="#00E5FF"
        intensity={0.55}
        distance={10}
        position={[2.2, 1.2, 2]}
      />
    </group>
  );
}

/* ─── Particles by stage ────────────────────────────────────────────────── */

type Slot = {
  p: ChainParticle;
  phase: number;
  speed: number;
  radius: number;
  elev: number;
  orbit: number;
};

function stageRadius(stage: ParticleStage, base: number): number {
  switch (stage) {
    case "mempool":
      return 3.6 + base * 2.8;
    case "assembling":
      return 1.6 + base * 1.1;
    case "sealed":
      return 1.35 + base * 0.55;
    case "focus":
      return 0.55 + base * 1.4;
    default:
      return 3 + base * 2;
  }
}

function TokenParticles({
  particles,
  assemble,
  focusMode,
}: {
  particles: ChainParticle[];
  assemble: number;
  focusMode: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const map = useMemo(() => getSoftTex(), []);
  const count = particles.length;

  const slots = useMemo<Slot[]>(
    () =>
      particles.map((p) => ({
        p,
        phase: hash01(p.id, 1) * Math.PI * 2,
        speed: 0.2 + hash01(p.id, 2) * 0.65,
        radius: hash01(p.id, 3),
        elev: (hash01(p.id, 4) - 0.5) * 2.4,
        orbit: hash01(p.id, 5) * Math.PI * 2,
      })),
    [particles]
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    const t = state.clock.elapsedTime;
    const camQ = state.camera.quaternion;
    const a = THREE.MathUtils.clamp(assemble, 0, 1);
    const ease = a * a * (3 - 2 * a);

    for (let i = 0; i < count; i++) {
      const s = slots[i];
      let stage = s.p.stage;
      // During assemble pulse, mempool particles pull inward
      if (a > 0.02 && stage === "mempool") stage = "assembling";

      const R = stageRadius(stage, s.radius);
      const spd =
        s.speed *
        (stage === "mempool" ? 1 : stage === "focus" ? 0.55 : 0.35) *
        (focusMode && stage !== "focus" ? 0.45 : 1);

      const ang = s.orbit + t * spd;
      const breathe = 1 + Math.sin(t * 2.2 + s.phase) * 0.07;

      let ox = Math.cos(ang) * R;
      let oy = s.elev * (stage === "sealed" ? 0.35 : 0.85);
      let oz = Math.sin(ang) * R;

      // Focus shell sits a bit higher
      if (stage === "focus") {
        oy += 0.35;
      }

      // Assemble: pull non-focus toward core
      if (stage === "assembling" || (a > 0 && s.p.pending)) {
        const pull = stage === "assembling" ? ease : ease * 0.5;
        ox *= 1 - pull * 0.88;
        oy *= 1 - pull * 0.88;
        oz *= 1 - pull * 0.88;
      }

      // Dim non-focus when address focused
      const focusDim =
        focusMode && stage !== "focus" ? 0.28 : 1;

      const size =
        (0.09 + s.p.weight * 0.13) *
        breathe *
        (s.p.pending ? 1.05 : 0.88) *
        (stage === "focus" ? 1.15 : 1) *
        (1 - (stage === "assembling" ? ease * 0.25 : 0));

      dummy.position.set(ox, oy, oz);
      dummy.quaternion.copy(camQ);
      dummy.scale.setScalar(Math.max(0.02, size));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.set(s.p.color);
      let mul =
        (s.p.pending ? 1.2 : stage === "sealed" ? 0.65 : 0.9) * focusDim;
      if (stage === "focus") mul *= 1.25;
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
        opacity={0.92}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

/* ─── Cinematic camera ──────────────────────────────────────────────────── */

function CinematicRig({
  assemble,
  focusMode,
}: {
  assemble: number;
  focusMode: boolean;
}) {
  const { camera } = useThree();
  const base = useMemo(
    () => new THREE.Vector3(0, focusMode ? 2.6 : 3.4, focusMode ? 7.2 : 9.2),
    // only reset when focus toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusMode]
  );

  useEffect(() => {
    camera.position.copy(base);
    camera.lookAt(0, 0, 0);
  }, [camera, base]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const breathe = Math.sin(t * 0.22) * 0.18;
    const dolly = assemble * 0.55;
    const target = base.clone();
    target.z -= breathe + dolly;
    target.y += assemble * 0.15;
    camera.position.lerp(target, 0.04);
  });

  return (
    <OrbitControls
      enablePan={false}
      minDistance={4.5}
      maxDistance={20}
      enableDamping
      dampingFactor={0.055}
      autoRotate={!focusMode && assemble < 0.15}
      autoRotateSpeed={0.28}
      target={[0, 0.1, 0]}
      maxPolarAngle={Math.PI * 0.82}
      minPolarAngle={0.25}
    />
  );
}

function ChainWorld({
  feed,
  assemble,
  focusMode,
}: {
  feed: ChainFeed;
  assemble: number;
  focusMode: boolean;
}) {
  const stackHeights = useMemo(
    () => feed.recent.map((b) => b.height).slice(0, 6),
    [feed.recent]
  );

  return (
    <>
      <color attach="background" args={["#02030a"]} />
      <fog attach="fog" args={["#02030a", 14, 38]} />
      <ambientLight intensity={0.2} color="#6a7a9a" />
      <directionalLight position={[6, 8, 4]} intensity={0.55} color="#fff4e8" />
      <Stars
        radius={70}
        depth={45}
        count={3200}
        factor={2.8}
        saturation={0.12}
        fade
        speed={0.12}
      />
      {/* Depth nebula */}
      <mesh position={[-12, 4, -18]} scale={16}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color="#12082a"
          transparent
          opacity={0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[14, -3, -16]} scale={12}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color="#061428"
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <SealedStack
        heights={stackHeights}
        tipHeight={feed.tip?.height ?? null}
      />
      <BlockCore pulse={assemble} />
      <TokenParticles
        particles={feed.particles}
        assemble={assemble}
        focusMode={focusMode}
      />
      <CinematicRig assemble={assemble} focusMode={focusMode} />
    </>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

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

function formatAmt(amount: string, decimals?: number | null): string {
  try {
    const d = decimals ?? 0;
    if (!d) return amount;
    const n = Number(BigInt(amount)) / 10 ** d;
    if (n >= 1000) return n.toFixed(1);
    if (n >= 1) return n.toFixed(3);
    return n.toPrecision(3);
  } catch {
    return amount;
  }
}

/* ─── Shell ─────────────────────────────────────────────────────────────── */

export default function ChainPulse() {
  const [addressInput, setAddressInput] = useState("");
  const [focusAddress, setFocusAddress] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  const { data, error, isLoading, dataUpdatedAt, refetch, isFetching } =
    useQuery({
      queryKey: ["chain-feed", focusAddress || ""],
      queryFn: () => fetchFeed(focusAddress),
      refetchInterval: 4000,
      staleTime: 2000,
    });

  const [assemble, setAssemble] = useState(0);
  const prevTip = useRef<string | null>(null);

  useEffect(() => {
    const id = data?.tip?.id ?? null;
    if (!id) return;
    if (prevTip.current && prevTip.current !== id) {
      if (soundOn) playSealChime();
      setAssemble(1);
      const t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / 2400);
        const wave = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6;
        setAssemble(Math.max(0, wave));
        if (u < 1) raf = requestAnimationFrame(tick);
        else setAssemble(0);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    prevTip.current = id;
  }, [data?.tip?.id, soundOn]);

  const applyFocus = useCallback(() => {
    const a = addressInput.trim();
    if (!a) {
      setFocusAddress(null);
      return;
    }
    setFocusAddress(a);
  }, [addressInput]);

  const clearFocus = useCallback(() => {
    setAddressInput("");
    setFocusAddress(null);
  }, []);

  const pendingN = data?.mempool?.length ?? 0;
  const mempoolParts =
    data?.particles?.filter((p) => p.stage === "mempool").length ?? 0;
  const sealedParts =
    data?.particles?.filter((p) => p.stage === "sealed").length ?? 0;
  const focusParts =
    data?.particles?.filter((p) => p.stage === "focus").length ?? 0;

  const tipErg = data?.tip
    ? data.tip.transactions.reduce((s, t) => {
        try {
          return s + BigInt(t.ergNano);
        } catch {
          return s;
        }
      }, BigInt(0))
    : BigInt(0);

  const focusMode = !!focusAddress && !!data?.focus;

  return (
    <div className="w-full space-y-2.5">
      <div className="canvas-container lumen-viz relative w-full bg-[#02030a] overflow-hidden rounded-2xl border border-white/10">
        <div className="absolute inset-0 w-full h-full min-h-[400px] md:min-h-[520px]">
          {data ? (
            <Canvas
              camera={{ position: [0, 3.4, 9.2], fov: 40 }}
              dpr={[1, 1.5]}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
              }}
              className="!absolute !inset-0 !h-full !w-full"
            >
              <ChainWorld
                feed={data}
                assemble={assemble}
                focusMode={focusMode}
              />
            </Canvas>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-widest text-[#A0A0B0]">
              {isLoading ? "LOADING LOCAL CHAIN…" : "CHAIN UNAVAILABLE"}
            </div>
          )}
        </div>

        {/* HUD top */}
        <div className="pointer-events-none absolute inset-0 z-10 p-3 md:p-4 flex flex-col justify-between gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="glass rounded-2xl border border-white/10 px-3 py-2 max-w-[min(100%,340px)]">
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
                mempool {pendingN} tx · particles {data?.particles?.length ?? 0}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => setSoundOn((v) => !v)}
                className="glass rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white"
              >
                {soundOn ? "SOUND ON" : "SOUND OFF"}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="glass rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white"
              >
                {isFetching ? "SYNC…" : "REFRESH"}
              </button>
            </div>
          </div>

          {/* Address focus */}
          <div className="pointer-events-auto glass rounded-2xl border border-white/10 px-3 py-2.5 w-full max-w-[min(100%,420px)]">
            <div className="text-[9px] font-mono tracking-[0.18em] text-[#00E5FF]/90 mb-1.5">
              ADDRESS FOCUS
            </div>
            <div className="flex gap-2">
              <input
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFocus();
                }}
                placeholder="paste Ergo address…"
                spellCheck={false}
                className="lumen-search-input flex-1 min-w-0 bg-transparent outline-none border-0 text-[#E8E8F0] font-mono text-[12px] placeholder:text-[#A0A0B0]/45"
              />
              <button
                type="button"
                onClick={applyFocus}
                className="shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-mono tracking-widest border border-[#E8C48A]/35 text-[#E8C48A] hover:bg-[#E8C48A]/10"
              >
                FOCUS
              </button>
              {focusAddress && (
                <button
                  type="button"
                  onClick={clearFocus}
                  className="shrink-0 px-2 py-1.5 rounded-xl text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white"
                >
                  CLEAR
                </button>
              )}
            </div>
            {focusMode && data?.focus && (
              <div className="mt-2 text-[10px] font-mono text-[#A0A0B0] space-y-0.5">
                <div className="text-[#E8E8F0]">
                  {formatErg(data.focus.confirmed.nanoErgs)} ERG ·{" "}
                  {data.focus.confirmed.tokens.length} tokens · {focusParts}{" "}
                  focus particles
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 max-h-[4.5rem] overflow-y-auto">
                  {data.focus.confirmed.tokens.slice(0, 12).map((t) => (
                    <span key={t.tokenId} className="text-[9px]">
                      <span style={{ color: "#5EFFD0" }}>
                        {t.name || t.tokenId.slice(0, 6)}
                      </span>
                      <span className="opacity-50">
                        {" "}
                        {formatAmt(t.amount, t.decimals)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom: timeline + tip */}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="glass rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-mono tracking-wide text-[#A0A0B0] max-w-[min(100%,400px)]">
              <div className="text-[#E8C48A]/90 mb-1.5 tracking-[0.18em]">
                TIMELINE
              </div>
              <div className="flex flex-wrap gap-2 mb-1.5">
                <StageChip
                  label="MEMPOOL"
                  n={mempoolParts}
                  color="#5EFFD0"
                  active
                />
                <span className="opacity-40 self-center">→</span>
                <StageChip
                  label="ASSEMBLE"
                  n={assemble > 0.05 ? mempoolParts : 0}
                  color="#E8C48A"
                  active={assemble > 0.05}
                />
                <span className="opacity-40 self-center">→</span>
                <StageChip
                  label="SEALED"
                  n={sealedParts}
                  color="#7AB8FF"
                  active
                />
                {focusMode && (
                  <>
                    <span className="opacity-40 self-center">·</span>
                    <StageChip
                      label="FOCUS"
                      n={focusParts}
                      color="#F0D4A0"
                      active
                    />
                  </>
                )}
              </div>
              <div className="text-[9px] opacity-55 leading-relaxed">
                outer orbit = mempool · pull on new tip · stack = recent blocks
                {focusMode ? " · focus shell = address tokens" : ""}
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
                  {data.tip.id.slice(0, 14)}…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[10px] font-mono tracking-wider text-[#A0A0B0]">
        <span>
          {error
            ? `error: ${error instanceof Error ? error.message : "failed"}`
            : data
              ? `live · ${new Date(dataUpdatedAt).toLocaleTimeString()}`
              : "…"}
        </span>
        <span className="opacity-50">
          names cached · local ergonode · /api/chain/*
        </span>
      </div>
    </div>
  );
}

function StageChip({
  label,
  n,
  color,
  active,
}: {
  label: string;
  n: number;
  color: string;
  active?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] tracking-wider ${
        active ? "border-white/15 bg-white/[0.04]" : "border-white/5 opacity-40"
      }`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label}
      <span className="tabular-nums opacity-70">{n}</span>
    </span>
  );
}
