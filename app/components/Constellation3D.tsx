"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Stars } from "@react-three/drei";
import * as THREE from "three";
import { Peer } from "../types/ergo";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlanetKind,
  PLANET_ARCHETYPES,
  kindFromAddress,
  seededFloat,
  getPlanetTextures,
  getRingTexture,
  getHomePlanetTextures,
} from "../lib/planet-textures";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface ConstellationProps {
  peers: Peer[];
  myNodeHeight: number;
  isOnline: boolean;
  onPeerHover?: (peer: Peer | null) => void;
  lastBlockHeight: number;
  onSimulateBlock?: () => void;
  hideControls?: boolean;
}

type PeerHoverFn = (peer: Peer | null, pos?: THREE.Vector3) => void;

type ControlsApi = {
  focus: () => void;
  setAutoOrbit: (on: boolean) => void;
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */

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

function boomEnvelope(propagationStart: number): number {
  if (propagationStart <= 0) return 0;
  const elapsed = (Date.now() - propagationStart) / 1000;
  if (elapsed > 2.2) return 0;
  return Math.max(0, 1 - elapsed / 2.0);
}

function getDeterministicPosition(address: string, index: number): THREE.Vector3 {
  const seed = hashString(address) + index * 37;
  const radius = 12 + (seed % 18);
  const phi = ((seed % 360) / 360) * Math.PI * 2;
  const theta = (((seed * 7) % 180) / 180) * Math.PI - Math.PI / 2;

  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(theta) * 0.55,
    radius * Math.sin(phi) * Math.cos(theta)
  );
}

// Shared geometries
const GEO_HI = new THREE.SphereGeometry(1, 64, 64);
const GEO_MD = new THREE.SphereGeometry(1, 32, 32);
const GEO_LO = new THREE.SphereGeometry(1, 24, 24);
const GEO_ATMOS = new THREE.SphereGeometry(1, 32, 32);
const GEO_RING = new THREE.RingGeometry(1.35, 2.15, 96);
const GEO_PARTICLE = new THREE.SphereGeometry(1, 10, 10);

// Flip ring UVs so texture maps radially (u along ring width)
(() => {
  const uv = GEO_RING.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    // RingGeometry: u around, v radial — we want radial as U for our texture
    uv.setXY(i, v, u);
  }
  uv.needsUpdate = true;
})();

/* ─── Atmosphere (Fresnel limb) ──────────────────────────────────────────── */

const atmosVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const atmosFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), uPower);
    float alpha = fresnel * uIntensity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function Atmosphere({
  color,
  scale = 1.08,
  intensity = 0.85,
  power = 2.6,
}: {
  color: string;
  scale?: number;
  intensity?: number;
  power?: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosVertex,
        fragmentShader: atmosFragment,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
          uPower: { value: power },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    [color, intensity, power]
  );

  useEffect(() => () => mat.dispose(), [mat]);

  return <mesh geometry={GEO_ATMOS} scale={scale} material={mat} />;
}

/* ─── Planet rings ──────────────────────────────────────────────────────── */

function PlanetRings({
  color,
  seed,
  scale = 1,
  tilt = 0.35,
}: {
  color: string;
  seed: number;
  scale?: number;
  tilt?: number;
}) {
  const tex = useMemo(() => getRingTexture(color, seed), [color, seed]);
  return (
    <mesh
      rotation={[Math.PI / 2 + tilt, 0.15, 0.2]}
      scale={scale}
      geometry={GEO_RING}
      renderOrder={1}
    >
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={0.9}
        side={THREE.DoubleSide}
        depthWrite={false}
        alphaTest={0.02}
      />
    </mesh>
  );
}

/* ─── Central home planet ───────────────────────────────────────────────── */

