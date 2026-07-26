"use client";

/**
 * Block Genesis — premium cinematic block-birth visualizer
 * Built on thin explorer feed: TX constellations → crystallize → seal → dock
 */

import React, {
  useRef,
  useMemo,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useQuery } from "@tanstack/react-query";
import type {
  ChainFeed,
  ChainParticle,
  ChainTxGroup,
} from "@/lib/chain";

/* ═══════════════════════════════════════════════════════════════════════════
   Soft textures & geometry
   ═══════════════════════════════════════════════════════════════════════════ */

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
  g.addColorStop(0.15, "rgba(255,255,255,0.8)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTex = new THREE.CanvasTexture(c);
  softTex.needsUpdate = true;
  return softTex;
}

const GEO_SPRITE = new THREE.PlaneGeometry(1, 1);
const GEO_NUCLEUS = new THREE.SphereGeometry(1, 24, 24);
const GEO_CRYSTAL = new THREE.IcosahedronGeometry(1, 1);
const GEO_DISC = new THREE.CylinderGeometry(1, 1, 0.1, 40);
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
    if (!d) {
      const n = Number(amount);
      if (n > 1e12) return (n / 1e9).toFixed(2) + "e9";
      return amount.length > 10 ? amount.slice(0, 8) + "…" : amount;
    }
    const n = Number(BigInt(amount)) / 10 ** d;
    if (n >= 1000) return n.toFixed(1);
    if (n >= 1) return n.toFixed(3);
    return n.toPrecision(3);
  } catch {
    return amount;
  }
}

/* ─── Sound ─────────────────────────────────────────────────────────────── */

function playSealSound() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;

    // Soft glass chime
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(990, now + 0.14);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.75);

    // Low seal thud
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(90, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(40, now + 0.35);
    g2.gain.setValueAtTime(0.0001, now + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.09, now + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.5);

    window.setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* silent */
  }
}

/* ─── Genesis phase machine ─────────────────────────────────────────────── */

/** 0..1 timeline of one seal cycle */
export type GenesisPhase = {
  /** overall 0 idle → 1 done */
  t: number;
  /** capture 0-1 */
  capture: number;
  /** crystallize 0-1 */
  crystal: number;
  /** seal material 0-1 */
  seal: number;
  /** dock to stack 0-1 */
  dock: number;
  active: boolean;
  tipId: string | null;
};

