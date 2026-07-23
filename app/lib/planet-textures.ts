/**
 * Procedural planet surface + ring textures for Aether constellation.
 * Canvas-based, generated once per type, shared across peers (stable, offline).
 */

import * as THREE from "three";

export type PlanetKind =
  | "earthlike"
  | "desert"
  | "ice"
  | "gas"
  | "volcanic"
  | "ocean"
  | "rocky"
  | "toxic";

export interface PlanetArchetype {
  kind: PlanetKind;
  /** Soft atmosphere rim color */
  atmosphere: string;
  roughness: number;
  metalness: number;
  bumpScale: number;
  hasRingsChance: number;
  ringColor: string;
  sizeMul: [number, number]; // min/max radius scale
}

export const PLANET_ARCHETYPES: Record<PlanetKind, PlanetArchetype> = {
  earthlike: {
    kind: "earthlike",
    atmosphere: "#7ec8ff",
    roughness: 0.72,
    metalness: 0.05,
    bumpScale: 0.035,
    hasRingsChance: 0.08,
    ringColor: "#c8d8e8",
    sizeMul: [0.42, 0.62],
  },
  desert: {
    kind: "desert",
    atmosphere: "#e8c080",
    roughness: 0.88,
    metalness: 0.02,
    bumpScale: 0.05,
    hasRingsChance: 0.05,
    ringColor: "#d4a574",
    sizeMul: [0.4, 0.58],
  },
  ice: {
    kind: "ice",
    atmosphere: "#b8e0ff",
    roughness: 0.45,
    metalness: 0.12,
    bumpScale: 0.03,
    hasRingsChance: 0.12,
    ringColor: "#d0e8ff",
    sizeMul: [0.38, 0.55],
  },
  gas: {
    kind: "gas",
    atmosphere: "#c4b090",
    roughness: 0.55,
    metalness: 0.08,
    bumpScale: 0.012,
    hasRingsChance: 0.45,
    ringColor: "#e8dcc8",
    sizeMul: [0.55, 0.85],
  },
  volcanic: {
    kind: "volcanic",
    atmosphere: "#ff6a40",
    roughness: 0.8,
    metalness: 0.15,
    bumpScale: 0.06,
    hasRingsChance: 0.04,
    ringColor: "#8a6050",
    sizeMul: [0.38, 0.56],
  },
  ocean: {
    kind: "ocean",
    atmosphere: "#4a90d0",
    roughness: 0.35,
    metalness: 0.18,
    bumpScale: 0.02,
    hasRingsChance: 0.06,
    ringColor: "#90b8d0",
    sizeMul: [0.44, 0.66],
  },
  rocky: {
    kind: "rocky",
    atmosphere: "#a0a0a8",
    roughness: 0.92,
    metalness: 0.04,
    bumpScale: 0.055,
    hasRingsChance: 0.03,
    ringColor: "#909098",
    sizeMul: [0.32, 0.5],
  },
  toxic: {
    kind: "toxic",
    atmosphere: "#80e0a0",
    roughness: 0.65,
    metalness: 0.1,
    bumpScale: 0.04,
    hasRingsChance: 0.15,
    ringColor: "#a0d0b0",
    sizeMul: [0.4, 0.6],
  },
};

const KINDS: PlanetKind[] = [
  "earthlike",
  "desert",
  "ice",
  "gas",
  "volcanic",
  "ocean",
  "rocky",
  "toxic",
];

/* ─── seeded PRNG ───────────────────────────────────────────────────────── */

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

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function kindFromAddress(address: string): PlanetKind {
  return KINDS[hashString(address) % KINDS.length];
}

export function seededFloat(address: string, salt: string): number {
  return mulberry32(hashString(address + ":" + salt))();
}

/* ─── value noise ───────────────────────────────────────────────────────── */

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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
    const n00 = grad(x0, y0);
    const n10 = grad(x0 + 1, y0);
    const n01 = grad(x0, y0 + 1);
    const n11 = grad(x0 + 1, y0 + 1);
    return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
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

/* ─── color helpers ─────────────────────────────────────────────────────── */

type RGB = [number, number, number];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/* ─── surface painters ──────────────────────────────────────────────────── */

