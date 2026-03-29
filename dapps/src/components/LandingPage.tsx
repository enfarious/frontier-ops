/**
 * FrontierOps Landing Page — full 3D EVE Frontier starfield
 * with three black holes (the Trinary) pulling stars inward.
 *
 * Three.js Points cloud — GPU renders all 24,500+ stars in a single draw call.
 * Physics runs on CPU in 3D, positions uploaded to GPU each frame.
 */
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { getSolarSystemMap, type SolarSystem } from "../core/world-api";

// ── Simulation constants ──────────────────────────────────────
const G = 600;
const DAMPING = 0.997;
const MAX_SPEED = 6;
const SOFTENING = 50;
const GRAVITY_RAMP_FRAMES = 180;
const INITIAL_PAUSE_FRAMES = 90;

// ── Star color from constellation — spectral classes ──────────
function starColor(constellationId: number, systemId: number): [number, number, number] {
  const hash = ((constellationId * 137.508) + (systemId * 0.618)) % 1;
  const classHash = ((constellationId * 73.856) % 1 + (systemId * 0.0001)) % 1;

  if (classHash < 0.03) return [0.55 + hash * 0.23, 0.71 + hash * 0.16, 1.0];
  if (classHash < 0.12) return [0.71 + hash * 0.16, 0.78 + hash * 0.12, 0.94 + hash * 0.06];
  if (classHash < 0.25) return [0.94 + hash * 0.06, 0.90 + hash * 0.08, 0.78 + hash * 0.12];
  if (classHash < 0.50) return [1.0, 0.86 + hash * 0.12, 0.47 + hash * 0.24];
  if (classHash < 0.75) return [1.0, 0.63 + hash * 0.20, 0.24 + hash * 0.16];
  return [1.0, 0.31 + hash * 0.24, 0.16 + hash * 0.12];
}

// ── Project solar systems to 3D coordinates ──────────────────
interface StarData {
  positions: Float32Array;  // x, y, z per star (true 3D)
  colors: Float32Array;     // r, g, b per star
  sizes: Float32Array;      // point size per star
  velocities: Float32Array; // vx, vy, vz per star
  count: number;
  scale: number;            // world-unit scale factor
}

function projectSystems3D(systems: Map<number, SolarSystem>): StarData {
  const entries = Array.from(systems.values());
  const count = entries.length;

  // Find bounds for normalization
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const sys of entries) {
    const { x, y, z } = sys.location;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;
  const maxRange = Math.max(rangeX, rangeY, rangeZ);

  // Scale to fit in a ~800 unit cube centered at origin
  const scale = 800 / maxRange;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const sys = entries[i];
    positions[i * 3] = (sys.location.x - cx) * scale;
    positions[i * 3 + 1] = (sys.location.y - cy) * scale;
    positions[i * 3 + 2] = (sys.location.z - cz) * scale;

    const [r, g, b] = starColor(sys.constellationId, sys.id);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    sizes[i] = 1.5 + Math.random() * 2.5;
  }

  return { positions, colors, sizes, velocities, count, scale };
}

// ── Black hole attractor ──────────────────────────────────────
interface BlackHole {
  x: number; y: number; z: number;
  cx: number; cy: number; cz: number;
  mass: number;
  radius: number;
  angle: number;
  speed: number;
}

interface BHConfig { cx: number; cy: number; cz: number; mass: number; speed: number }

const DEFAULT_BH_CONFIGS: BHConfig[] = [
  { cx: 2, cy: 25, cz: -87, mass: 1.0, speed: 0.0008 },
  { cx: 39, cy: 27, cz: -112, mass: 0.85, speed: -0.0012 },
  { cx: 74, cy: 26, cz: -64, mass: 0.7, speed: 0.0006 },
];

function createTrinar3D(configs: BHConfig[]): BlackHole[] {
  const orbitRadius = 20;
  return configs.map((c, i) => ({
    x: 0, y: 0, z: 0,
    cx: c.cx, cy: c.cy, cz: c.cz,
    mass: c.mass, radius: orbitRadius,
    angle: (i * Math.PI * 2) / 3,
    speed: c.speed,
  }));
}

