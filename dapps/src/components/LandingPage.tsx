/**
 * FrontierOps Landing Page — the actual EVE Frontier starfield
 * collapsing into the Trinary (three black holes).
 *
 * Three.js Points cloud — GPU renders all 24,500+ stars in a single draw call.
 * Physics runs on CPU, positions uploaded to GPU each frame via buffer attributes.
 */
import { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getSolarSystemMap, type SolarSystem } from "../core/world-api";

// ── Simulation constants ──────────────────────────────────────
const G = 600;
const MOUSE_G = 2000;
const DAMPING = 0.997;
const MAX_SPEED = 6;
const SOFTENING = 50;
const GRAVITY_RAMP_FRAMES = 180;
const INITIAL_PAUSE_FRAMES = 90;
const OVERSCALE = 1.8;

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

// ── Project solar systems to flat coordinates ─────────────────
interface StarData {
  positions: Float32Array;  // x, y per star (flat 2D, z=0)
  colors: Float32Array;     // r, g, b per star
  sizes: Float32Array;      // point size per star
  velocities: Float32Array; // vx, vy per star
  count: number;
}

function projectSystems(systems: Map<number, SolarSystem>, viewW: number, viewH: number): StarData {
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);

  const entries: { px: number; pz: number; sys: SolarSystem }[] = [];
  let minPx = Infinity, maxPx = -Infinity;
  let minPz = Infinity, maxPz = -Infinity;

  for (const [, sys] of systems) {
    const px = sys.location.x + sys.location.y * cos30;
    const pz = sys.location.z + sys.location.y * sin30;
    entries.push({ px, pz, sys });
    if (px < minPx) minPx = px;
    if (px > maxPx) maxPx = px;
    if (pz < minPz) minPz = pz;
    if (pz > maxPz) maxPz = pz;
  }

  const rangePx = maxPx - minPx || 1;
  const rangePz = maxPz - minPz || 1;
  const drawW = viewW * OVERSCALE;
  const drawH = viewH * OVERSCALE;
  const scaleX = drawW / rangePx;
  const scaleZ = drawH / rangePz;
  const scale = Math.min(scaleX, scaleZ);

  // Center in view (coordinates in world units centered at 0,0)
  const totalW = rangePx * scale;
  const totalH = rangePz * scale;

  const count = entries.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const velocities = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const { px, pz, sys } = entries[i];
    // Map to centered coordinates
    const x = ((px - minPx) * scale) - totalW / 2;
    const y = -(((pz - minPz) * scale) - totalH / 2); // flip Y for Three.js

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;

    const [r, g, b] = starColor(sys.constellationId, sys.id);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    sizes[i] = 1.5 + Math.random() * 2.5;
    velocities[i * 2] = 0;
    velocities[i * 2 + 1] = 0;
  }

  return { positions, colors, sizes, velocities, count };
}

// ── Black hole attractor ──────────────────────────────────────
interface BlackHole {
  x: number; y: number;
  mass: number;
  radius: number;
  angle: number;
  speed: number;
}

function createTrinar(viewW: number, viewH: number): BlackHole[] {
  const orbitRadius = Math.min(viewW, viewH) * 0.04;
  return [
    { x: 0, y: 0, mass: 1.0, radius: orbitRadius, angle: 0, speed: 0.0008 },
    { x: 0, y: 0, mass: 0.85, radius: orbitRadius * 0.7, angle: Math.PI * 2 / 3, speed: -0.0012 },
    { x: 0, y: 0, mass: 0.7, radius: orbitRadius * 1.2, angle: Math.PI * 4 / 3, speed: 0.0006 },
  ];
}

// ── Star point sprite texture ─────────────────────────────────
function createStarTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Radial gradient: bright center, soft falloff
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

