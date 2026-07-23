"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, Stars } from "@react-three/drei";
import * as THREE from "three";
import { Peer } from "../types/ergo";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface ConstellationProps {
  peers: Peer[];
  myNodeHeight: number;
  isOnline: boolean;
  onPeerHover?: (peer: Peer | null) => void;
  lastBlockHeight: number;
  onSimulateBlock?: () => void;
  /** Hide floating Boom/Focus while a parent modal is open */
  hideControls?: boolean;
}

interface PeerNodeProps {
  peer: Peer;
  position: THREE.Vector3;
  index: number;
  size: number;
  tint: THREE.Color;
  onHover: (peer: Peer | null, pos?: THREE.Vector3) => void;
  propagationStart: number;
}

interface TravelingParticleProps {
  start: THREE.Vector3;
  end: THREE.Vector3;
  duration: number;
  onComplete: () => void;
  color: string;
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

/** Ergo peer.lastMessage is usually already ms; accept seconds too. */
function peerLastMs(lm?: number): number {
  if (!lm) return 0;
  return lm > 1e12 ? lm : lm * 1000;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Soft boom envelope 1 → 0 over ~2s (no React state). */
function boomEnvelope(propagationStart: number): number {
  if (propagationStart <= 0) return 0;
  const elapsed = (Date.now() - propagationStart) / 1000;
  if (elapsed > 2.2) return 0;
  return Math.max(0, 1 - elapsed / 2.0);
}

/** Deterministic spherical position from address (stable across renders). */
function getDeterministicPosition(address: string, index: number): THREE.Vector3 {
  const seed = hashString(address) + index * 37;
  const radius = 11 + (seed % 19);
  const phi = ((seed % 360) / 360) * Math.PI * 2;
  const theta = (((seed * 7) % 180) / 180) * Math.PI - Math.PI / 2;

  const x = radius * Math.cos(phi) * Math.cos(theta);
  const y = radius * Math.sin(theta) * 0.55;
  const z = radius * Math.sin(phi) * Math.cos(theta);

  return new THREE.Vector3(x, y, z);
}

/** Soft planet tint from address hash — calm cyan / teal / indigo / soft rose. */
function peerTint(address: string): THREE.Color {
  const h = hashString(address);
  const palette = [
    new THREE.Color("#5EEAD4"),
    new THREE.Color("#67E8F9"),
    new THREE.Color("#93C5FD"),
    new THREE.Color("#A5B4FC"),
    new THREE.Color("#C4B5FD"),
    new THREE.Color("#FBCFE8"),
    new THREE.Color("#99F6E4"),
    new THREE.Color("#BAE6FD"),
  ];
  return palette[h % palette.length].clone();
}

function peerSize(address: string, index: number): number {
  const h = hashString(address + String(index));
  return 0.38 + ((h % 100) / 100) * 0.32; // 0.38 – 0.70
}

// Shared geometries (one alloc, reused)
const GEO_SPHERE = new THREE.SphereGeometry(1, 48, 48);
const GEO_SPHERE_LO = new THREE.SphereGeometry(1, 24, 24);
const GEO_RING = new THREE.RingGeometry(1, 1.08, 96);
const GEO_PARTICLE = new THREE.SphereGeometry(1, 12, 12);

/* ─── Central planet (YOUR NODE) ────────────────────────────────────────── */

function MyNode({ isOnline, height }: { isOnline: boolean; height: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const atmosRef = useRef<THREE.Mesh>(null!);
  const haloRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const breath = 1 + Math.sin(t * 0.85) * 0.035;

    if (coreRef.current) {
      coreRef.current.scale.setScalar(breath);
      coreRef.current.rotation.y = t * 0.08;
    }
    if (atmosRef.current) {
      atmosRef.current.scale.setScalar(breath * 1.12);
    }
    if (haloRef.current) {
      const h = 1.55 + Math.sin(t * 0.55) * 0.06;
      haloRef.current.scale.setScalar(h);
      const mat = haloRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.07 + Math.sin(t * 0.7) * 0.02;
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(2.1 + Math.sin(t * 0.45) * 0.12);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.09 + Math.sin(t * 0.5) * 0.025;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.04;
      ringRef.current.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.2) * 0.02;
    }
    if (groupRef.current && isOnline) {
      groupRef.current.rotation.y = t * 0.015;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Soft outer glow */}
      <mesh ref={glowRef} geometry={GEO_SPHERE_LO}>
        <meshBasicMaterial
          color="#FF7A3D"
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Atmosphere shell */}
      <mesh ref={atmosRef} geometry={GEO_SPHERE}>
        <meshBasicMaterial
          color="#FF9A6A"
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Halo rim */}
      <mesh ref={haloRef} geometry={GEO_SPHERE_LO}>
        <meshBasicMaterial
          color="#00E5FF"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Core planet */}
      <mesh ref={coreRef} geometry={GEO_SPHERE} scale={1.65}>
        <meshStandardMaterial
          color="#1a0f0c"
          emissive="#FF7A3D"
          emissiveIntensity={1.35}
          roughness={0.45}
          metalness={0.25}
        />
      </mesh>

      {/* Subtle highlight cap */}
      <mesh scale={1.66} rotation={[0.4, 0.6, 0]} geometry={GEO_SPHERE_LO}>
        <meshBasicMaterial
          color="#FFB088"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Thin orbital ring */}
      <mesh ref={ringRef} scale={2.85} geometry={GEO_RING}>
        <meshBasicMaterial
          color="#FF7A3D"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={2.95} rotation={[Math.PI / 2.35, 0.15, 0.4]} geometry={GEO_RING}>
        <meshBasicMaterial
          color="#00E5FF"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Soft point light from the planet */}
      <pointLight color="#FF7A3D" intensity={2.2} distance={48} decay={2} />
      <pointLight color="#00E5FF" intensity={0.45} distance={36} decay={2} />

      <Html position={[0, -3.15, 0]} style={{ pointerEvents: "none" }} center>
        <div className="text-center select-none">
          <div className="text-[#FF7A3D] text-[10px] font-mono tracking-[0.28em] uppercase opacity-90">
            Your Node
          </div>
          <div className="text-[#E8E8F0]/55 text-[10px] font-mono mt-0.5 tracking-wider">
            {height > 0 ? height.toLocaleString() : "—"}
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ─── Peer planet ───────────────────────────────────────────────────────── */

