"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { Peer } from "../types/ergo";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlanetKind,
  PLANET_ARCHETYPES,
  kindFromAddress,
  seededFloat,
  preloadAllTextures,
  getTextureAtlas,
  getPlanetTexture,
  getSunTexture,
  getRingTexture,
} from "../lib/planet-textures";
import {
  createAmbienceController,
  type AmbienceController,
  type AmbienceMode,
} from "../lib/space-ambience";
import NodeMapSearch, { type SearchableNode } from "./NodeMapSearch";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface ConstellationProps {
  peers: Peer[];
  myNodeHeight: number;
  isOnline: boolean;
  onPeerHover?: (peer: Peer | null) => void;
  lastBlockHeight: number;
  onSimulateBlock?: () => void;
  hideControls?: boolean;
  /** @deprecated Sun no longer shows a name caption; kept for API compat */
  centerLabel?: string;
}

type PeerHoverFn = (peer: Peer | null, pos?: THREE.Vector3) => void;

type ControlsApi = {
  /** Reset camera to default overview of the sun */
  focus: () => void;
  /** Smooth fly to a peer planet (by address key) + accent it */
  focusPeer: (address: string) => void;
  clearPeerFocus: () => void;
  setAutoOrbit: (on: boolean) => void;
  setOrbitSpeed: (speed: number) => void;
};

/** Shared HUD panel width — left search & right controls stay symmetric */
const HUD_PANEL_W = "w-[min(280px,32vw)]";
const HUD_CARD =
  "glass rounded-2xl border border-white/10 px-4 py-3 w-full box-border";
const HUD_BTN =
  "glass w-full h-11 px-4 rounded-2xl text-[11px] font-mono tracking-widest border border-white/10 hover:border-white/25 flex items-center justify-center gap-2 transition-all active:scale-[0.985] box-border";

/** Base galaxy spin (rad/s at 1.0×). Visible without being frantic. */
const GALAXY_BASE_SPEED = 0.12;

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
  // Wider orbits so sun reads as a star and planets get a real terminator
  const radius = 14 + (seed % 22);
  const phi = ((seed % 360) / 360) * Math.PI * 2;
  const theta = (((seed * 7) % 180) / 180) * Math.PI - Math.PI / 2;

  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(theta) * 0.48,
    radius * Math.sin(phi) * Math.cos(theta)
  );
}

