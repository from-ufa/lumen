
'use client';

import React, { useRef, useEffect, useState } from 'react';

interface Oracle {
  name: string;
  ring: number;
  angle: number;
  speed: number;
  color: string;
  status: 'Active' | 'Verifying' | 'Offline' | 'Slashed';
  latency: number;
  accuracy: number;
  stake: number;
  reward: number;
  size: number;
  slashing: number;
  x?: number;
  y?: number;
  pulse?: number;
}

interface Datapoint {
  x: number; y: number;
  tx: number; ty: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
  isOutlier: boolean;
  source: string;
}

interface Reward {
  x: number; y: number;
  tx: number; ty: number;
  progress: number;
  speed: number;
  size: number;
}

interface SlashPart {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  color: string;
  size: number;
}

interface Ballot {
  x: number; y: number;
  angle: number;
  dist: number;
  speed: number;
  alpha: number;
}

interface GlowRing {
  r: number;
  a: number;
  color: string;
}

interface EpochData {
  epoch: number;
  price: number;
  sources: number;
  consensus: number;
}

export default function OracleConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<Oracle | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [epoch, setEpoch] = useState(1849);
  const [epochProgress, setEpochProgress] = useState(0);
  const [currentPrice, setCurrentPrice] = useState(67.43);
  const [confidence, setConfidence] = useState(98);
  const [activeSources, setActiveSources] = useState(12);
  const [poolFunds, setPoolFunds] = useState(2847);
  const [epochHistory, setEpochHistory] = useState<EpochData[]>([]);

  // Initialize epoch history
  useEffect(() => {
    const hist: EpochData[] = [];
    for (let i = 0; i < 8; i++) {
      hist.push({
        epoch: 1849 - 7 + i,
        price: 67.43 - (7 - i) * 0.15 + Math.random() * 0.3,
        sources: 11 + Math.floor(Math.random() * 4),
        consensus: 95 + Math.floor(Math.random() * 5),
      });
    }
    setEpochHistory(hist);
  }, []);

  const animDataRef = useRef({
    time: 0,
    phase: 'idle' as 'idle' | 'submit' | 'collect' | 'aggregate' | 'distribute',
    phaseTimer: 0,
    epochProgress: 0,
    epoch: 1849,
    currentPrice: 67.43,
    confidence: 98,
    activeSources: 12,
    poolFunds: 2847,
    stars: [] as { x: number; y: number; size: number; alpha: number; twinkle: number }[],
    oracles: [] as Oracle[],
    datapoints: [] as Datapoint[],
    rewards: [] as Reward[],
    slashParts: [] as SlashPart[],
    ballots: [] as Ballot[],
    glowRings: [] as GlowRing[],
    hovered: null as Oracle | null,
    mx: 0, my: 0,
    W: 0, H: 0, CX: 0, CY: 0,
    epochHistory: [] as EpochData[],
  });

  // Sync state to ref
  useEffect(() => {
    animDataRef.current.epoch = epoch;
    animDataRef.current.currentPrice = currentPrice;
    animDataRef.current.confidence = confidence;
    animDataRef.current.activeSources = activeSources;
    animDataRef.current.poolFunds = poolFunds;
    animDataRef.current.epochHistory = epochHistory;
  }, [epoch, currentPrice, confidence, activeSources, poolFunds, epochHistory]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const containerEl = containerRef.current;
    if (!canvasEl || !containerEl) return;
    const ctxEl = canvasEl.getContext('2d');
    if (!ctxEl) return;
    const canvas = canvasEl;
    const container = containerEl;
    const ctx = ctxEl;

    const ad = animDataRef.current;

    // Init stars
    for (let i = 0; i < 200; i++) {
      ad.stars.push({
        x: Math.random() * 3000,
        y: Math.random() * 2000,
        size: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.5 + 0.1,
        twinkle: Math.random() * 0.02 + 0.005,
      });
    }

    // Init oracles
    // TODO: replace with real Ergo Oracle Pool data from /api/oracles
    ad.oracles = [
      { name: 'Sigma Oracle A', ring: 1, angle: 0, speed: 0.004, color: '#00D4AA', status: 'Active', latency: 12, accuracy: 99.8, stake: 450, reward: 23.5, size: 7, slashing: 0 },
      { name: 'Sigma Oracle B', ring: 1, angle: 1.8, speed: 0.004, color: '#00D4AA', status: 'Active', latency: 18, accuracy: 99.6, stake: 380, reward: 19.2, size: 6, slashing: 0 },
      { name: 'Sigma Oracle C', ring: 1, angle: 3.6, speed: 0.004, color: '#FBBF24', status: 'Verifying', latency: 45, accuracy: 98.2, stake: 520, reward: 31.0, size: 6, slashing: 0 },
      { name: 'ErgoWatch', ring: 2, angle: 0.5, speed: 0.0025, color: '#00D4AA', status: 'Active', latency: 8, accuracy: 99.9, stake: 890, reward: 45.1, size: 8, slashing: 0 },
      { name: 'OracleCore', ring: 2, angle: 2.3, speed: 0.0025, color: '#00D4AA', status: 'Active', latency: 15, accuracy: 99.7, stake: 620, reward: 33.8, size: 7, slashing: 0 },
      { name: 'Spectrum Feed', ring: 2, angle: 4.1, speed: 0.0025, color: '#00D4AA', status: 'Active', latency: 6, accuracy: 99.9, stake: 1200, reward: 67.2, size: 9, slashing: 0 },
      { name: 'DIA Ergo', ring: 3, angle: 1.0, speed: 0.0015, color: '#EF4444', status: 'Slashed', latency: 89, accuracy: 94.5, stake: 210, reward: 0, size: 5, slashing: 1 },
      { name: 'Anon Node 1', ring: 3, angle: 2.8, speed: 0.0015, color: '#00D4AA', status: 'Active', latency: 22, accuracy: 99.1, stake: 340, reward: 18.5, size: 6, slashing: 0 },
      { name: 'Anon Node 2', ring: 3, angle: 4.6, speed: 0.0015, color: '#00D4AA', status: 'Active', latency: 34, accuracy: 98.8, stake: 280, reward: 15.3, size: 5, slashing: 0 },
      { name: 'Witnet Ergo', ring: 3, angle: 0.2, speed: 0.0015, color: '#555', status: 'Offline', latency: 999, accuracy: 0, stake: 0, reward: 0, size: 4, slashing: 0 },
      { name: 'Azor Node', ring: 2, angle: 5.5, speed: 0.0025, color: '#00D4AA', status: 'Active', latency: 11, accuracy: 99.8, stake: 750, reward: 38.9, size: 7, slashing: 0 },
      { name: 'Miner Pool', ring: 1, angle: 5.2, speed: 0.004, color: '#00D4AA', status: 'Active', latency: 14, accuracy: 99.5, stake: 410, reward: 21.7, size: 6, slashing: 0 },
      { name: 'Flux Monitor', ring: 3, angle: 3.4, speed: 0.0015, color: '#FBBF24', status: 'Verifying', latency: 67, accuracy: 97.1, stake: 190, reward: 0, size: 5, slashing: 0 },
      { name: 'Razor Ergo', ring: 1, angle: 2.5, speed: 0.004, color: '#00D4AA', status: 'Active', latency: 19, accuracy: 99.3, stake: 330, reward: 17.8, size: 6, slashing: 0 },
      { name: 'Nest Protocol', ring: 2, angle: 1.4, speed: 0.0025, color: '#00D4AA', status: 'Active', latency: 9, accuracy: 99.8, stake: 560, reward: 29.4, size: 7, slashing: 0 },
      { name: 'Gravity Node', ring: 3, angle: 5.0, speed: 0.0015, color: '#00D4AA', status: 'Active', latency: 28, accuracy: 98.9, stake: 290, reward: 16.1, size: 5, slashing: 0 },
    ];
    ad.oracles.forEach(o => { o.pulse = Math.random() * Math.PI * 2; });

    const ringR = [90, 155, 220];
    const EPOCH_DURATION = 900;

    function resize() {
      const rect = container.getBoundingClientRect();
      ad.W = rect.width;
      ad.H = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = ad.W * dpr;
      canvas.height = ad.H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ad.CX = ad.W / 2;
      ad.CY = ad.H / 2 - 20;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Mouse
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      ad.mx = e.clientX - r.left;
      ad.my = e.clientY - r.top;
      let h: Oracle | null = null;
      for (const o of ad.oracles) {
        if (o.x == null || o.y == null) continue;
        const dx = ad.mx - o.x, dy = ad.my - o.y;
        if (dx * dx + dy * dy < (o.size + 10) ** 2) { h = o; break; }
      }
      ad.hovered = h;
      setHovered(h);
      setMousePos({ x: ad.mx, y: ad.my });
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => { ad.hovered = null; setHovered(null); });

    // Helpers
    function glow(x: number, y: number, r: number, color: string, a: number) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const base = color.startsWith('#') ? hexToRgb(color) : color;
      g.addColorStop(0, base.replace(')', `, ${a})`).replace('rgb', 'rgba'));
      g.addColorStop(0.5, base.replace(')', `, ${a * 0.3})`).replace('rgb', 'rgba'));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function hexToRgb(hex: string) {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
    }

    function drawHex(x: number, y: number, r: number, fill: string | CanvasGradient | null, stroke: string | null, sw = 1) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
    }

    function drawDiamond(x: number, y: number, s: number, color: string, a = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }

    function drawStar(x: number, y: number, r: number, color: string, a = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * r, -Math.sin((18 + i * 72) / 180 * Math.PI) * r);
        ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * r * 0.4, -Math.sin((54 + i * 72) / 180 * Math.PI) * r * 0.4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawTriangle(x: number, y: number, s: number, color: string, a = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.866, s * 0.5);
      ctx.lineTo(-s * 0.866, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawBg() {
      ctx.fillStyle = '#05070A';
      ctx.fillRect(0, 0, ad.W, ad.H);
      for (const s of ad.stars) {
        s.alpha += Math.sin(ad.time * s.twinkle) * 0.003;
        ctx.fillStyle = `rgba(226,232,240,${Math.max(0.05, Math.min(0.6, s.alpha))})`;
        ctx.beginPath();
        ctx.arc(s.x % ad.W, s.y % ad.H, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawOrbits() {
      ringR.forEach((r, i) => {
        ctx.strokeStyle = `rgba(255,255,255,${0.025 + i * 0.008})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 12]);
        ctx.beginPath();
        ctx.arc(ad.CX, ad.CY, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    function drawCore() {
      const pulse = Math.sin(ad.time * 0.04) * 4;
      glow(ad.CX, ad.CY, 70 + pulse, '#00E5FF', 0.12);
      for (let i = 0; i < 3; i++) {
        const ph = (ad.time * 0.015 + i * 2.1) % 6;
        const rad = 35 + ph * 18;
        const a = Math.max(0, 1 - ph / 6) * 0.12;
        ctx.strokeStyle = `rgba(0,229,255,${a})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ad.CX, ad.CY, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      const coreR = 28 + pulse * 0.3;
      const grad = ctx.createRadialGradient(ad.CX, ad.CY, 0, ad.CX, ad.CY, coreR);
      grad.addColorStop(0, 'rgba(0,229,255,0.25)');
      grad.addColorStop(0.6, 'rgba(0,229,255,0.08)');
      grad.addColorStop(1, 'transparent');
      drawHex(ad.CX, ad.CY, coreR, grad, 'rgba(0,229,255,0.35)', 1.5);
      drawHex(ad.CX, ad.CY, 14, null, 'rgba(255,255,255,0.25)', 1);
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.arc(ad.CX, ad.CY, 5, 0, Math.PI * 2);
      ctx.fill();
      glow(ad.CX, ad.CY, 18, '#00E5FF', 0.4);
      ctx.fillStyle = 'rgba(226,232,240,0.9)';
      ctx.font = '300 22px "SF Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`$${ad.currentPrice.toFixed(2)}`, ad.CX, ad.CY - 52);
      ctx.fillStyle = 'rgba(226,232,240,0.35)';
      ctx.font = '500 9px -apple-system, sans-serif';
      ctx.fillText('ERG/USD POOL BOX', ad.CX, ad.CY - 36);
      ctx.fillStyle = 'rgba(0,229,255,0.6)';
      ctx.font = '10px monospace';
      ctx.fillText(`EPOCH #${ad.epoch}`, ad.CX, ad.CY + 50);
    }

    function drawOracle(o: Oracle) {
      o.angle += o.speed;
      o.x = ad.CX + Math.cos(o.angle) * ringR[o.ring - 1];
      o.y = ad.CY + Math.sin(o.angle) * ringR[o.ring - 1];
      o.pulse = (o.pulse || 0) + 0.05;

      if (o.status !== 'Offline') {
        const g = ctx.createLinearGradient(o.x, o.y, ad.CX, ad.CY);
        g.addColorStop(0, o.status === 'Slashed' ? 'rgba(239,68,68,0.08)' : 'rgba(0,212,170,0.06)');
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(ad.CX, ad.CY);
        ctx.stroke();
      }

      if (o.status === 'Active') glow(o.x, o.y, 22, '#00D4AA', 0.18);
      else if (o.status === 'Slashed') glow(o.x, o.y, 18, '#EF4444', 0.15);

      const isHov = ad.hovered === o;
      const sz = o.size + (isHov ? 4 : 0);

      ctx.fillStyle = o.status === 'Offline' ? '#333' : o.status === 'Slashed' ? '#EF4444' : o.color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, sz, 0, Math.PI * 2);
      ctx.fill();

      if (o.status === 'Verifying') {
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(o.x, o.y, sz + 5, ad.time * 0.08, ad.time * 0.08 + Math.PI * 1.3);
        ctx.stroke();
      }

      if (o.status === 'Slashed') {
        ctx.strokeStyle = `rgba(239,68,68,${0.3 + Math.sin(ad.time * 0.1) * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.arc(o.x, o.y, sz + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isHov) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(o.x, o.y, sz + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (o.size >= 8 || isHov) {
        ctx.fillStyle = 'rgba(226,232,240,0.55)';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(o.name, o.x, o.y + sz + 16);
      }

      if (o.stake > 0) {
        ctx.strokeStyle = 'rgba(255,92,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(o.x, o.y, sz + 3, 0, Math.PI * 2 * (o.stake / 1200));
        ctx.stroke();
      }
    }

    function spawnDatapoint(source: Oracle, isOutlier = false) {
      ad.datapoints.push({
        x: source.x || 0, y: source.y || 0,
        tx: ad.CX, ty: ad.CY,
        progress: 0,
        speed: 0.008 + Math.random() * 0.006,
        color: isOutlier ? '#EF4444' : '#00D4AA',
        size: 3 + Math.random() * 2,
        isOutlier,
        source: source.name,
      });
    }

    function drawDatapoints() {
      for (let i = ad.datapoints.length - 1; i >= 0; i--) {
        const p = ad.datapoints[i];
        p.progress += p.speed;
        if (p.progress >= 1) { ad.datapoints.splice(i, 1); continue; }

        let ex = 0, ey = 0;
        if (p.isOutlier && p.progress > 0.3) {
          const dev = (p.progress - 0.3) * 200;
          ex = Math.cos(ad.time * 0.2) * dev;
          ey = Math.sin(ad.time * 0.2) * dev + dev * 0.5;
          if (p.progress > 0.7 && Math.random() < 0.3) {
            ad.slashParts.push({
              x: p.x + (p.tx - p.x) * p.progress + ex,
              y: p.y + (p.ty - p.y) * p.progress + ey,
              vx: (Math.random() - 0.5) * 3,
              vy: (Math.random() - 0.5) * 3,
              life: 1,
              color: '#EF4444',
              size: Math.random() * 2 + 1,
            });
          }
          if (p.progress > 0.95) { ad.datapoints.splice(i, 1); continue; }
        }

        const x = p.x + (p.tx - p.x) * p.progress + ex;
        const y = p.y + (p.ty - p.y) * p.progress + ey;
        const a = 1 - Math.abs(p.progress - 0.5) * 1.5;
        drawDiamond(x, y, p.size * 2, p.color, Math.max(0, a));

        ctx.strokeStyle = p.color + Math.floor(Math.max(0, a) * 40).toString(16).padStart(2, '0');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - (p.tx - p.x) * 0.04, y - (p.ty - p.y) * 0.04);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    function spawnReward(target: Oracle) {
      ad.rewards.push({
        x: ad.CX, y: ad.CY,
        tx: target.x || 0, ty: target.y || 0,
        progress: 0,
        speed: 0.012,
        size: 4 + Math.random() * 2,
      });
    }

    function drawRewards() {
      for (let i = ad.rewards.length - 1; i >= 0; i--) {
        const r = ad.rewards[i];
        r.progress += r.speed;
        if (r.progress >= 1) { ad.rewards.splice(i, 1); continue; }
        const x = r.x + (r.tx - r.x) * r.progress;
        const y = r.y + (r.ty - r.y) * r.progress;
        const a = 1 - r.progress;
        drawStar(x, y, r.size, '#FFD700', a);
      }
    }

    function drawSlashParts() {
      for (let i = ad.slashParts.length - 1; i >= 0; i--) {
        const p = ad.slashParts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) { ad.slashParts.splice(i, 1); continue; }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function drawBallots() {
      if (ad.time % 180 === 0 && ad.ballots.length < 8) {
        const src = ad.oracles.filter(o => o.status === 'Active')[Math.floor(Math.random() * 10)];
        if (src) {
          ad.ballots.push({
            x: (src.x || 0) + (Math.random() - 0.5) * 30,
            y: (src.y || 0) + (Math.random() - 0.5) * 30,
            angle: Math.random() * Math.PI * 2,
            dist: 20 + Math.random() * 15,
            speed: 0.01 + Math.random() * 0.01,
            alpha: 0.6,
          });
        }
      }
      for (let i = ad.ballots.length - 1; i >= 0; i--) {
        const b = ad.ballots[i];
        b.angle += b.speed;
        b.alpha += Math.sin(ad.time * 0.05) * 0.01;
        const x = ad.CX + Math.cos(b.angle) * b.dist;
        const y = ad.CY + Math.sin(b.angle) * b.dist;
        drawTriangle(x, y, 5, '#A855F7', Math.max(0.2, Math.min(0.8, b.alpha)));
      }
    }

    function drawGlowRings() {
      for (let i = ad.glowRings.length - 1; i >= 0; i--) {
        const g = ad.glowRings[i];
        g.r += 2;
        g.a -= 0.015;
        if (g.a <= 0) { ad.glowRings.splice(i, 1); continue; }
        ctx.strokeStyle = g.color + Math.floor(g.a * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ad.CX, ad.CY, g.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function updateEpoch() {
      ad.epochProgress += 1 / EPOCH_DURATION;

      if (ad.phase === 'idle') {
        if (ad.epochProgress > 0.7) { ad.phase = 'submit'; ad.phaseTimer = 0; }
      } else if (ad.phase === 'submit') {
        ad.phaseTimer++;
        if (ad.phaseTimer % 20 === 0 && ad.phaseTimer < 200) {
          const active = ad.oracles.filter(o => o.status === 'Active' || o.status === 'Verifying');
          const src = active[Math.floor(Math.random() * active.length)];
          if (src) {
            const isOutlier = src.name === 'DIA Ergo' && Math.random() < 0.7;
            spawnDatapoint(src, isOutlier);
          }
        }
        if (ad.phaseTimer > 250) { ad.phase = 'collect'; ad.phaseTimer = 0; }
      } else if (ad.phase === 'collect') {
        ad.phaseTimer++;
        if (ad.phaseTimer === 30) {
          ad.glowRings.push({ r: 30, a: 0.8, color: '#00E5FF' });
          ad.glowRings.push({ r: 30, a: 0.6, color: '#FFD700' });
        }
        if (ad.phaseTimer > 60) { ad.phase = 'aggregate'; ad.phaseTimer = 0; }
      } else if (ad.phase === 'aggregate') {
        ad.phaseTimer++;
        if (ad.phaseTimer === 1) {
          ad.currentPrice += (Math.random() - 0.5) * 0.8;
          ad.confidence = 95 + Math.floor(Math.random() * 5);
          ad.activeSources = 11 + Math.floor(Math.random() * 4);
          ad.poolFunds += Math.floor(Math.random() * 10);
          ad.glowRings.push({ r: 25, a: 1, color: '#00E5FF' });
          ad.glowRings.push({ r: 40, a: 0.7, color: '#00D4AA' });
          // Sync to React state
          setCurrentPrice(ad.currentPrice);
          setConfidence(ad.confidence);
          setActiveSources(ad.activeSources);
          setPoolFunds(ad.poolFunds);
        }
        if (ad.phaseTimer > 40) { ad.phase = 'distribute'; ad.phaseTimer = 0; }
      } else if (ad.phase === 'distribute') {
        ad.phaseTimer++;
        if (ad.phaseTimer % 8 === 0 && ad.phaseTimer < 120) {
          const active = ad.oracles.filter(o => o.status === 'Active');
          const tgt = active[Math.floor(Math.random() * active.length)];
          if (tgt) spawnReward(tgt);
        }
        if (ad.phaseTimer > 150) {
          ad.phase = 'idle';
          ad.epoch++;
          ad.epochProgress = 0;
          setEpoch(ad.epoch);
          setEpochProgress(0);
          // Update history
          setEpochHistory(prev => {
            const next = [...prev];
            next.shift();
            next.push({
              epoch: ad.epoch,
              price: ad.currentPrice,
              sources: ad.activeSources,
              consensus: ad.confidence,
            });
            return next;
          });
        }
      }
      setEpochProgress(ad.epochProgress);
    }

    function animate() {
      ctx.clearRect(0, 0, ad.W, ad.H);
      ad.time++;
      drawBg();
      drawOrbits();
      drawGlowRings();
      drawCore();
      drawBallots();
      ad.oracles.forEach(drawOracle);
      drawDatapoints();
      drawRewards();
      drawSlashParts();
      updateEpoch();
      animFrame = requestAnimationFrame(animate);
    }

    let animFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener('mousemove', onMove);
      ro.disconnect();
    };
  }, []);

  const activeCount = animDataRef.current.oracles.filter(o => o.status === 'Active').length;
  const totalCount = animDataRef.current.oracles.length;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#05070A',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
        userSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />

      {/* HUD: Network */}
      <div className="oracle-constellation-hud" style={hudStyle}>
        <div style={hudLabelStyle}>Network Consensus</div>
        <div style={hudValueStyle}>
          <span style={{ ...dotStyle, background: '#00D4AA' }} />
          {activeCount}/{totalCount}
        </div>
        <div style={hudSubStyle}>oracles aligned</div>
      </div>

      {/* HUD: Pool Economics */}
      <div className="oracle-constellation-hud" style={{ ...hudStyle, left: 260 }}>
        <div style={hudLabelStyle}>Pool Economics</div>
        <div style={{ ...hudValueStyle, fontSize: 22 }}>
          <span style={{ color: '#FF5C00' }}>ERG</span>/<span style={{ color: '#00E5FF' }}>USD</span>
        </div>
        <div style={hudSubStyle}>Funds: {poolFunds.toLocaleString()} ERG</div>
      </div>

      {/* HUD: Datapoint */}
      <div className="oracle-constellation-hud" style={{ ...hudStyle, top: 130 }}>
        <div style={hudLabelStyle}>Current Datapoint</div>
        <div style={{ ...hudValueStyle, color: '#00E5FF' }}>${currentPrice.toFixed(2)}</div>
        <div style={hudSubStyle}>Confidence: {confidence}% · Sources: {activeSources}</div>
      </div>

      {/* Epoch Ring */}
      <div style={epochRingStyle}>
        <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
          <circle
            cx="45" cy="45" r="40" fill="none"
            stroke="#00E5FF" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={251}
            strokeDashoffset={251 * (1 - epochProgress)}
            style={{ filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.4))', transition: 'stroke-dashoffset 0.1s linear' }}
          />
        </svg>
        <div style={epochTextStyle}>
          <div style={{ fontSize: 20, fontWeight: 300, fontFamily: 'monospace' }}>{epoch}</div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(226,232,240,0.4)' }}>epoch</div>
        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          ...tooltipStyle,
          left: mousePos.x + 18,
          top: mousePos.y + 18,
          opacity: 1,
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10, color: '#fff' }}>{hovered.name}</div>
          <div style={ttRowStyle}><span>Status:</span><span style={{ color: hovered.status === 'Active' ? '#00D4AA' : hovered.status === 'Offline' ? '#777' : '#FBBF24' }}>{hovered.status}</span></div>
          <div style={ttRowStyle}><span>Latency:</span><span>{hovered.latency}ms</span></div>
          <div style={ttRowStyle}><span>Accuracy:</span><span>{hovered.accuracy}%</span></div>
          <div style={ttRowStyle}><span>Stake:</span><span>{hovered.stake} ERG</span></div>
          <div style={ttRowStyle}><span>Reward:</span><span>{hovered.reward} ERG</span></div>
        </div>
      )}

      {/* Epoch Bar */}
      <div style={epochBarStyle}>
        {epochHistory.map((e, idx) => {
          const h = 20 + e.sources * 3;
          const isActive = idx === epochHistory.length - 1;
          return (
            <div key={e.epoch} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', minWidth: 36, transition: 'transform 0.2s', transform: isActive ? 'translateY(-4px)' : 'none' }}>
              <div style={{
                width: 28,
                height: h,
                borderRadius: '4px 4px 0 0',
                background: 'linear-gradient(to top, #00D4AA, #00E5FF)',
                opacity: isActive ? 1 : 0.6,
                boxShadow: isActive ? '0 0 12px rgba(0,229,255,0.3)' : 'none',
              }} />
              <div style={{ fontSize: 9, color: isActive ? '#00E5FF' : 'rgba(226,232,240,0.35)', fontFamily: 'monospace' }}>{e.epoch}</div>
            </div>
          );
        })}
      </div>

      <style>{`@media (max-width: 768px) {
  .oracle-constellation-legend { display: none !important; }
  .oracle-constellation-hud { min-width: 140px !important; padding: 12px 14px !important; }
}`}</style>
      {/* Legend */}
      <div className="oracle-constellation-legend" style={legendStyle}>
        {[
          { shape: 'hex', color: '#00E5FF', label: 'Pool Box (Core)' },
          { shape: 'circle', color: '#00D4AA', label: 'Active Oracle' },
          { shape: 'circle', color: '#FBBF24', label: 'Verifying' },
          { shape: 'diamond', color: '#EF4444', label: 'Outlier / Slashed' },
          { shape: 'star', color: '#FFD700', label: 'Reward Token' },
          { shape: 'triangle', color: '#A855F7', label: 'Ballot Token' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div style={{
              width: 10, height: 10,
              background: item.color,
              clipPath: item.shape === 'hex' ? 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' :
                        item.shape === 'diamond' ? 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' :
                        item.shape === 'star' ? 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' :
                        item.shape === 'triangle' ? 'polygon(50% 0%,100% 100%,0% 100%)' :
                        'none',
              borderRadius: item.shape === 'circle' ? '50%' : 0,
            }} />
            <span style={{ fontSize: 11, color: 'rgba(226,232,240,0.5)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Styles
const hudStyle: React.CSSProperties = {
  position: 'absolute',
  top: 18, left: 18,
  background: 'rgba(13, 19, 33, 0.85)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: '18px 22px',
  color: '#E2E8F0',
  zIndex: 10,
  minWidth: 200,
  transition: 'all 0.3s ease',
};

const hudLabelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 2.5,
  color: 'rgba(226,232,240,0.35)',
  fontWeight: 600,
  marginBottom: 10,
};

const hudValueStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 300,
  letterSpacing: -0.5,
  fontFamily: '"SF Mono", "JetBrains Mono", monospace',
  marginBottom: 4,
};

const hudSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(226,232,240,0.4)',
};

const dotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 7, height: 7,
  borderRadius: '50%',
  marginRight: 8,
  verticalAlign: 'middle',
};

const epochRingStyle: React.CSSProperties = {
  position: 'absolute',
  top: 20, right: 20,
  width: 90, height: 90,
  zIndex: 10,
};

const epochTextStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  textAlign: 'center',
  color: '#E2E8F0',
};

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  background: 'rgba(5,7,10,0.95)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  padding: '16px 20px',
  color: '#E2E8F0',
  fontSize: 13,
  pointerEvents: 'none',
  zIndex: 30,
  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
  minWidth: 200,
  transition: 'opacity 0.25s',
};

const ttRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 5,
  gap: 20,
};

const epochBarStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 18,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'flex-end',
  gap: 6,
  zIndex: 10,
  background: 'rgba(13,19,33,0.7)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 12,
  padding: '12px 18px',
};

const legendStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 80,
  right: 20,
  background: 'rgba(13,19,33,0.7)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 12,
  padding: '14px 18px',
  zIndex: 10,
};