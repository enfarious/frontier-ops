/**
 * FrontierOps Landing Page — the actual EVE Frontier starfield
 * collapsing into the Trinary (three black holes).
 *
 * Loads all 24,500+ solar systems from the World API, projects them
 * to 2D, colors them by constellation, then lets gravity pull them
 * into three attractor points representing the Trinary.
 *
 * Mouse creates a fourth gravity well. Pure canvas, real data, real math.
 */
import { useRef, useEffect, useState } from "react";
import { getSolarSystemMap, type SolarSystem } from "../core/world-api";

// ── Simulation constants ──────────────────────────────────────
const G = 600;                    // gravitational constant
const MOUSE_G = 2000;             // mouse gravity
const DAMPING = 0.997;            // velocity damping per frame
const MAX_SPEED = 6;
const SOFTENING = 50;             // prevent div-by-zero
const GRAVITY_RAMP_FRAMES = 180;  // frames to ramp gravity from 0→1 (3s at 60fps)
const INITIAL_PAUSE_FRAMES = 90;  // frames before gravity starts (1.5s to admire the map)

// ── Star color from constellation — spectral classes ──────────
// Hash constellation into a star color: blue-white, white, yellow, orange, red
function starColor(constellationId: number, systemId: number): [number, number, number] {
  // Mix constellation and system for variety within clusters
  const hash = ((constellationId * 137.508) + (systemId * 0.618)) % 1;
  const classHash = ((constellationId * 73.856) % 1 + (systemId * 0.0001)) % 1;

  // Spectral distribution weighted toward cooler stars (realistic)
  if (classHash < 0.03) {
    // O/B class — blue-white (rare, hot)
    return [140 + hash * 60, 180 + hash * 40, 255];
  } else if (classHash < 0.12) {
    // A class — white-blue
    return [180 + hash * 40, 200 + hash * 30, 240 + hash * 15];
  } else if (classHash < 0.25) {
    // F class — white-yellow
    return [240 + hash * 15, 230 + hash * 20, 200 + hash * 30];
  } else if (classHash < 0.50) {
    // G class — yellow (sun-like)
    return [255, 220 + hash * 30, 120 + hash * 60];
  } else if (classHash < 0.75) {
    // K class — orange
    return [255, 160 + hash * 50, 60 + hash * 40];
  } else {
    // M class — red (most common)
    return [255, 80 + hash * 60, 40 + hash * 30];
  }
}

interface Star {
  // Position
  x: number; y: number;
  // Home position (real star location)
  homeX: number; homeY: number;
  // Velocity
  vx: number; vy: number;
  // Visual
  color: [number, number, number];
  brightness: number; // 0-1
  size: number;
}

interface BlackHole {
  x: number; y: number;
  mass: number;
  // Orbital params (they orbit each other)
  cx: number; cy: number;
  radius: number;
  angle: number;
  speed: number;
}

function projectSystems(
  systems: Map<number, SolarSystem>,
  w: number,
  h: number,
): Star[] {
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);

  // Project 3D → 2D (same as starmap)
  const projected: { px: number; pz: number; sys: SolarSystem }[] = [];
  let minPx = Infinity, maxPx = -Infinity;
  let minPz = Infinity, maxPz = -Infinity;

  for (const [, sys] of systems) {
    const px = sys.location.x + sys.location.y * cos30;
    const pz = sys.location.z + sys.location.y * sin30;
    projected.push({ px, pz, sys });
    if (px < minPx) minPx = px;
    if (px > maxPx) maxPx = px;
    if (pz < minPz) minPz = pz;
    if (pz > maxPz) maxPz = pz;
  }

  const rangePx = maxPx - minPx || 1;
  const rangePz = maxPz - minPz || 1;

  // 1.8x overscale so the starfield bleeds past screen edges
  const OVERSCALE = 1.8;
  const drawW = w * OVERSCALE;
  const drawH = h * OVERSCALE;

  // Maintain aspect ratio, centered (overscale means negative offsets)
  const scaleX = drawW / rangePx;
  const scaleZ = drawH / rangePz;
  const scale = Math.min(scaleX, scaleZ);
  const offsetX = (w - rangePx * scale) / 2;
  const offsetZ = (h - rangePz * scale) / 2;

  return projected.map(({ px, pz, sys }) => {
    const screenX = offsetX + (px - minPx) * scale;
    const screenY = offsetZ + (pz - minPz) * scale;
    const [r, g, b] = starColor(sys.constellationId, sys.id);
    // Brightness varies by "depth" (y coordinate gives depth feel)
    const depthNorm = (sys.location.y - (-1e12)) / 2e12; // rough normalize
    const brightness = 0.3 + Math.abs(depthNorm % 1) * 0.7;

    return {
      x: screenX,
      y: screenY,
      homeX: screenX,
      homeY: screenY,
      vx: 0,
      vy: 0,
      color: [r, g, b] as [number, number, number],
      brightness: Math.min(1, Math.max(0.2, brightness)),
      size: 0.5 + Math.random() * 1.5,
    };
  });
}