/** Parse peer address → SearchableNode for premium search UI */
function peerToSearchable(peer: Peer, index: number): SearchableNode {
  const address = peer.address || `peer-${index}`;
  const m = address.match(/(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?/);
  const active = Date.now() - peerLastMs(peer.lastMessage) < 120_000;
  return {
    id: address,
    ip: m?.[1] || address.replace(/^\//, ""),
    port: m?.[2] || null,
    name: peer.name || address.replace(/^\//, ""),
    city: peer.connectionType || undefined,
    country: undefined,
    state: active ? "connected" : "seen",
    version: null,
    lat: 0,
    lon: 0,
  };
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Ease-in-out cubic — smoother camera ease */
function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// Shared geometries
const GEO_SUN = new THREE.SphereGeometry(1, 96, 96);
const GEO_HI = new THREE.SphereGeometry(1, 64, 64);
const GEO_MD = new THREE.SphereGeometry(1, 48, 48);
const GEO_LO = new THREE.SphereGeometry(1, 24, 24);
const GEO_ATMOS = new THREE.SphereGeometry(1, 48, 48);
const GEO_RING = new THREE.RingGeometry(1.45, 2.35, 128);
const GEO_PARTICLE = new THREE.SphereGeometry(1, 10, 10);

// Ring UVs: map radial to U for saturn ring strip
(() => {
  const uv = GEO_RING.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, v, u);
  }
  uv.needsUpdate = true;
})();

/* ─── Subtle natural atmosphere (not neon) ──────────────────────────────── */

const atmosVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const atmosFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    float ndv = max(dot(normalize(vNormalW), normalize(vViewW)), 0.0);
    // Thin limb haze — physically soft, low intensity
    float fresnel = pow(1.0 - ndv, uPower);
    float alpha = fresnel * uIntensity;
    // desaturate slightly so it never reads as "glow stick"
    vec3 col = mix(uColor, vec3(0.85, 0.88, 0.95), 0.25);
    gl_FragColor = vec4(col, alpha);
  }
`;

function Atmosphere({
  color,
  scale = 1.06,
  intensity = 0.35,
  power = 3.2,
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
        blending: THREE.NormalBlending,
      }),
    [color, intensity, power]
  );

  useEffect(() => () => mat.dispose(), [mat]);

  if (intensity < 0.03) return null;
  return <mesh geometry={GEO_ATMOS} scale={scale} material={mat} />;
}

/* ─── Real sun pulse: body expands, corona is volumetric + noisy ─────────── */

const sunBodyVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const sunBodyFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uPulse; // 0.92–1.12 physical brightness + surface life
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Slow surface churn — living photosphere
    vec2 uv = vUv + vec2(uTime * 0.008, uTime * 0.002);
    vec3 tex = texture2D(uMap, uv).rgb;
    float mu = max(dot(normalize(vNormal), normalize(vView)), 0.0);
    float limb = 0.55 + 0.45 * pow(mu, 0.6);
    // Peak of pulse = hotter core, not just brighter overlay
    float heat = mix(0.88, 1.18, (uPulse - 0.92) / 0.2);
    vec3 col = tex * vec3(1.05, 0.95, 0.78) * limb * heat;
    col += vec3(0.15, 0.08, 0.02) * pow(mu, 2.0) * uPulse;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const coronaVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPos = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Volumetric-ish corona: fresnel + radial falloff + cheap noise that breathes
const coronaFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uPulse;   // physical expansion factor
  uniform float uShell;   // 0 near / 1 far shell character
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vPos;

  // 3D value noise (cheap)
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    float ndv = max(dot(N, V), 0.0);

    // Soft shell — thicker when pulse high (star expanding)
    float power = mix(2.8, 2.1, (uPulse - 0.92) / 0.2);
    float rim = pow(1.0 - ndv, power);

    // Turbulent corona streamers (rotate slowly)
    float ang = uTime * 0.15;
    vec3 np = vPos * (2.2 - uShell * 0.6);
    np.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * np.xz;
    float n = noise(np + vec3(0.0, uTime * 0.25, 0.0));
    n += 0.5 * noise(np * 2.3 - uTime * 0.18);
    n = smoothstep(0.25, 0.85, n);

    // Real volume: density higher near surface, thins outward (uShell)
    float density = rim * mix(0.9, 0.45, uShell);
    density *= mix(0.55, 1.15, n);           // structure
    density *= mix(0.75, 1.25, uPulse - 0.1); // brighter & denser at peak

    float a = density * uIntensity;
    a = clamp(a, 0.0, 0.85);

    // Color shifts hotter (whiter-yellow) when expanded
    vec3 hot = mix(uColor, vec3(1.0, 0.92, 0.7), 0.35 * (uPulse - 0.92) / 0.2);
    vec3 col = mix(hot * 0.7, hot * 1.2, n * rim);

    gl_FragColor = vec4(col, a);
  }
`;

function Sun({
  map,
}: {
  isOnline: boolean;
  height: number;
  map: THREE.Texture;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Mesh>(null!);
  const coronaNearRef = useRef<THREE.Mesh>(null!);
  const coronaFarRef = useRef<THREE.Mesh>(null!);

  const bodyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: sunBodyVertex,
        fragmentShader: sunBodyFragment,
        uniforms: {
          uMap: { value: map },
          uTime: { value: 0 },
          uPulse: { value: 1 },
        },
      }),
    [map]
  );

  const coronaNearMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: coronaVertex,
        fragmentShader: coronaFragment,
        uniforms: {
          uColor: { value: new THREE.Color("#ff9a3a") },
          uIntensity: { value: 1.15 },
          uTime: { value: 0 },
          uPulse: { value: 1 },
          uShell: { value: 0.0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const coronaFarMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: coronaVertex,
        fragmentShader: coronaFragment,
        uniforms: {
          uColor: { value: new THREE.Color("#ffc878") },
          uIntensity: { value: 0.55 },
          uTime: { value: 0 },
          uPulse: { value: 1 },
          uShell: { value: 1.0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useEffect(
    () => () => {
      bodyMat.dispose();
      coronaNearMat.dispose();
      coronaFarMat.dispose();
    },
    [bodyMat, coronaNearMat, coronaFarMat]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Organic multi-harmonic heart of a star (period ~4–8s)
    const breath =
      1.0 +
      Math.sin(t * 0.72) * 0.055 +
      Math.sin(t * 0.41 + 1.1) * 0.035 +
      Math.sin(t * 0.23 + 0.6) * 0.02;
    // Map to physical pulse 0.92–1.12
    const pulse = 0.92 + (breath - 0.89) * 1.4;
    const p = THREE.MathUtils.clamp(pulse, 0.92, 1.14);

    if (bodyRef.current) {
      bodyRef.current.rotation.y = t * 0.035;
      // REAL expansion of the star body
      bodyRef.current.scale.setScalar(2.05 * p);
    }
    bodyMat.uniforms.uTime.value = t;
    bodyMat.uniforms.uPulse.value = p;

    // Corona expands MORE than the body — true breathing envelope
    const nearScale = 2.45 * (0.94 + (p - 0.92) * 2.4);
    const farScale = 3.4 * (0.92 + (p - 0.92) * 3.2);
    if (coronaNearRef.current) coronaNearRef.current.scale.setScalar(nearScale);
    if (coronaFarRef.current) coronaFarRef.current.scale.setScalar(farScale);

    coronaNearMat.uniforms.uTime.value = t;
    coronaFarMat.uniforms.uTime.value = t;
    coronaNearMat.uniforms.uPulse.value = p;
    coronaFarMat.uniforms.uPulse.value = p;
    // Density rides the same pulse
    coronaNearMat.uniforms.uIntensity.value = 0.95 + (p - 0.92) * 2.2;
    coronaFarMat.uniforms.uIntensity.value = 0.4 + (p - 0.92) * 1.6;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coronaFarRef} geometry={GEO_ATMOS} material={coronaFarMat} />
      <mesh ref={coronaNearRef} geometry={GEO_ATMOS} material={coronaNearMat} />
      <mesh ref={bodyRef} geometry={GEO_SUN} material={bodyMat} />
    </group>
  );
}

/* ─── Saturn-style rings ────────────────────────────────────────────────── */

function SaturnRings({
  scale = 1,
  tilt = 0.45,
  ringMap,
}: {
  scale?: number;
  tilt?: number;
  ringMap: THREE.Texture;
}) {
  return (
    <mesh
      rotation={[Math.PI / 2 + tilt, 0.05, 0.1]}
      scale={scale}
      geometry={GEO_RING}
      renderOrder={2}
    >
      <meshBasicMaterial
        map={ringMap}
        transparent
        opacity={0.95}
        side={THREE.DoubleSide}
        depthWrite={false}
        alphaTest={0.04}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ─── Peer planet — always textured (file or procedural) ────────────────── */

function PeerPlanet({
  peer,
  position,
  index,
  onHover,
  propagationStart,
  map,
  ringMap,
  focused = false,
}: {
  peer: Peer;
  position: THREE.Vector3;
  index: number;
  onHover: PeerHoverFn;
  propagationStart: number;
  map: THREE.Texture;
  ringMap: THREE.Texture;
  /** Premium search focus — champagne accent, not status colors */
  focused?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Mesh>(null!);
  const focusRingRef = useRef<THREE.Mesh>(null!);
  const focusRing2Ref = useRef<THREE.Mesh>(null!);
  const focusRing3Ref = useRef<THREE.Mesh>(null!);
  const focusGlowRef = useRef<THREE.Mesh>(null!);
  const focusPulseRef = useRef<THREE.Mesh>(null!);
  const focusLightRef = useRef<THREE.PointLight>(null!);
  const [hovered, setHovered] = useState(false);

  const address = peer.address || `peer-${index}`;
  const kind = useMemo(() => kindFromAddress(address), [address]);
  const arch = PLANET_ARCHETYPES[kind];

  const size = useMemo(() => {
    const t = seededFloat(address, "size");
    const [a, b] = arch.sizeMul;
    return a + t * (b - a);
  }, [address, arch.sizeMul]);

  // Visible self-rotation (independent of galaxy orbit)
  const spin = useMemo(() => 0.25 + seededFloat(address, "spin") * 0.55, [address]);
  const tilt = useMemo(() => (seededFloat(address, "tilt") - 0.5) * 0.4, [address]);
  const ringTilt = useMemo(
    () => 0.35 + seededFloat(address, "ringtilt") * 0.25,
    [address]
  );

  const isActive = Date.now() - peerLastMs(peer.lastMessage) < 120_000;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const phase = index * 0.37;
    const boom = boomEnvelope(propagationStart);

    if (bodyRef.current) bodyRef.current.rotation.y = t * spin;
    if (groupRef.current) {
      const hoverBoost = hovered ? 1.06 : 1;
      // Stronger pop so the found world is obvious at a glance
      const focusBoost = focused ? 1.22 : 1;
      const flash = boom > 0 ? 1 + boom * 0.04 : 1;
      groupRef.current.scale.setScalar(hoverBoost * focusBoost * flash);
      groupRef.current.position.x = position.x + Math.sin(t * 0.24 + phase) * 0.02;
      groupRef.current.position.y = position.y + Math.cos(t * 0.21 + phase) * 0.015;
      groupRef.current.position.z = position.z + Math.sin(t * 0.18 + phase) * 0.02;
    }

    if (!focused) return;

    // Soft core glow
    if (focusGlowRef.current) {
      const g = 1.35 + Math.sin(t * 2.4) * 0.12;
      focusGlowRef.current.scale.setScalar(size * g);
      (focusGlowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.22 + Math.sin(t * 2.4) * 0.08;
    }

    // Expanding sonar pulse (loops)
    if (focusPulseRef.current) {
      const cycle = (t * 0.55) % 1;
      const s = size * (1.6 + cycle * 3.2);
      focusPulseRef.current.scale.setScalar(s);
      (focusPulseRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.45 * (1 - cycle);
    }

    // Triple champagne rings — thick, bright, counter-rotating
    if (focusRingRef.current) {
      const pulse = 1 + Math.sin(t * 2.6) * 0.08;
      focusRingRef.current.scale.setScalar(size * 1.75 * pulse);
      focusRingRef.current.rotation.x = Math.PI / 2;
      focusRingRef.current.rotation.z = t * 0.55;
      (focusRingRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.92 + Math.sin(t * 2.6) * 0.08;
    }
    if (focusRing2Ref.current) {
      const pulse2 = 1 + Math.sin(t * 2.6 + 0.9) * 0.1;
      focusRing2Ref.current.scale.setScalar(size * 2.45 * pulse2);
      focusRing2Ref.current.rotation.x = Math.PI / 2.15;
      focusRing2Ref.current.rotation.z = -t * 0.4;
      (focusRing2Ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.7 + Math.sin(t * 2.6 + 0.9) * 0.12;
    }
    if (focusRing3Ref.current) {
      const pulse3 = 1 + Math.sin(t * 2.0 + 1.6) * 0.12;
      focusRing3Ref.current.scale.setScalar(size * 3.15 * pulse3);
      focusRing3Ref.current.rotation.x = Math.PI / 1.9;
      focusRing3Ref.current.rotation.z = t * 0.28;
      (focusRing3Ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.4 + Math.sin(t * 2.0 + 1.6) * 0.12;
    }

    if (focusLightRef.current) {
      focusLightRef.current.intensity = 2.4 + Math.sin(t * 2.4) * 0.6;
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

  // Never multiply map by a Color — that caused washed-out / white look.
  // Stale peers get a slight darkening via material color only as gray multiplier < 1.
  // Focused: lift brightness so the world reads as "selected" without cyan status confusion.
  const colorMul = focused
    ? isActive
      ? 1.18
      : 1.05
    : isActive
      ? hovered
        ? 1.05
        : 1.0
      : 0.78;

  return (
    <group ref={groupRef} position={position} rotation={[tilt, 0, tilt * 0.35]}>
      <mesh
        ref={bodyRef}
        geometry={GEO_MD}
        scale={size}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={() => onHover(peer, position)}
      >
        <meshBasicMaterial
          map={map}
          color={new THREE.Color(colorMul, colorMul, colorMul)}
          toneMapped={false}
        />
      </mesh>

      <Atmosphere
        color={focused ? "#FFE9B0" : arch.atmosphere}
        scale={size * (focused ? 1.28 : 1.05)}
        intensity={
          (focused
            ? 1.55
            : hovered
              ? arch.atmosphereIntensity * 0.7
              : arch.atmosphereIntensity * 0.45) * (isActive || focused ? 1 : 0.55)
        }
        power={focused ? 2.1 : 3.8}
      />

      {focused && (
        <>
          {/* Soft volumetric-style core */}
          <mesh ref={focusGlowRef}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial
              color="#F5E6C8"
              transparent
              opacity={0.25}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Expanding sonar shell */}
          <mesh ref={focusPulseRef}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshBasicMaterial
              color="#E8C97A"
              transparent
              opacity={0.35}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              wireframe={false}
              side={THREE.BackSide}
            />
          </mesh>

          {/* Inner bright ring */}
          <mesh ref={focusRingRef} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.92, 1.12, 80]} />
            <meshBasicMaterial
              color="#FFF6D8"
              transparent
              opacity={0.95}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Mid gold ring */}
          <mesh ref={focusRing2Ref} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.94, 1.1, 80]} />
            <meshBasicMaterial
              color="#E8C97A"
              transparent
              opacity={0.75}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Outer halo ring */}
          <mesh ref={focusRing3Ref} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.96, 1.08, 80]} />
            <meshBasicMaterial
              color="#F5E6C8"
              transparent
              opacity={0.45}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          <pointLight
            ref={focusLightRef}
            color="#F5E6C8"
            intensity={2.6}
            distance={28}
            decay={2}
          />
        </>
      )}

      {arch.hasRings && (
        <SaturnRings scale={size} tilt={ringTilt} ringMap={ringMap} />
      )}
    </group>
  );
}

/* ─── Connection lines (unchanged style — do not redesign) ──────────────── */

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
    const progress = Math.min(
      (Date.now() - startTime.current) / 1000 / duration,
      1
    );
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
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.08;
  });

  return (
    <mesh ref={meshRef} geometry={GEO_LO} visible={false}>
      <meshBasicMaterial
        color="#ffd9a0"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

/* ─── Minimal lights (planets are meshBasic / unlit — lights for lines only) */

function SceneLights() {
  return (
    <>
      {/* Keep a soft fill so any residual standard materials (rings fallback) read */}
      <ambientLight intensity={1.0} color="#ffffff" />
      <hemisphereLight args={["#ffffff", "#404050", 0.6]} />
      {/* Camera-facing key: always lights whatever the viewer looks at */}
      <CameraFacingLight />
    </>
  );
}

/** Directional light that follows the camera — "light from the viewer" */
function CameraFacingLight() {
  const ref = useRef<THREE.DirectionalLight>(null!);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    ref.current.position.copy(camera.position);
    ref.current.target.position.set(0, 0, 0);
    ref.current.target.updateMatrixWorld();
  });
  return (
    <directionalLight ref={ref} intensity={0.85} color="#ffffff" />
  );
}

