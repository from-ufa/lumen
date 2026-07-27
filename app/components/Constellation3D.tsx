"use client";

/**
 * Network Orbit — premium cinematic network visualizer
 * Realistic Earth · pulsing peers · soft particle trails · no orbital hoops
 */

import React, {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { Peer } from "../types/ergo";
import { motion, AnimatePresence } from "framer-motion";
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
  hideControls?: boolean;
  /** Label for the My Node / Lumen Node orbital point */
  centerLabel?: string;
}

type PeerHoverFn = (peer: Peer | null, pos?: THREE.Vector3) => void;

type ControlsApi = {
  focus: () => void;
  focusPeer: (address: string) => void;
  clearPeerFocus: () => void;
  setAutoOrbit: (on: boolean) => void;
  setOrbitSpeed: (speed: number) => void;
};

type PeerShell = "live" | "seen" | "ghost";

type PeerSlot = {
  peer: Peer;
  address: string;
  index: number;
  shell: PeerShell;
  /** Base spherical angles (deterministic) */
  theta: number;
  phi: number;
  radius: number;
  driftSpeed: number;
  phase: number;
  /** Heartbeat frequency (rad/s) */
  pulseFreq: number;
  color: THREE.Color;
  /** World position updated each frame */
  position: THREE.Vector3;
  /** Previous frame pos for trail tangent */
  prevPosition: THREE.Vector3;
};

const HUD_PANEL_W = "w-[min(280px,32vw)]";
const HUD_CARD =
  "glass rounded-2xl border border-white/10 px-4 py-3 w-full box-border";
const HUD_BTN =
  "glass w-full h-11 px-4 rounded-2xl text-[11px] font-mono tracking-widest border border-white/10 hover:border-white/25 flex items-center justify-center gap-2 transition-all active:scale-[0.985] box-border";

/** Orbital radii (world units) — altitude ~½ of previous (2× closer to Earth) */
const EARTH_R = 3.2;
const SHELL_R: Record<PeerShell, [number, number]> = {
  // EARTH_R + (old - EARTH_R) / 2
  live: [4.2, 5.05],
  seen: [5.4, 6.5],
  ghost: [6.9, 8.4],
};

/** Premium status palette — bright live, calm seen, muted ghost */
const SHELL_COLOR: Record<PeerShell, string> = {
  live: "#5EFFD0",
  seen: "#7EC0FF",
  ghost: "#A0A8BC",
};

const SHELL_BRIGHT: Record<PeerShell, number> = {
  live: 1.35,
  seen: 1.05,
  ghost: 0.72,
};

const LIVE_MS = 120_000;
const SEEN_MS = 30 * 60_000;

/** Ultra-thin trail — live peers only, almost invisible */
const TRAIL_LEN: Record<PeerShell, number> = {
  live: 2,
  seen: 0,
  ghost: 0,
};
const MAX_TRAIL_PEERS = 48;

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