function phaseFromT(t: number, tipId: string | null): GenesisPhase {
  const x = Math.min(1, Math.max(0, t));
  return {
    t: x,
    capture: easeInOutCubic(Math.min(1, x / 0.32)),
    crystal: easeInOutCubic(Math.min(1, Math.max(0, (x - 0.22) / 0.38))),
    seal: easeInOutCubic(Math.min(1, Math.max(0, (x - 0.55) / 0.2))),
    dock: easeInOutCubic(Math.min(1, Math.max(0, (x - 0.72) / 0.28))),
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

/* ─── Shared selection bridge ───────────────────────────────────────────── */

type Selection =
  | { kind: "tx"; txId: string }
  | { kind: "block"; blockId: string; height: number }
  | null;

/* ─── TX Constellation nucleus + orbits ─────────────────────────────────── */

type TxSlot = {
  group: ChainTxGroup;
  home: THREE.Vector3;
  phase: number;
  speed: number;
};

function layoutTxHomes(groups: ChainTxGroup[], focusMode: boolean): TxSlot[] {
  const mem = groups.filter((g) => g.stage === "mempool" || g.pending);
  const sealed = groups.filter((g) => g.stage === "sealed" && !g.pending);
  // Prefer showing mempool constellations; a few sealed for context
  const show = [
    ...mem.slice(0, 14),
    ...sealed.slice(0, focusMode ? 4 : 8),
  ];
  return show.map((group, i) => {
    const n = show.length || 1;
    const ring = group.pending ? 4.2 : 2.35;
    const elev =
      (hash01(group.txId, 3) - 0.5) * (group.pending ? 2.4 : 1.1);
    const ang = (i / n) * Math.PI * 2 + hash01(group.txId, 1) * 0.4;
    return {
      group,
      home: new THREE.Vector3(
        Math.cos(ang) * ring,
        elev + (focusMode && group.pending ? 0.3 : 0),
        Math.sin(ang) * ring
      ),
      phase: hash01(group.txId, 7) * Math.PI * 2,
      speed: 0.15 + hash01(group.txId, 8) * 0.25,
    };
  });
}

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
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // One instanced mesh for all orbiting particles across TX groups
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
          localR: 0.28 + hash01(p.id, 2) * 0.55,
          localPhase: hash01(p.id, 3) * Math.PI * 2 + i,
          localSpeed: 0.8 + hash01(p.id, 4) * 1.4,
          elev: (hash01(p.id, 5) - 0.5) * 0.35,
        });
      });
    }
    return out;
  }, [slots, partsByTx]);

  const instRef = useRef<THREE.InstancedMesh>(null!);
  const count = flatParts.length;

  // World centers of each TX (updated each frame for particle parenting)
  const centers = useRef<Map<string, THREE.Vector3>>(new Map());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const camQ = state.camera.quaternion;
    const cap = genesis.capture;
    const cry = genesis.crystal;

    for (const s of slots) {
      const g = groupRefs.current.get(s.group.txId);
      if (!g) continue;

      // Home orbit drift
      const drift = s.home
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), t * s.speed * 0.15);
      drift.y = s.home.y + Math.sin(t * 0.5 + s.phase) * 0.12;

      // Capture: pull toward origin
      const target = drift.multiplyScalar(1 - cap * 0.92);
      // Crystallize: collapse further into core
      target.multiplyScalar(1 - cry * 0.85);

      g.position.lerp(target, 0.12);
      centers.current.set(s.group.txId, g.position.clone());

      // Fade nucleus as crystallize
      const nuc = g.children.find((c) => c.name === "nucleus") as THREE.Mesh;
      if (nuc) {
        const mat = nuc.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.85 * (1 - cry) * (s.group.pending ? 1 : 0.55));
        nuc.scale.setScalar(
          (selection?.kind === "tx" && selection.txId === s.group.txId
            ? 0.16
            : 0.11) *
            (1 + Math.sin(t * 2 + s.phase) * 0.06) *
            (1 - cry * 0.7)
        );
      }
      // Hide entire group when fully crystallized
      g.visible = cry < 0.98;
    }

    // Orbit particles around their TX center
    const mesh = instRef.current;
    if (!mesh || count === 0) return;
    for (let i = 0; i < count; i++) {
      const fp = flatParts[i];
      const center =
        centers.current.get(fp.txId) || new THREE.Vector3(0, 0, 0);
      const ang = fp.localPhase + t * fp.localSpeed;
      const localScale = 1 - cry * 0.95;
      const lr = fp.localR * localScale * (1 - cap * 0.3);
      const x = center.x + Math.cos(ang) * lr;
      const y = center.y + fp.elev * localScale;
      const z = center.z + Math.sin(ang) * lr;

      const size =
        (0.07 + fp.p.weight * 0.1) *
        (1 + Math.sin(t * 2.4 + fp.localPhase) * 0.08) *
        (1 - cry * 0.6) *
        (focusMode && fp.p.stage !== "focus" ? 0.85 : 1);

      dummy.position.set(x, y, z);
      dummy.quaternion.copy(camQ);
      dummy.scale.setScalar(Math.max(0.01, size));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.set(fp.p.color);
      color.multiplyScalar(
        (fp.p.pending ? 1.15 : 0.7) * (1 - cry * 0.4)
      );
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      {slots.map((s) => {
        const selected =
          selection?.kind === "tx" && selection.txId === s.group.txId;
        const accent = s.group.pending ? "#5EFFD0" : "#7AB8FF";
        return (
          <group
            key={s.group.txId}
            ref={(el) => {
              if (el) groupRefs.current.set(s.group.txId, el);
              else groupRefs.current.delete(s.group.txId);
            }}
            position={s.home}
          >
            {/* Soft nucleus */}
            <mesh
              name="nucleus"
              geometry={GEO_NUCLEUS}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                const w = new THREE.Vector3();
                e.object.getWorldPosition(w);
                onSelectTx(s.group.txId, w);
              }}
            >
              <meshBasicMaterial
                color={selected ? "#F0D4A0" : accent}
                transparent
                opacity={0.85}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            {/* Soft glow shell */}
            <mesh scale={2.4} geometry={GEO_SPRITE} renderOrder={1}>
              <meshBasicMaterial
                map={map}
                color={selected ? "#F0D4A0" : accent}
                transparent
                opacity={selected ? 0.45 : 0.22}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Fat invisible hit */}
            <mesh
              geometry={GEO_HIT}
              scale={0.45}
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

      {count > 0 && (
        <instancedMesh
          ref={instRef}
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
      )}
    </group>
  );
}