function PeerPlanet({
  peer,
  position,
  index,
  size,
  tint,
  onHover,
  propagationStart,
}: PeerNodeProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const lastSeen = Date.now() - peerLastMs(peer.lastMessage);
  const isActive = lastSeen < 120_000;
  const baseColor = useMemo(
    () => (isActive ? tint.clone() : new THREE.Color("#4B5568")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peer.address, isActive]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const phase = index * 0.37;
    const boom = boomEnvelope(propagationStart);
    const breath = 1 + Math.sin(t * 0.9 + phase) * (isActive ? 0.05 : 0.02);
    const hoverBoost = hovered ? 1.28 : 1;
    const flash = boom > 0 ? 1 + boom * 0.35 : 1;

    if (coreRef.current) {
      coreRef.current.scale.setScalar(size * breath * hoverBoost * flash);
      coreRef.current.rotation.y = t * (0.12 + (index % 5) * 0.02);
    }
    if (glowRef.current) {
      const g = size * (hovered ? 2.4 : 1.9) * (1 + boom * 0.5);
      glowRef.current.scale.setScalar(g);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (hovered ? 0.32 : isActive ? 0.14 : 0.06) + boom * 0.25;
    }
    if (groupRef.current) {
      groupRef.current.position.x = position.x + Math.sin(t * 0.15 + phase) * 0.04;
      groupRef.current.position.y = position.y + Math.cos(t * 0.12 + phase) * 0.03;
      groupRef.current.position.z = position.z + Math.sin(t * 0.11 + phase * 1.3) * 0.04;
    }
  });

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    onHover(peer, position);
    document.body.style.cursor = "pointer";
  };

  const handleOut = () => {
    setHovered(false);
    onHover(null);
    document.body.style.cursor = "default";
  };

  return (
    <group ref={groupRef} position={position}>
      <mesh ref={glowRef} geometry={GEO_SPHERE_LO} raycast={() => null}>
        <meshBasicMaterial
          color={baseColor}
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh
        ref={coreRef}
        geometry={GEO_SPHERE_LO}
        scale={size}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={() => onHover(peer, position)}
      >
        <meshStandardMaterial
          color={isActive ? "#0c1218" : "#0a0a0e"}
          emissive={baseColor}
          emissiveIntensity={hovered ? 1.6 : isActive ? 0.95 : 0.35}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>

      {hovered && (
        <mesh scale={size * 1.55} geometry={GEO_RING} rotation={[Math.PI / 2.2, 0.2, 0]}>
          <meshBasicMaterial
            color={baseColor}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/* ─── Connection lines (batched, pulsing) ───────────────────────────────── */

function ConnectionLines({
  ends,
  activeFlags,
  propagationStart,
}: {
  ends: THREE.Vector3[];
  activeFlags: boolean[];
  propagationStart: number;
}) {
  const lineRef = useRef<THREE.LineSegments>(null!);

  const { positions, colors } = useMemo(() => {
    const n = ends.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const e = ends[i];
      pos[i * 6 + 0] = 0;
      pos[i * 6 + 1] = 0;
      pos[i * 6 + 2] = 0;
      pos[i * 6 + 3] = e.x;
      pos[i * 6 + 4] = e.y;
      pos[i * 6 + 5] = e.z;

      const active = activeFlags[i];
      const c0 = active ? [1.0, 0.48, 0.24] : [0.25, 0.28, 0.35];
      const c1 = active ? [0.0, 0.9, 1.0] : [0.2, 0.24, 0.3];
      col[i * 6 + 0] = c0[0];
      col[i * 6 + 1] = c0[1];
      col[i * 6 + 2] = c0[2];
      col[i * 6 + 3] = c1[0];
      col[i * 6 + 4] = c1[1];
      col[i * 6 + 5] = c1[2];
    }
    return { positions: pos, colors: col };
  }, [ends, activeFlags]);

  useFrame((state) => {
    if (!lineRef.current) return;
    const mat = lineRef.current.material as THREE.LineBasicMaterial;
    const t = state.clock.elapsedTime;
    const breath = 0.22 + Math.sin(t * 1.15) * 0.06;
    const boom = boomEnvelope(propagationStart) * 0.55;
    mat.opacity = Math.min(0.85, breath + boom);
  });

  useEffect(() => {
    if (!lineRef.current) return;
    const geo = lineRef.current.geometry;
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeBoundingSphere();
  }, [positions, colors]);

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.28}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/* ─── Soft signal packets along a line ──────────────────────────────────── */

function SignalPackets({
  ends,
  activeFlags,
  propagationStart,
}: {
  ends: THREE.Vector3[];
  activeFlags: boolean[];
  propagationStart: number;
}) {
  const packets = useMemo(() => {
    const activeIdx = ends.map((_, i) => i).filter((i) => activeFlags[i]);
    const pick = activeIdx.length > 0 ? activeIdx : ends.map((_, i) => i);
    const count = Math.min(24, pick.length);
    return Array.from({ length: count }, (_, k) => {
      const i = pick[k % pick.length];
      return {
        end: ends[i],
        speed: 0.18 + (hashString(String(i)) % 40) / 200,
        phase: (hashString(`pkt-${i}-${k}`) % 1000) / 1000,
        size: 0.06 + (k % 3) * 0.015,
      };
    });
  }, [ends, activeFlags]);

  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    if (!meshRef.current || packets.length === 0) return;
    const t = state.clock.elapsedTime;
    const boom = boomEnvelope(propagationStart);
    const flash = 1 + boom * 0.8;

    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      const raw = (t * p.speed + p.phase) % 2;
      const u = raw < 1 ? raw : 2 - raw;
      const eased = u * u * (3 - 2 * u);
      dummy.position.set(p.end.x * eased, p.end.y * eased, p.end.z * eased);
      const s = p.size * flash * (0.7 + Math.sin(t * 3 + p.phase * 6) * 0.3);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;

    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.45 + boom * 0.35;
    color.set(boom > 0.15 ? "#FF7A3D" : "#7DD3FC");
    mat.color.copy(color);
  });

  if (packets.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[GEO_PARTICLE, undefined, packets.length]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color="#7DD3FC"
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/* ─── Boom traveling particles ──────────────────────────────────────────── */

function TravelingParticle({
  start,
  end,
  duration,
  onComplete,
  color,
}: TravelingParticleProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const startTime = useRef(Date.now());
  const done = useRef(false);

  useFrame(() => {
    if (!meshRef.current || done.current) return;
    const elapsed = (Date.now() - startTime.current) / 1000;
    const progress = Math.min(elapsed / duration, 1);

    if (progress >= 1) {
      done.current = true;
      onComplete();
      return;
    }

    const eased = 1 - Math.pow(1 - progress, 3);
    meshRef.current.position.lerpVectors(start, end, eased);
    const scale = 0.22 + Math.sin(progress * Math.PI) * 0.28;
    meshRef.current.scale.setScalar(scale);
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.95 * (1 - progress * 0.35);
  });

  return (
    <mesh ref={meshRef} position={start} geometry={GEO_PARTICLE}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ─── Boom radial flash (from center) ───────────────────────────────────── */

function BoomWave({ active, startMs }: { active: boolean; startMs: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (!meshRef.current) return;
    if (!active || startMs <= 0) {
      meshRef.current.visible = false;
      return;
    }
    const elapsed = (Date.now() - startMs) / 1000;
    if (elapsed > 1.8) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;
    const u = elapsed / 1.8;
    const r = 1.5 + u * 28;
    meshRef.current.scale.setScalar(r);
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (1 - u) * 0.18;
  });

  return (
    <mesh ref={meshRef} geometry={GEO_SPHERE_LO} visible={false}>
      <meshBasicMaterial
        color="#FF7A3D"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

/* ─── R3F world (must live under Canvas) ────────────────────────────────── */

type PeerHoverFn = (peer: Peer | null, pos?: THREE.Vector3) => void;

type ControlsApi = {
  focus: () => void;
  setAutoOrbit: (on: boolean) => void;
};

function ConstellationWorld({
  peers,
  myNodeHeight,
  isOnline,
  onPeerHover,
  isPropagating,
  propagationStart,
  particles,
  setParticles,
  autoOrbit,
  controlsApiRef,
}: {
  peers: Peer[];
  myNodeHeight: number;
  isOnline: boolean;
  onPeerHover: PeerHoverFn;
  isPropagating: boolean;
  propagationStart: number;
  particles: Array<{ id: number; start: THREE.Vector3; end: THREE.Vector3 }>;
  setParticles: React.Dispatch<
    React.SetStateAction<Array<{ id: number; start: THREE.Vector3; end: THREE.Vector3 }>>
  >;
  autoOrbit: boolean;
  controlsApiRef: React.MutableRefObject<ControlsApi | null>;
}) {
  const controlsRef = useRef<any>(null);

  const peerData = useMemo(() => {
    return peers.map((peer, index) => {
      const address = peer.address || `peer-${index}`;
      return {
        peer,
        position: getDeterministicPosition(address, index),
        size: peerSize(address, index),
        tint: peerTint(address),
        isActive: Date.now() - peerLastMs(peer.lastMessage) < 180_000,
      };
    });
  }, [peers]);

  const ends = useMemo(() => peerData.map((p) => p.position), [peerData]);
  const activeFlags = useMemo(() => peerData.map((p) => p.isActive), [peerData]);

  useEffect(() => {
    controlsApiRef.current = {
      focus: () => {
        if (!controlsRef.current) return;
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.object.position.set(0, 26, 40);
        controlsRef.current.autoRotate = false;
        controlsRef.current.update();
      },
      setAutoOrbit: (on: boolean) => {
        if (controlsRef.current) controlsRef.current.autoRotate = on;
      },
    };
    return () => {
      controlsApiRef.current = null;
    };
  }, [controlsApiRef]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoOrbit;
    }
  }, [autoOrbit]);

  return (
    <>
      <color attach="background" args={["#030308"]} />
      <fog attach="fog" args={["#030308", 55, 120]} />

      <ambientLight intensity={0.22} />
      <hemisphereLight args={["#1a2030", "#050508", 0.35]} />
      <pointLight position={[18, 32, 12]} intensity={0.35} color="#E8E8F0" />
      <pointLight position={[-28, -12, -30]} intensity={0.25} color="#3B82F6" />

      <Stars
        radius={220}
        depth={60}
        count={900}
        factor={2.4}
        saturation={0}
        fade
        speed={0.25}
      />

      <MyNode isOnline={isOnline} height={myNodeHeight} />
      <BoomWave active={isPropagating} startMs={propagationStart} />

      {ends.length > 0 && (
        <>
          <ConnectionLines
            ends={ends}
            activeFlags={activeFlags}
            propagationStart={propagationStart}
          />
          <SignalPackets
            ends={ends}
            activeFlags={activeFlags}
            propagationStart={propagationStart}
          />
        </>
      )}

      {peerData.map(({ peer, position, size, tint }, index) => (
        <PeerPlanet
          key={peer.address || `peer-${index}`}
          peer={peer}
          position={position}
          index={index}
          size={size}
          tint={tint}
          onHover={onPeerHover}
          propagationStart={propagationStart}
        />
      ))}

      {particles.map((p) => (
        <TravelingParticle
          key={p.id}
          start={p.start}
          end={p.end}
          duration={1.4}
          color="#FF7A3D"
          onComplete={() => {
            setParticles((prev) => prev.filter((x) => x.id !== p.id));
          }}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate
        minDistance={10}
        maxDistance={90}
        autoRotate={autoOrbit}
        autoRotateSpeed={0.1}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
      />
    </>
  );
}

/* ─── Outer shell (UI + Canvas) ─────────────────────────────────────────── */

function Scene({
  peers,
  myNodeHeight,
  isOnline,
  onPeerHover,
  lastBlockHeight,
  onSimulateBlock,
  hideControls = false,
}: ConstellationProps) {
  const controlsApiRef = useRef<ControlsApi | null>(null);
  const [hoveredPeer, setHoveredPeer] = useState<Peer | null>(null);
  const [hoveredPos, setHoveredPos] = useState<THREE.Vector3 | null>(null);
  const [isAutoOrbit, setIsAutoOrbit] = useState(true);
  const [isPropagating, setIsPropagating] = useState(false);
  const [propagationStart, setPropagationStart] = useState(0);
  const [particles, setParticles] = useState<
    Array<{ id: number; start: THREE.Vector3; end: THREE.Vector3 }>
  >([]);

  const peerData = useMemo(() => {
    return peers.map((peer, index) => {
      const address = peer.address || `peer-${index}`;
      return {
        peer,
        position: getDeterministicPosition(address, index),
      };
    });
  }, [peers]);

  const triggerBlockPropagation = useCallback(() => {
    if (peers.length === 0) return;

    setIsPropagating(true);
    setPropagationStart(Date.now());

    const pool = peerData;
    const n = Math.min(10, Math.max(1, pool.length));
    const newParticles = Array.from({ length: n }, (_, i) => {
      const target = pool[Math.floor(Math.random() * pool.length)] ?? pool[i % pool.length];
      return {
        id: Date.now() + i,
        start: new THREE.Vector3(0, 0, 0),
        end: target.position.clone(),
      };
    });

    setParticles(newParticles);

    window.setTimeout(() => {
      setIsPropagating(false);
      setParticles([]);
    }, 2300);
  }, [peers, peerData]);

  useEffect(() => {
    if (lastBlockHeight > 0 && peers.length > 0) {
      const timer = window.setTimeout(() => {
        triggerBlockPropagation();
      }, 420);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBlockHeight]);

  useEffect(() => {
    if (onSimulateBlock) {
      (window as any).__aetherSimulateBlock = triggerBlockPropagation;
    }
  }, [onSimulateBlock, triggerBlockPropagation]);

  const handlePeerHover = useCallback<PeerHoverFn>(
    (peer, pos) => {
      setHoveredPeer(peer);
      setHoveredPos(pos || null);
      if (onPeerHover) onPeerHover(peer);
    },
    [onPeerHover]
  );

  const focusOnMyNode = () => {
    controlsApiRef.current?.focus();
    setIsAutoOrbit(false);
  };

  const toggleAutoOrbit = () => {
    setIsAutoOrbit((v) => {
      const next = !v;
      controlsApiRef.current?.setAutoOrbit(next);
      return next;
    });
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "f") focusOnMyNode();
      if (e.key.toLowerCase() === "o") toggleAutoOrbit();
      if (e.key.toLowerCase() === "b" && onSimulateBlock) triggerBlockPropagation();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSimulateBlock, triggerBlockPropagation]);

  return (
    <>
      <Canvas
        camera={{ position: [0, 26, 40], fov: 46 }}
        className="!absolute !inset-0 !h-full !w-full"
        style={{ width: "100%", height: "100%", display: "block" }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
        dpr={[1, 1.75]}
        gl={{
          alpha: false,
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        }}
      >
        <ConstellationWorld
          peers={peers}
          myNodeHeight={myNodeHeight}
          isOnline={isOnline}
          onPeerHover={handlePeerHover}
          isPropagating={isPropagating}
          propagationStart={propagationStart}
          particles={particles}
          setParticles={setParticles}
          autoOrbit={isAutoOrbit}
          controlsApiRef={controlsApiRef}
        />
      </Canvas>

      {/* Mobile controls */}
      {!hideControls && (
        <div className="md:hidden absolute top-0 inset-x-0 z-20 flex items-start justify-between gap-2 p-2.5 pointer-events-none">
          {onSimulateBlock && (
            <button
              type="button"
              onClick={triggerBlockPropagation}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono tracking-wider border border-[#FF7A3D]/50 bg-[#0A0A0F]/90 text-[#FF7A3D] shadow-lg backdrop-blur-md active:scale-[0.97]"
            >
              ✧ BOOM
            </button>
          )}
          <button
            type="button"
            onClick={focusOnMyNode}
            className="pointer-events-auto ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono tracking-wider border border-white/20 bg-[#0A0A0F]/90 text-[#E8E8F0] shadow-lg backdrop-blur-md active:scale-[0.97]"
          >
            FOCUS
          </button>
        </div>
      )}

      {/* Desktop controls */}
      {!hideControls && (
        <div className="hidden md:flex absolute top-4 right-4 z-20 flex-col gap-2">
          <button
            type="button"
            onClick={toggleAutoOrbit}
            className="btn-cinematic glass px-4 py-2 rounded-xl text-xs font-mono tracking-widest border border-white/10 hover:border-[#FF7A3D]/40 flex items-center gap-2 transition-all active:scale-[0.985]"
          >
            <span className={isAutoOrbit ? "text-[#FF7A3D]" : "text-[#A0A0B0]"}>◉</span>
            {isAutoOrbit ? "AUTO ORBIT ON" : "AUTO ORBIT OFF"}
          </button>

          <button
            type="button"
            onClick={focusOnMyNode}
            className="btn-cinematic glass px-4 py-2 rounded-xl text-xs font-mono tracking-widest border border-white/10 hover:border-[#00E5FF]/40 flex items-center gap-2 transition-all active:scale-[0.985]"
          >
            FOCUS ON MY NODE
          </button>

          {onSimulateBlock && (
            <button
              type="button"
              onClick={triggerBlockPropagation}
              className="btn-cinematic glass px-4 py-2 rounded-xl text-xs font-mono tracking-[2px] bg-[#FF7A3D]/10 border border-[#FF7A3D]/30 hover:bg-[#FF7A3D]/20 text-[#FF7A3D] flex items-center gap-2 transition-all active:scale-[0.985]"
            >
              ✧ SIMULATE BLOCK WAVE
            </button>
          )}
        </div>
      )}

      {/* Hover tooltip */}
      <AnimatePresence>
        {hoveredPeer && hoveredPos && (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: `calc(50% + ${hoveredPos.x * 1.8}px)`,
              top: `calc(45% - ${hoveredPos.y * 1.6}px)`,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              className="glass rounded-2xl px-5 py-4 text-sm min-w-[220px] border border-white/10"
            >
              <div className="font-mono text-[#00E5FF] text-xs tracking-[2px] mb-1">
                PEER NODE
              </div>
              <div className="font-mono text-white break-all text-[13px] leading-tight mb-3">
                {hoveredPeer.name || hoveredPeer.address}
              </div>
              {hoveredPeer.name && (
                <div className="font-mono text-[#A0A0B0] text-[11px] break-all mb-3 -mt-2">
                  {hoveredPeer.address}
                </div>
              )}

              <div className="flex justify-between text-xs">
                <div>
                  <span className="text-[#A0A0B0]">LAST SEEN</span>
                  <br />
                  <span className="font-mono text-white">
                    {Math.floor(
                      (Date.now() - peerLastMs(hoveredPeer.lastMessage)) / 1000
                    )}
                    s ago
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[#A0A0B0]">STATUS</span>
                  <br />
                  <span
                    className={
                      Date.now() - peerLastMs(hoveredPeer.lastMessage) < 120000
                        ? "text-[#10B981]"
                        : "text-[#F59E0B]"
                    }
                  >
                    {Date.now() - peerLastMs(hoveredPeer.lastMessage) < 120000
                      ? "ACTIVE"
                      : "STALE"}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Legend — desktop */}
      <div className="hidden md:block absolute bottom-4 left-4 z-20 glass rounded-2xl px-4 py-3 text-[10px] font-mono tracking-widest border border-white/10">
        <div className="flex items-center gap-4 text-[#A0A0B0]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#FF7A3D]" /> YOUR NODE
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#67E8F9]" /> PEERS
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#4B5568]" /> STALE
          </div>
        </div>
        <div className="text-[9px] text-[#A0A0B0]/60 mt-1.5">
          Drag to orbit · Scroll to zoom · Hover peers · F / O / B
        </div>
      </div>
    </>
  );
}

export default function Constellation3D(props: ConstellationProps) {
  return (
    <div className="w-full">
      <div className="canvas-container aether-viz relative w-full bg-[#030308] overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <Scene {...props} />
        </div>
      </div>
      <div className="md:hidden mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10px] font-mono tracking-wider text-[#A0A0B0]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#FF7A3D]" /> YOU
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#67E8F9]" /> PEERS
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#4B5568]" /> STALE
        </span>
        <span className="opacity-50">Pinch · drag · B boom</span>
      </div>
    </div>
  );
}