// ── Black hole glow mesh ──────────────────────────────────────
function BlackHoleGlow({ position, intensity }: { position: [number, number, number]; intensity: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(position[0], position[1], position[2]);
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <circleGeometry args={[40 + intensity * 30, 32]} />
      <meshBasicMaterial
        color={new THREE.Color(0.24, 0.47, 0.78)}
        transparent
        opacity={0.06 * intensity}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Main star field component ─────────────────────────────────
function StarField({ starData, onReady }: { starData: StarData; onReady: () => void }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { viewport, pointer } = useThree();
  const frameRef = useRef(0);
  const blackHolesRef = useRef<BlackHole[]>(createTrinar(viewport.width, viewport.height));
  const [bhPositions, setBhPositions] = useState<[number, number, number][]>([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  const texture = useMemo(createStarTexture, []);

  // Store velocities outside geometry
  const velocities = useRef(starData.velocities);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useFrame(() => {
    if (!pointsRef.current) return;

    const frame = ++frameRef.current;
    const gravityPhase = Math.max(0, frame - INITIAL_PAUSE_FRAMES);
    const gravityStrength = Math.min(1, gravityPhase / GRAVITY_RAMP_FRAMES);

    const bhs = blackHolesRef.current;
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const vel = velocities.current;
    const count = starData.count;

    // Update black holes
    for (const bh of bhs) {
      bh.angle += bh.speed;
      bh.x = Math.cos(bh.angle) * bh.radius;
      bh.y = Math.sin(bh.angle) * bh.radius;
    }

    // Update glow positions
    setBhPositions(bhs.map(bh => [bh.x, bh.y, -1] as [number, number, number]));

    if (gravityStrength > 0) {
      const gdt = G * 0.016 * gravityStrength;
      const mgdt = MOUSE_G * 0.016;
      const soft2 = SOFTENING * SOFTENING;
      const maxSpd2 = MAX_SPEED * MAX_SPEED;
      const damp = DAMPING;

      const bh0x = bhs[0].x, bh0y = bhs[0].y, bh0m = bhs[0].mass;
      const bh1x = bhs[1].x, bh1y = bhs[1].y, bh1m = bhs[1].mass;
      const bh2x = bhs[2].x, bh2y = bhs[2].y, bh2m = bhs[2].mass;

      // Convert pointer to world coords
      const mouseX = pointer.x * viewport.width / 2;
      const mouseY = pointer.y * viewport.height / 2;
      // Mouse is "active" when pointer is inside the canvas area
      const mouseActive = Math.abs(pointer.x) < 1 && Math.abs(pointer.y) < 1;

      for (let i = 0; i < count; i++) {
        const pi3 = i * 3;
        const vi2 = i * 2;
        const sx = positions[pi3];
        const sy = positions[pi3 + 1];
        let vx = vel[vi2];
        let vy = vel[vi2 + 1];

        // Gravity from Trinary (unrolled)
        let dx = bh0x - sx, dy = bh0y - sy;
        let distSq = dx * dx + dy * dy + soft2;
        let invDist = 1 / Math.sqrt(distSq);
        let f = gdt * bh0m / distSq;
        vx += dx * invDist * f;
        vy += dy * invDist * f;

        dx = bh1x - sx; dy = bh1y - sy;
        distSq = dx * dx + dy * dy + soft2;
        invDist = 1 / Math.sqrt(distSq);
        f = gdt * bh1m / distSq;
        vx += dx * invDist * f;
        vy += dy * invDist * f;

        dx = bh2x - sx; dy = bh2y - sy;
        distSq = dx * dx + dy * dy + soft2;
        invDist = 1 / Math.sqrt(distSq);
        f = gdt * bh2m / distSq;
        vx += dx * invDist * f;
        vy += dy * invDist * f;

        // Mouse gravity
        if (mouseActive) {
          dx = mouseX - sx; dy = mouseY - sy;
          distSq = dx * dx + dy * dy + soft2;
          invDist = 1 / Math.sqrt(distSq);
          f = mgdt / distSq;
          vx += dx * invDist * f;
          vy += dy * invDist * f;
        }

        vx *= damp;
        vy *= damp;

        const spd2 = vx * vx + vy * vy;
        if (spd2 > maxSpd2) {
          const s = MAX_SPEED / Math.sqrt(spd2);
          vx *= s;
          vy *= s;
        }

        positions[pi3] = sx + vx;
        positions[pi3 + 1] = sy + vy;

        vel[vi2] = vx;
        vel[vi2 + 1] = vy;
      }

      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[starData.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[starData.colors, 3]}
          />
          <bufferAttribute
            attach="attributes-size"
            args={[starData.sizes, 1]}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={3}
          sizeAttenuation={false}
          map={texture}
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Black hole glows */}
      {bhPositions.map((pos, i) => (
        <BlackHoleGlow
          key={i}
          position={pos}
          intensity={Math.min(1, frameRef.current > INITIAL_PAUSE_FRAMES
            ? (frameRef.current - INITIAL_PAUSE_FRAMES) / GRAVITY_RAMP_FRAMES
            : 0)}
        />
      ))}
    </>
  );
}

// ── Landing page wrapper ──────────────────────────────────────
export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [starData, setStarData] = useState<StarData | null>(null);
  const [showUI, setShowUI] = useState(false);
  const [starCount, setStarCount] = useState(0);

  useEffect(() => {
    getSolarSystemMap().then((systems) => {
      // Use window dimensions for projection
      const data = projectSystems(systems, window.innerWidth, window.innerHeight);
      setStarData(data);
      setStarCount(data.count);
    });
  }, []);

  const handleReady = useMemo(() => () => {
    setTimeout(() => setShowUI(true), 800);
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#080a10" }}>
      {/* Three.js Canvas */}
      <Canvas
        style={{ position: "absolute", top: 0, left: 0 }}
        camera={{ position: [0, 0, 500], fov: 75, near: 1, far: 2000 }}
        gl={{ antialias: false, alpha: false }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(0x080a10));
        }}
      >
        {starData && <StarField starData={starData} onReady={handleReady} />}
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
          opacity: showUI ? 1 : 0,
          transition: "opacity 1.5s ease",
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
    </div>
  );
}
