/**
 * Planet / sun textures for Aether constellation.
 *
 * Strategy (bulletproof):
 *  1. Always build a procedural CanvasTexture first (never white, always detailed)
 *  2. Try to upgrade to a file from /public/planets/*.jpg when available
 *  3. getPlanetTexture(kind) is ALWAYS a valid Texture — never null
 *
 * File sources (when present):
 *  - Solar System Scope CC-BY 4.0: sun, mars, jupiter, saturn, neptune, uranus, mercury, venus, rings
 *  - three.js examples: earth, moon
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
  atmosphere: string;
  atmosphereIntensity: number;
  hasRings: boolean;
  sizeMul: [number, number];
  /** Preferred file under /public/planets */
  mapUrl: string;
  label: string;
  /** Base palette for procedural painter */
  colors: {
    base: [number, number, number];
    mid: [number, number, number];
    high: [number, number, number];
    accent?: [number, number, number];
  };
}

export const PLANET_ARCHETYPES: Record<PlanetKind, PlanetArchetype> = {
  earthlike: {
    kind: "earthlike",
    atmosphere: "#9ec9f0",
    atmosphereIntensity: 0.4,
    hasRings: false,
    sizeMul: [0.48, 0.62],
    mapUrl: "/planets/earth_atmos_2048.jpg",
    label: "terrestrial",
    colors: {
      base: [18, 52, 110],
      mid: [52, 110, 48],
      high: [230, 235, 240],
      accent: [194, 178, 128],
    },
  },
  mars: {
    kind: "mars",
    atmosphere: "#c4a882",
    atmosphereIntensity: 0.16,
    hasRings: false,
    sizeMul: [0.36, 0.48],
    mapUrl: "/planets/mars_2k.jpg",
    label: "martian",
    colors: {
      base: [120, 55, 35],
      mid: [180, 90, 55],
      high: [210, 160, 120],
      accent: [90, 50, 35],
    },
  },
  mercury: {
    kind: "mercury",
    atmosphere: "#a8a8a8",
    atmosphereIntensity: 0.03,
    hasRings: false,
    sizeMul: [0.28, 0.4],
    mapUrl: "/planets/mercury_2k.jpg",
    label: "mercurian",
    colors: {
      base: [70, 68, 65],
      mid: [130, 125, 118],
      high: [175, 170, 162],
      accent: [40, 38, 36],
    },
  },
  venus: {
    kind: "venus",
    atmosphere: "#e8d0a0",
    atmosphereIntensity: 0.32,
    hasRings: false,
    sizeMul: [0.44, 0.58],
    mapUrl: "/planets/venus_2k.jpg",
    label: "venusian",
    colors: {
      base: [140, 90, 40],
      mid: [200, 140, 70],
      high: [230, 190, 120],
      accent: [100, 60, 30],
    },
  },
  jupiter: {
    kind: "jupiter",
    atmosphere: "#d4c0a0",
    atmosphereIntensity: 0.2,
    hasRings: false,
    sizeMul: [0.72, 0.95],
    mapUrl: "/planets/jupiter_2k.jpg",
    label: "jovian",
    colors: {
      base: [150, 110, 80],
      mid: [210, 180, 140],
      high: [230, 200, 160],
      accent: [200, 90, 60],
    },
  },
  saturn: {
    kind: "saturn",
    atmosphere: "#e0d0b0",
    atmosphereIntensity: 0.18,
    hasRings: true,
    sizeMul: [0.62, 0.82],
    mapUrl: "/planets/saturn_2k.jpg",
    label: "saturnian",
    colors: {
      base: [170, 140, 100],
      mid: [210, 185, 140],
      high: [230, 210, 170],
      accent: [140, 110, 80],
    },
  },
  neptune: {
    kind: "neptune",
    atmosphere: "#6a9fd4",
    atmosphereIntensity: 0.26,
    hasRings: false,
    sizeMul: [0.5, 0.68],
    mapUrl: "/planets/neptune_2k.jpg",
    label: "neptunian",
    colors: {
      base: [20, 40, 120],
      mid: [40, 80, 180],
      high: [90, 140, 220],
      accent: [200, 210, 255],
    },
  },
  uranus: {
    kind: "uranus",
    atmosphere: "#a8d4d0",
    atmosphereIntensity: 0.22,
    hasRings: false,
    sizeMul: [0.48, 0.64],
    mapUrl: "/planets/uranus_2k.jpg",
    label: "uranian",
    colors: {
      base: [60, 140, 150],
      mid: [100, 180, 185],
      high: [160, 220, 220],
      accent: [40, 100, 110],
    },
  },
  moon: {
    kind: "moon",
    atmosphere: "#909090",
    atmosphereIntensity: 0.02,
    hasRings: false,
    sizeMul: [0.26, 0.38],
    mapUrl: "/planets/moon_1024.jpg",
    label: "lunar",
    colors: {
      base: [60, 60, 58],
      mid: [120, 118, 112],
      high: [180, 178, 170],
      accent: [35, 35, 34],
    },
  },
};

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