/* ─── Focus particles (address) ─────────────────────────────────────────── */

function FocusShell({
  particles,
  highlight,
}: {
  particles: ChainParticle[];
  highlight: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const map = useMemo(() => getSoftTex(), []);
  const focus = useMemo(
    () => particles.filter((p) => p.stage === "focus"),
    [particles]
  );
  const count = focus.length;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    const t = state.clock.elapsedTime;
    const camQ = state.camera.quaternion;
    for (let i = 0; i < count; i++) {
      const p = focus[i];
      const ang = hash01(p.id, 1) * Math.PI * 2 + t * (0.35 + hash01(p.id, 2) * 0.4);
      const R = 0.7 + hash01(p.id, 3) * 1.3;
      const y = 0.4 + (hash01(p.id, 4) - 0.5) * 1.2;
      // Gentle pull when highlighted
      const pull = highlight ? 0.85 : 1;
      dummy.position.set(
        Math.cos(ang) * R * pull,
        y,
        Math.sin(ang) * R * pull
      );
      dummy.quaternion.copy(camQ);
      dummy.scale.setScalar(
        (0.1 + p.weight * 0.12) * (1 + Math.sin(t * 2 + i) * 0.08)
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(p.color);
      color.multiplyScalar(highlight ? 1.35 : 1.1);
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
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

/* ─── Crystal block + dock ──────────────────────────────────────────────── */

function GenesisCrystal({
  genesis,
  stackHeights,
  tipHeight,
  tipId,
  onSelectBlock,
  selectedBlockId,
}: {
  genesis: GenesisPhase;
  stackHeights: number[];
  tipHeight: number | null;
  tipId: string | null;
  onSelectBlock: (id: string, height: number, world: THREE.Vector3) => void;
  selectedBlockId: string | null;
}) {
  const crystalRef = useRef<THREE.Mesh>(null!);
  const glassRef = useRef<THREE.MeshStandardMaterial>(null!);
  const dockGroup = useRef<THREE.Group>(null!);
  const map = useMemo(() => getSoftTex(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const cry = genesis.crystal;
    const seal = genesis.seal;
    const dock = genesis.dock;

    if (crystalRef.current) {
      // Grow during crystallize
      const grow = genesis.active
        ? 0.15 + cry * 0.95 + seal * 0.1
        : 1.05 + Math.sin(t * 1.3) * 0.02;
      crystalRef.current.scale.setScalar(grow);
      crystalRef.current.rotation.y = t * 0.2 + seal * 0.5;
      crystalRef.current.rotation.x = Math.sin(t * 0.3) * 0.08;
      crystalRef.current.visible = true;
    }

    if (glassRef.current) {
      // Frosted glass → metal on seal
      glassRef.current.metalness = 0.18 + seal * 0.55;
      glassRef.current.roughness = 0.22 + seal * 0.2;
      glassRef.current.opacity = 0.55 + cry * 0.25 + seal * 0.15;
      glassRef.current.emissiveIntensity = 0.4 + cry * 0.45 + seal * 0.35;
      glassRef.current.color.set(seal > 0.5 ? "#d4dde8" : "#a8bdd8");
    }

    if (dockGroup.current) {
      // New disc starts at core, docks into stack
      const startY = 0.1;
      const endY = -2.15;
      const y = THREE.MathUtils.lerp(startY, endY, dock);
      const s = THREE.MathUtils.lerp(0.2, 1, Math.min(1, dock * 1.4));
      dockGroup.current.position.y = y;
      dockGroup.current.scale.setScalar(
        genesis.active && dock > 0.01 ? s : 0.001
      );
      dockGroup.current.visible = genesis.active && dock > 0.01;
    }
  });

  return (
    <group>
      {/* Living crystal / tip core — frosted glass → metal */}
      <mesh ref={crystalRef} geometry={GEO_CRYSTAL}>
        <meshStandardMaterial
          ref={glassRef}
          color="#a8bdd8"
          emissive="#E8C48A"
          emissiveIntensity={0.45}
          metalness={0.25}
          roughness={0.22}
          transparent
          opacity={0.72}
        />
      </mesh>
      <mesh geometry={GEO_CRYSTAL} scale={1.02}>
        <meshBasicMaterial
          color="#E8C48A"
          wireframe
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={2.8} geometry={GEO_SPRITE} renderOrder={0}>
        <meshBasicMaterial
          map={map}
          color="#E8C48A"
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <pointLight color="#E8C48A" intensity={1.3} distance={12} />
      <pointLight
        color="#00E5FF"
        intensity={0.45}
        distance={9}
        position={[2, 1.5, 2]}
      />

      {/* Docking disc (new sealed block) */}
      <group ref={dockGroup}>
        <mesh geometry={GEO_DISC} scale={[1.2, 1, 1.2]}>
          <meshStandardMaterial
            color="#1c2436"
            emissive="#E8C48A"
            emissiveIntensity={0.55}
            metalness={0.7}
            roughness={0.28}
          />
        </mesh>
      </group>

      {/* Sealed stack */}
      <group position={[0, -2.35, 0]}>
        {stackHeights.map((h, i) => {
          const isTip = tipHeight != null && h === tipHeight && i === 0;
          const bid =
            i === 0 && tipId
              ? tipId
              : `h-${h}`;
          const selected = selectedBlockId === bid || (isTip && selectedBlockId === tipId);
          return (
            <mesh
              key={`${h}-${i}`}
              position={[0, -i * 0.24, 0]}
              geometry={GEO_DISC}
              scale={[1.18 - i * 0.035, 1, 1.18 - i * 0.035]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                const w = new THREE.Vector3();
                e.object.getWorldPosition(w);
                onSelectBlock(isTip && tipId ? tipId : bid, h, w);
              }}
            >
              <meshStandardMaterial
                color={selected ? "#2a384f" : isTip ? "#222c40" : "#121722"}
                emissive={selected ? "#F0D4A0" : isTip ? "#E8C48A" : "#3a5070"}
                emissiveIntensity={selected ? 0.55 : isTip ? 0.32 : 0.1}
                metalness={0.55}
                roughness={0.4}
                transparent
                opacity={0.9 - i * 0.07}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/* ─── Camera ────────────────────────────────────────────────────────────── */

function GenesisCamera({
  flyTo,
  genesis,
  focusMode,
  selected,
}: {
  flyTo: THREE.Vector3 | null;
  genesis: GenesisPhase;
  focusMode: boolean;
  selected: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const base = useMemo(
    () =>
      new THREE.Vector3(
        0,
        focusMode ? 2.8 : 3.6,
        focusMode ? 7.5 : 10
      ),
    [focusMode]
  );
  const fly = useRef<{
    active: boolean;
    t0: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    if (!flyTo) return;
    const to = flyTo
      .clone()
      .normalize()
      .multiplyScalar(3.2)
      .add(new THREE.Vector3(0, 1.1, 0))
      .add(flyTo.clone().multiplyScalar(0.35));
    // ensure not inside
    if (to.length() < 4) to.setLength(4.5);
    fly.current = {
      active: true,
      t0: performance.now(),
      from: camera.position.clone(),
      to,
      fromT: controlsRef.current?.target?.clone() ?? new THREE.Vector3(),
      toT: flyTo.clone(),
    };
  }, [flyTo, camera]);

  useFrame(() => {
    const f = fly.current;
    if (f?.active) {
      const u = easeInOutCubic(
        Math.min(1, (performance.now() - f.t0) / 1100)
      );
      camera.position.lerpVectors(f.from, f.to, u);
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(f.fromT, f.toT, u);
        controlsRef.current.update();
      }
      if (u >= 1) f.active = false;
      return;
    }

    // Cinematic breathe when idle
    if (!selected && !genesis.active) {
      const t = performance.now() / 1000;
      const target = base.clone();
      target.z += Math.sin(t * 0.2) * 0.2;
      target.y += Math.sin(t * 0.15) * 0.08;
      camera.position.lerp(target, 0.02);
    } else if (genesis.dock > 0.2) {
      // Slight pull back during dock
      const target = base.clone();
      target.z += 0.8 * genesis.dock;
      camera.position.lerp(target, 0.04);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={4}
      maxDistance={22}
      enableDamping
      dampingFactor={0.05}
      autoRotate={!selected && !focusMode && !genesis.active}
      autoRotateSpeed={0.22}
      target={[0, 0.05, 0]}
      maxPolarAngle={Math.PI * 0.85}
      minPolarAngle={0.2}
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
  focusMode,
}: {
  feed: ChainFeed;
  genesis: GenesisPhase;
  selection: Selection;
  setSelection: (s: Selection) => void;
  flyTarget: THREE.Vector3 | null;
  setFlyTarget: (v: THREE.Vector3 | null) => void;
  focusMode: boolean;
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
    (blockId: string, height: number, world: THREE.Vector3) => {
      setSelection({ kind: "block", blockId, height });
      setFlyTarget(world.clone());
    },
    [setSelection, setFlyTarget]
  );

  return (
    <>
      <color attach="background" args={["#01020a"]} />
      <fog attach="fog" args={["#01020a", 12, 36]} />
      <ambientLight intensity={0.18} color="#7a8aaa" />
      <directionalLight position={[5, 9, 4]} intensity={0.65} color="#fff6ec" />
      <directionalLight position={[-4, -2, -3]} intensity={0.15} color="#1a3060" />
      <Stars
        radius={80}
        depth={50}
        count={3800}
        factor={2.6}
        saturation={0.1}
        fade
        speed={0.1}
      />
      <mesh position={[-14, 5, -20]} scale={18}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color="#100828"
          transparent
          opacity={0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[12, -4, -18]} scale={14}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color="#051020"
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <GenesisCrystal
        genesis={genesis}
        stackHeights={stackHeights}
        tipHeight={feed.tip?.height ?? null}
        tipId={feed.tip?.id ?? null}
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

      <FocusShell
        particles={feed.particles}
        highlight={focusMode}
      />

      <GenesisCamera
        flyTo={flyTarget}
        genesis={genesis}
        focusMode={focusMode}
        selected={!!selection}
      />
    </>
  );
}

/* ─── HUD helpers ───────────────────────────────────────────────────────── */

function findTxGroup(feed: ChainFeed, txId: string): ChainTxGroup | null {
  return (feed.txGroups || []).find((g) => g.txId === txId) || null;
}

/* ─── Shell ─────────────────────────────────────────────────────────────── */

export default function ChainPulse() {
  const [addressInput, setAddressInput] = useState("");
  const [focusAddress, setFocusAddress] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [flyTarget, setFlyTarget] = useState<THREE.Vector3 | null>(null);
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

  // Seal cycle on new tip
  useEffect(() => {
    const id = data?.tip?.id ?? null;
    if (!id) return;
    if (prevTip.current && prevTip.current !== id) {
      if (soundOn) playSealSound();
      setGenesisTip(id);
      setGenesisT(0.001);
      const t0 = performance.now();
      const DUR = 3200;
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
  }, []);

  const focusMode = !!focusAddress && !!data?.focus;
  const selectedTx =
    data && selection?.kind === "tx"
      ? findTxGroup(data, selection.txId)
      : null;

  const mempoolN = (data?.txGroups || []).filter((g) => g.pending).length;
  const sealedN = (data?.txGroups || []).filter((g) => !g.pending).length;

  // Mobile / reduced motion: still render but simpler note
  const [webglOk, setWebglOk] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl =
        c.getContext("webgl") || c.getContext("experimental-webgl");
      setWebglOk(!!gl);
    } catch {
      setWebglOk(false);
    }
  }, []);

  return (
    <div className="w-full space-y-2.5">
      <div className="canvas-container lumen-viz relative w-full bg-[#01020a] overflow-hidden rounded-2xl border border-white/10">
        <div className="absolute inset-0 w-full h-full min-h-[420px] md:min-h-[560px]">
          {data && webglOk ? (
            <Canvas
              camera={{ position: [0, 3.6, 10], fov: 38 }}
              dpr={[1, 1.5]}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
                preserveDrawingBuffer: true,
              }}
              className="!absolute !inset-0 !h-full !w-full"
              onPointerMissed={() => clearSelection()}
            >
              <GenesisWorld
                feed={data}
                genesis={genesis}
                selection={selection}
                setSelection={setSelection}
                flyTarget={flyTarget}
                setFlyTarget={setFlyTarget}
                focusMode={focusMode}
              />
            </Canvas>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-mono text-[11px] tracking-widest text-[#A0A0B0] p-6 text-center">
              {isLoading
                ? "CRYSTALLIZING…"
                : !webglOk
                  ? "WebGL unavailable — use API /api/chain/feed"
                  : "CHAIN UNAVAILABLE"}
              {error && (
                <span className="text-[10px] opacity-60 max-w-md">
                  {error instanceof Error ? error.message : "error"}
                </span>
              )}
            </div>
          )}
        </div>

        {/* HUD */}
        <div className="pointer-events-none absolute inset-0 z-10 p-3 md:p-4 flex flex-col justify-between gap-2">
          {/* Top row */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="glass rounded-2xl border border-white/10 px-3.5 py-2.5 max-w-[min(100%,360px)]">
              <div className="text-[9px] font-mono tracking-[0.28em] text-[#E8C48A] mb-1">
                BLOCK GENESIS
              </div>
              <div className="text-[12px] font-mono text-[#E8E8F0] tabular-nums tracking-wide">
                tip{" "}
                <span className="text-[#FF7A3D]">
                  {data?.tip?.height?.toLocaleString() ?? "—"}
                </span>
                {data?.indexedHeight != null && (
                  <span className="text-[#A0A0B0]/70 text-[11px]">
                    {" "}
                    · idx {data.indexedHeight.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono text-[#A0A0B0] mt-1 tracking-wide">
                {mempoolN} tx constellations · {sealedN} sealed ·{" "}
                {data?.particles?.length ?? 0} particles
              </div>
              {genesis.active && (
                <div className="mt-1.5 h-0.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#5EFFD0] via-[#E8C48A] to-[#FF7A3D] transition-[width] duration-75"
                    style={{ width: `${Math.round(genesis.t * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => setSoundOn((v) => !v)}
                className="glass rounded-full border border-white/10 px-3 py-2 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white transition-colors"
              >
                {soundOn ? "♪" : "♩"}
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                className="glass rounded-full border border-white/10 px-3 py-2 text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white"
              >
                {isFetching ? "…" : "↻"}
              </button>
            </div>
          </div>

          {/* Address focus — minimal */}
          <div className="pointer-events-auto glass rounded-2xl border border-white/10 px-3 py-2 w-full max-w-[min(100%,400px)]">
            <div className="flex gap-2 items-center">
              <input
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFocus()}
                placeholder="address focus"
                spellCheck={false}
                className="lumen-search-input flex-1 min-w-0 bg-transparent outline-none border-0 text-[#E8E8F0] font-mono text-[12px] placeholder:text-[#A0A0B0]/40"
              />
              <button
                type="button"
                onClick={applyFocus}
                className="text-[10px] font-mono tracking-widest text-[#E8C48A] px-2"
              >
                FOCUS
              </button>
              {focusAddress && (
                <button
                  type="button"
                  onClick={clearFocus}
                  className="text-[10px] font-mono tracking-widest text-[#A0A0B0] px-1"
                >
                  ✕
                </button>
              )}
            </div>
            {focusMode && data?.focus && (
              <div className="mt-1.5 text-[10px] font-mono text-[#A0A0B0]">
                <span className="text-[#E8E8F0]">
                  {formatErg(data.focus.confirmed.nanoErgs)} ERG
                </span>
                {" · "}
                {data.focus.confirmed.tokens.length} tokens highlighted
              </div>
            )}
          </div>

          {/* Selection storyboard + timeline */}
          <div className="flex flex-wrap items-end justify-between gap-2">
            {selectedTx ? (
              <div className="pointer-events-auto glass rounded-2xl border border-[#E8C48A]/30 px-3.5 py-3 max-w-[min(100%,340px)] shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="text-[9px] font-mono tracking-[0.22em] text-[#E8C48A]">
                    TRANSACTION
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[10px] font-mono text-[#A0A0B0] hover:text-white"
                  >
                    CLOSE
                  </button>
                </div>
                <div className="text-[11px] font-mono text-[#E8E8F0] break-all mb-2">
                  {selectedTx.txId.slice(0, 18)}…
                </div>
                <div className="flex gap-3 text-[10px] font-mono text-[#A0A0B0] mb-2">
                  <span>
                    <span className="text-[#5EFFD0]">{selectedTx.inputs}</span>{" "}
                    in
                  </span>
                  <span>→</span>
                  <span>
                    <span className="text-[#E8C48A]">{selectedTx.outputs}</span>{" "}
                    out
                  </span>
                  <span className="text-[#FF7A3D]">
                    {formatErg(selectedTx.ergNano)} ERG
                  </span>
                </div>
                {selectedTx.tokens.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                    {selectedTx.tokens.slice(0, 10).map((t) => (
                      <span
                        key={t.tokenId}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[9px] font-mono"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: t.color }}
                        />
                        <span className="text-[#E8E8F0]">
                          {t.label || t.name || t.tokenId.slice(0, 6)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[9px] font-mono text-[#A0A0B0]/50 tracking-wider">
                  {selectedTx.pending ? "MEMPOOL CONSTELLATION" : "SEALED IN TIP"}
                </div>
              </div>
            ) : selection?.kind === "block" ? (
              <div className="pointer-events-auto glass rounded-2xl border border-[#7AB8FF]/30 px-3.5 py-3 max-w-[min(100%,300px)]">
                <div className="flex justify-between mb-1">
                  <div className="text-[9px] font-mono tracking-[0.22em] text-[#7AB8FF]">
                    BLOCK
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-[10px] font-mono text-[#A0A0B0]"
                  >
                    CLOSE
                  </button>
                </div>
                <div className="text-[13px] font-mono text-[#E8E8F0] tabular-nums">
                  #{selection.height.toLocaleString()}
                </div>
                <div className="text-[10px] font-mono text-[#A0A0B0] mt-0.5 break-all">
                  {selection.blockId.slice(0, 20)}…
                </div>
              </div>
            ) : (
              <div className="glass rounded-2xl border border-white/10 px-3 py-2 text-[9px] font-mono tracking-[0.16em] text-[#A0A0B0] max-w-[min(100%,360px)]">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[#5EFFD0]">TX CONSTELLATIONS</span>
                  <span className="opacity-40">→</span>
                  <span
                    className={
                      genesis.crystal > 0.1 ? "text-[#E8C48A]" : "opacity-50"
                    }
                  >
                    CRYSTALLIZE
                  </span>
                  <span className="opacity-40">→</span>
                  <span
                    className={
                      genesis.seal > 0.1 ? "text-[#FF7A3D]" : "opacity-50"
                    }
                  >
                    SEAL
                  </span>
                  <span className="opacity-40">→</span>
                  <span
                    className={
                      genesis.dock > 0.1 ? "text-[#7AB8FF]" : "opacity-50"
                    }
                  >
                    DOCK
                  </span>
                </div>
                <div className="mt-1.5 opacity-50 normal-case tracking-normal">
                  tap a soft nucleus · watch value crystallize into the chain
                </div>
              </div>
            )}

            {data?.tip && (
              <div className="glass rounded-2xl border border-white/10 px-3 py-2 text-[10px] font-mono text-right">
                <div className="text-[9px] tracking-[0.2em] text-[#E8C48A]/80">
                  TIP
                </div>
                <div className="text-[#E8E8F0] tabular-nums">
                  {data.tip.txCount} tx
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-0.5 text-[10px] font-mono tracking-wider text-[#A0A0B0]">
        <span>
          {error
            ? `error: ${error instanceof Error ? error.message : "failed"}`
            : data
              ? `genesis · ${new Date(dataUpdatedAt).toLocaleTimeString()}`
              : "…"}
        </span>
        <span className="opacity-45">
          thin explorer · /api/chain/feed · local node
        </span>
      </div>
    </div>
  );
}