function paintEarthlike(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 91);
  const ocean: RGB = [18, 52, 110];
  const shallow: RGB = [30, 110, 150];
  const shore: RGB = [194, 178, 128];
  const land: RGB = [52, 110, 48];
  const mountain: RGB = [110, 100, 90];
  const snow: RGB = [230, 235, 240];
  const desert: RGB = [170, 140, 80];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      // equirect-ish coords
      const elev = fbm(n1, u * 6, v * 3, 5) * 0.55 + fbm(n2, u * 12, v * 6, 3) * 0.2;
      const lat = Math.abs(v * 2 - 1); // poles
      const moisture = fbm(n2, u * 4 + 3, v * 4, 4);

      let c: RGB;
      if (elev < -0.05) {
        c = mix(ocean, shallow, clamp01((elev + 0.35) / 0.3));
      } else if (elev < 0.02) {
        c = shore;
      } else if (elev > 0.38 || lat > 0.82) {
        c = mix(mountain, snow, clamp01((elev - 0.3) * 2 + lat));
      } else if (moisture < -0.1 && lat < 0.55) {
        c = mix(desert, land, clamp01(moisture + 0.3));
      } else {
        c = mix(land, mountain, clamp01((elev - 0.05) * 1.5));
      }

      // subtle cloud streaks
      const clouds = fbm(n1, u * 8 + 10, v * 4, 3);
      if (clouds > 0.28) {
        const ct = (clouds - 0.28) * 1.4;
        c = mix(c, [245, 248, 255], clamp01(ct * 0.55));
      }

      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

function paintDesert(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 17);
  const sand: RGB = [194, 150, 90];
  const dune: RGB = [160, 110, 60];
  const rock: RGB = [110, 80, 55];
  const dark: RGB = [70, 50, 35];
  const polar: RGB = [210, 200, 185];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const elev = fbm(n1, u * 7, v * 4, 5);
      const ridges = Math.abs(fbm(n2, u * 14, v * 7, 3));
      const lat = Math.abs(v * 2 - 1);
      let c = mix(sand, dune, clamp01(elev * 0.8 + 0.4));
      if (ridges > 0.35) c = mix(c, rock, (ridges - 0.35) * 2);
      if (elev < -0.25) c = dark;
      if (lat > 0.88) c = mix(c, polar, (lat - 0.88) * 8);
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

function paintIce(data: Uint8ClampedArray, w: number, h: number, seed: number) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 33);
  const ice: RGB = [210, 225, 240];
  const deep: RGB = [140, 175, 210];
  const crack: RGB = [90, 120, 160];
  const snow: RGB = [245, 250, 255];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const elev = fbm(n1, u * 5, v * 3, 4);
      const cracks = Math.abs(fbm(n2, u * 18, v * 10, 2));
      let c = mix(deep, ice, clamp01(elev + 0.5));
      if (cracks > 0.42) c = mix(c, crack, (cracks - 0.42) * 2.5);
      if (elev > 0.25) c = mix(c, snow, (elev - 0.25) * 2);
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

function paintGas(data: Uint8ClampedArray, w: number, h: number, seed: number) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 55);
  const bands: RGB[] = [
    [180, 140, 100],
    [210, 180, 140],
    [150, 110, 80],
    [230, 200, 160],
    [120, 90, 70],
    [200, 160, 120],
  ];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const bandNoise = fbm(n1, u * 3, v * 14, 3) * 0.08;
      const band = Math.floor(((v + bandNoise) * bands.length * 1.8) % bands.length);
      const swirl = fbm(n2, u * 8 + v * 2, v * 6, 4);
      let c = bands[Math.abs(band) % bands.length];
      c = mix(c, bands[(band + 1) % bands.length], clamp01(swirl * 0.5 + 0.35));
      // great-spot-ish
      const cx = 0.35;
      const cy = 0.55;
      const dx = (u - cx) * 2.2;
      const dy = (v - cy) * 4;
      if (dx * dx + dy * dy < 0.04) {
        c = mix(c, [200, 90, 60], 0.55);
      }
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

function paintVolcanic(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 71);
  const rock: RGB = [40, 35, 38];
  const basalt: RGB = [55, 48, 50];
  const ash: RGB = [80, 70, 65];
  const lava: RGB = [255, 90, 30];
  const glow: RGB = [255, 180, 60];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const elev = fbm(n1, u * 6, v * 4, 5);
      const cracks = fbm(n2, u * 16, v * 10, 3);
      let c = mix(rock, basalt, clamp01(elev + 0.5));
      if (elev > 0.15) c = mix(c, ash, (elev - 0.15) * 1.5);
      // lava veins
      if (cracks > 0.32 && elev < 0.2) {
        const t = (cracks - 0.32) * 3;
        c = mix(c, mix(lava, glow, t), clamp01(t));
      }
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

function paintOcean(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 12);
  const deep: RGB = [8, 30, 70];
  const mid: RGB = [20, 70, 120];
  const shallow: RGB = [40, 130, 160];
  const island: RGB = [60, 120, 55];
  const beach: RGB = [200, 185, 130];
  const cloud: RGB = [240, 245, 255];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const elev = fbm(n1, u * 5, v * 3, 5);
      let c: RGB;
      if (elev > 0.28) c = elev > 0.34 ? island : beach;
      else if (elev > 0.1) c = shallow;
      else if (elev > -0.05) c = mid;
      else c = deep;
      const cl = fbm(n2, u * 7 + 2, v * 3, 3);
      if (cl > 0.3) c = mix(c, cloud, (cl - 0.3) * 0.7);
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

