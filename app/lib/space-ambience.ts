/**
 * Cinematic space ambience for Lumen 3D constellation.
 *
 * 1) If the operator places a licensed track at /public/audio/stay.mp3
 *    (or stay.ogg / constellation.mp3), that file is played on loop.
 * 2) Otherwise an original Web Audio pad plays — NOT the Interstellar
 *    soundtrack (Hans Zimmer / WaterTower are copyrighted; we cannot
 *    redistribute "Stay" with the app).
 */

export type AmbienceMode = "file" | "synth" | "off";

export interface AmbienceController {
  play: () => Promise<void>;
  pause: () => void;
  setVolume: (v: number) => void;
  getVolume: () => number;
  isPlaying: () => boolean;
  getMode: () => AmbienceMode;
  /** "file" | "synth" | "none" — what would play if started */
  getSourceLabel: () => string;
  dispose: () => void;
}

const FILE_CANDIDATES = [
  "/audio/stay.mp3",
  "/audio/stay.ogg",
  "/audio/interstellar-stay.mp3",
  "/audio/constellation.mp3",
];

async function findAudioFile(): Promise<string | null> {
  for (const url of FILE_CANDIDATES) {
    try {
      const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-2" } });
      if (res.ok || res.status === 206) return url;
    } catch {
      /* try next */
    }
  }
  return null;
}

function createSynthAmbience(
  ctx: AudioContext,
  master: GainNode
): { start: () => void; stop: () => void } {
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  let stopped = false;
  let sparkTimer = 0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 720;
  filter.Q.value = 0.55;
  filter.connect(master);

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 0.04;
  lfoGain.gain.value = 200;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  oscs.push(lfo);

  // Original slow open-voicing pad (not a film score)
  const layers: { freq: number; type: OscillatorType; gain: number; detune: number }[] = [
    { freq: 55.0, type: "sine", gain: 0.15, detune: 0 },
    { freq: 82.4, type: "sine", gain: 0.11, detune: -3 },
    { freq: 110.0, type: "triangle", gain: 0.05, detune: 4 },
    { freq: 164.8, type: "sine", gain: 0.04, detune: -2 },
    { freq: 220.0, type: "sine", gain: 0.028, detune: 5 },
    { freq: 329.6, type: "triangle", gain: 0.015, detune: 0 },
  ];

  const start = () => {
    const t0 = ctx.currentTime;
    for (const layer of layers) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = layer.type;
      osc.frequency.value = layer.freq;
      osc.detune.value = layer.detune;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(layer.gain, t0 + 5);
      osc.connect(g);
      g.connect(filter);
      osc.start(t0);
      oscs.push(osc);
      gains.push(g);
    }

    const spark = () => {
      if (stopped) return;
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 620 + Math.random() * 480;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.014, now + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 4);
      o.connect(g);
      g.connect(filter);
      o.start(now);
      o.stop(now + 4.2);
      sparkTimer = window.setTimeout(spark, 9000 + Math.random() * 14000);
    };
    sparkTimer = window.setTimeout(spark, 6000);
  };

  const stop = () => {
    stopped = true;
    window.clearTimeout(sparkTimer);
    const now = ctx.currentTime;
    for (const g of gains) {
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
        g.gain.linearRampToValueAtTime(0.0001, now + 1.4);
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => {
      for (const o of oscs) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* ignore */
        }
      }
      filter.disconnect();
    }, 1500);
  };

  return { start, stop };
}

export function createAmbienceController(): AmbienceController {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let synth: { start: () => void; stop: () => void } | null = null;
  let mode: AmbienceMode = "off";
  let playing = false;
  let volume = 0.4;
  let disposed = false;
  let sourceLabel = "none";

  const ensureCtx = () => {
    if (ctx) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  };

  return {
    async play() {
      if (disposed || playing) return;
      ensureCtx();
      if (!ctx || !master) return;
      if (ctx.state === "suspended") await ctx.resume();

      const fileUrl = await findAudioFile();
      if (fileUrl) {
        audioEl = new Audio(fileUrl);
        audioEl.loop = true;
        audioEl.preload = "auto";
        audioEl.volume = volume;
        await audioEl.play();
        mode = "file";
        sourceLabel = fileUrl;
        playing = true;
        return;
      }

      synth = createSynthAmbience(ctx, master);
      synth.start();
      mode = "synth";
      sourceLabel = "lumen-pad";
      playing = true;
    },

    pause() {
      if (!playing) return;
      if (audioEl) {
        audioEl.pause();
        audioEl.src = "";
        audioEl = null;
      }
      if (synth) {
        synth.stop();
        synth = null;
      }
      playing = false;
      mode = "off";
    },

    setVolume(v: number) {
      volume = Math.min(1, Math.max(0, v));
      if (master) {
        master.gain.setTargetAtTime(volume, master.context.currentTime, 0.04);
      }
      if (audioEl) audioEl.volume = volume;
    },

    getVolume: () => volume,
    isPlaying: () => playing,
    getMode: () => mode,
    getSourceLabel: () => sourceLabel,

    dispose() {
      disposed = true;
      if (audioEl) {
        audioEl.pause();
        audioEl = null;
      }
      if (synth) {
        synth.stop();
        synth = null;
      }
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
      master = null;
      playing = false;
      mode = "off";
    },
  };
}
