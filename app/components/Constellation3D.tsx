"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Peer } from '../types/ergo';
import { motion, AnimatePresence } from 'framer-motion';

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
  onHover: (peer: Peer | null, pos?: THREE.Vector3) => void;
  isPropagating: boolean;
  propagationStart: number;
}

interface TravelingParticleProps {
  start: THREE.Vector3;
  end: THREE.Vector3;
  duration: number;
  onComplete: () => void;
}

/** Ergo peer.lastMessage is usually already ms; accept seconds too. */
function peerLastMs(lm?: number): number {
  if (!lm) return 0;
  return lm > 1e12 ? lm : lm * 1000;
}

// Deterministic position from address string (stable across renders)
function getDeterministicPosition(address: string, index: number): THREE.Vector3 {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash) + address.charCodeAt(i);
    hash |= 0;
  }
  
  // Use hash + index for variety
  const seed = Math.abs(hash) + index * 37;
  
  // Spherical distribution - closer and farther peers for depth
  const radius = 12 + (seed % 17);
  const phi = ((seed % 360) / 360) * Math.PI * 2;
  const theta = (((seed * 7) % 180) / 180) * Math.PI - Math.PI / 2;
  
  const x = radius * Math.cos(phi) * Math.cos(theta);
  const y = radius * Math.sin(theta) * 0.6; // flatter
  const z = radius * Math.sin(phi) * Math.cos(theta);
  
  return new THREE.Vector3(x, y, z);
}