function seeded01(seed: number, salt: number): number {
  let x = (seed ^ (salt * 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function shellFromPeer(peer: Peer, now: number): PeerShell {
  const age = now - peerLastMs(peer.lastMessage);
  if (age >= 0 && age < LIVE_MS) return "live";
  if (age >= 0 && age < SEEN_MS) return "seen";
  return "ghost";
}

function boomEnvelope(propagationStart: number): number {
  if (propagationStart <= 0) return 0;
  const elapsed = (Date.now() - propagationStart) / 1000;
  if (elapsed > 2.4) return 0;
  return Math.max(0, 1 - elapsed / 2.2);
}

function peerToSearchable(peer: Peer, index: number): SearchableNode {
  const address = peer.address || `peer-${index}`;
  const m = address.match(/(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?/);
  const shell = shellFromPeer(peer, Date.now());
  return {
    id: address,
    ip: m?.[1] || address.replace(/^\//, ""),
    port: m?.[2] || null,
    name: peer.name || address.replace(/^\//, ""),
    city: peer.connectionType || undefined,
    country: undefined,
    state: shell === "live" ? "connected" : shell === "seen" ? "seen" : "ghost",
    version: null,
    lat: 0,
    lon: 0,
  };
}

function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function applyShellColor(color: THREE.Color, shell: PeerShell) {
  color.set(SHELL_COLOR[shell]);
  color.multiplyScalar(SHELL_BRIGHT[shell]);
  if (shell === "live") color.offsetHSL(0, 0.06, 0.06);
}

function buildSlot(peer: Peer, index: number, now: number): PeerSlot {
  const address = peer.address || `peer-${index}`;
  const seed = hashString(address);
  const shell = shellFromPeer(peer, now);
  const [r0, r1] = SHELL_R[shell];
  const radius = r0 + seeded01(seed, 1) * (r1 - r0);
  // Dense belt with mild inclination scatter
  const theta = seeded01(seed, 2) * Math.PI * 2;
  const phi =
    (seeded01(seed, 3) - 0.5) * 0.72 +
    Math.sin(seeded01(seed, 4) * Math.PI * 2) * 0.18;
  const color = new THREE.Color();
  applyShellColor(color, shell);

  // Live drifts faster; ghosts almost still
  const driftBase =
    shell === "live" ? 0.065 : shell === "seen" ? 0.04 : 0.018;
  const pulseBase =
    shell === "live" ? 1.85 : shell === "seen" ? 1.25 : 0.75;

  return {
    peer,
    address,
    index,
    shell,
    theta,
    phi,
    radius,
    driftSpeed: driftBase + seeded01(seed, 5) * 0.055,
    phase: seeded01(seed, 6) * Math.PI * 2,
    pulseFreq: pulseBase + seeded01(seed, 7) * 0.45,
    color,
    position: new THREE.Vector3(),
    prevPosition: new THREE.Vector3(),
  };
}

function slotWorldPos(slot: PeerSlot, t: number, out: THREE.Vector3) {
  // Living orbit: angular drift + gentle radial breathe + vertical bob
  const ang = slot.theta + t * slot.driftSpeed;
  const bob =
    Math.sin(t * 0.42 + slot.phase) * 0.12 +
    Math.sin(t * 0.19 + slot.phase * 1.7) * 0.05;
  const r =
    slot.radius +
    Math.sin(t * 0.28 + slot.phase) * 0.07 +
    Math.cos(t * 0.15 + slot.phase * 0.5) * 0.03;
  const cosP = Math.cos(slot.phi);
  out.set(
    r * Math.cos(ang) * cosP,
    r * Math.sin(slot.phi) + bob,
    r * Math.sin(ang) * cosP
  );
  return out;
}

/** Gentle breath only: scale 1.0 → 1.12 max */
function heartbeat(t: number, freq: number, phase: number): number {
  return 1 + Math.sin(t * freq + phase) * 0.06;
}

/* ─── Shared geometries ─────────────────────────────────────────────────── */

const GEO_EARTH = new THREE.SphereGeometry(1, 96, 96);
const GEO_CLOUDS = new THREE.SphereGeometry(1, 64, 64);
/** Soft camera-facing sprite (never hard mesh sphere — those look square) */
const GEO_SPRITE = new THREE.PlaneGeometry(1, 1);
/** Invisible raycast target only */
const GEO_HIT = new THREE.SphereGeometry(1, 8, 8);

/**
 * Compact soft sprite sizes (plane full-width, gaussian falloff).
 * Earth radius ≈ 3.2 — keep pin-scale so Earth stays hero.
 */
const SIZE_LIVE = 0.085;
const SIZE_SEEN = 0.07;
const SIZE_GHOST = 0.055;
const SIZE_MY = 0.11;
/** Outer soft bloom relative to core */
const GLOW_MUL = 2.35;

/* ─── Soft circular glow textures (procedural gaussian) ─────────────────── */

type SoftTexKind = "core" | "halo";
const softTexCache: Partial<Record<SoftTexKind, THREE.CanvasTexture>> = {};

/**
 * Radial soft disc — perfect circle, zero hard edges.
 * core: tight bright center · halo: wide cinematic bloom
 */
function getSoftCircleTexture(kind: SoftTexKind): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const hit = softTexCache[kind];
  if (hit) return hit;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  if (kind === "core") {
    // Hot center, still soft limb
    g.addColorStop(0.0, "rgba(255,255,255,1.0)");
    g.addColorStop(0.12, "rgba(255,255,255,0.95)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(0.62, "rgba(255,255,255,0.12)");
    g.addColorStop(1.0, "rgba(255,255,255,0.0)");
  } else {
    // Wide soft bloom — cinematic particle light
    g.addColorStop(0.0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.18, "rgba(255,255,255,0.28)");
    g.addColorStop(0.42, "rgba(255,255,255,0.10)");
    g.addColorStop(0.7, "rgba(255,255,255,0.03)");
    g.addColorStop(1.0, "rgba(255,255,255,0.0)");
  }
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.premultiplyAlpha = false;
  softTexCache[kind] = tex;
  return tex;
}

/* Day + night blend Earth shader (sun-lit day, city lights on night side) */
/* Limb haze baked into earth shader rim — no separate sphere (that = ring) */
const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uSpecular;
  uniform vec3 uLightDir;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uLightDir);
    float ndl = dot(N, L);
    float dayMask = smoothstep(-0.12, 0.22, ndl);
    float nightMask = 1.0 - smoothstep(-0.05, 0.35, ndl);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    // Boost city lights — warm amber cities
    night = night * vec3(1.35, 1.15, 0.85) * 1.6;

    float specMap = texture2D(uSpecular, vUv).r;
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0) * specMap * dayMask * 0.55;

    // Soft ambient so dark side isn't pure black
    vec3 ambient = day * 0.06 + vec3(0.01, 0.015, 0.03);
    vec3 col = mix(night * nightMask + ambient, day, dayMask);
    col += vec3(0.55, 0.72, 1.0) * spec;

    // Very soft edge falloff (surface only — no separate ring mesh)
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    col *= 1.0 - rim * 0.18;
    col += vec3(0.35, 0.55, 0.85) * rim * 0.06;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ─── Texture loader (module-level cache) ───────────────────────────────── */

const texCache: Record<string, THREE.Texture> = {};
let texPromise: Promise<Record<string, THREE.Texture>> | null = null;

function loadEarthTextures(): Promise<Record<string, THREE.Texture>> {
  if (texPromise) return texPromise;
  const loader = new THREE.TextureLoader();
  const paths: Record<string, string> = {
    day: "/planets/earth_blue_marble.jpg",
    night: "/planets/earth_night_2k.jpg",
    specular: "/planets/earth_specular_2048.jpg",
    normal: "/planets/earth_normal_2048.jpg",
    clouds: "/planets/earth_clouds_1024.png",
  };
  texPromise = Promise.all(
    Object.entries(paths).map(
      ([k, url]) =>
        new Promise<[string, THREE.Texture]>((resolve) => {
          if (texCache[k]) {
            resolve([k, texCache[k]]);
            return;
          }
          loader.load(
            url,
            (t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 8;
              t.wrapS = t.wrapT = THREE.RepeatWrapping;
              texCache[k] = t;
              resolve([k, t]);
            },
            undefined,
            () => {
              // Fallback: empty 1×1
              const data = new Uint8Array([20, 40, 80, 255]);
              const t = new THREE.DataTexture(data, 1, 1);
              t.needsUpdate = true;
              texCache[k] = t;
              resolve([k, t]);
            }
          );
        })
    )
  ).then((entries) => Object.fromEntries(entries));
  return texPromise;
}

/* ─── Earth ─────────────────────────────────────────────────────────────── */

function Earth({ spin }: { spin: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const earthRef = useRef<THREE.Mesh>(null!);
  const cloudsRef = useRef<THREE.Mesh>(null!);
  const earthAngle = useRef(0);
  const cloudAngle = useRef(0);
  const [maps, setMaps] = useState<Record<string, THREE.Texture> | null>(null);

  useEffect(() => {
    let alive = true;
    loadEarthTextures().then((m) => {
      if (alive) setMaps(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  const earthMat = useMemo(() => {
    if (!maps) return null;
    return new THREE.ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      uniforms: {
        uDay: { value: maps.day },
        uNight: { value: maps.night },
        uSpecular: { value: maps.specular },
        // Light from viewer side — updated each frame from camera
        uLightDir: { value: new THREE.Vector3(0, 0.35, 1).normalize() },
        uTime: { value: 0 },
      },
    });
  }, [maps]);

  useEffect(
    () => () => {
      earthMat?.dispose();
    },
    [earthMat]
  );

  useFrame((state, dt) => {
    // AUTO ORBIT OFF must freeze Earth + clouds (not only camera autoRotate)
    if (spin) {
      earthAngle.current += dt * 0.028;
      cloudAngle.current += dt * 0.034;
    }
    if (earthRef.current) earthRef.current.rotation.y = earthAngle.current;
    if (cloudsRef.current) cloudsRef.current.rotation.y = cloudAngle.current;
    if (earthMat) {
      earthMat.uniforms.uTime.value = state.clock.elapsedTime;
      // Key light always from viewing side (camera → Earth)
      earthMat.uniforms.uLightDir.value.copy(state.camera.position).normalize();
    }
  });

  return (
    <group ref={groupRef} scale={EARTH_R}>
      {/* Soft fill on limbs only — key light is camera-facing via shader */}
      <pointLight position={[-2.5, 0.4, -1.5]} intensity={0.18} color="#1a3a6a" distance={10} />

      {earthMat ? (
        <mesh ref={earthRef} geometry={GEO_EARTH} material={earthMat} />
      ) : (
        <mesh ref={earthRef} geometry={GEO_EARTH}>
          <meshStandardMaterial color="#1a3a5c" roughness={0.85} metalness={0.1} />
        </mesh>
      )}

      {/* Clouds — tight to surface, no separate halo shell */}
      {maps?.clouds && (
        <mesh ref={cloudsRef} geometry={GEO_CLOUDS} scale={1.012}>
          <meshStandardMaterial
            map={maps.clouds}
            transparent
            opacity={0.38}
            depthWrite={false}
            roughness={1}
            metalness={0}
            alphaTest={0.02}
          />
        </mesh>
      )}
      {/* No atmosphere sphere: BackSide fresnel reads as a hard blue ring */}
    </group>
  );
}

/** Shared motion bridge (refs — no React lag for orbit pause) */
type MotionBridge = {
  /** 1 full speed → 0 frozen */
  mul: number;
  hovering: boolean;
  hasPointer: boolean;
  pointer: THREE.Vector2;
  simTime: number;
  hitMesh: THREE.InstancedMesh | null;
  lastHoverId: number;
};

function createMotionBridge(): MotionBridge {
  return {
    mul: 1,
    hovering: false,
    hasPointer: false,
    pointer: new THREE.Vector2(0, 0),
    simTime: 0,
    hitMesh: null,
    lastHoverId: -1,
  };
}

const _occDir = new THREE.Vector3();

/** Ray vs sphere at origin — true if Earth blocks camera → point */
function occludedByEarth(
  cam: THREE.Vector3,
  point: THREE.Vector3,
  earthR: number = EARTH_R
): boolean {
  _occDir.copy(point).sub(cam);
  const dist = _occDir.length();
  if (dist < 1e-4) return false;
  _occDir.multiplyScalar(1 / dist);
  // |cam + t*dir|^2 = R^2
  const b = cam.dot(_occDir);
  const c = cam.lengthSq() - earthR * earthR;
  const disc = b * b - c;
  if (disc < 0) return false;
  const tHit = -b - Math.sqrt(disc);
  // hit between camera and node (not beyond node, not behind camera)
  return tHit > 0.02 && tHit < dist - 0.04;
}

/** Peer is on the camera-facing side of Earth (interactive) */
function isPeerVisibleFromCamera(
  cam: THREE.Vector3,
  peerPos: THREE.Vector3
): boolean {
  // Slightly smaller R so nodes near the limb still pickable if truly in front
  return !occludedByEarth(cam, peerPos, EARTH_R * 0.97);
}

/** Compact label for my node */
function shortNodeLabel(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "you";
  const low = s.toLowerCase();
  if (low.includes("my node") || low === "you") return "you";
  if (low.includes("lumen")) return "lumen";
  return s.length > 10 ? s.slice(0, 9) + "…" : s.toLowerCase();
}

/* ─── My Node — soft circular sprite (slightly larger peer) ─────────────── */

function MyNodeDot({
  label,
  isOnline,
  motionRef,
}: {
  label: string;
  isOnline: boolean;
  motionRef: MutableRefObject<MotionBridge>;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const [labelVisible, setLabelVisible] = useState(true);
  const posScratch = useMemo(() => new THREE.Vector3(), []);
  const coreMap = useMemo(() => getSoftCircleTexture("core"), []);
  const haloMap = useMemo(() => getSoftCircleTexture("halo"), []);

  const radius = (SHELL_R.live[0] + SHELL_R.live[1]) / 2 + 0.1;
  const phi = 0.12;
  const drift = 0.055;
  const phase = 1.15;
  const accent = isOnline ? "#F0D4A0" : "#8a7a60";
  const shortLabel = useMemo(() => shortNodeLabel(label), [label]);

  useFrame((state) => {
    // Same frozen clock as peers when hovering
    const t = motionRef.current.simTime;
    const ang = phase + t * drift;
    const bob = Math.sin(t * 0.35 + phase) * 0.06;
    const r = radius + Math.sin(t * 0.22 + phase) * 0.03;
    const cosP = Math.cos(phi);
    posScratch.set(
      r * Math.cos(ang) * cosP,
      r * Math.sin(phi) + bob,
      r * Math.sin(ang) * cosP
    );
    if (groupRef.current) {
      groupRef.current.position.copy(posScratch);
      // Billboard — always face camera (perfect circle)
      groupRef.current.quaternion.copy(state.camera.quaternion);
    }

    const hb = heartbeat(t, 1.7, phase);
    if (coreRef.current) coreRef.current.scale.setScalar(SIZE_MY * hb);
    if (glowRef.current) {
      glowRef.current.scale.setScalar(SIZE_MY * GLOW_MUL * hb);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.55 + (hb - 1) * 1.2;
    }

    // Hide label when node is behind Earth (HTML would otherwise float over the globe)
    const show = !occludedByEarth(
      state.camera.position,
      posScratch,
      EARTH_R * 0.98
    );
    setLabelVisible((v) => (v === show ? v : show));
  });

  return (
    <group ref={groupRef}>
      <mesh ref={glowRef} geometry={GEO_SPRITE} renderOrder={2}>
        <meshBasicMaterial
          map={haloMap}
          color={accent}
          transparent
          opacity={0.55}
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={coreRef} geometry={GEO_SPRITE} renderOrder={3}>
        <meshBasicMaterial
          map={coreMap}
          color={accent}
          transparent
          opacity={0.95}
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {labelVisible && (
        <Html
          center
          sprite
          style={{ pointerEvents: "none", userSelect: "none" }}
          position={[0, 0.08, 0]}
          zIndexRange={[10, 0]}
        >
          <div
            className="whitespace-nowrap font-mono uppercase"
            style={{
              color: accent,
              fontSize: "8px",
              letterSpacing: "0.12em",
              opacity: 0.7,
              lineHeight: 1,
              padding: "1px 4px",
              textShadow: "0 1px 3px rgba(0,0,0,0.9)",
            }}
          >
            {shortLabel}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ─── Compact peers: tiny core + minimal glow + optional micro-trail ────── */

/** Invisible hit radius — cores are tiny pins */
const HIT_MUL = 10;

/**
 * DOM pointer + per-frame raycast against hit InstancedMesh.
 * R3F pointer events on opacity:0 instances are unreliable.
 */
function PeerHoverDriver({
  slots,
  motionRef,
  onHover,
}: {
  slots: PeerSlot[];
  motionRef: MutableRefObject<MotionBridge>;
  onHover: PeerHoverFn;
}) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  // Generous threshold for tiny instances
  raycaster.params.Mesh = { threshold: 0.15 };

  useEffect(() => {
    const el = gl.domElement;
    const m = motionRef.current;

    const setPointer = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const w = rect.width || 1;
      const h = rect.height || 1;
      m.pointer.x = ((ev.clientX - rect.left) / w) * 2 - 1;
      m.pointer.y = -((ev.clientY - rect.top) / h) * 2 + 1;
      m.hasPointer = true;
    };
    const clearPointer = () => {
      m.hasPointer = false;
      if (m.hovering || m.lastHoverId >= 0) {
        m.hovering = false;
        m.lastHoverId = -1;
        onHover(null);
      }
    };

    el.addEventListener("pointermove", setPointer, { passive: true });
    el.addEventListener("pointerdown", setPointer, { passive: true });
    el.addEventListener("pointerenter", setPointer, { passive: true });
    el.addEventListener("pointerleave", clearPointer);
    el.addEventListener("pointercancel", clearPointer);
    return () => {
      el.removeEventListener("pointermove", setPointer);
      el.removeEventListener("pointerdown", setPointer);
      el.removeEventListener("pointerenter", setPointer);
      el.removeEventListener("pointerleave", clearPointer);
      el.removeEventListener("pointercancel", clearPointer);
    };
  }, [gl, motionRef, onHover]);

  useFrame((_, dt) => {
    const m = motionRef.current;
    const mesh = m.hitMesh;
    const cam = camera.position;

    let over = false;
    let id = -1;
    if (m.hasPointer && mesh && slots.length > 0) {
      raycaster.setFromCamera(m.pointer, camera);
      const hits = raycaster.intersectObject(mesh, false);
      // Nearest hit that is NOT behind Earth (visible limb only)
      for (let h = 0; h < hits.length; h++) {
        const instId = hits[h].instanceId;
        if (instId == null || instId < 0 || instId >= slots.length) continue;
        const pos = slots[instId].position;
        if (!isPeerVisibleFromCamera(cam, pos)) continue;
        id = instId;
        over = true;
        break;
      }
    }

    m.hovering = over;
    // Smooth coast: stop faster than resume
    const want = over ? 0 : 1;
    m.mul = THREE.MathUtils.damp(m.mul, want, over ? 6 : 2.2, dt);
    // Advance simulation clock only while moving
    m.simTime += dt * m.mul;

    if (over && id !== m.lastHoverId) {
      m.lastHoverId = id;
      const slot = slots[id];
      onHover(slot.peer, slot.position.clone());
    } else if (!over && m.lastHoverId >= 0) {
      m.lastHoverId = -1;
      onHover(null);
    }
  });

  return null;
}

function PeerInstances({
  slots,
  propagationStart,
  focusAddress,
  onHover,
  slotsRef,
  motionRef,
}: {
  slots: PeerSlot[];
  propagationStart: number;
  focusAddress: string | null;
  onHover: PeerHoverFn;
  slotsRef: MutableRefObject<PeerSlot[]>;
  motionRef: MutableRefObject<MotionBridge>;
}) {
  const coreRef = useRef<THREE.InstancedMesh>(null!);
  const glowRef = useRef<THREE.InstancedMesh>(null!);
  const hitRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const count = slots.length;
  const coreMap = useMemo(() => getSoftCircleTexture("core"), []);
  const haloMap = useMemo(() => getSoftCircleTexture("halo"), []);
  const { camera } = useThree();

  const trailMeta = useMemo(() => {
    const n = Math.min(count, MAX_TRAIL_PEERS);
    let total = 0;
    const offsets: number[] = [];
    const lengths: number[] = [];
    for (let i = 0; i < n; i++) {
      const len = TRAIL_LEN[slots[i].shell];
      offsets.push(total);
      lengths.push(len);
      total += len;
    }
    return { n, total, offsets, lengths };
  }, [slots, count]);

  const trailPos = useMemo(
    () => new Float32Array(Math.max(1, trailMeta.total) * 3),
    [trailMeta.total]
  );
  const trailCol = useMemo(
    () => new Float32Array(Math.max(1, trailMeta.total) * 3),
    [trailMeta.total]
  );
  const trailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
    g.setDrawRange(0, trailMeta.total);
    return g;
  }, [trailPos, trailCol, trailMeta.total]);

  useEffect(() => () => trailGeom.dispose(), [trailGeom]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots, slotsRef]);

  // Register hit mesh for PeerHoverDriver raycasts
  useFrame(() => {
    motionRef.current.hitMesh = hitRef.current;
  });

  useFrame(() => {
    const core = coreRef.current;
    const glow = glowRef.current;
    const hit = hitRef.current;
    if (!core || count === 0) return;
    // Paused sim time freezes orbital drift under cursor
    const t = motionRef.current.simTime;
    const boom = boomEnvelope(propagationStart);
    // Billboard: soft discs always face camera → perfect circles
    const camQ = camera.quaternion;

    for (let i = 0; i < count; i++) {
      const slot = slots[i];
      slot.prevPosition.copy(slot.position);
      slotWorldPos(slot, t, slot.position);

      const isFocus = focusAddress === slot.address;
      const base =
        slot.shell === "live"
          ? SIZE_LIVE
          : slot.shell === "seen"
            ? SIZE_SEEN
            : SIZE_GHOST;
      // Soft breath 1.0–1.12; brightness does the cinema, not size
      const hb = heartbeat(t, slot.pulseFreq, slot.phase);
      const focusMul = isFocus ? 1.2 : 1;
      const boomMul = 1 + boom * 0.06;
      const coreScale = base * hb * focusMul * boomMul;

      dummy.position.copy(slot.position);
      dummy.quaternion.copy(camQ);
      dummy.scale.setScalar(coreScale);
      dummy.updateMatrix();
      core.setMatrixAt(i, dummy.matrix);

      if (glow) {
        dummy.scale.setScalar(coreScale * GLOW_MUL);
        dummy.updateMatrix();
        glow.setMatrixAt(i, dummy.matrix);
      }
      // Fat hit target (sphere — raycast only)
      if (hit) {
        dummy.quaternion.identity();
        dummy.scale.setScalar(Math.max(base * HIT_MUL * 0.55, 0.28));
        dummy.updateMatrix();
        hit.setMatrixAt(i, dummy.matrix);
      }

      color.copy(slot.color);
      if (isFocus) color.set("#F0D4A0");
      // Gentle brightness flicker (additive sprites read as light)
      const bright = 0.88 + (hb - 1) * 2.8 + boom * 0.2;
      color.multiplyScalar(bright);
      core.setColorAt(i, color);
      if (glow) {
        // Halo slightly cooler/softer
        tmp.copy(color).multiplyScalar(0.85);
        glow.setColorAt(i, tmp);
      }

      // Micro trail — live only, 2 faint sparks
      if (i < trailMeta.n && trailMeta.lengths[i] > 0) {
        const len = trailMeta.lengths[i];
        const baseOff = trailMeta.offsets[i];
        const dx = slot.prevPosition.x - slot.position.x;
        const dy = slot.prevPosition.y - slot.position.y;
        const dz = slot.prevPosition.z - slot.position.z;
        const speed = Math.hypot(dx, dy, dz) || 0.001;
        const trailAmp = 4 / Math.max(speed, 0.0005);
        for (let k = 0; k < len; k++) {
          const f = (k + 1) / (len + 0.5);
          const o = (baseOff + k) * 3;
          trailPos[o] = slot.position.x + dx * f * trailAmp;
          trailPos[o + 1] = slot.position.y + dy * f * trailAmp;
          trailPos[o + 2] = slot.position.z + dz * f * trailAmp;
          const fade = (1 - f) * 0.18;
          trailCol[o] = slot.color.r * fade;
          trailCol[o + 1] = slot.color.g * fade;
          trailCol[o + 2] = slot.color.b * fade;
        }
      }
    }

    core.instanceMatrix.needsUpdate = true;
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
    if (glow) {
      glow.instanceMatrix.needsUpdate = true;
      if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
    }
    if (hit) hit.instanceMatrix.needsUpdate = true;
    if (trailMeta.total > 0) {
      trailGeom.attributes.position.needsUpdate = true;
      trailGeom.attributes.color.needsUpdate = true;
    }
  });

  const handleClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id == null || id < 0 || id >= slots.length) return;
      // Ignore clicks on peers hidden behind Earth
      if (!isPeerVisibleFromCamera(camera.position, slots[id].position)) return;
      onHover(slots[id].peer, slots[id].position.clone());
      try {
        window.dispatchEvent(new Event("lumen-invite-wake"));
      } catch {
        /* */
      }
    },
    [slots, onHover, camera]
  );

  if (count === 0) return null;

  return (
    <group>
      {trailMeta.total > 0 && (
        <points geometry={trailGeom} frustumCulled={false}>
          <pointsMaterial
            map={haloMap ?? undefined}
            size={0.05}
            vertexColors
            transparent
            opacity={0.65}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            sizeAttenuation
            toneMapped={false}
            alphaTest={0.01}
          />
        </points>
      )}

      {/* Soft outer bloom — circular gaussian sprite, additive */}
      <instancedMesh
        ref={glowRef}
        args={[GEO_SPRITE, undefined, count]}
        frustumCulled={false}
        renderOrder={2}
      >
        <meshBasicMaterial
          map={haloMap}
          color="#ffffff"
          transparent
          opacity={0.7}
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {/* Soft bright core — circular, not hard mesh ball */}
      <instancedMesh
        ref={coreRef}
        args={[GEO_SPRITE, undefined, count]}
        frustumCulled={false}
        renderOrder={3}
      >
        <meshBasicMaterial
          map={coreMap}
          color="#ffffff"
          transparent
          opacity={0.95}
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {/* Hit targets for manual raycast (PeerHoverDriver) + click */}
      <instancedMesh
        ref={hitRef}
        args={[GEO_HIT, undefined, count]}
        onClick={handleClick}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ─── Camera controller ─────────────────────────────────────────────────── */

function CameraRig({
  autoOrbit,
  orbitSpeed,
  controlsApiRef,
  slotsRef,
  motionRef,
  onFocusAddressChange,
}: {
  autoOrbit: boolean;
  orbitSpeed: number;
  controlsApiRef: MutableRefObject<ControlsApi | null>;
  slotsRef: MutableRefObject<PeerSlot[]>;
  motionRef: MutableRefObject<MotionBridge>;
  onFocusAddressChange: (a: string | null) => void;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  const flyRef = useRef<{
    active: boolean;
    t0: number;
    dur: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);

  /** First open: ~2× closer than original [0, 6.5, 16] */
  const defaultPos = useMemo(() => new THREE.Vector3(0, 3.2, 8), []);
  const defaultTarget = useMemo(() => new THREE.Vector3(0, 0.2, 0), []);

  useEffect(() => {
    const api: ControlsApi = {
      focus: () => {
        flyRef.current = {
          active: true,
          t0: performance.now(),
          dur: 1100,
          fromPos: camera.position.clone(),
          toPos: defaultPos.clone(),
          fromTarget: controlsRef.current?.target.clone() ?? defaultTarget.clone(),
          toTarget: defaultTarget.clone(),
        };
        onFocusAddressChange(null);
      },
      focusPeer: (address: string) => {
        const slot = slotsRef.current.find((s) => s.address === address);
        if (!slot) return;
        const target = slot.position.clone();
        const dir = target.clone().normalize();
        if (dir.lengthSq() < 0.01) dir.set(0, 0.3, 1).normalize();
        const camPos = target.clone().add(dir.multiplyScalar(3.2)).add(new THREE.Vector3(0, 1.2, 0));
        flyRef.current = {
          active: true,
          t0: performance.now(),
          dur: 1200,
          fromPos: camera.position.clone(),
          toPos: camPos,
          fromTarget: controlsRef.current?.target.clone() ?? defaultTarget.clone(),
          toTarget: target,
        };
        onFocusAddressChange(address);
      },
      clearPeerFocus: () => {
        onFocusAddressChange(null);
      },
      setAutoOrbit: () => {},
      setOrbitSpeed: () => {},
    };
    controlsApiRef.current = api;
    return () => {
      controlsApiRef.current = null;
    };
  }, [camera, controlsApiRef, defaultPos, defaultTarget, onFocusAddressChange, slotsRef]);

  useFrame(() => {
    const fly = flyRef.current;
    if (fly?.active) {
      const u = easeInOutCubic(
        Math.min(1, (performance.now() - fly.t0) / fly.dur)
      );
      camera.position.lerpVectors(fly.fromPos, fly.toPos, u);
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(fly.fromTarget, fly.toTarget, u);
        controlsRef.current.update();
      }
      if (u >= 1) fly.active = false;
    }
    if (controlsRef.current) {
      // Motion mul is driven by PeerHoverDriver (raycast every frame)
      const mul = motionRef.current.mul;
      // Hard stop when AUTO ORBIT OFF — no residual autoRotate
      const canSpin = !!autoOrbit && !fly?.active && mul > 0.02;
      controlsRef.current.autoRotate = canSpin;
      controlsRef.current.autoRotateSpeed = canSpin
        ? 0.4 * orbitSpeed * mul
        : 0;
      if (!canSpin) {
        // Ensure controls don't keep coasting on the autoRotate path
        controlsRef.current.update();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      args={[camera, gl.domElement]}
      enablePan
      enableZoom
      enableRotate
      autoRotate={false}
      autoRotateSpeed={0}
      minDistance={4}
      maxDistance={42}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.48}
      zoomSpeed={0.7}
      target={[0, 0.2, 0]}
      maxPolarAngle={Math.PI * 0.92}
      minPolarAngle={0.12}
    />
  );
}

/* ─── World root ────────────────────────────────────────────────────────── */

function NetworkOrbitWorld({
  peers,
  isOnline,
  centerLabel,
  onPeerHover,
  propagationStart,
  autoOrbit,
  orbitSpeed,
  controlsApiRef,
  focusAddress,
  onFocusAddressChange,
}: {
  peers: Peer[];
  isOnline: boolean;
  centerLabel: string;
  onPeerHover: PeerHoverFn;
  propagationStart: number;
  autoOrbit: boolean;
  orbitSpeed: number;
  controlsApiRef: MutableRefObject<ControlsApi | null>;
  focusAddress: string | null;
  onFocusAddressChange: (a: string | null) => void;
}) {
  const slotsRef = useRef<PeerSlot[]>([]);
  const motionRef = useRef<MotionBridge>(createMotionBridge());

  // Rebuild slots when peer set changes (addresses)
  const peerKey = peers.map((p) => p.address).join("|");
  const slots = useMemo(() => {
    const now = Date.now();
    return peers.map((p, i) => buildSlot(p, i, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey]);

  // Refresh shell classification periodically without full rebuild of angles
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const slot of slots) {
        const shell = shellFromPeer(slot.peer, now);
        if (shell !== slot.shell) {
          slot.shell = shell;
          const [r0, r1] = SHELL_R[shell];
          const seed = hashString(slot.address);
          slot.radius = r0 + seeded01(seed, 1) * (r1 - r0);
          applyShellColor(slot.color, shell);
          slot.driftSpeed =
            (shell === "live" ? 0.065 : shell === "seen" ? 0.04 : 0.018) +
            seeded01(seed, 5) * 0.055;
          slot.pulseFreq =
            (shell === "live" ? 1.85 : shell === "seen" ? 1.25 : 0.75) +
            seeded01(seed, 7) * 0.45;
        }
      }
    };
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [slots]);

  // Init positions immediately
  useMemo(() => {
    const t = 0;
    for (const s of slots) slotWorldPos(s, t, s.position);
  }, [slots]);

  return (
    <>
      <color attach="background" args={["#010104"]} />
      <fog attach="fog" args={["#010104", 28, 55]} />

      <ambientLight intensity={0.22} color="#6a7a9a" />
      {/* Key light from default viewer side (matches initial camera) */}
      <directionalLight
        position={[0, 3.2, 8]}
        intensity={1.75}
        color="#fff6ec"
      />
      <directionalLight
        position={[-4, -1.5, -3]}
        intensity={0.18}
        color="#1a3060"
      />
      <hemisphereLight args={["#1a2840", "#050508", 0.4]} />

      <Stars
        radius={90}
        depth={50}
        count={4200}
        factor={3.2}
        saturation={0.15}
        fade
        speed={0.15}
      />

      {/* Distant nebula glow */}
      <mesh position={[-18, 8, -30]} scale={22}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#1a1040"
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[22, -6, -28]} scale={18}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#0a2040"
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <Earth spin={autoOrbit} />
      <PeerInstances
        slots={slots}
        propagationStart={propagationStart}
        focusAddress={focusAddress}
        onHover={onPeerHover}
        slotsRef={slotsRef}
        motionRef={motionRef}
      />
      <MyNodeDot
        label={centerLabel}
        isOnline={isOnline}
        motionRef={motionRef}
      />
      <PeerHoverDriver
        slots={slots}
        motionRef={motionRef}
        onHover={onPeerHover}
      />

      <CameraRig
        autoOrbit={autoOrbit}
        orbitSpeed={orbitSpeed}
        controlsApiRef={controlsApiRef}
        slotsRef={slotsRef}
        motionRef={motionRef}
        onFocusAddressChange={onFocusAddressChange}
      />
    </>
  );
}

/* ─── Outer shell + HUD ─────────────────────────────────────────────────── */

function Scene({
  peers,
  myNodeHeight: _myNodeHeight,
  isOnline,
  onPeerHover,
  lastBlockHeight,
  hideControls = false,
  centerLabel = "Lumen Node",
}: ConstellationProps) {
  const controlsApiRef = useRef<ControlsApi | null>(null);
  const ambienceRef = useRef<AmbienceController | null>(null);
  const [infoPeer, setInfoPeer] = useState<Peer | null>(null);
  const [hoveredPos, setHoveredPos] = useState<THREE.Vector3 | null>(null);
  /** Soft hide so adjacent-node raycast flicker does not flash the card */
  const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const [isAutoOrbit, setIsAutoOrbit] = useState(true);
  const [orbitSpeed, setOrbitSpeed] = useState(1.0);
  const [propagationStart, setPropagationStart] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const [musicVol, setMusicVol] = useState(0.4);
  const [musicMode, setMusicMode] = useState<AmbienceMode>("off");
  const [musicBusy, setMusicBusy] = useState(false);
  const [focusAddress, setFocusAddress] = useState<string | null>(null);
  const [searchClearToken, setSearchClearToken] = useState(0);

  const clearSearchFocus = useCallback(() => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
    setFocusAddress(null);
    controlsApiRef.current?.clearPeerFocus();
    setInfoPeer(null);
    setHoveredPos(null);
    onPeerHover?.(null);
    setSearchClearToken((n) => n + 1);
    // Do not force auto-orbit back on — respect user's OFF choice
  }, [onPeerHover]);

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

  const searchNodes = useMemo(
    () => peers.map((p, i) => peerToSearchable(p, i)),
    [peers]
  );

  const shellCounts = useMemo(() => {
    const now = Date.now();
    let live = 0,
      seen = 0,
      ghost = 0;
    for (const p of peers) {
      const s = shellFromPeer(p, now);
      if (s === "live") live++;
      else if (s === "seen") seen++;
      else ghost++;
    }
    return { live, seen, ghost };
  }, [peers]);

  const handleSearchSelect = useCallback(
    (node: SearchableNode) => {
      const address = node.id;
      setIsAutoOrbit(false);
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
        if (hoverHideTimerRef.current) {
          clearTimeout(hoverHideTimerRef.current);
          hoverHideTimerRef.current = null;
        }
        setInfoPeer(peer);
        onPeerHover?.(peer);
      }
      try {
        window.dispatchEvent(new Event("lumen-invite-wake"));
      } catch {
        /* */
      }
    },
    [peers, onPeerHover]
  );

  const triggerBlockPropagation = useCallback(() => {
    if (peers.length === 0) return;
    setPropagationStart(Date.now());
  }, [peers.length]);

  useEffect(() => {
    if (lastBlockHeight > 0 && peers.length > 0) {
      const timer = window.setTimeout(() => triggerBlockPropagation(), 420);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBlockHeight]);

  const handlePeerHover = useCallback<PeerHoverFn>(
    (peer, pos) => {
      if (hoverHideTimerRef.current) {
        clearTimeout(hoverHideTimerRef.current);
        hoverHideTimerRef.current = null;
      }
      if (peer) {
        setInfoPeer(peer);
        setHoveredPos(pos || null);
        onPeerHover?.(peer);
        return;
      }
      // Leave node → auto-dismiss (short delay only to bridge raycast gaps)
      onPeerHover?.(null);
      hoverHideTimerRef.current = setTimeout(() => {
        setInfoPeer(null);
        setHoveredPos(null);
        hoverHideTimerRef.current = null;
      }, 90);
    },
    [onPeerHover]
  );

  useEffect(() => {
    return () => {
      if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
    };
  }, []);

  const floatingStyle = useMemo(() => {
    if (!hoveredPos) {
      return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
    }
    const rawX = 50 + hoveredPos.x * 2.2;
    const rawY = 48 - hoveredPos.y * 2.0;
    const left = Math.min(78, Math.max(22, rawX));
    const top = Math.min(72, Math.max(18, rawY));
    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: "translate(-50%, -50%)",
    };
  }, [hoveredPos]);

  const infoShell = infoPeer ? shellFromPeer(infoPeer, Date.now()) : null;
  const shellLabel =
    infoShell === "live"
      ? "LIVE"
      : infoShell === "seen"
        ? "SEEN"
        : infoShell === "ghost"
          ? "GHOST"
          : "PEER";

  const infoLastSec =
    infoPeer?.lastMessage != null
      ? Math.max(
          0,
          Math.round((Date.now() - peerLastMs(infoPeer.lastMessage)) / 1000)
        )
      : null;

  const shortAddr = (addr: string) => {
    const a = addr.replace(/^\//, "");
    if (a.length <= 22) return a;
    return `${a.slice(0, 10)}…${a.slice(-8)}`;
  };

  const infoCardBody = infoPeer ? (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{
            background: infoShell ? SHELL_COLOR[infoShell] : "#C8D0E0",
            boxShadow: infoShell
              ? `0 0 8px ${SHELL_COLOR[infoShell]}`
              : undefined,
          }}
        />
        <div
          className="font-mono text-[10px] tracking-[0.18em] uppercase"
          style={{ color: infoShell ? SHELL_COLOR[infoShell] : "#A0A0B0" }}
        >
          {shellLabel}
        </div>
      </div>

      {infoPeer.name ? (
        <>
          <div className="text-[13px] sm:text-sm font-medium text-white leading-snug truncate">
            {infoPeer.name}
          </div>
          <div
            className="font-mono text-[11px] text-[#8B8B9A] leading-snug truncate"
            title={infoPeer.address}
          >
            {shortAddr(infoPeer.address)}
          </div>
        </>
      ) : (
        <div
          className="font-mono text-[12px] sm:text-[13px] text-white leading-snug break-all"
          title={infoPeer.address}
        >
          {shortAddr(infoPeer.address)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[10px] font-mono text-[#6B6B78] tracking-wide">
        {infoPeer.connectionType ? (
          <span className="text-[#A0A0B0]">{infoPeer.connectionType}</span>
        ) : null}
        {infoLastSec != null ? <span>last {infoLastSec}s</span> : null}
      </div>
    </div>
  ) : null;

  const focusOnMyNode = () => {
    setIsAutoOrbit(false);
    setFocusAddress(null);
    controlsApiRef.current?.focus();
  };

  const toggleAutoOrbit = () => {
    setIsAutoOrbit((v) => !v);
  };

  const onOrbitSpeedChange = (v: number) => {
    setOrbitSpeed(Math.min(5, Math.max(0.25, v)));
  };

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
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbitSpeed, musicOn, musicBusy]);

  return (
    <div ref={vizRef} className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [0, 3.2, 8], fov: 42 }}
        className="!absolute !inset-0 !h-full !w-full"
        style={{ width: "100%", height: "100%", display: "block" }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
        dpr={[1, 1.5]}
        gl={{
          alpha: false,
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        }}
        onPointerMissed={() => {
          /* sticky card — don't clear on miss */
        }}
      >
        <NetworkOrbitWorld
          peers={peers}
          isOnline={isOnline}
          centerLabel={centerLabel || "Lumen Node"}
          onPeerHover={handlePeerHover}
          propagationStart={propagationStart}
          autoOrbit={isAutoOrbit}
          orbitSpeed={orbitSpeed}
          controlsApiRef={controlsApiRef}
          focusAddress={focusAddress}
          onFocusAddressChange={setFocusAddress}
        />
      </Canvas>

      {/* Mobile search */}
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

      {/* Mobile FOCUS */}
      {!hideControls && (
        <div className="md:hidden absolute bottom-0 inset-x-0 z-30 pointer-events-none flex items-end justify-end gap-3 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={focusOnMyNode}
            className="pointer-events-auto flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-2xl text-[10px] font-mono tracking-wider border border-white/20 bg-[#0A0A0F]/92 text-[#E8E8F0] shadow-lg backdrop-blur-md active:scale-[0.97]"
          >
            FOCUS
          </button>
        </div>
      )}

      {/* Desktop left: search */}
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

      {/* Desktop right: controls */}
      {!hideControls && (
        <div
          className={`hidden md:flex absolute top-4 right-4 z-20 flex-col gap-2 ${HUD_PANEL_W}`}
        >
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
                <span>ORBIT SPEED</span>
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
                aria-label="Orbit speed"
              />
              <div className="flex justify-between text-[9px] font-mono text-[#A0A0B0]/50">
                <span>0.25×</span>
                <span>[ ] keys</span>
                <span>5×</span>
              </div>
            </div>
          </div>

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
        </div>
      )}

      {/* Peer hover card — auto-dismiss on leave; no close control */}
      <AnimatePresence>
        {infoPeer && !focusAddress && (
          <>
            <motion.div
              key="peer-info-mobile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden absolute z-40 left-2.5 right-2.5 bottom-[4.25rem] pointer-events-none"
            >
              <div
                className="rounded-2xl px-4 py-3 text-sm border border-white/[0.09] max-h-[min(32vh,200px)] overflow-hidden"
                style={{
                  background:
                    "linear-gradient(165deg, rgba(18,22,28,0.94) 0%, rgba(8,10,14,0.97) 100%)",
                  boxShadow:
                    "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 28px rgba(0,229,255,0.06)",
                  backdropFilter: "blur(16px)",
                }}
              >
                {infoCardBody}
              </div>
            </motion.div>

            <motion.div
              key="peer-info-desktop"
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="hidden md:block absolute z-30 pointer-events-none"
              style={floatingStyle}
            >
              <div
                className="rounded-2xl px-4 py-3 text-sm w-[min(248px,30vw)] border border-white/[0.09]"
                style={{
                  background:
                    "linear-gradient(165deg, rgba(18,22,28,0.94) 0%, rgba(8,10,14,0.97) 100%)",
                  boxShadow:
                    "0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 32px rgba(0,229,255,0.07)",
                  backdropFilter: "blur(16px)",
                }}
              >
                {infoCardBody}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div
        className={`hidden md:block absolute bottom-4 left-4 z-20 ${HUD_PANEL_W} pointer-events-none`}
      >
        <div className={`${HUD_CARD} text-[10px] font-mono tracking-widest`}>
          <div className="text-[9px] text-[#E8C48A]/80 tracking-[0.2em] mb-2">
            NETWORK ORBIT
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[#A0A0B0]">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#E8C48A]" />
              YOU
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: SHELL_COLOR.live }}
              />
              LIVE {shellCounts.live}
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: SHELL_COLOR.seen }}
              />
              SEEN {shellCounts.seen}
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: SHELL_COLOR.ghost }}
              />
              GHOST {shellCounts.ghost}
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
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: SHELL_COLOR.live }}
          />{" "}
          LIVE
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: SHELL_COLOR.seen }}
          />{" "}
          SEEN
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: SHELL_COLOR.ghost }}
          />{" "}
          GHOST
        </span>
        <span className="opacity-50">Pinch · drag · O orbit · F focus</span>
      </div>
    </div>
  );
}