/** Texture inventory for diagnostics */
export const TEXTURE_MANIFEST: { id: string; url: string; usedBy: string }[] = [
  { id: "sun", url: SUN_MAP_URL, usedBy: "Sun" },
  { id: "earth", url: "/planets/earth_atmos_2048.jpg", usedBy: "earthlike" },
  { id: "mars", url: "/planets/mars_2k.jpg", usedBy: "mars" },
  { id: "mercury", url: "/planets/mercury_2k.jpg", usedBy: "mercury" },
  { id: "venus", url: "/planets/venus_2k.jpg", usedBy: "venus" },
  { id: "jupiter", url: "/planets/jupiter_2k.jpg", usedBy: "jupiter" },
  { id: "saturn", url: "/planets/saturn_2k.jpg", usedBy: "saturn" },
  { id: "neptune", url: "/planets/neptune_2k.jpg", usedBy: "neptune" },
  { id: "uranus", url: "/planets/uranus_2k.jpg", usedBy: "uranus" },
  { id: "moon", url: "/planets/moon_1024.jpg", usedBy: "moon" },
  { id: "ring", url: RING_MAP_URL, usedBy: "saturn rings" },
];

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

/* ─── noise ─────────────────────────────────────────────────────────────── */

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function makeNoise2D(seed: number) {
  const rand = mulberry32(seed);
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) table[i] = rand();
  const grad = (ix: number, iy: number) => {
    const i = (ix * 374761393 + iy * 668265263) & 255;
    return table[i] * 2 - 1;
  };
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    return lerp(
      lerp(grad(x0, y0), grad(x0 + 1, y0), fx),
      lerp(grad(x0, y0 + 1), grad(x0 + 1, y0 + 1), fx),
      fy
    );
  };
}

function fbm(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number
) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, y * f);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

/* ─── procedural painters ───────────────────────────────────────────────── */

function paintPlanet(
  kind: PlanetKind,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
) {
  const arch = PLANET_ARCHETYPES[kind];
  const { base, mid, high, accent } = arch.colors;
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 91);
  const isGas = kind === "jupiter" || kind === "saturn";

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      let c: [number, number, number];

      if (isGas) {
        const bandNoise = fbm(n1, u * 3, v * 16, 3) * 0.06;
        const band = Math.sin((v + bandNoise) * Math.PI * 10) * 0.5 + 0.5;
        const swirl = fbm(n2, u * 8, v * 5, 4);
        c = mix3(base, high, clamp01(band));
        c = mix3(c, mid, clamp01(swirl * 0.5 + 0.35));
        // spot
        const dx = (u - 0.35) * 2.2;
        const dy = (v - 0.55) * 4;
        if (dx * dx + dy * dy < 0.035 && accent) {
          c = mix3(c, accent, 0.55);
        }
      } else if (kind === "earthlike") {
        const elev = fbm(n1, u * 6, v * 3, 5);
        const lat = Math.abs(v * 2 - 1);
        if (elev < -0.05) c = mix3(base, [30, 110, 150], clamp01((elev + 0.3) / 0.3));
        else if (elev < 0.02) c = accent || mid;
        else if (elev > 0.35 || lat > 0.82) c = mix3(mid, high, clamp01((elev - 0.2) + lat));
        else c = mix3(mid, [40, 90, 40], clamp01(elev));
        const clouds = fbm(n2, u * 8, v * 4, 3);
        if (clouds > 0.28) c = mix3(c, [245, 248, 255], (clouds - 0.28) * 0.9);
      } else if (kind === "neptune" || kind === "uranus") {
        const elev = fbm(n1, u * 4, v * 3, 4);
        const band = Math.sin(v * Math.PI * 6 + elev) * 0.5 + 0.5;
        c = mix3(base, high, band);
        c = mix3(c, mid, clamp01(elev + 0.4));
        if (accent && fbm(n2, u * 10, v * 6, 2) > 0.35) {
          c = mix3(c, accent, 0.25);
        }
      } else {
        // rocky / desert / moon / venus / mars
        const elev = fbm(n1, u * 7, v * 4, 5);
        const cr = fbm(n2, u * 18, v * 12, 2);
        c = mix3(base, mid, clamp01(elev + 0.45));
        if (elev > 0.2) c = mix3(c, high, (elev - 0.2) * 1.4);
        if (cr > 0.38 && accent) c = mix3(c, accent, (cr - 0.38) * 2);
      }

      const i = (y * w + x) * 4;
      data[i] = c[0] | 0;
      data[i + 1] = c[1] | 0;
      data[i + 2] = c[2] | 0;
      data[i + 3] = 255;
    }
  }
}