function HomePlanet({ isOnline, height }: { isOnline: boolean; height: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Mesh>(null!);
  const tex = useMemo(() => getHomePlanetTextures(), []);
  const arch = PLANET_ARCHETYPES.earthlike;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (bodyRef.current) {
      bodyRef.current.rotation.y = t * 0.06;
    }
    if (groupRef.current && isOnline) {
      groupRef.current.rotation.y = t * 0.012;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Soft fill light from planet */}
      <pointLight color="#FF9A6A" intensity={1.4} distance={40} decay={2} />
      <pointLight color="#88ccff" intensity={0.35} distance={30} decay={2} />

      <mesh ref={bodyRef} geometry={GEO_HI} scale={1.85} castShadow>
        <meshStandardMaterial
          map={tex.map}
          bumpMap={tex.bumpMap}
          bumpScale={arch.bumpScale * 1.4}
          roughness={0.68}
          metalness={0.06}
          envMapIntensity={0.4}
        />
      </mesh>

      <Atmosphere color="#7ec8ff" scale={2.05} intensity={1.05} power={2.4} />
      <Atmosphere color="#FF7A3D" scale={2.18} intensity={0.28} power={3.2} />

      <PlanetRings color="#e8d4c0" seed={4242} scale={1.85} tilt={0.42} />
      <PlanetRings color="#a8c8e0" seed={4243} scale={1.72} tilt={0.42} />

      <Html position={[0, -3.35, 0]} style={{ pointerEvents: "none" }} center>
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
  onHover,
  propagationStart,
}: {
  peer: Peer;
  position: THREE.Vector3;
  index: number;
  onHover: PeerHoverFn;
  propagationStart: number;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const address = peer.address || `peer-${index}`;
  const kind = useMemo(() => kindFromAddress(address), [address]);
  const arch = PLANET_ARCHETYPES[kind];

  const size = useMemo(() => {
    const t = seededFloat(address, "size");
    const [a, b] = arch.sizeMul;
    return a + t * (b - a);
  }, [address, arch.sizeMul]);

  const hasRings = useMemo(
    () => seededFloat(address, "rings") < arch.hasRingsChance,
    [address, arch.hasRingsChance]
  );

  const spin = useMemo(() => 0.04 + seededFloat(address, "spin") * 0.1, [address]);
  const tilt = useMemo(() => (seededFloat(address, "tilt") - 0.5) * 0.5, [address]);
  const texSeed = useMemo(() => hashString(address) % 97, [address]);

  // Share texture per kind+bucket (not unique per peer) for performance
  const tex = useMemo(
    () => getPlanetTextures(kind, 256, Math.floor(texSeed / 12)),
    [kind, texSeed]
  );

  const isActive = Date.now() - peerLastMs(peer.lastMessage) < 120_000;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const phase = index * 0.37;
    const boom = boomEnvelope(propagationStart);

    if (bodyRef.current) {
      bodyRef.current.rotation.y = t * spin;
    }
    if (groupRef.current) {
      const hoverBoost = hovered ? 1.12 : 1;
      const flash = boom > 0 ? 1 + boom * 0.08 : 1;
      groupRef.current.scale.setScalar(hoverBoost * flash);
      // tiny idle drift
      groupRef.current.position.x = position.x + Math.sin(t * 0.12 + phase) * 0.03;
      groupRef.current.position.y = position.y + Math.cos(t * 0.1 + phase) * 0.025;
      groupRef.current.position.z = position.z + Math.sin(t * 0.09 + phase) * 0.03;
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
    <group ref={groupRef} position={position} rotation={[tilt, 0, tilt * 0.4]}>
      <mesh
        ref={bodyRef}
        geometry={GEO_MD}
        scale={size}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={() => onHover(peer, position)}
      >
        <meshStandardMaterial
          map={tex.map}
          bumpMap={tex.bumpMap}
          bumpScale={arch.bumpScale}
          roughness={isActive ? arch.roughness : Math.min(0.95, arch.roughness + 0.15)}
          metalness={arch.metalness}
          color={isActive ? "#ffffff" : "#8890a0"}
          envMapIntensity={0.35}
        />
      </mesh>

      <Atmosphere
        color={arch.atmosphere}
        scale={size * 1.1}
        intensity={hovered ? 1.15 : isActive ? 0.8 : 0.4}
        power={2.5}
      />

      {hasRings && (
        <PlanetRings
          color={arch.ringColor}
          seed={texSeed + 3}
          scale={size}
          tilt={0.3 + seededFloat(address, "ringtilt") * 0.35}
        />
      )}
    </group>
  );
}

/* ─── Connection lines + signal packets ─────────────────────────────────── */

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
      pos[i * 6] = 0;
      pos[i * 6 + 1] = 0;
      pos[i * 6 + 2] = 0;
      pos[i * 6 + 3] = e.x;
      pos[i * 6 + 4] = e.y;
      pos[i * 6 + 5] = e.z;

      const active = activeFlags[i];
      // very soft: warm core → cool peer
      const c0 = active ? [0.85, 0.42, 0.22] : [0.2, 0.22, 0.28];
      const c1 = active ? [0.15, 0.65, 0.85] : [0.18, 0.2, 0.25];
      for (let k = 0; k < 3; k++) {
        col[i * 6 + k] = c0[k];
        col[i * 6 + 3 + k] = c1[k];
      }
    }
    return { positions: pos, colors: col };
  }, [ends, activeFlags]);

  useFrame((state) => {
    if (!lineRef.current) return;
    const mat = lineRef.current.material as THREE.LineBasicMaterial;
    const breath = 0.14 + Math.sin(state.clock.elapsedTime * 1.05) * 0.04;
    mat.opacity = Math.min(0.55, breath + boomEnvelope(propagationStart) * 0.35);
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
        opacity={0.18}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

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
    const count = Math.min(18, pick.length);
    return Array.from({ length: count }, (_, k) => {
      const i = pick[k % pick.length];
      return {
        end: ends[i],
        speed: 0.16 + (hashString(String(i)) % 40) / 220,
        phase: (hashString(`pkt-${i}-${k}`) % 1000) / 1000,
        size: 0.05 + (k % 3) * 0.012,
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
    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      const raw = (t * p.speed + p.phase) % 2;
      const u = raw < 1 ? raw : 2 - raw;
      const eased = u * u * (3 - 2 * u);
      dummy.position.set(p.end.x * eased, p.end.y * eased, p.end.z * eased);
      dummy.scale.setScalar(p.size * (1 + boom * 0.6));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.4 + boom * 0.3;
    color.set(boom > 0.15 ? "#FF7A3D" : "#8ecae6");
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
        color="#8ecae6"
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function TravelingParticle({
  start,
  end,
  duration,
  onComplete,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  duration: number;
  onComplete: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const startTime = useRef(Date.now());
  const done = useRef(false);

  useFrame(() => {
    if (!meshRef.current || done.current) return;
    const progress = Math.min((Date.now() - startTime.current) / 1000 / duration, 1);
    if (progress >= 1) {
      done.current = true;
      onComplete();
      return;
    }
    const eased = 1 - Math.pow(1 - progress, 3);
    meshRef.current.position.lerpVectors(start, end, eased);
    meshRef.current.scale.setScalar(0.18 + Math.sin(progress * Math.PI) * 0.22);
  });

  return (
    <mesh ref={meshRef} position={start} geometry={GEO_PARTICLE}>
      <meshBasicMaterial
        color="#FF7A3D"
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

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
    meshRef.current.scale.setScalar(1.5 + u * 26);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.12;
  });

  return (
    <mesh ref={meshRef} geometry={GEO_LO} visible={false}>
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

/* ─── Scene lighting (key + fill + rim for volume) ──────────────────────── */

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.18} />
      <hemisphereLight args={["#b8c8e0", "#0a0a12", 0.45]} />
      {/* Key sun */}
      <directionalLight
        position={[40, 30, 20]}
        intensity={1.65}
        color="#fff5e8"
        castShadow={false}
      />
      {/* Cool fill */}
      <directionalLight position={[-25, -10, -30]} intensity={0.35} color="#6a8cff" />
      {/* Rim */}
      <directionalLight position={[0, -20, 40]} intensity={0.25} color="#ffb080" />
    </>
  );
}

/* ─── World inside Canvas ───────────────────────────────────────────────── */

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
  const { gl } = useThree();

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl]);

  const peerData = useMemo(() => {
    return peers.map((peer, index) => {
      const address = peer.address || `peer-${index}`;
      return {
        peer,
        position: getDeterministicPosition(address, index),
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
        controlsRef.current.object.position.set(0, 24, 38);
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
    if (controlsRef.current) controlsRef.current.autoRotate = autoOrbit;
  }, [autoOrbit]);

  return (
    <>
      <color attach="background" args={["#020208"]} />
      <fog attach="fog" args={["#020208", 60, 130]} />

      <SceneLights />

      <Stars
        radius={240}
        depth={70}
        count={1100}
        factor={2.2}
        saturation={0}
        fade
        speed={0.2}
      />

      <HomePlanet isOnline={isOnline} height={myNodeHeight} />
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

      {peerData.map(({ peer, position }, index) => (
        <PeerPlanet
          key={peer.address || `peer-${index}`}
          peer={peer}
          position={position}
          index={index}
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
          onComplete={() => setParticles((prev) => prev.filter((x) => x.id !== p.id))}
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
        autoRotateSpeed={0.08}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
      />
    </>
  );
}

/* ─── Outer shell ───────────────────────────────────────────────────────── */

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
    return peers.map((peer, index) => ({
      peer,
      position: getDeterministicPosition(peer.address || `peer-${index}`, index),
    }));
  }, [peers]);

  const triggerBlockPropagation = useCallback(() => {
    if (peers.length === 0) return;
    setIsPropagating(true);
    setPropagationStart(Date.now());
    const n = Math.min(10, peerData.length);
    setParticles(
      Array.from({ length: n }, (_, i) => {
        const target = peerData[Math.floor(Math.random() * peerData.length)];
        return {
          id: Date.now() + i,
          start: new THREE.Vector3(0, 0, 0),
          end: target.position.clone(),
        };
      })
    );
    window.setTimeout(() => {
      setIsPropagating(false);
      setParticles([]);
    }, 2300);
  }, [peers, peerData]);

  useEffect(() => {
    if (lastBlockHeight > 0 && peers.length > 0) {
      const timer = window.setTimeout(() => triggerBlockPropagation(), 420);
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
      onPeerHover?.(peer);
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
        camera={{ position: [0, 24, 38], fov: 46 }}
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
                PEER PLANET
              </div>
              <div className="font-mono text-white break-all text-[13px] leading-tight mb-1">
                {hoveredPeer.name || hoveredPeer.address}
              </div>
              {hoveredPeer.name && (
                <div className="font-mono text-[#A0A0B0] text-[11px] break-all mb-2">
                  {hoveredPeer.address}
                </div>
              )}
              <div className="font-mono text-[10px] text-[#A0A0B0] mb-3 tracking-wider uppercase">
                {kindFromAddress(hoveredPeer.address || "")} world
              </div>
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

      <div className="hidden md:block absolute bottom-4 left-4 z-20 glass rounded-2xl px-4 py-3 text-[10px] font-mono tracking-widest border border-white/10">
        <div className="flex items-center gap-4 text-[#A0A0B0]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#FF7A3D]" /> YOUR PLANET
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#67E8F9]" /> PEER WORLDS
          </div>
        </div>
        <div className="text-[9px] text-[#A0A0B0]/60 mt-1.5">
          Drag · zoom · hover · F / O / B
        </div>
      </div>
    </>
  );
}

export default function Constellation3D(props: ConstellationProps) {
  return (
    <div className="w-full">
      <div className="canvas-container aether-viz relative w-full bg-[#020208] overflow-hidden">
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
        <span className="opacity-50">Pinch · drag · B boom</span>
      </div>
    </div>
  );
}

// silence unused import if tree-shaken oddly
void (0 as unknown as PlanetKind);