function createTrinar(w: number, h: number): BlackHole[] {
  const cx = w / 2;
  const cy = h / 2;
  const orbitRadius = Math.min(w, h) * 0.06;

  return [
    {
      x: cx, y: cy,
      mass: 1.0,
      cx, cy,
      radius: orbitRadius,
      angle: 0,
      speed: 0.0008,
    },
    {
      x: cx, y: cy,
      mass: 0.85,
      cx, cy,
      radius: orbitRadius * 0.7,
      angle: Math.PI * 2 / 3,
      speed: -0.0012, // counter-orbiting
    },
    {
      x: cx, y: cy,
      mass: 0.7,
      cx, cy,
      radius: orbitRadius * 1.2,
      angle: Math.PI * 4 / 3,
      speed: 0.0006,
    },
  ];
}

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const stateRef = useRef<{
    stars: Star[];
    blackHoles: BlackHole[];
    frame: number;
    loaded: boolean;
  } | null>(null);
  const [showUI, setShowUI] = useState(false);
  const [starCount, setStarCount] = useState(0);

  // Load real star data
  useEffect(() => {
    getSolarSystemMap().then((systems) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const stars = projectSystems(systems, canvas.width, canvas.height);
      const blackHoles = createTrinar(canvas.width, canvas.height);
      stateRef.current = { stars, blackHoles, frame: 0, loaded: true };
      setStarCount(stars.length);
      // Show UI shortly after stars appear
      setTimeout(() => setShowUI(true), 800);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      // If already loaded, reproject
      if (stateRef.current?.loaded) {
        getSolarSystemMap().then((systems) => {
          const stars = projectSystems(systems, canvas!.width, canvas!.height);
          const blackHoles = createTrinar(canvas!.width, canvas!.height);
          // Preserve velocities from existing stars if count matches
          const old = stateRef.current?.stars;
          if (old && old.length === stars.length) {
            for (let i = 0; i < stars.length; i++) {
              stars[i].vx = old[i].vx;
              stars[i].vy = old[i].vy;
            }
          }
          stateRef.current = { stars, blackHoles, frame: stateRef.current?.frame ?? 0, loaded: true };
        });
      }
    }
    resize();
    window.addEventListener("resize", resize);

    function tick() {
      const state = stateRef.current;
      const w = canvas!.width;
      const h = canvas!.height;

      // Pre-load: just draw dark background
      if (!state?.loaded) {
        ctx.fillStyle = "#080a10";
        ctx.fillRect(0, 0, w, h);

        // Loading text
        ctx.fillStyle = "rgba(100, 140, 180, 0.4)";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("LOADING STAR CHART...", w / 2, h / 2);

        animRef.current = requestAnimationFrame(tick);
        return;
      }

      const { stars, blackHoles } = state;
      state.frame++;
      const frame = state.frame;

      // Gravity ramp: 0 during pause, then 0→1 over GRAVITY_RAMP_FRAMES
      const gravityPhase = Math.max(0, frame - INITIAL_PAUSE_FRAMES);
      const gravityStrength = Math.min(1, gravityPhase / GRAVITY_RAMP_FRAMES);

      // Update black hole positions (Trinary orbit)
      for (const bh of blackHoles) {
        bh.angle += bh.speed;
        bh.x = bh.cx + Math.cos(bh.angle) * bh.radius;
        bh.y = bh.cy + Math.sin(bh.angle) * bh.radius;
      }

      // Update stars — optimized physics
      // Pre-compute gravity constant × dt × strength to avoid per-star multiplies
      const mouse = mouseRef.current;
      const gdt = G * 0.016 * gravityStrength;
      const mgdt = MOUSE_G * 0.016;
      const soft2 = SOFTENING * SOFTENING;
      const damp = DAMPING;
      const maxSpd2 = MAX_SPEED * MAX_SPEED;
      const margin = 80;

      if (gravityStrength > 0) {
        // Cache black hole positions
        const bh0x = blackHoles[0].x, bh0y = blackHoles[0].y, bh0m = blackHoles[0].mass;
        const bh1x = blackHoles[1].x, bh1y = blackHoles[1].y, bh1m = blackHoles[1].mass;
        const bh2x = blackHoles[2].x, bh2y = blackHoles[2].y, bh2m = blackHoles[2].mass;
        const mx = mouse.x, my = mouse.y, mActive = mouse.active;

        for (let i = 0, len = stars.length; i < len; i++) {
          const star = stars[i];
          let vx = star.vx;
          let vy = star.vy;
          const sx = star.x;
          const sy = star.y;

          // Gravity from 3 black holes (unrolled, no inner loop)
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
          if (mActive) {
            dx = mx - sx; dy = my - sy;
            distSq = dx * dx + dy * dy + soft2;
            invDist = 1 / Math.sqrt(distSq);
            f = mgdt / distSq;
            vx += dx * invDist * f;
            vy += dy * invDist * f;
          }

          // Damping
          vx *= damp;
          vy *= damp;

          // Clamp speed (avoid sqrt unless needed)
          const spd2 = vx * vx + vy * vy;
          if (spd2 > maxSpd2) {
            const s = MAX_SPEED / Math.sqrt(spd2);
            vx *= s;
            vy *= s;
          }

          // Integrate + wrap
          let nx = sx + vx;
          let ny = sy + vy;
          if (nx < -margin) nx = w + margin;
          else if (nx > w + margin) nx = -margin;
          if (ny < -margin) ny = h + margin;
          else if (ny > h + margin) ny = -margin;

          star.vx = vx;
          star.vy = vy;
          star.x = nx;
          star.y = ny;
        }
      }

      // ── Render ──────────────────────────────────────────────

      // Fade background — creates trail effect once stars are moving
      if (gravityStrength > 0.1) {
        // Stronger fade = shorter trails
        const fadeAlpha = 0.08 + gravityStrength * 0.07;
        ctx.fillStyle = `rgba(8, 10, 16, ${fadeAlpha})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        // Solid background when stars are stationary
        ctx.fillStyle = "#080a10";
        ctx.fillRect(0, 0, w, h);
      }

      // Subtle grid (only visible in early frames)
      if (gravityStrength < 0.5) {
        const gridAlpha = 0.04 * (1 - gravityStrength * 2);
        ctx.strokeStyle = `rgba(40, 60, 80, ${gridAlpha})`;
        ctx.lineWidth = 0.5;
        const gridSize = 100;
        for (let x = 0; x < w; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
      }

      // Draw black hole accretion glow
      for (const bh of blackHoles) {
        const glowRadius = 40 + bh.mass * 30 + gravityStrength * 20;
        const grad = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, glowRadius);
        grad.addColorStop(0, `rgba(60, 120, 200, ${0.12 * gravityStrength})`);
        grad.addColorStop(0.4, `rgba(100, 60, 180, ${0.06 * gravityStrength})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bh.x, bh.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Core
        if (gravityStrength > 0.3) {
          ctx.fillStyle = `rgba(20, 20, 30, ${gravityStrength * 0.8})`;
          ctx.beginPath();
          ctx.arc(bh.x, bh.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw stars — performance-optimized
      // fillRect is ~4x faster than arc for tiny dots.
      // Only use arc + glow for the ~5% of stars that are large enough to notice.
      for (const star of stars) {
        // Skip stars fully off-screen
        if (star.x < -10 || star.x > w + 10 || star.y < -10 || star.y > h + 10) continue;

        const [r, g, b] = star.color;
        const alpha = star.brightness;

        if (star.size > 1.4) {
          // Larger stars: glow + round core (arc)
          const glowSize = star.size * 2.5;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.12})`;
          ctx.fillRect(star.x - glowSize, star.y - glowSize, glowSize * 2, glowSize * 2);

          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Small stars: fast 1-2px filled rectangle
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          const s = star.size < 0.8 ? 1 : 2;
          ctx.fillRect(star.x, star.y, s, s);
        }
      }

      // Mouse cursor gravity well indicator
      if (mouse.active) {
        const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 60);
        grad.addColorStop(0, "rgba(255, 200, 100, 0.1)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 60, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);

    // Mouse/touch handlers
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const onLeave = () => { mouseRef.current.active = false; };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: true };
      }
    };
    const onTouchEnd = () => { mouseRef.current.active = false; };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("touchmove", onTouch, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#080a10" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", cursor: "crosshair" }}
      />

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
        {/* Title */}
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

        {/* Subtitle */}
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

        {/* Decorative line */}
        <div
          style={{
            width: "clamp(100px, 20vw, 200px)",
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(64, 180, 255, 0.4), transparent)",
            margin: "24px 0",
          }}
        />

        {/* Status indicators */}
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

        {/* Enter button */}
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

        {/* Bottom credits */}
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