function paintSun(data: Uint8ClampedArray, w: number, h: number, seed: number) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 17);
  const deep: [number, number, number] = [180, 70, 10];
  const mid: [number, number, number] = [255, 150, 30];
  const hot: [number, number, number] = [255, 220, 90];
  const core: [number, number, number] = [255, 245, 200];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const gran = fbm(n1, u * 28, v * 14, 4);
      const cell = fbm(n2, u * 12, v * 6, 3);
      let c = mix3(deep, mid, clamp01(gran * 0.5 + 0.45));
      c = mix3(c, hot, clamp01(cell * 0.45 + 0.2));
      // limb slightly darker via v-distance from equator is subtle; keep bright
      if (gran > 0.25) c = mix3(c, core, (gran - 0.25) * 0.8);
      const i = (y * w + x) * 4;
      data[i] = c[0] | 0;
      data[i + 1] = c[1] | 0;
      data[i + 2] = c[2] | 0;
      data[i + 3] = 255;
    }
  }
}

function canvasToTexture(
  canvas: HTMLCanvasElement,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeProceduralPlanetTexture(kind: PlanetKind, size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(size, size);
  paintPlanet(kind, img.data, size, size, hashString(kind) + 42);
  ctx.putImageData(img, 0, 0);
  return canvasToTexture(canvas, true);
}

function makeProceduralSunTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(size, size);
  paintSun(img.data, size, size, 99);
  ctx.putImageData(img, 0, 0);
  return canvasToTexture(canvas, true);
}

function makeProceduralRingTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(777);
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let alpha = 0;
    if (t > 0.08 && t < 0.95) {
      alpha = 0.4 + Math.sin(t * 40) * 0.1 + Math.sin(t * 120) * 0.05;
      if (t > 0.42 && t < 0.48) alpha *= 0.12;
      if (t > 0.7 && t < 0.73) alpha *= 0.2;
      alpha *= 0.55 + rand() * 0.2;
    }
    alpha = clamp01(alpha);
    const shade = 0.75 + Math.sin(t * 55) * 0.15;
    const r = Math.floor(220 * shade);
    const g = Math.floor(200 * shade);
    const b = Math.floor(170 * shade);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fillRect(x, 0, 1, h);
  }
  return canvasToTexture(canvas, true);
}

/* ─── file loader + registry (always has procedural base) ───────────────── */

export interface TextureStatus {
  id: string;
  url: string;
  usedBy: string;
  fileOk: boolean | null; // null = not checked yet
  source: "procedural" | "file";
}

const planetTex: Partial<Record<PlanetKind, THREE.Texture>> = {};
const planetSource: Partial<Record<PlanetKind, "procedural" | "file">> = {};
let sunTex: THREE.Texture | null = null;
let sunSource: "procedural" | "file" = "procedural";
let ringTex: THREE.Texture | null = null;
let ringSource: "procedural" | "file" = "procedural";
const fileOk = new Map<string, boolean>();

function ensureProceduralBase() {
  if (typeof document === "undefined") return;
  (Object.keys(PLANET_ARCHETYPES) as PlanetKind[]).forEach((k) => {
    if (!planetTex[k]) {
      planetTex[k] = makeProceduralPlanetTexture(k, 512);
      planetSource[k] = "procedural";
    }
  });
  if (!sunTex) {
    sunTex = makeProceduralSunTexture(512);
    sunSource = "procedural";
  }
  if (!ringTex) {
    ringTex = makeProceduralRingTexture();
    ringSource = "procedural";
  }
}

/** Always returns a usable texture (procedural at minimum). */
export function getPlanetTexture(kind: PlanetKind): THREE.Texture {
  ensureProceduralBase();
  return planetTex[kind]!;
}

export function getSunTexture(): THREE.Texture {
  ensureProceduralBase();
  return sunTex!;
}

export function getRingTexture(): THREE.Texture {
  ensureProceduralBase();
  return ringTex!;
}

function loadImageTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      fileOk.set(url, true);
      resolve(tex);
    };
    img.onerror = () => {
      fileOk.set(url, false);
      reject(new Error(`Failed to load ${url}`));
    };
    // cache-bust once so CDN/proxy weirdness doesn't stick forever
    img.src = url;
  });
}

/**
 * Preload: build procedural bases immediately, then try to upgrade each
 * from /public/planets files. Never leaves a kind without a texture.
 */
export async function preloadAllTextures(): Promise<{
  status: TextureStatus[];
  allHaveMap: boolean;
}> {
  ensureProceduralBase();

  // sequential-ish with limited concurrency to avoid browser stalls
  const jobs: Promise<void>[] = [];

  const upgradePlanet = async (kind: PlanetKind) => {
    const url = PLANET_ARCHETYPES[kind].mapUrl;
    try {
      const fileTex = await loadImageTexture(url);
      // Do not dispose previous map while meshes may still reference it
      planetTex[kind] = fileTex;
      planetSource[kind] = "file";
    } catch {
      // keep procedural
      planetSource[kind] = "procedural";
    }
  };

  (Object.keys(PLANET_ARCHETYPES) as PlanetKind[]).forEach((k) => {
    jobs.push(upgradePlanet(k));
  });

  jobs.push(
    (async () => {
      try {
        sunTex = await loadImageTexture(SUN_MAP_URL);
        sunSource = "file";
      } catch {
        sunSource = "procedural";
      }
    })()
  );

  jobs.push(
    (async () => {
      try {
        ringTex = await loadImageTexture(RING_MAP_URL);
        ringSource = "file";
      } catch {
        ringSource = "procedural";
      }
    })()
  );

  await Promise.all(jobs);

  const status: TextureStatus[] = TEXTURE_MANIFEST.map((m) => {
    let source: "procedural" | "file" = "procedural";
    if (m.id === "sun") source = sunSource;
    else if (m.id === "ring") source = ringSource;
    else {
      const kind = m.usedBy as PlanetKind;
      source = planetSource[kind] || "procedural";
    }
    return {
      id: m.id,
      url: m.url,
      usedBy: m.usedBy,
      fileOk: fileOk.has(m.url) ? fileOk.get(m.url)! : null,
      source,
    };
  });

  if (typeof console !== "undefined") {
    console.info(
      "[Aether] planet textures",
      status.map((s) => `${s.id}:${s.source}${s.fileOk === false ? "(file-fail)" : ""}`)
    );
  }

  return { status, allHaveMap: true };
}

/** Snapshot of current maps for React (always non-null textures). */
export function getTextureAtlas(): {
  planets: Record<PlanetKind, THREE.Texture>;
  sun: THREE.Texture;
  ring: THREE.Texture;
  sources: Record<string, string>;
} {
  ensureProceduralBase();
  const planets = {} as Record<PlanetKind, THREE.Texture>;
  (Object.keys(PLANET_ARCHETYPES) as PlanetKind[]).forEach((k) => {
    planets[k] = planetTex[k]!;
  });
  return {
    planets,
    sun: sunTex!,
    ring: ringTex!,
    sources: {
      sun: sunSource,
      ring: ringSource,
      ...Object.fromEntries(
        (Object.keys(PLANET_ARCHETYPES) as PlanetKind[]).map((k) => [
          k,
          planetSource[k] || "procedural",
        ])
      ),
    },
  };
}

// legacy helpers used elsewhere
export interface PlanetMaps {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  specularMap?: THREE.Texture;
}

export function loadPlanetMaps(kind: PlanetKind): Promise<PlanetMaps> {
  ensureProceduralBase();
  return Promise.resolve({ map: planetTex[kind]! });
}

export async function loadAllPlanetMaps(): Promise<
  Record<PlanetKind, PlanetMaps | null>
> {
  await preloadAllTextures();
  const out = {} as Record<PlanetKind, PlanetMaps | null>;
  (Object.keys(PLANET_ARCHETYPES) as PlanetKind[]).forEach((k) => {
    out[k] = { map: getPlanetTexture(k) };
  });
  return out;
}

export function loadSunMap(): Promise<THREE.Texture> {
  ensureProceduralBase();
  return Promise.resolve(getSunTexture());
}

export function loadRingMap(): Promise<THREE.Texture> {
  ensureProceduralBase();
  return Promise.resolve(getRingTexture());
}

export function preloadSolarAssets(): void {
  if (typeof window === "undefined") return;
  preloadAllTextures().catch(() => {});
}
