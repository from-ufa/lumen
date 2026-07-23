/**
 * Real planetary textures for Aether constellation (NASA-style look).
 * Sources (public / free for educational use):
 *  - Solar System Scope (CC-BY 4.0): sun, mars, jupiter, saturn, rings, …
 *  - three.js examples: earth maps, moon
 * Served from /public/planets/
 */

import * as THREE from "three";

export type PlanetKind =
  | "earthlike"
  | "mars"
  | "mercury"
  | "venus"
  | "jupiter"
  | "saturn"
  | "neptune"
  | "uranus"
  | "moon";

export interface PlanetArchetype {
  kind: PlanetKind;
  /** Thin natural atmosphere tint (subtle) */
  atmosphere: string;
  atmosphereIntensity: number;
  roughness: number;
  metalness: number;
  hasRings: boolean;
  sizeMul: [number, number];
  mapUrl: string;
  normalUrl?: string;
  specularUrl?: string;
  label: string;
}

export const PLANET_ARCHETYPES: Record<PlanetKind, PlanetArchetype> = {
  earthlike: {
    kind: "earthlike",
    atmosphere: "#9ec9f0",
    atmosphereIntensity: 0.45,
    roughness: 0.78,
    metalness: 0.04,
    hasRings: false,
    sizeMul: [0.48, 0.62],
    mapUrl: "/planets/earth_atmos_2048.jpg",
    normalUrl: "/planets/earth_normal_2048.jpg",
    specularUrl: "/planets/earth_specular_2048.jpg",
    label: "terrestrial",
  },
  mars: {
    kind: "mars",
    atmosphere: "#c4a882",
    atmosphereIntensity: 0.18,
    roughness: 0.92,
    metalness: 0.02,
    hasRings: false,
    sizeMul: [0.36, 0.48],
    mapUrl: "/planets/mars_2k.jpg",
    label: "martian",
  },
  mercury: {
    kind: "mercury",
    atmosphere: "#a8a8a8",
    atmosphereIntensity: 0.04,
    roughness: 0.95,
    metalness: 0.08,
    hasRings: false,
    sizeMul: [0.28, 0.4],
    mapUrl: "/planets/mercury_2k.jpg",
    label: "mercurian",
  },
  venus: {
    kind: "venus",
    atmosphere: "#e8d0a0",
    atmosphereIntensity: 0.35,
    roughness: 0.7,
    metalness: 0.03,
    hasRings: false,
    sizeMul: [0.44, 0.58],
    mapUrl: "/planets/venus_2k.jpg",
    label: "venusian",
  },
  jupiter: {
    kind: "jupiter",
    atmosphere: "#d4c0a0",
    atmosphereIntensity: 0.22,
    roughness: 0.55,
    metalness: 0.02,
    hasRings: false,
    sizeMul: [0.72, 0.95],
    mapUrl: "/planets/jupiter_2k.jpg",
    label: "jovian",
  },
  saturn: {
    kind: "saturn",
    atmosphere: "#e0d0b0",
    atmosphereIntensity: 0.2,
    roughness: 0.58,
    metalness: 0.02,
    hasRings: true,
    sizeMul: [0.62, 0.82],
    mapUrl: "/planets/saturn_2k.jpg",
    label: "saturnian",
  },
  neptune: {
    kind: "neptune",
    atmosphere: "#6a9fd4",
    atmosphereIntensity: 0.28,
    roughness: 0.5,
    metalness: 0.04,
    hasRings: false,
    sizeMul: [0.5, 0.68],
    mapUrl: "/planets/neptune_2k.jpg",
    label: "neptunian",
  },
  uranus: {
    kind: "uranus",
    atmosphere: "#a8d4d0",
    atmosphereIntensity: 0.25,
    roughness: 0.52,
    metalness: 0.04,
    hasRings: false,
    sizeMul: [0.48, 0.64],
    mapUrl: "/planets/uranus_2k.jpg",
    label: "uranian",
  },
  moon: {
    kind: "moon",
    atmosphere: "#909090",
    atmosphereIntensity: 0.02,
    roughness: 0.96,
    metalness: 0.02,
    hasRings: false,
    sizeMul: [0.26, 0.38],
    mapUrl: "/planets/moon_1024.jpg",
    label: "lunar",
  },
};

/** Weighted toward familiar Solar System variety */
const KIND_POOL: PlanetKind[] = [
  "earthlike",
  "earthlike",
  "mars",
  "mars",
  "mercury",
  "venus",
  "jupiter",
  "jupiter",
  "saturn",
  "saturn",
  "neptune",
  "uranus",
  "moon",
  "moon",
];

export const SUN_MAP_URL = "/planets/sun_2k.jpg";
export const RING_MAP_URL = "/planets/saturn_ring_2k.png";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function kindFromAddress(address: string): PlanetKind {
  return KIND_POOL[hashString(address) % KIND_POOL.length];
}

export function seededFloat(address: string, salt: string): number {
  return mulberry32(hashString(address + ":" + salt))();
}

/* ─── Texture loader cache ──────────────────────────────────────────────── */

const loader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;
const texCache = new Map<string, THREE.Texture>();
const pending = new Map<string, Promise<THREE.Texture>>();

function configureMap(tex: THREE.Texture, isColor = true) {
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function loadTexture(url: string, isColor = true): Promise<THREE.Texture> {
  if (!loader) return Promise.reject(new Error("no window"));
  const hit = texCache.get(url);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(url);
  if (p) return p;

  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        configureMap(tex, isColor);
        texCache.set(url, tex);
        pending.delete(url);
        resolve(tex);
      },
      undefined,
      (err) => {
        pending.delete(url);
        reject(err);
      }
    );
  });
  pending.set(url, promise);
  return promise;
}

export interface PlanetMaps {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  specularMap?: THREE.Texture;
}

const mapsCache = new Map<PlanetKind, Promise<PlanetMaps>>();

export function loadPlanetMaps(kind: PlanetKind): Promise<PlanetMaps> {
  const existing = mapsCache.get(kind);
  if (existing) return existing;

  const arch = PLANET_ARCHETYPES[kind];
  const promise = (async () => {
    const map = await loadTexture(arch.mapUrl, true);
    let normalMap: THREE.Texture | undefined;
    let specularMap: THREE.Texture | undefined;
    if (arch.normalUrl) {
      try {
        normalMap = await loadTexture(arch.normalUrl, false);
      } catch {
        /* optional */
      }
    }
    if (arch.specularUrl) {
      try {
        specularMap = await loadTexture(arch.specularUrl, false);
      } catch {
        /* optional */
      }
    }
    return { map, normalMap, specularMap };
  })();

  mapsCache.set(kind, promise);
  return promise;
}

export function loadSunMap(): Promise<THREE.Texture> {
  return loadTexture(SUN_MAP_URL, true);
}

export function loadRingMap(): Promise<THREE.Texture> {
  return loadTexture(RING_MAP_URL, true);
}

/** Preload common assets once Canvas mounts */
export function preloadSolarAssets(): void {
  if (typeof window === "undefined") return;
  loadSunMap().catch(() => {});
  loadRingMap().catch(() => {});
  (Object.keys(PLANET_ARCHETYPES) as PlanetKind[]).forEach((k) => {
    loadPlanetMaps(k).catch(() => {});
  });
}