// My Node - central glowing core
function MyNode({ isOnline, height }: { isOnline: boolean; height: number }) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (coreRef.current) {
      // Gentle breathing pulse synced to ~2min block time feel
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.2) * 0.08;
      coreRef.current.scale.setScalar(pulse);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.6 + Math.sin(state.clock.elapsedTime * 0.8) * 0.15);
    }
    if (groupRef.current && isOnline) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.8]} />
        <meshBasicMaterial color="#FF7A3D" />
      </mesh>
      
      {/* Inner glow layer */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[2.4]} />
        <meshBasicMaterial 
          color="#FF7A3D" 
          transparent 
          opacity={0.15} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Outer energy rings */}
      {[3.2, 4.1].map((r, i) => (
        <mesh key={i} rotation={[i * 0.6, i * 1.1, 0]}>
          <ringGeometry args={[r, r + 0.08, 64]} />
          <meshBasicMaterial 
            color={i === 0 ? "#FF7A3D" : "#00E5FF"} 
            transparent 
            opacity={0.25} 
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Label */}
      <Html position={[0, -3.5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="text-center">
          <div className="text-[#FF7A3D] text-xs font-mono tracking-[3px] uppercase">YOUR NODE</div>
          <div className="text-[#E8E8F0] text-[10px] font-mono opacity-60 mt-0.5">HEIGHT {height.toLocaleString()}</div>
        </div>
      </Html>
    </group>
  );
}

// Individual Peer Node
function PeerNode({ peer, position, index, onHover, isPropagating, propagationStart }: PeerNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  
  const [hovered, setHovered] = useState(false);

  const lastSeen = Date.now() - peerLastMs(peer.lastMessage);
  const isActive = lastSeen < 120_000; // active if message < 2min ago

  useFrame((state) => {
    if (meshRef.current) {
      const baseScale = hovered ? 1.35 : 1;
      const pulse = isActive ? 1 + Math.sin(state.clock.elapsedTime * 2.5 + index) * 0.12 : 1;
      meshRef.current.scale.setScalar(baseScale * pulse);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(hovered ? 2.1 : 1.7);
    }
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    onHover(peer, position);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    setHovered(false);
    onHover(null);
    document.body.style.cursor = 'default';
  };

  const color = isActive ? "#00E5FF" : "#64748B";

  return (
    <group position={position}>
      {/* Core peer */}
      <mesh 
        ref={meshRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={() => onHover(peer, position)}
      >
        <sphereGeometry args={[0.65]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.1]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={hovered ? 0.35 : 0.18} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Subtle ring for active peers */}
      {isActive && (
        <mesh rotation={[Math.random() * 2, Math.random() * 2, 0]}>
          <ringGeometry args={[1.4, 1.45, 32]} />
          <meshBasicMaterial color="#00E5FF" transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// Connection Line between my node and peer
function ConnectionLine({ 
  start, 
  end, 
  isActive, 
  isPropagating, 
  propagationStart 
}: { 
  start: THREE.Vector3; 
  end: THREE.Vector3; 
  isActive: boolean;
  isPropagating: boolean;
  propagationStart: number;
}) {
  const lineRef = useRef<THREE.Line>(null!);
  
  const points = useMemo(() => [start.clone(), end.clone()], [start, end]);

  useFrame((state) => {
    if (lineRef.current && lineRef.current.material) {
      const mat = lineRef.current.material as THREE.LineBasicMaterial;
      
      let opacity = isActive ? 0.45 : 0.15;
      let elapsed = 0;
      
      if (isPropagating && propagationStart > 0) {
        elapsed = (Date.now() - propagationStart) / 1000;
        // Flash brighter during propagation
        if (elapsed < 1.8) {
          const flash = Math.max(0, 1 - elapsed / 1.8);
          opacity = Math.max(opacity, 0.35 + flash * 0.65);
        }
      }
      
      mat.opacity = opacity;
      mat.color.set((isPropagating && elapsed > 0 && elapsed < 1.8) ? "#FF7A3D" : (isActive ? "#00E5FF" : "#475569"));
    }
  });

  const positions = useMemo(
    () => new Float32Array(points.flatMap((p) => [p.x, p.y, p.z])),
    [points]
  );

  // three.js Line primitive (R3F) collides with SVG <line> in React types
  const LinePrimitive = "line" as unknown as React.FC<{
    ref?: React.Ref<THREE.Line>;
    children?: React.ReactNode;
  }>;

  return (
    <LinePrimitive ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={isActive ? "#00E5FF" : "#475569"}
        transparent
        opacity={isActive ? 0.45 : 0.15}
        linewidth={1.5}
      />
    </LinePrimitive>
  );
}

// Traveling energy particle during block propagation
function TravelingParticle({ start, end, duration, onComplete }: TravelingParticleProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const startTime = useRef(Date.now());

  useFrame(() => {
    if (!meshRef.current) return;

    const elapsed = (Date.now() - startTime.current) / 1000;
    const progress = Math.min(elapsed / duration, 1);

    if (progress >= 1) {
      onComplete();
      return;
    }

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentPos = start.clone().lerp(end, eased);
    
    meshRef.current.position.copy(currentPos);
    
    // Scale and opacity pulse
    const scale = 0.4 + Math.sin(progress * Math.PI) * 0.25;
    meshRef.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={meshRef} position={start}>
      <sphereGeometry args={[0.35]} />
      <meshBasicMaterial 
        color="#FF7A3D" 
        transparent 
        opacity={0.9}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function Scene({ 
  peers, 
  myNodeHeight, 
  isOnline, 
  onPeerHover, 
  lastBlockHeight,
  onSimulateBlock,
  hideControls = false,
}: ConstellationProps) {
  const controlsRef = useRef<any>(null);
  const [hoveredPeer, setHoveredPeer] = useState<Peer | null>(null);
  const [hoveredPos, setHoveredPos] = useState<THREE.Vector3 | null>(null);
  const [isAutoOrbit, setIsAutoOrbit] = useState(true);
  const [isPropagating, setIsPropagating] = useState(false);
  const [propagationStart, setPropagationStart] = useState(0);
  const [particles, setParticles] = useState<Array<{ id: number; start: THREE.Vector3; end: THREE.Vector3 }>>([]);

  const peerPositions = useMemo(() => {
    return peers.map((peer, index) => ({
      peer,
      position: getDeterministicPosition(peer.address || `peer-${index}`, index),
    }));
  }, [peers]);

  // Detect new block and trigger beautiful propagation animation
  useEffect(() => {
    if (lastBlockHeight > 0 && peers.length > 0) {
      const timer = setTimeout(() => {
        triggerBlockPropagation();
      }, 420); // small delay after height update for drama
      return () => clearTimeout(timer);
    }
  }, [lastBlockHeight]);

  const triggerBlockPropagation = useCallback(() => {
    if (peers.length === 0) return;

    setIsPropagating(true);
    setPropagationStart(Date.now());

    // Spawn 6-9 traveling particles to random peers
    const newParticles = Array.from({ length: Math.min(8, peers.length) }, (_, i) => {
      const randomPeer = peerPositions[Math.floor(Math.random() * peerPositions.length)];
      return {
        id: Date.now() + i,
        start: new THREE.Vector3(0, 0, 0), // from center
        end: randomPeer.position.clone(),
      };
    });

    setParticles(newParticles);

    // End propagation after animation
    setTimeout(() => {
      setIsPropagating(false);
      setParticles([]);
    }, 2200);
  }, [peers, peerPositions]);

  // Expose simulate function to parent
  useEffect(() => {
    if (onSimulateBlock) {
      (window as any).__aetherSimulateBlock = triggerBlockPropagation;
    }
  }, [onSimulateBlock, triggerBlockPropagation]);

  const handlePeerHover = (peer: Peer | null, pos?: THREE.Vector3) => {
    setHoveredPeer(peer);
    setHoveredPos(pos || null);
    if (onPeerHover) onPeerHover(peer);
  };

  const focusOnMyNode = () => {
    if (controlsRef.current) {
      const controls = controlsRef.current;
      controls.target.set(0, 0, 0);
      controls.object.position.set(0, 28, 42);
      controls.update();
    }
    setIsAutoOrbit(false);
  };

  const toggleAutoOrbit = () => {
    const next = !isAutoOrbit;
    setIsAutoOrbit(next);
    if (controlsRef.current) {
      controlsRef.current.autoRotate = next;
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') focusOnMyNode();
      if (e.key.toLowerCase() === 'o') toggleAutoOrbit();
      if (e.key.toLowerCase() === 'b' && onSimulateBlock) triggerBlockPropagation();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSimulateBlock, triggerBlockPropagation]);

  return (
    <>
      <Canvas
        camera={{ position: [0, 28, 42], fov: 48 }}
        className="!absolute !inset-0 !h-full !w-full"
        style={{ width: "100%", height: "100%", display: "block" }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
        gl={{ 
          alpha: true, 
          antialias: true, 
          preserveDrawingBuffer: true,
          powerPreference: "high-performance"
        }}
      >
        <color attach="background" args={['#050508']} />
        
        <ambientLight intensity={0.4} />
        <pointLight position={[0, 40, 20]} intensity={1.2} color="#FF7A3D" />
        <pointLight position={[-30, -10, -40]} intensity={0.6} color="#00E5FF" />

        <Stars 
          radius={280} 
          depth={40} 
          count={420} 
          factor={3.2} 
          saturation={0} 
          fade 
          speed={0.6}
        />

        {/* My central node */}
        <MyNode isOnline={isOnline} height={myNodeHeight} />

        {/* Connection lines */}
        {peerPositions.map(({ peer, position }, idx) => {
          const isActive = Date.now() - peerLastMs(peer.lastMessage) < 180_000;
          return (
            <ConnectionLine
              key={`line-${idx}`}
              start={new THREE.Vector3(0, 0, 0)}
              end={position}
              isActive={isActive}
              isPropagating={isPropagating}
              propagationStart={propagationStart}
            />
          );
        })}

        {/* Peer nodes */}
        {peerPositions.map(({ peer, position }, index) => (
          <PeerNode
            key={`peer-${index}`}
            peer={peer}
            position={position}
            index={index}
            onHover={handlePeerHover}
            isPropagating={isPropagating}
            propagationStart={propagationStart}
          />
        ))}

        {/* Traveling particles during propagation */}
        {particles.map((p) => (
          <TravelingParticle
            key={p.id}
            start={p.start}
            end={p.end}
            duration={1.35}
            onComplete={() => {
              setParticles(prev => prev.filter(x => x.id !== p.id));
            }}
          />
        ))}

        <OrbitControls 
          ref={controlsRef}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={8}
          maxDistance={95}
          autoRotate={isAutoOrbit}
          autoRotateSpeed={0.12}
          enableDamping
          dampingFactor={0.12}
        />
      </Canvas>

      {/* ── Mobile: only Simulate Boom (left) + Focus (right) — no center clutter ── */}
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

      {/* ── Desktop: full control stack (top-right) ── */}
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

      {/* Hover Tooltip */}
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
              <div className="font-mono text-[#00E5FF] text-xs tracking-[2px] mb-1">PEER NODE</div>
              <div className="font-mono text-white break-all text-[13px] leading-tight mb-3">
                {hoveredPeer.address}
              </div>
              
              <div className="flex justify-between text-xs">
                <div>
                  <span className="text-[#A0A0B0]">LAST SEEN</span><br />
                  <span className="font-mono text-white">
                    {Math.floor((Date.now() - peerLastMs(hoveredPeer.lastMessage)) / 1000)}s ago
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[#A0A0B0]">STATUS</span><br />
                  <span className={Date.now() - peerLastMs(hoveredPeer.lastMessage) < 120000 ? "text-[#10B981]" : "text-[#F59E0B]"}>
                    {Date.now() - peerLastMs(hoveredPeer.lastMessage) < 120000 ? "ACTIVE" : "STALE"}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Legend — desktop only (covers map on mobile) */}
      <div className="hidden md:block absolute bottom-4 left-4 z-20 glass rounded-2xl px-4 py-3 text-[10px] font-mono tracking-widest border border-white/10">
        <div className="flex items-center gap-4 text-[#A0A0B0]">
          <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-[#FF7A3D]" /> YOUR NODE</div>
          <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-[#00E5FF]" /> ACTIVE PEERS</div>
          <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-[#64748B]" /> STALE</div>
        </div>
        <div className="text-[9px] text-[#A0A0B0]/60 mt-1.5">Drag to orbit • Scroll to zoom • Hover peers • Press F / O / B</div>
      </div>
    </>
  );
}

export default function Constellation3D(props: ConstellationProps) {
  // Explicit height (not only min-h): R3F Canvas % height collapses otherwise → tiny 1/3 viewport
  return (
    <div className="w-full">
      <div className="canvas-container aether-viz relative w-full bg-[#050508] overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <Scene {...props} />
        </div>
      </div>
      {/* Mobile: compact legend under 3D (no overlay on canvas) */}
      <div className="md:hidden mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10px] font-mono tracking-wider text-[#A0A0B0]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#FF7A3D]" /> YOU
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#00E5FF]" /> ACTIVE
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#64748B]" /> STALE
        </span>
        <span className="opacity-50">Pinch · drag · B boom</span>
      </div>
    </div>
  );
}
