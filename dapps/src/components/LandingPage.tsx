/**
 * FrontierOps Landing Page — gravitational particle simulation.
 *
 * N-body system with glowing particles orbiting attractor points.
 * Mouse creates a gravity well. Particles leave fading trails.
 * Pure canvas, pure math, zero dependencies.
 */
import { useRef, useEffect, useCallback, useState } from "react";

// ── Simulation constants ──────────────────────────────────────
const PARTICLE_COUNT = 600;
const ATTRACTOR_COUNT = 3;
const G = 800;                  // gravitational constant
const MOUSE_G = 2400;           // mouse gravity (stronger pull)
const DAMPING = 0.998;          // velocity damping per frame
const TRAIL_LENGTH = 12;
const MAX_SPEED = 8;
const SOFTENING = 40;           // prevent division by zero in gravity
const SPAWN_VELOCITY = 1.5;

// ── Color palette (EVE Frontier vibes) ────────────────────────
const COLORS = [
  [64, 180, 255],   // ice blue
  [255, 140, 50],   // amber
  [120, 255, 180],  // jade green
  [200, 120, 255],  // violet
  [255, 80, 80],    // danger red
  [255, 220, 80],   // gold
];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: number[];
  alpha: number;
  size: number;
  trail: { x: number; y: number }[];
}

interface Attractor {
  x: number; y: number;
  mass: number;
  // Orbit parameters
  cx: number; cy: number;
  rx: number; ry: number;
  angle: number;
  speed: number;
}

function createParticle(w: number, h: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const dist = 100 + Math.random() * Math.min(w, h) * 0.4;
  return {
    x: w / 2 + Math.cos(angle) * dist,
    y: h / 2 + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * SPAWN_VELOCITY * 2 + Math.cos(angle + Math.PI / 2) * SPAWN_VELOCITY,
    vy: (Math.random() - 0.5) * SPAWN_VELOCITY * 2 + Math.sin(angle + Math.PI / 2) * SPAWN_VELOCITY,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 0.4 + Math.random() * 0.6,
    size: 1 + Math.random() * 2,
    trail: [],
  };
}