// ── Star point sprite texture ─────────────────────────────────
function createStarTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
  grad.addColorStop(0.15, "rgba(255, 255, 255, 0.8)");
  grad.addColorStop(0.4, "rgba(255, 255, 255, 0.15)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ── Black hole glow texture ──────────────────────────────────
function createGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Warm amber glow (EVE Frontier key art style)
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 255, 240, 1.0)");
  grad.addColorStop(0.1, "rgba(255, 200, 120, 0.7)");
  grad.addColorStop(0.3, "rgba(240, 140, 40, 0.3)");
  grad.addColorStop(0.6, "rgba(180, 80, 10, 0.1)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ── Black hole visual ────────────────────────────────────────
// Lore-accurate colors (hot amber/orange accretion — from EVE Frontier key art)
const LORE_COLORS = [
  new THREE.Color(0.9, 0.45, 0.08),  // hot amber
  new THREE.Color(0.85, 0.35, 0.05), // deep orange
  new THREE.Color(0.95, 0.55, 0.12), // warm gold
];

// High-vis debug colors
const DEBUG_COLORS = [
  new THREE.Color(0.9, 0.15, 0.1),   // red
  new THREE.Color(0.85, 0.1, 0.15),  // crimson
  new THREE.Color(0.8, 0.2, 0.1),    // scarlet
];

function BlackHoleVisual({ position, intensity, index, highVis }: { position: [number, number, number]; intensity: number; index: number; highVis: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const glowTex = useMemo(createGlowTexture, []);

  const color = highVis ? DEBUG_COLORS[index % 3] : LORE_COLORS[index % 3];

  useFrame(({ camera, clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.set(position[0], position[1], position[2]);

    // Rotate accretion disk
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.elapsedTime * (0.2 + index * 0.1);
    }

    // Billboard the glow sprites toward camera
    for (const child of groupRef.current.children) {
      if ((child as any).isMesh && child !== ringRef.current) {
        child.quaternion.copy(camera.quaternion);
      }
    }
  });

  const coreSize = 4 + intensity * 2;

  return (
    <group ref={groupRef}>
      {/* Core */}
      <mesh>
        <sphereGeometry args={[coreSize, 16, 16]} />
        <meshBasicMaterial color={highVis ? color : 0x020408} />
      </mesh>

      {/* Inner glow sprite */}
      <mesh>
        <planeGeometry args={[coreSize * 10, coreSize * 10]} />
        <meshBasicMaterial
          map={glowTex}
          color={color}
          transparent
          opacity={(highVis ? 0.8 : 0.3) * intensity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Outer glow sprite */}
      <mesh>
        <planeGeometry args={[coreSize * 20, coreSize * 20]} />
        <meshBasicMaterial
          map={glowTex}
          color={color}
          transparent
          opacity={(highVis ? 0.35 : 0.12) * intensity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Accretion disk — red-shifted in lore mode */}
      <mesh ref={ringRef} rotation={[Math.PI * 0.4 + index * 0.3, 0, 0]}>
        <ringGeometry args={[coreSize * 1.5, coreSize * 5, 48]} />
        <meshBasicMaterial
          color={highVis ? color : new THREE.Color(0.95, 0.5, 0.1)}
          transparent
          opacity={(highVis ? 0.3 : 0.15) * intensity}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ── Main star field component (3D physics) ───────────────────
function StarField({ starData, onReady, resetKey, gravityMults, bhConfigs, paused, highVis }: { starData: StarData; onReady: () => void; resetKey: number; gravityMults: [number, number, number]; bhConfigs: BHConfig[]; paused: boolean; highVis: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const frameRef = useRef(0);
  const blackHolesRef = useRef<BlackHole[]>(createTrinar3D(bhConfigs));

  // Update black hole home positions when configs change
  useEffect(() => {
    const bhs = blackHolesRef.current;
    for (let i = 0; i < bhs.length && i < bhConfigs.length; i++) {
      bhs[i].cx = bhConfigs[i].cx;
      bhs[i].cy = bhConfigs[i].cy;
      bhs[i].cz = bhConfigs[i].cz;
    }
  }, [bhConfigs]);
  const [bhPositions, setBhPositions] = useState<[number, number, number][]>([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  const texture = useMemo(createStarTexture, []);

  const homePositions = useRef(new Float32Array(starData.positions));
  const velocities = useRef(starData.velocities);

  useEffect(() => { onReady(); }, [onReady]);

  // Reset
  useEffect(() => {
    if (resetKey === 0) return;
    if (!pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const home = homePositions.current;
    const vel = velocities.current;
    for (let i = 0; i < positions.length; i++) positions[i] = home[i];
    for (let i = 0; i < vel.length; i++) vel[i] = 0;
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    frameRef.current = 0;
    const bhs = blackHolesRef.current;
    for (let i = 0; i < bhs.length; i++) {
      bhs[i].angle = (i * Math.PI * 2) / 3;
    }
  }, [resetKey]);

  useFrame(() => {
    if (!pointsRef.current) return;
    if (paused) {
      // Still update black hole positions for display, just don't run physics
      const bhs = blackHolesRef.current;
      for (const bh of bhs) {
        bh.x = bh.cx;
        bh.y = bh.cy;
        bh.z = bh.cz;
      }
      setBhPositions(bhs.map(bh => [bh.x, bh.y, bh.z] as [number, number, number]));
      return;
    }

    const frame = ++frameRef.current;
    const gravityPhase = Math.max(0, frame - INITIAL_PAUSE_FRAMES);
    const gravityStrength = Math.min(1, gravityPhase / GRAVITY_RAMP_FRAMES);

    const bhs = blackHolesRef.current;
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const vel = velocities.current;
    const count = starData.count;

    // Update black holes — orbit around their home position in 3D
    for (const bh of bhs) {
      bh.angle += bh.speed;
      bh.x = bh.cx + Math.cos(bh.angle) * bh.radius;
      bh.y = bh.cy + Math.sin(bh.angle) * bh.radius * 0.5;
      bh.z = bh.cz + Math.sin(bh.angle * 0.7) * bh.radius * 0.3;
    }

    setBhPositions(bhs.map(bh => [bh.x, bh.y, bh.z] as [number, number, number]));

    if (gravityStrength > 0) {
      const gdt = G * 0.016 * gravityStrength;
      const soft2 = SOFTENING * SOFTENING;
      const maxSpd2 = MAX_SPEED * MAX_SPEED;
      const damp = DAMPING;

      for (let i = 0; i < count; i++) {
        const pi3 = i * 3;
        const sx = positions[pi3];
        const sy = positions[pi3 + 1];
        const sz = positions[pi3 + 2];
        let vx = vel[pi3];
        let vy = vel[pi3 + 1];
        let vz = vel[pi3 + 2];

        // Gravity from each black hole (with per-hole multiplier)
        for (let bi = 0; bi < bhs.length; bi++) {
          const bh = bhs[bi];
          const mult = gravityMults[bi] ?? 1;
          if (mult === 0) continue;
          const dx = bh.x - sx;
          const dy = bh.y - sy;
          const dz = bh.z - sz;
          const distSq = dx * dx + dy * dy + dz * dz + soft2;
          const invDist = 1 / Math.sqrt(distSq);
          const f = gdt * bh.mass * mult / distSq;
          vx += dx * invDist * f;
          vy += dy * invDist * f;
          vz += dz * invDist * f;
        }

        vx *= damp;
        vy *= damp;
        vz *= damp;

        const spd2 = vx * vx + vy * vy + vz * vz;
        if (spd2 > maxSpd2) {
          const s = MAX_SPEED / Math.sqrt(spd2);
          vx *= s;
          vy *= s;
          vz *= s;
        }

        positions[pi3] = sx + vx;
        positions[pi3 + 1] = sy + vy;
        positions[pi3 + 2] = sz + vz;
        vel[pi3] = vx;
        vel[pi3 + 1] = vy;
        vel[pi3 + 2] = vz;
      }

      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starData.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[starData.colors, 3]} />
          <bufferAttribute attach="attributes-size" args={[starData.sizes, 1]} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={4}
          sizeAttenuation
          map={texture}
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {bhPositions.map((pos, i) => (
        <BlackHoleVisual
          key={i}
          position={pos}
          index={i}
          highVis={highVis}
          intensity={Math.min(1, frameRef.current > INITIAL_PAUSE_FRAMES
            ? (frameRef.current - INITIAL_PAUSE_FRAMES) / GRAVITY_RAMP_FRAMES
            : 0) * (gravityMults[i] > 0 ? 1 : 0.1)}
        />
      ))}
    </>
  );
}

// ── Camera reset helper ───────────────────────────────────────
function CameraResetter({ resetKey }: { resetKey: number }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (resetKey === 0) return;
    camera.position.set(0, 200, 800);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) controlsRef.current.reset();
  }, [resetKey, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan
      enableZoom
      enableRotate
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      panSpeed={0.5}
      minDistance={50}
      maxDistance={2000}
    />
  );
}

// ── Landing page wrapper ──────────────────────────────────────
export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [starData, setStarData] = useState<StarData | null>(null);
  const [showUI, setShowUI] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [starCount, setStarCount] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [gravityMults, setGravityMults] = useState<[number, number, number]>([1, 1, 1]);
  const [bhConfigs, setBhConfigs] = useState<BHConfig[]>([...DEFAULT_BH_CONFIGS]);
  const [simPaused, setSimPaused] = useState(false);
  const [highVis, setHighVis] = useState(false);

  useEffect(() => {
    getSolarSystemMap().then((systems) => {
      const data = projectSystems3D(systems);
      setStarData(data);
      setStarCount(data.count);
    });
  }, []);

  const handleReady = useCallback(() => {
    setTimeout(() => setShowUI(true), 800);
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#080a10" }}>
      {/* Three.js Canvas */}
      <Canvas
        style={{ position: "absolute", top: 0, left: 0 }}
        camera={{ position: [0, 200, 800], fov: 60, near: 1, far: 4000 }}
        gl={{ antialias: false, alpha: false }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(0x080a10));
        }}
      >
        <CameraResetter resetKey={resetKey} />
        {starData && <StarField starData={starData} onReady={handleReady} resetKey={resetKey} gravityMults={gravityMults} bhConfigs={bhConfigs} paused={simPaused} highVis={highVis} />}
      </Canvas>

      {/* Loading state */}
      {!starData && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(100, 140, 180, 0.4)" }}>
            LOADING STAR CHART...
          </span>
        </div>
      )}

      {/* Overlay UI */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: showUI && uiVisible ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      >
        <h1
          style={{
            fontFamily: "monospace",
            fontSize: "clamp(2rem, 5vw, 4.5rem)",
            fontWeight: 700,
            color: "rgba(255, 255, 255, 0.88)",
            letterSpacing: "0.3em",
            textShadow: "0 0 40px rgba(64, 180, 255, 0.35), 0 0 80px rgba(64, 180, 255, 0.12)",
            margin: 0,
            textAlign: "center",
            userSelect: "none",
          }}
        >
          FRONTIER OPS
        </h1>

        <p
          style={{
            fontFamily: "monospace",
            fontSize: "clamp(0.7rem, 1.5vw, 1rem)",
            color: "rgba(180, 200, 220, 0.55)",
            letterSpacing: "0.15em",
            margin: "8px 0 0 0",
            textAlign: "center",
            userSelect: "none",
          }}
        >
          OUTPOST OPERATOR'S CONSOLE
        </p>

        <div
          style={{
            width: "clamp(100px, 20vw, 200px)",
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(64, 180, 255, 0.4), transparent)",
            margin: "24px 0",
          }}
        />

        <div
          style={{
            display: "flex",
            gap: "clamp(16px, 3vw, 32px)",
            fontFamily: "monospace",
            fontSize: "clamp(0.55rem, 1vw, 0.7rem)",
            color: "rgba(120, 180, 150, 0.6)",
            letterSpacing: "0.1em",
            userSelect: "none",
          }}
        >
          <span>SUI TESTNET <span style={{ color: "rgba(120, 255, 180, 0.9)" }}>●</span></span>
          <span>ESCROW <span style={{ color: "rgba(64, 180, 255, 0.9)" }}>●</span></span>
          <span>{starCount.toLocaleString()} SYSTEMS <span style={{ color: "rgba(255, 220, 80, 0.9)" }}>●</span></span>
        </div>

        <button
          onClick={onEnter}
          style={{
            pointerEvents: "auto",
            marginTop: "clamp(24px, 4vh, 48px)",
            padding: "12px 40px",
            fontFamily: "monospace",
            fontSize: "clamp(0.75rem, 1.2vw, 0.9rem)",
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "rgba(200, 220, 240, 0.9)",
            background: "rgba(64, 180, 255, 0.08)",
            border: "1px solid rgba(64, 180, 255, 0.25)",
            borderRadius: 4,
            cursor: "pointer",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.background = "rgba(64, 180, 255, 0.18)";
            btn.style.borderColor = "rgba(64, 180, 255, 0.5)";
            btn.style.boxShadow = "0 0 30px rgba(64, 180, 255, 0.12)";
          }}
          onMouseLeave={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.background = "rgba(64, 180, 255, 0.08)";
            btn.style.borderColor = "rgba(64, 180, 255, 0.25)";
            btn.style.boxShadow = "none";
          }}
        >
          Enter Console
        </button>

        <div
          style={{
            position: "absolute",
            bottom: "clamp(16px, 3vh, 32px)",
            fontFamily: "monospace",
            fontSize: "0.6rem",
            color: "rgba(100, 120, 140, 0.4)",
            letterSpacing: "0.1em",
            textAlign: "center",
            userSelect: "none",
            lineHeight: 1.8,
          }}
        >
          JOBS · BOUNTIES · ASSEMBLIES · STARMAP · MISSION CONTROL
          <br />
          THE TRINARY AWAITS
        </div>
      </div>

      {/* Bottom-left: gravity sliders */}
      <div
        style={{
          position: "absolute",
          bottom: "clamp(16px, 3vh, 32px)",
          left: "clamp(16px, 3vw, 32px)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          opacity: showUI && uiVisible ? 0.7 : 0,
          transition: "opacity 0.5s ease",
          fontFamily: "monospace",
          fontSize: "0.55rem",
          letterSpacing: "0.08em",
          color: "rgba(160, 180, 200, 0.6)",
        }}
      >
        {(["BH-1", "BH-2", "BH-3"] as const).map((label, i) => {
          const colors = ["#3366cc", "#7733bb", "#22aaaa"];
          const inputStyle = {
            width: 65, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,140,180,0.2)",
            borderRadius: 3, color: "rgba(180,200,220,0.85)", fontFamily: "monospace", fontSize: "0.8rem",
            padding: "4px 6px", textAlign: "right" as const,
          };
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ width: 30, color: colors[i] }}>{label}</span>
              <input
                type="range" min="0" max="3" step="0.1"
                value={gravityMults[i]}
                onChange={(e) => {
                  const next = [...gravityMults] as [number, number, number];
                  next[i] = parseFloat(e.target.value);
                  setGravityMults(next);
                }}
                style={{ width: 60, accentColor: colors[i] }}
              />
              <span style={{ width: 22, textAlign: "right" }}>{gravityMults[i].toFixed(1)}x</span>
              {(["cx", "cy", "cz"] as const).map((axis) => (
                <input
                  key={axis}
                  type="number"
                  value={bhConfigs[i][axis]}
                  onChange={(e) => {
                    const next = bhConfigs.map((c, ci) =>
                      ci === i ? { ...c, [axis]: parseFloat(e.target.value) || 0 } : c,
                    );
                    setBhConfigs(next);
                  }}
                  style={inputStyle}
                  title={axis.toUpperCase()}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Bottom-right controls */}
      <div
        style={{
          position: "absolute",
          bottom: "clamp(16px, 3vh, 32px)",
          right: "clamp(16px, 3vw, 32px)",
          display: "flex",
          gap: 8,
          opacity: showUI ? 1 : 0,
          transition: "opacity 1s ease",
        }}
      >
        {/* Pause/Resume Sim */}
        <button
          onClick={() => setSimPaused(!simPaused)}
          style={{
            padding: "6px 14px",
            fontFamily: "monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            color: simPaused ? "rgba(255, 180, 80, 0.8)" : "rgba(160, 180, 200, 0.5)",
            background: simPaused ? "rgba(255, 180, 80, 0.08)" : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${simPaused ? "rgba(255, 180, 80, 0.3)" : "rgba(100, 140, 180, 0.15)"}`,
            borderRadius: 3,
            cursor: "pointer",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = "rgba(200, 220, 240, 0.8)";
            btn.style.borderColor = "rgba(64, 180, 255, 0.4)";
          }}
          onMouseLeave={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = simPaused ? "rgba(255, 180, 80, 0.8)" : "rgba(160, 180, 200, 0.5)";
            btn.style.borderColor = simPaused ? "rgba(255, 180, 80, 0.3)" : "rgba(100, 140, 180, 0.15)";
          }}
        >
          {simPaused ? "▶ Resume" : "⏸ Pause"}
        </button>

        {/* High-vis toggle */}
        <button
          onClick={() => setHighVis(!highVis)}
          style={{
            padding: "6px 14px",
            fontFamily: "monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            color: highVis ? "rgba(255, 100, 80, 0.8)" : "rgba(160, 180, 200, 0.5)",
            background: highVis ? "rgba(255, 100, 80, 0.08)" : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${highVis ? "rgba(255, 100, 80, 0.3)" : "rgba(100, 140, 180, 0.15)"}`,
            borderRadius: 3,
            cursor: "pointer",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = "rgba(200, 220, 240, 0.8)";
            btn.style.borderColor = "rgba(64, 180, 255, 0.4)";
          }}
          onMouseLeave={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = highVis ? "rgba(255, 100, 80, 0.8)" : "rgba(160, 180, 200, 0.5)";
            btn.style.borderColor = highVis ? "rgba(255, 100, 80, 0.3)" : "rgba(100, 140, 180, 0.15)";
          }}
        >
          {highVis ? "Hi-Vis" : "Lore"}
        </button>

        {/* Hide/Show UI */}
        <button
          onClick={() => setUiVisible(!uiVisible)}
          style={{
            padding: "6px 14px",
            fontFamily: "monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            color: "rgba(160, 180, 200, 0.5)",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(100, 140, 180, 0.15)",
            borderRadius: 3,
            cursor: "pointer",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = "rgba(200, 220, 240, 0.8)";
            btn.style.borderColor = "rgba(64, 180, 255, 0.4)";
          }}
          onMouseLeave={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = "rgba(160, 180, 200, 0.5)";
            btn.style.borderColor = "rgba(100, 140, 180, 0.15)";
          }}
        >
          {uiVisible ? "Hide UI" : "Show UI"}
        </button>

        {/* Reset */}
        <button
          onClick={() => setResetKey((k) => k + 1)}
          style={{
            padding: "6px 14px",
            fontFamily: "monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            color: "rgba(160, 180, 200, 0.5)",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(100, 140, 180, 0.15)",
            borderRadius: 3,
            cursor: "pointer",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = "rgba(200, 220, 240, 0.8)";
            btn.style.borderColor = "rgba(64, 180, 255, 0.4)";
          }}
          onMouseLeave={(e) => {
            const btn = e.target as HTMLButtonElement;
            btn.style.color = "rgba(160, 180, 200, 0.5)";
            btn.style.borderColor = "rgba(100, 140, 180, 0.15)";
          }}
        >
          ↺ Reset
        </button>
      </div>
    </div>
  );
}