/* ─── World ─────────────────────────────────────────────────────────────── */

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
  orbitSpeed,
  controlsApiRef,
  peerHovered = false,
  focusAddress = null,
  onFocusAddressChange,
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
  /** Multiplier 0.1–5 for galaxy spin */
  orbitSpeed: number;
  controlsApiRef: React.MutableRefObject<ControlsApi | null>;
  /** When true, galaxy spin eases to a stop (read peer tooltip) */
  peerHovered?: boolean;
  /** Address of planet selected via search */
  focusAddress?: string | null;
  onFocusAddressChange?: (address: string | null) => void;
}) {
  const controlsRef = useRef<any>(null);
  const galaxyRef = useRef<THREE.Group>(null!);
  const orbitOnRef = useRef(autoOrbit);
  const orbitSpeedRef = useRef(orbitSpeed);
  /** Smooth 0..1 multiplier — eases out on planet hover, eases in on leave */
  const orbitFactorRef = useRef(autoOrbit ? 1 : 0);
  const peerHoveredRef = useRef(peerHovered);
  const focusAddressRef = useRef(focusAddress);
  const onFocusAddressChangeRef = useRef(onFocusAddressChange);
  const { gl, camera } = useThree();
  const [atlas, setAtlas] = useState<ReturnType<typeof getTextureAtlas> | null>(
    null
  );
  const [texTick, setTexTick] = useState(0);

  type FlyState = {
    t0: number;
    dur: number;
    cam0: THREE.Vector3;
    cam1: THREE.Vector3;
    tgt0: THREE.Vector3;
    tgt1: THREE.Vector3;
  };
  const flyRef = useRef<FlyState | null>(null);
  const peerDataRef = useRef<
    Array<{ peer: Peer; position: THREE.Vector3; address: string }>
  >([]);

  useEffect(() => {
    orbitOnRef.current = autoOrbit;
  }, [autoOrbit]);
  useEffect(() => {
    orbitSpeedRef.current = orbitSpeed;
  }, [orbitSpeed]);
  useEffect(() => {
    peerHoveredRef.current = peerHovered;
  }, [peerHovered]);
  useEffect(() => {
    focusAddressRef.current = focusAddress;
  }, [focusAddress]);
  useEffect(() => {
    onFocusAddressChangeRef.current = onFocusAddressChange;
  }, [onFocusAddressChange]);

  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    gl.toneMappingExposure = 1;
    gl.outputColorSpace = THREE.SRGBColorSpace;

    let alive = true;
    const initial = getTextureAtlas();
    setAtlas(initial);
    preloadAllTextures().then((result) => {
      if (!alive) return;
      setAtlas(getTextureAtlas());
      setTexTick((n) => n + 1);
      console.info("[Lumen] texture preload done", result.status);
    });
    return () => {
      alive = false;
    };
  }, [gl]);

  const peerData = useMemo(() => {
    return peers.map((peer, index) => {
      const address = peer.address || `peer-${index}`;
      return {
        peer,
        address,
        position: getDeterministicPosition(address, index),
        isActive: Date.now() - peerLastMs(peer.lastMessage) < 180_000,
        kind: kindFromAddress(address),
      };
    });
  }, [peers]);

  useEffect(() => {
    peerDataRef.current = peerData.map((p) => ({
      peer: p.peer,
      position: p.position,
      address: p.address,
    }));
  }, [peerData]);

  const ends = useMemo(() => peerData.map((p) => p.position), [peerData]);
  const activeFlags = useMemo(() => peerData.map((p) => p.isActive), [peerData]);

  const startFlyToWorld = useCallback(
    (worldPos: THREE.Vector3, duration = 1.15) => {
      if (!controlsRef.current) return;
      const controls = controlsRef.current;
      const cam = controls.object as THREE.PerspectiveCamera;

      const dist = worldPos.length();
      const radial =
        dist > 0.001
          ? worldPos.clone().normalize()
          : new THREE.Vector3(0, 0.2, 1).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      let side = new THREE.Vector3().crossVectors(radial, up);
      if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
      side.normalize();
      const lift = new THREE.Vector3().crossVectors(side, radial).normalize();

      // Camera sits outside the planet along a pleasant viewing angle
      const approach = Math.min(22, Math.max(14, dist * 0.55 + 10));
      const cam1 = worldPos
        .clone()
        .add(radial.clone().multiplyScalar(approach * 0.55))
        .add(lift.clone().multiplyScalar(approach * 0.42))
        .add(side.clone().multiplyScalar(approach * 0.28));

      // Keep within orbit limits
      const camDist = cam1.length();
      if (camDist < 12) cam1.multiplyScalar(12 / Math.max(camDist, 0.01));
      if (camDist > 95) cam1.multiplyScalar(95 / camDist);

      flyRef.current = {
        t0: performance.now(),
        dur: duration * 1000,
        cam0: cam.position.clone(),
        cam1,
        tgt0: controls.target.clone(),
        tgt1: worldPos.clone(),
      };
    },
    []
  );

  // Rotate the whole galaxy (planets + links) around the sun.
  // Smoothly pause when hovering a peer so tooltips are readable.
  useFrame((_, delta) => {
    // Camera fly-to (search) — highest priority, runs even while galaxy is paused
    const fly = flyRef.current;
    if (fly && controlsRef.current) {
      const u = easeInOutCubic((performance.now() - fly.t0) / fly.dur);
      const controls = controlsRef.current;
      controls.object.position.lerpVectors(fly.cam0, fly.cam1, u);
      controls.target.lerpVectors(fly.tgt0, fly.tgt1, u);
      controls.update();
      if (u >= 1) flyRef.current = null;
    }

    if (!galaxyRef.current) return;
    const wantSpin =
      orbitOnRef.current &&
      !peerHoveredRef.current &&
      !focusAddressRef.current &&
      !flyRef.current;
    const target = wantSpin ? 1 : 0;
    // ~0.35s ease (exponential smoothstep)
    const blend = 1 - Math.exp(-delta * 5.5);
    orbitFactorRef.current = THREE.MathUtils.lerp(
      orbitFactorRef.current,
      target,
      blend
    );
    const factor = orbitFactorRef.current;
    if (factor < 0.001) return;
    const speed = GALAXY_BASE_SPEED * orbitSpeedRef.current * factor;
    galaxyRef.current.rotation.y += delta * speed;
    // slight tilt drift so it feels spatial, not flat turntable
    galaxyRef.current.rotation.x =
      Math.sin(galaxyRef.current.rotation.y * 0.35) * 0.04;
  });

  useEffect(() => {
    controlsApiRef.current = {
      focus: () => {
        if (!controlsRef.current) return;
        onFocusAddressChangeRef.current?.(null);
        const controls = controlsRef.current;
        flyRef.current = {
          t0: performance.now(),
          dur: 950,
          cam0: controls.object.position.clone(),
          cam1: new THREE.Vector3(0, 22, 42),
          tgt0: controls.target.clone(),
          tgt1: new THREE.Vector3(0, 0, 0),
        };
      },
      focusPeer: (address: string) => {
        if (!galaxyRef.current || !controlsRef.current) return;
        const entry = peerDataRef.current.find(
          (p) =>
            p.address === address ||
            p.peer.address === address ||
            p.address.replace(/^\//, "") === address.replace(/^\//, "")
        );
        if (!entry) return;
        // Local planet pos → world (accounts for live galaxy rotation)
        const world = entry.position.clone();
        galaxyRef.current.updateMatrixWorld(true);
        galaxyRef.current.localToWorld(world);
        onFocusAddressChangeRef.current?.(entry.address);
        startFlyToWorld(world, 1.2);
      },
      clearPeerFocus: () => {
        flyRef.current = null;
        onFocusAddressChangeRef.current?.(null);
      },
      setAutoOrbit: (on: boolean) => {
        orbitOnRef.current = on;
      },
      setOrbitSpeed: (speed: number) => {
        orbitSpeedRef.current = speed;
      },
    };
    return () => {
      controlsApiRef.current = null;
    };
  }, [controlsApiRef, startFlyToWorld]);

  void camera;
  void smoothstep;

  return (
    <>
      <color attach="background" args={["#010104"]} />
      <fog attach="fog" args={["#010104", 70, 130]} />

      <SceneLights />

      <Stars
        radius={280}
        depth={90}
        count={1400}
        factor={1.8}
        saturation={0}
        fade
        speed={0.12}
      />

      {/* Sun fixed at center — does not spin with galaxy */}
      {atlas && (
        <Sun isOnline={isOnline} height={myNodeHeight} map={atlas.sun} />
      )}
      <BoomWave active={isPropagating} startMs={propagationStart} />

      {/* Entire peer system orbits as one galaxy */}
      <group ref={galaxyRef}>
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

        {atlas &&
          peerData.map(({ peer, position, kind, address }, index) => (
            <PeerPlanet
              key={`${peer.address || `peer-${index}`}-${texTick}`}
              peer={peer}
              position={position}
              index={index}
              onHover={onPeerHover}
              propagationStart={propagationStart}
              map={atlas.planets[kind] ?? getPlanetTexture(kind)}
              ringMap={atlas.ring ?? getRingTexture()}
              focused={
                !!focusAddress &&
                (address === focusAddress ||
                  peer.address === focusAddress ||
                  address.replace(/^\//, "") ===
                    focusAddress.replace(/^\//, ""))
              }
            />
          ))}

        {particles.map((p) => (
          <TravelingParticle
            key={p.id}
            start={p.start}
            end={p.end}
            duration={1.4}
            onComplete={() =>
              setParticles((prev) => prev.filter((x) => x.id !== p.id))
            }
          />
        ))}
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate
        minDistance={12}
        maxDistance={100}
        autoRotate={false}
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.5}
        zoomSpeed={0.65}
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
  const ambienceRef = useRef<AmbienceController | null>(null);
  /** Sticky planet info (tap/click keeps card open until Clear) */
  const [infoPeer, setInfoPeer] = useState<Peer | null>(null);
  const [hoveredPos, setHoveredPos] = useState<THREE.Vector3 | null>(null);
  const [pointerOver, setPointerOver] = useState(false);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const [isAutoOrbit, setIsAutoOrbit] = useState(true);
  /** Galaxy spin multiplier (0.25× – 5×) */
  const [orbitSpeed, setOrbitSpeed] = useState(1.5);
  const [isPropagating, setIsPropagating] = useState(false);
  const [propagationStart, setPropagationStart] = useState(0);
  const [particles, setParticles] = useState<
    Array<{ id: number; start: THREE.Vector3; end: THREE.Vector3 }>
  >([]);
  const [musicOn, setMusicOn] = useState(false);
  const [musicVol, setMusicVol] = useState(0.4);
  const [musicMode, setMusicMode] = useState<AmbienceMode>("off");
  const [musicBusy, setMusicBusy] = useState(false);
  /** Search-focused peer address (champagne accent + camera fly) */
  const [focusAddress, setFocusAddress] = useState<string | null>(null);
  /** Bump to wipe search input + results (NodeMapSearch clearToken) */
  const [searchClearToken, setSearchClearToken] = useState(0);

  const clearSearchFocus = useCallback(() => {
    setFocusAddress(null);
    controlsApiRef.current?.clearPeerFocus();
    setInfoPeer(null);
    setHoveredPos(null);
    setPointerOver(false);
    onPeerHover?.(null);
    setSearchClearToken((n) => n + 1);
    // Resume galaxy spin — clean, logical reset after Clear
    setIsAutoOrbit(true);
    controlsApiRef.current?.setAutoOrbit(true);
  }, [onPeerHover]);

  // Ambient music — user gesture required by browsers to start
  useEffect(() => {
    const ctrl = createAmbienceController();
    ambienceRef.current = ctrl;
    ctrl.setVolume(musicVol);
    return () => {
      ctrl.dispose();
      ambienceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMusic = async () => {
    const ctrl = ambienceRef.current;
    if (!ctrl || musicBusy) return;
    setMusicBusy(true);
    try {
      if (ctrl.isPlaying()) {
        ctrl.pause();
        setMusicOn(false);
        setMusicMode("off");
      } else {
        await ctrl.play();
        setMusicOn(true);
        setMusicMode(ctrl.getMode());
      }
    } catch (err) {
      console.warn("[Lumen] music play failed", err);
      setMusicOn(false);
      setMusicMode("off");
    } finally {
      setMusicBusy(false);
    }
  };

  const onMusicVolChange = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setMusicVol(clamped);
    ambienceRef.current?.setVolume(clamped);
  };

  const peerData = useMemo(() => {
    return peers.map((peer, index) => ({
      peer,
      position: getDeterministicPosition(peer.address || `peer-${index}`, index),
    }));
  }, [peers]);

  const searchNodes = useMemo(
    () => peers.map((p, i) => peerToSearchable(p, i)),
    [peers]
  );

  const handleSearchSelect = useCallback(
    (node: SearchableNode) => {
      const address = node.id;
      setIsAutoOrbit(false);
      controlsApiRef.current?.setAutoOrbit(false);
      // Defer one frame so controls API is ready after orbit off
      requestAnimationFrame(() => {
        controlsApiRef.current?.focusPeer(address);
      });
      const peer =
        peers.find(
          (p, i) =>
            (p.address || `peer-${i}`) === address ||
            p.address === address ||
            p.name === node.name
        ) || null;
      if (peer) {
        setInfoPeer(peer);
        setPointerOver(true);
        onPeerHover?.(peer);
      }
    },
    [peers, onPeerHover]
  );

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
      (window as any).__lumenSimulateBlock = triggerBlockPropagation;
    }
  }, [onSimulateBlock, triggerBlockPropagation]);

  const handlePeerHover = useCallback<PeerHoverFn>(
    (peer, pos) => {
      if (peer) {
        setInfoPeer(peer);
        setHoveredPos(pos || null);
        setPointerOver(true);
      } else {
        // Pointer leave — keep sticky card; only release hover spin pause
        setPointerOver(false);
      }
      onPeerHover?.(peer);
    },
    [onPeerHover]
  );

  const clearInfoPeer = useCallback(() => {
    setInfoPeer(null);
    setHoveredPos(null);
    setPointerOver(false);
    onPeerHover?.(null);
  }, [onPeerHover]);

  /** Clamp floating card into the viz box (desktop) */
  const floatingStyle = useMemo(() => {
    if (!hoveredPos) {
      return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
    }
    // Approximate screen offset from world pos (legacy mapping)
    const rawX = 50 + hoveredPos.x * 1.8; // %
    const rawY = 45 - hoveredPos.y * 1.6;
    // Keep card fully inside with margin (card ~280px / ~160px → ~22% / 18% of typical canvas)
    const left = Math.min(78, Math.max(22, rawX));
    const top = Math.min(72, Math.max(18, rawY));
    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: "translate(-50%, -50%)",
    };
  }, [hoveredPos]);

  const infoCardBody = infoPeer ? (
    <>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="font-mono text-[#C8D0E0] text-[10px] sm:text-xs tracking-[2px]">
          PEER
        </div>
        <button
          type="button"
          onClick={clearInfoPeer}
          className="pointer-events-auto text-[10px] font-mono tracking-widest text-[#A0A0B0] hover:text-white shrink-0 -mt-0.5"
        >
          CLOSE
        </button>
      </div>
      <div className="font-mono text-white break-all text-[13px] leading-tight mb-1">
        {infoPeer.name || infoPeer.address}
      </div>
      {infoPeer.name && (
        <div className="font-mono text-[#A0A0B0] text-[11px] break-all mb-2">
          {infoPeer.address}
        </div>
      )}
      <div className="font-mono text-[10px] text-[#A0A0B0] mb-3 tracking-wider uppercase">
        {PLANET_ARCHETYPES[kindFromAddress(infoPeer.address || "")].label} world
      </div>
      <div className="flex justify-between text-xs gap-4">
        <div>
          <span className="text-[#A0A0B0]">LAST SEEN</span>
          <br />
          <span className="font-mono text-white">
            {Math.floor((Date.now() - peerLastMs(infoPeer.lastMessage)) / 1000)}s
            ago
          </span>
        </div>
        <div className="text-right">
          <span className="text-[#A0A0B0]">STATUS</span>
          <br />
          <span
            className={
              Date.now() - peerLastMs(infoPeer.lastMessage) < 120000
                ? "text-[#10B981]"
                : "text-[#F59E0B]"
            }
          >
            {Date.now() - peerLastMs(infoPeer.lastMessage) < 120000
              ? "ACTIVE"
              : "STALE"}
          </span>
        </div>
      </div>
    </>
  ) : null;

  const focusOnMyNode = () => {
    setFocusAddress(null);
    controlsApiRef.current?.clearPeerFocus();
    controlsApiRef.current?.focus();
    setIsAutoOrbit(false);
    controlsApiRef.current?.setAutoOrbit(false);
    // Keep search text; user may still want the query — only Clear wipes input
  };

  const toggleAutoOrbit = () => {
    setIsAutoOrbit((v) => {
      const next = !v;
      if (next) {
        // Resume spin — drop search lock so galaxy can move again
        setFocusAddress(null);
        controlsApiRef.current?.clearPeerFocus();
      }
      controlsApiRef.current?.setAutoOrbit(next);
      return next;
    });
  };

  const onOrbitSpeedChange = (v: number) => {
    const clamped = Math.min(5, Math.max(0.25, v));
    setOrbitSpeed(clamped);
    controlsApiRef.current?.setOrbitSpeed(clamped);
  };

  useEffect(() => {
    controlsApiRef.current?.setOrbitSpeed(orbitSpeed);
  }, [orbitSpeed]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "f") focusOnMyNode();
      if (e.key.toLowerCase() === "o") toggleAutoOrbit();
      if (e.key.toLowerCase() === "m") void toggleMusic();
      if (e.key === "[" || e.key === "-") onOrbitSpeedChange(orbitSpeed - 0.25);
      if (e.key === "]" || e.key === "=" || e.key === "+")
        onOrbitSpeedChange(orbitSpeed + 0.25);
      if (e.key.toLowerCase() === "b" && onSimulateBlock) triggerBlockPropagation();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSimulateBlock, triggerBlockPropagation, orbitSpeed, musicOn, musicBusy]);

  return (
    <div ref={vizRef} className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [0, 22, 42], fov: 42 }}
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
          orbitSpeed={orbitSpeed}
          controlsApiRef={controlsApiRef}
          peerHovered={pointerOver || !!infoPeer || !!focusAddress}
          focusAddress={focusAddress}
          onFocusAddressChange={setFocusAddress}
        />
      </Canvas>

      {/* ── Mobile: search top (same logic as World Map) ── */}
      <div className="md:hidden absolute top-0 inset-x-0 z-30 pointer-events-none p-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <NodeMapSearch
          nodes={searchNodes}
          selectedId={focusAddress}
          compact
          clearToken={searchClearToken}
          onSelect={handleSearchSelect}
          className="w-full"
        />
      </div>

      {/* ── Mobile: BOOM left · FOCUS right (bottom, symmetric) ── */}
      {!hideControls && (
        <div className="md:hidden absolute bottom-0 inset-x-0 z-30 pointer-events-none flex items-end justify-between gap-3 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          {onSimulateBlock ? (
            <button
              type="button"
              onClick={triggerBlockPropagation}
              className="pointer-events-auto flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-2xl text-[10px] font-mono tracking-wider border border-[#E8C48A]/50 bg-[#0A0A0F]/92 text-[#E8C48A] shadow-lg backdrop-blur-md active:scale-[0.97]"
            >
              ✧ BOOM
            </button>
          ) : (
            <span className="min-h-11 w-px" aria-hidden />
          )}
          <button
            type="button"
            onClick={focusOnMyNode}
            className="pointer-events-auto flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-2xl text-[10px] font-mono tracking-wider border border-white/20 bg-[#0A0A0F]/92 text-[#E8E8F0] shadow-lg backdrop-blur-md active:scale-[0.97]"
          >
            FOCUS
          </button>
        </div>
      )}

      {/* ── Desktop left: premium node search ── */}
      {!hideControls && (
        <div
          className={`hidden md:flex absolute top-4 left-4 z-20 flex-col gap-2 ${HUD_PANEL_W} pointer-events-none`}
        >
          <NodeMapSearch
            nodes={searchNodes}
            selectedId={focusAddress}
            clearToken={searchClearToken}
            onSelect={handleSearchSelect}
            className="w-full"
          />
          {focusAddress && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${HUD_CARD} pointer-events-auto border-[#E8C97A]/40 bg-[#0A0A0F]/80 shadow-[0_0_24px_rgba(232,201,122,0.15)]`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] font-mono tracking-[0.22em] text-[#E8C97A] mb-1 drop-shadow-[0_0_8px_rgba(232,201,122,0.5)]">
                    FOUND
                  </div>
                  <div className="text-[12px] font-medium text-white truncate">
                    {peers.find((p) => p.address === focusAddress)?.name ||
                      focusAddress.replace(/^\//, "")}
                  </div>
                  <div className="text-[10px] font-mono text-[#A0A0B0] mt-0.5 truncate">
                    {focusAddress.replace(/^\//, "")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearSearchFocus}
                  className="text-[10px] font-mono text-[#A0A0B0] hover:text-white shrink-0 px-1.5 py-0.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  CLEAR
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Desktop right: unified control stack ── */}
      {!hideControls && (
        <div
          className={`hidden md:flex absolute top-4 right-4 z-20 flex-col gap-2 ${HUD_PANEL_W}`}
        >
          {/* Auto orbit + galaxy speed */}
          <div className={`${HUD_CARD} space-y-2.5 min-h-[132px]`}>
            <button
              type="button"
              onClick={toggleAutoOrbit}
              className="w-full h-9 flex items-center gap-2 text-[11px] font-mono tracking-widest transition-all active:scale-[0.985]"
            >
              <span className={isAutoOrbit ? "text-[#E8C48A]" : "text-[#A0A0B0]"}>
                ◉
              </span>
              <span className="text-[#E8E8F0] truncate">
                {isAutoOrbit ? "AUTO ORBIT ON" : "AUTO ORBIT OFF"}
              </span>
            </button>

            <div
              className={`space-y-1.5 transition-opacity ${
                isAutoOrbit ? "opacity-100" : "opacity-40 pointer-events-none"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-[#A0A0B0]">
                <span>GALAXY SPEED</span>
                <span className="text-[#E8C48A] tabular-nums">
                  {orbitSpeed.toFixed(2)}×
                </span>
              </div>
              <input
                type="range"
                min={0.25}
                max={5}
                step={0.05}
                value={orbitSpeed}
                onChange={(e) => onOrbitSpeedChange(parseFloat(e.target.value))}
                className="w-full h-1.5 appearance-none rounded-full bg-white/10 accent-[#E8C48A] cursor-pointer"
                aria-label="Galaxy orbit speed"
              />
              <div className="flex justify-between text-[9px] font-mono text-[#A0A0B0]/50">
                <span>0.25×</span>
                <span>[ ] keys</span>
                <span>5×</span>
              </div>
            </div>
          </div>

          {/* Music / ambience — same card footprint */}
          <div className={`${HUD_CARD} space-y-2.5 min-h-[132px]`}>
            <button
              type="button"
              onClick={() => void toggleMusic()}
              disabled={musicBusy}
              className="w-full h-9 flex items-center gap-2 text-[11px] font-mono tracking-widest transition-all active:scale-[0.985] disabled:opacity-50"
            >
              <span className={musicOn ? "text-[#E8C48A]" : "text-[#A0A0B0]"}>
                {musicOn ? "♪" : "♩"}
              </span>
              <span className="text-[#E8E8F0] truncate">
                {musicBusy
                  ? "LOADING…"
                  : musicOn
                    ? "MUSIC ON"
                    : "MUSIC OFF"}
              </span>
            </button>
            <div
              className={`space-y-1.5 transition-opacity ${
                musicOn ? "opacity-100" : "opacity-40"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-[#A0A0B0]">
                <span>VOLUME</span>
                <span className="text-[#E8C48A] tabular-nums">
                  {Math.round(musicVol * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={musicVol}
                onChange={(e) => onMusicVolChange(parseFloat(e.target.value))}
                className="w-full h-1.5 appearance-none rounded-full bg-white/10 accent-[#E8C48A] cursor-pointer"
                aria-label="Music volume"
              />
              <div className="text-[9px] font-mono text-[#A0A0B0]/55 leading-relaxed min-h-[2.5em] break-words">
                {musicMode === "file"
                  ? "Playing /audio/stay.* (your file)"
                  : musicMode === "synth"
                    ? "lumen space pad · M to toggle"
                    : "Press M · stay.mp3 in /public/audio"}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={focusOnMyNode}
            className={`${HUD_BTN} btn-cinematic hover:border-white/30 text-[#E8E8F0]`}
          >
            FOCUS ON MY NODE
          </button>
          {onSimulateBlock && (
            <button
              type="button"
              onClick={triggerBlockPropagation}
              className={`${HUD_BTN} btn-cinematic bg-[#E8C48A]/08 border-[#E8C48A]/25 hover:bg-[#E8C48A]/14 text-[#E8C48A]`}
            >
              ✧ SIMULATE BLOCK WAVE
            </button>
          )}
        </div>
      )}

      {/*
        Planet info card
        - Mobile: docked bottom of canvas (always fully visible)
        - Desktop: near planet, % clamped inside the viz box
      */}
      <AnimatePresence>
        {infoPeer && !focusAddress && (
          <>
            {/* Mobile — docked above bottom controls, fully in-view */}
            <motion.div
              key="peer-info-mobile"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden absolute z-40 left-2.5 right-2.5 bottom-[4.25rem] pointer-events-auto"
            >
              <div className="glass rounded-2xl px-4 py-3.5 text-sm border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)] max-h-[min(36vh,240px)] overflow-y-auto">
                {infoCardBody}
              </div>
            </motion.div>

            {/* Desktop — floating, clamped into viewport */}
            <motion.div
              key="peer-info-desktop"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              className="hidden md:block absolute z-30 pointer-events-none"
              style={floatingStyle}
            >
              <div className="glass rounded-2xl px-5 py-4 text-sm w-[min(280px,32vw)] border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.4)] pointer-events-auto">
                {infoCardBody}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Legend — desktop bottom-left */}
      <div
        className={`hidden md:block absolute bottom-4 left-4 z-20 ${HUD_PANEL_W} pointer-events-none`}
      >
        <div className={`${HUD_CARD} text-[10px] font-mono tracking-widest`}>
          <div className="flex items-center gap-4 text-[#A0A0B0]">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#E8C48A]" />{" "}
              SUN
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#8a9bb0]" />{" "}
              PEER WORLDS
            </div>
          </div>
          <div className="text-[9px] text-[#A0A0B0]/60 mt-1.5 tracking-wide">
            Search · drag · zoom · F / O / B
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Constellation3D(props: ConstellationProps) {
  return (
    <div className="w-full">
      <div className="canvas-container lumen-viz relative w-full bg-[#010104] overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <Scene {...props} />
        </div>
      </div>
      <div className="md:hidden mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10px] font-mono tracking-wider text-[#A0A0B0]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#E8C48A]" /> SUN
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#8a9bb0]" /> PEERS
        </span>
        <span className="opacity-50">Pinch · drag · hover · B boom</span>
      </div>
    </div>
  );
}

void (0 as unknown as PlanetKind);