function createAttractor(w: number, h: number): Attractor {
  return {
    x: w / 2, y: h / 2,
    mass: 0.6 + Math.random() * 0.8,
    cx: w / 2, cy: h / 2,
    rx: 60 + Math.random() * Math.min(w, h) * 0.2,
    ry: 40 + Math.random() * Math.min(w, h) * 0.15,
    angle: Math.random() * Math.PI * 2,
    speed: 0.0003 + Math.random() * 0.0006,
  };
}

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const stateRef = useRef<{ particles: Particle[]; attractors: Attractor[]; time: number } | null>(null);
  const [showUI, setShowUI] = useState(false);

  // Fade in UI after a beat
  useEffect(() => {
    const t = setTimeout(() => setShowUI(true), 600);
    return () => clearTimeout(t);
  }, []);

  const init = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(w, h));
    }
    const attractors: Attractor[] = [];
    for (let i = 0; i < ATTRACTOR_COUNT; i++) {
      attractors.push(createAttractor(w, h));
    }
    stateRef.current = { particles, attractors, time: 0 };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      if (!stateRef.current) {
        init(canvas!.width, canvas!.height);
      }
    }
    resize();
    window.addEventListener("resize", resize);

    function tick() {
      const state = stateRef.current;
      if (!state) { animRef.current = requestAnimationFrame(tick); return; }

      const w = canvas!.width;
      const h = canvas!.height;
      const { particles, attractors } = state;
      state.time++;

      // Update attractor positions (slow orbits)
      for (const a of attractors) {
        a.angle += a.speed;
        a.x = a.cx + Math.cos(a.angle) * a.rx;
        a.y = a.cy + Math.sin(a.angle) * a.ry;
      }

      // Update particles
      const mouse = mouseRef.current;
      for (const p of particles) {
        // Store trail
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > TRAIL_LENGTH) p.trail.shift();

        // Gravity from attractors
        for (const a of attractors) {
          const dx = a.x - p.x;
          const dy = a.y - p.y;
          const distSq = dx * dx + dy * dy + SOFTENING * SOFTENING;
          const dist = Math.sqrt(distSq);
          const force = (G * a.mass) / distSq;
          p.vx += (dx / dist) * force * 0.016;
          p.vy += (dy / dist) * force * 0.016;
        }

        // Mouse gravity
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const distSq = dx * dx + dy * dy + SOFTENING * SOFTENING;
          const dist = Math.sqrt(distSq);
          const force = MOUSE_G / distSq;
          p.vx += (dx / dist) * force * 0.016;
          p.vy += (dy / dist) * force * 0.016;
        }

        // Damping
        p.vx *= DAMPING;
        p.vy *= DAMPING;

        // Clamp speed
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > MAX_SPEED) {
          p.vx = (p.vx / speed) * MAX_SPEED;
          p.vy = (p.vy / speed) * MAX_SPEED;
        }

        // Integrate
        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges with margin
        const margin = 50;
        if (p.x < -margin) p.x = w + margin;
        if (p.x > w + margin) p.x = -margin;
        if (p.y < -margin) p.y = h + margin;
        if (p.y > h + margin) p.y = -margin;
      }

      // ── Render ──────────────────────────────────────────────
      // Fade background (creates trail effect)
      ctx.fillStyle = "rgba(8, 10, 16, 0.15)";
      ctx.fillRect(0, 0, w, h);

      // Draw subtle grid
      ctx.strokeStyle = "rgba(40, 60, 80, 0.08)";
      ctx.lineWidth = 0.5;
      const gridSize = 80;
      const gridOffsetX = (state.time * 0.1) % gridSize;
      const gridOffsetY = (state.time * 0.05) % gridSize;
      for (let x = -gridSize + gridOffsetX; x < w + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = -gridSize + gridOffsetY; y < h + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw attractor glow
      for (const a of attractors) {
        const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 60 * a.mass);
        grad.addColorStop(0, `rgba(100, 180, 255, ${0.08 * a.mass})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 60 * a.mass, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw particle trails and particles
      for (const p of particles) {
        const [r, g, b] = p.color;

        // Trail
        if (p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let i = 1; i < p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y);
          }
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.15})`;
          ctx.lineWidth = p.size * 0.6;
          ctx.stroke();
        }

        // Glow
        const glowSize = p.size * 4;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.4})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mouse cursor glow
      if (mouse.active) {
        const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 80);
        grad.addColorStop(0, "rgba(255, 200, 100, 0.12)");
        grad.addColorStop(0.5, "rgba(255, 140, 50, 0.04)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 80, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);

    // Mouse handlers
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };
    const onLeave = () => { mouseRef.current.active = false; };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current.x = e.touches[0].clientX;
        mouseRef.current.y = e.touches[0].clientY;
        mouseRef.current.active = true;
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
  }, [init]);

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
          transition: "opacity 1.2s ease",
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontFamily: "monospace",
            fontSize: "clamp(2rem, 5vw, 4.5rem)",
            fontWeight: 700,
            color: "rgba(255, 255, 255, 0.9)",
            letterSpacing: "0.3em",
            textShadow: "0 0 40px rgba(64, 180, 255, 0.4), 0 0 80px rgba(64, 180, 255, 0.15)",
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
            color: "rgba(180, 200, 220, 0.6)",
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
            background: "linear-gradient(90deg, transparent, rgba(64, 180, 255, 0.5), transparent)",
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
            color: "rgba(120, 200, 150, 0.7)",
            letterSpacing: "0.1em",
            userSelect: "none",
          }}
        >
          <span>SUI TESTNET <span style={{ color: "rgba(120, 255, 180, 0.9)" }}>●</span></span>
          <span>ESCROW <span style={{ color: "rgba(64, 180, 255, 0.9)" }}>●</span></span>
          <span>ON-CHAIN <span style={{ color: "rgba(255, 200, 80, 0.9)" }}>●</span></span>
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
            border: "1px solid rgba(64, 180, 255, 0.3)",
            borderRadius: 4,
            cursor: "pointer",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background = "rgba(64, 180, 255, 0.2)";
            (e.target as HTMLButtonElement).style.borderColor = "rgba(64, 180, 255, 0.6)";
            (e.target as HTMLButtonElement).style.boxShadow = "0 0 30px rgba(64, 180, 255, 0.15)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = "rgba(64, 180, 255, 0.08)";
            (e.target as HTMLButtonElement).style.borderColor = "rgba(64, 180, 255, 0.3)";
            (e.target as HTMLButtonElement).style.boxShadow = "none";
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
            color: "rgba(100, 120, 140, 0.5)",
            letterSpacing: "0.1em",
            textAlign: "center",
            userSelect: "none",
          }}
        >
          JOBS · BOUNTIES · ASSEMBLIES · STARMAP · MISSION CONTROL
          <br />
          FULLY DECENTRALIZED · NO BACKEND · ON-CHAIN ESCROW
        </div>
      </div>
    </div>
  );
}