function paintRocky(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 99);
  const base: RGB = [120, 115, 110];
  const dark: RGB = [55, 52, 50];
  const light: RGB = [170, 165, 158];
  const crater: RGB = [40, 38, 36];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const elev = fbm(n1, u * 8, v * 5, 5);
      let c = mix(dark, base, clamp01(elev + 0.45));
      if (elev > 0.2) c = mix(c, light, (elev - 0.2) * 1.5);
      // crater-ish dips
      const cr = fbm(n2, u * 20, v * 12, 2);
      if (cr > 0.4) c = mix(c, crater, (cr - 0.4) * 2);
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

function paintToxic(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seed: number
) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 41);
  const base: RGB = [40, 70, 45];
  const acid: RGB = [120, 200, 80];
  const purple: RGB = [90, 50, 120];
  const dark: RGB = [20, 30, 25];
  const glow: RGB = [180, 255, 120];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const elev = fbm(n1, u * 6, v * 4, 4);
      const veins = fbm(n2, u * 14, v * 8, 3);
      let c = mix(dark, base, clamp01(elev + 0.5));
      if (elev > 0.1) c = mix(c, acid, (elev - 0.1) * 1.2);
      if (veins > 0.25) c = mix(c, purple, (veins - 0.25) * 1.4);
      if (veins > 0.4) c = mix(c, glow, (veins - 0.4) * 1.5);
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

const PAINTERS: Record<
  PlanetKind,
  (d: Uint8ClampedArray, w: number, h: number, s: number) => void
> = {
  earthlike: paintEarthlike,
  desert: paintDesert,
  ice: paintIce,
  gas: paintGas,
  volcanic: paintVolcanic,
  ocean: paintOcean,
  rocky: paintRocky,
  toxic: paintToxic,
};

/* ─── texture factory + cache ───────────────────────────────────────────── */

export interface PlanetTextures {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

const diffuseCache = new Map<string, PlanetTextures>();
const ringCache = new Map<string, THREE.CanvasTexture>();

function makeBumpFromDiffuse(
  data: Uint8ClampedArray,
  w: number,
  h: number
): ImageData {
  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = Math.min(255, r * 0.35 + g * 0.45 + b * 0.2);
    out.data[i * 4] = lum;
    out.data[i * 4 + 1] = lum;
    out.data[i * 4 + 2] = lum;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

export function getPlanetTextures(
  kind: PlanetKind,
  resolution = 256,
  seed = 1
): PlanetTextures {
  const key = `${kind}:${resolution}:${seed}`;
  const hit = diffuseCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.createImageData(resolution, resolution);
  PAINTERS[kind](img.data, resolution, resolution, seed);
  ctx.putImageData(img, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.needsUpdate = true;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = resolution;
  bumpCanvas.height = resolution;
  const bctx = bumpCanvas.getContext("2d")!;
  bctx.putImageData(makeBumpFromDiffuse(img.data, resolution, resolution), 0, 0);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.needsUpdate = true;

  const pack = { map, bumpMap };
  diffuseCache.set(key, pack);
  return pack;
}

/** Elegant ring texture: radial alpha bands */
export function getRingTexture(color = "#e8dcc8", seed = 1): THREE.CanvasTexture {
  const key = `${color}:${seed}`;
  const hit = ringCache.get(key);
  if (hit) return hit;

  const w = 512;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(seed + 777);

  // parse hex-ish color roughly
  const c = new THREE.Color(color);

  for (let x = 0; x < w; x++) {
    const t = x / w; // 0 inner → 1 outer
    // cassini-like gaps
    let alpha = 0;
    if (t > 0.08 && t < 0.95) {
      alpha = 0.35 + Math.sin(t * 40) * 0.08 + Math.sin(t * 120) * 0.04;
      if (t > 0.42 && t < 0.48) alpha *= 0.15; // gap
      if (t > 0.7 && t < 0.73) alpha *= 0.25;
      alpha *= 0.55 + rand() * 0.15;
    }
    alpha = clamp01(alpha);
    const shade = 0.75 + Math.sin(t * 55) * 0.15;
    ctx.fillStyle = `rgba(${Math.floor(c.r * 255 * shade)},${Math.floor(
      c.g * 255 * shade
    )},${Math.floor(c.b * 255 * shade)},${alpha})`;
    ctx.fillRect(x, 0, 1, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  ringCache.set(key, tex);
  return tex;
}

/** Home / Your Node — high-res earthlike with unique seed */
export function getHomePlanetTextures(): PlanetTextures {
  return getPlanetTextures("earthlike", 512, 4242);
}
