/**
 * 3D Starmap using Three.js via React Three Fiber.
 * Renders 24k+ solar systems as a point cloud with orbit controls.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useCallback, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { SolarSystem } from "../../core/world-api";
import type { JumpRoute } from "./hooks/useGateLinks";
import type { NormalizedCoord } from "./helpers/projection";
import type { KillmailData } from "../danger-alerts/danger-types";
import { useHeatmapData } from "./hooks/useHeatmapData";
import { HeatmapBlobs } from "./HeatmapBlobs";
import type { RouteResult } from "./route-planner";

export interface StarmapCanvasHandle {
  navigateTo: (nx: number, nz: number, targetZoom: number) => void;
}

interface StarmapCanvasProps {
  systems: Map<number, SolarSystem>;
  coords: Map<number, NormalizedCoord>;
  killHeat: Map<number, number>;
  jumpRoutes: JumpRoute[];
  selectedSystem: number | null;
  onSelectSystem: (id: number | null, pos?: { x: number; y: number }) => void;
  onHoverSystem: (id: number | null) => void;
  onReady?: () => void;
  killmails?: KillmailData[];
  heatmapCurrentTime?: number;
  heatmapWindowDuration?: number;
  heatmapEnabled?: boolean;
  heatmapShowAll?: boolean;
  route?: RouteResult | null;
}

/** Normalize 3D coords to a centered unit cube */
function normalizePositions(systems: Map<number, SolarSystem>) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const sys of systems.values()) {
    const { x, y, z } = sys.location;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;
  const maxRange = Math.max(rangeX, rangeY, rangeZ);

  // Map to [-500, 500] range — extra wide to separate dense clusters around black holes
  const scale = 1000 / maxRange;
  const positions = new Map<number, THREE.Vector3>();

  for (const [id, sys] of systems) {
    positions.set(id, new THREE.Vector3(
       (sys.location.x - (minX + maxX) / 2) * scale,
      -((sys.location.y - (minY + maxY) / 2) * scale),
      -((sys.location.z - (minZ + maxZ) / 2) * scale),
    ));
  }

  return positions;
}

/** The point cloud of all star systems */
function StarField({
  systems,
  positions,
  killHeat,
  selectedSystem,
  onSelectSystem,
  onHoverSystem,
  controlsRef,
  gatedSystems,
}: {
  systems: Map<number, SolarSystem>;
  positions: Map<number, THREE.Vector3>;
  killHeat: Map<number, number>;
  selectedSystem: number | null;
  onSelectSystem: (id: number | null, pos?: { x: number; y: number }) => void;
  onHoverSystem: (id: number | null) => void;
  controlsRef: React.RefObject<any>;
  gatedSystems: Set<number>;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, raycaster, pointer, gl } = useThree();

  // Animate camera to center on selected system
  const animTarget = useRef<THREE.Vector3 | null>(null);
  const animating = useRef(false);

  useEffect(() => {
    if (selectedSystem && positions.has(selectedSystem) && controlsRef.current) {
      const target = positions.get(selectedSystem)!;
      animTarget.current = target.clone();
      animating.current = true;
    }
  }, [selectedSystem, positions, controlsRef]);

  useFrame(() => {
    if (animating.current && animTarget.current && controlsRef.current) {
      const controls = controlsRef.current;
      const target = animTarget.current;

      // Smoothly move the orbit target to the star
      controls.target.lerp(target, 0.08);

      // Move camera toward the star, maintaining relative offset but closer
      const offset = camera.position.clone().sub(controls.target);
      const dist = offset.length();
      const targetDist = Math.max(15, Math.min(dist, 40)); // Zoom in but not too close
      offset.normalize().multiplyScalar(targetDist);
      const newCamPos = target.clone().add(offset);
      camera.position.lerp(newCamPos, 0.08);

      controls.update();

      // Stop when close enough
      if (controls.target.distanceTo(target) < 0.1) {
        animating.current = false;
        animTarget.current = null;
      }
    }
  });

  // Build geometry with time-based heat coloring
  const { geometry, idArray } = useMemo(() => {
    const count = systems.size;
    const posArr = new Float32Array(count * 3);
    const colorArr = new Float32Array(count * 3);
    const sizeArr = new Float32Array(count);
    const ids = new Array<number>(count);

    const now = Date.now();
    // Time windows for heat decay
    const HOUR = 3600_000;
    const HOT = 1 * HOUR;       // < 1h = bright red
    const WARM = 6 * HOUR;      // < 6h = orange/yellow
    const COOL = 24 * HOUR;     // < 24h = fading
    const COLD = 72 * HOUR;     // < 72h = barely visible warmth

    let i = 0;
    for (const [id] of systems) {
      const pos = positions.get(id);
      if (!pos) continue;

      posArr[i * 3] = pos.x;
      posArr[i * 3 + 1] = pos.y;
      posArr[i * 3 + 2] = pos.z;

      const lastKill = killHeat.get(id);
      const isGated = gatedSystems.size === 0 || gatedSystems.has(id);
      const color = new THREE.Color();
      let size = 1.2;

      if (lastKill && lastKill > 0) {
        const age = now - lastKill;

        if (age < HOT) {
          // Blazing red — active danger
          const t = age / HOT;
          color.setRGB(1, t * 0.2, 0.05);
          size = 3.5 - t * 1;
        } else if (age < WARM) {
          // Orange → yellow — recent activity
          const t = (age - HOT) / (WARM - HOT);
          color.setRGB(1, 0.2 + t * 0.6, 0.05 + t * 0.1);
          size = 2.5 - t * 0.5;
        } else if (age < COOL) {
          // Yellow → pale — cooling down
          const t = (age - WARM) / (COOL - WARM);
          color.setRGB(1 - t * 0.3, 0.8 - t * 0.2, 0.15 + t * 0.5);
          size = 2.0 - t * 0.3;
        } else if (age < COLD) {
          // Pale → blue-white — old news
          const t = (age - COOL) / (COLD - COOL);
          color.setRGB(0.7 - t * 0.3, 0.6 - t * 0.1, 0.65 + t * 0.15);
          size = 1.7 - t * 0.3;
        } else {
          // Cold — default star color with slight warmth
          color.setRGB(0.4, 0.45, 0.7);
          size = 1.3;
        }
      } else if (isGated) {
        // Gated system — visible white-blue star
        color.setRGB(0.55, 0.65, 0.9);
        size = 1.5;
      } else {
        // Background star (no gate) — very dim, almost invisible
        color.setRGB(0.06, 0.06, 0.1);
        size = 0.4;
      }

      colorArr[i * 3] = color.r;
      colorArr[i * 3 + 1] = color.g;
      colorArr[i * 3 + 2] = color.b;
      sizeArr[i] = size;

      ids[i] = id;
      i++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizeArr, 1));

    return { geometry: geo, idArray: ids };
  }, [systems, positions, killHeat, gatedSystems]);

  // Raycasting for hover
  const hoveredRef = useRef<number | null>(null);
  const hoverFrameSkip = useRef(0);

  useFrame(() => {
    // Only raycast every 3rd frame for performance
    hoverFrameSkip.current = (hoverFrameSkip.current + 1) % 3;
    if (hoverFrameSkip.current !== 0 || !pointsRef.current) return;

    raycaster.setFromCamera(pointer, camera);
    raycaster.params.Points = { threshold: 1.2 };
    const intersects = raycaster.intersectObject(pointsRef.current);

    if (intersects.length > 0) {
      const idx = intersects[0].index;
      if (idx !== undefined && idx < idArray.length) {
        const sysId = idArray[idx];
        if (hoveredRef.current !== sysId) {
          hoveredRef.current = sysId;
          setHoveredId(sysId);
          onHoverSystem(sysId);
          gl.domElement.style.cursor = "pointer";
        }
      }
    } else if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      setHoveredId(null);
      onHoverSystem(null);
      gl.domElement.style.cursor = "grab";
    }
  });

  // Click handler
  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    if (!pointsRef.current) return;

    raycaster.setFromCamera(pointer, camera);
    raycaster.params.Points = { threshold: 0.8 };
    const intersects = raycaster.intersectObject(pointsRef.current);

    if (intersects.length > 0) {
      const idx = intersects[0].index;
      if (idx !== undefined && idx < idArray.length) {
        // Get screen position for the overlay
        const point = intersects[0].point;
        const screenPos = point.clone().project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        const x = (screenPos.x * 0.5 + 0.5) * rect.width;
        const y = (-screenPos.y * 0.5 + 0.5) * rect.height;
        onSelectSystem(idArray[idx], { x, y });
      }
    } else {
      onSelectSystem(null);
    }
  }, [camera, raycaster, pointer, gl, idArray, onSelectSystem]);

  // Hovered system label (state so it triggers re-render)
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const hoveredPos = hoveredId ? positions.get(hoveredId) : null;
  const hoveredSysName = hoveredId ? systems.get(hoveredId)?.name : null;

  // Selected system marker
  const selectedPos = selectedSystem ? positions.get(selectedSystem) : null;
  const selectedSys = selectedSystem ? systems.get(selectedSystem) : null;

  // Create a circle texture for soft glowing dots
  const circleTexture = useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.8)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.15)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  return (
    <>
      <points ref={pointsRef} geometry={geometry} onClick={handleClick}>
        <pointsMaterial
          map={circleTexture}
          vertexColors
          sizeAttenuation
          size={1.5}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Hover tooltip */}
      {hoveredPos && hoveredSysName && hoveredId !== selectedSystem && (
        <group position={hoveredPos}>
          <Html center style={{ pointerEvents: "none", transform: "translateY(-14px)" }}>
            <div style={{
              color: "#ccc",
              fontSize: 11,
              fontFamily: "monospace",
              background: "rgba(0,0,0,0.7)",
              padding: "2px 6px",
              borderRadius: 3,
              whiteSpace: "nowrap",
            }}>
              {hoveredSysName}
            </div>
          </Html>
        </group>
      )}

      {/* Selected system highlight */}
      {selectedPos && (
        <group position={selectedPos}>
          <mesh>
            <ringGeometry args={[1.5, 2, 32]} />
            <meshBasicMaterial color="white" transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          {selectedSys && (
            <Html center distanceFactor={30} style={{ pointerEvents: "none" }}>
              <div style={{
                color: "white",
                fontSize: 11,
                fontFamily: "monospace",
                background: "rgba(0,0,0,0.7)",
                padding: "2px 6px",
                borderRadius: 3,
                whiteSpace: "nowrap",
              }}>
                {selectedSys.name}
              </div>
            </Html>
          )}
        </group>
      )}
    </>
  );
}

/** Render player travel routes as glowing lines — brighter = more traveled */
function TravelLines({
  routes,
  positions,
}: {
  routes: JumpRoute[];
  positions: Map<number, THREE.Vector3>;
}) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const colors: number[] = [];

    const maxCount = Math.max(1, ...routes.map((r) => r.count));

    for (const route of routes) {
      const from = positions.get(route.originSystem);
      const to = positions.get(route.destinationSystem);
      if (!from || !to) continue;

      points.push(from.x, from.y, from.z);
      points.push(to.x, to.y, to.z);

      // Intensity scales with travel frequency
      const t = Math.min(route.count / maxCount, 1);
      // Low travel = dim teal, high travel = bright gold
      const r1 = 0.1 + t * 0.9;
      const g1 = 0.6 + t * 0.3;
      const b1 = 0.8 - t * 0.6;
      colors.push(r1, g1, b1);
      colors.push(r1, g1, b1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [routes, positions]);

  if (routes.length === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Static gate network — renders all stargate connections as dim lines */
function GateNetwork({
  positions,
  onGatedSystems,
}: {
  positions: Map<number, THREE.Vector3>;
  onGatedSystems?: (ids: Set<number>) => void;
}) {
  const [connections, setConnections] = useState<Array<{ from: number; to: number }>>([]);

  useEffect(() => {
    import("./data/gate-connections.json").then((mod) => {
      const conns = mod.default as Array<{ from: number; to: number }>;
      setConnections(conns);
      if (onGatedSystems) {
        const ids = new Set<number>();
        for (const c of conns) { ids.add(c.from); ids.add(c.to); }
        onGatedSystems(ids);
      }
    });
  }, [onGatedSystems]);

  const geometry = useMemo(() => {
    if (connections.length === 0 || positions.size === 0) return null;

    const points: number[] = [];
    let count = 0;
    let missed = 0;

    for (const conn of connections) {
      const from = positions.get(conn.from);
      const to = positions.get(conn.to);
      if (!from || !to) { missed++; continue; }

      points.push(from.x, from.y, from.z);
      points.push(to.x, to.y, to.z);
      count++;
    }

    if (count === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [connections, positions]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={0x4488aa}
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Heatmap blob layer — must be inside R3F Canvas context */
function HeatmapLayer({
  killmails,
  positions,
  currentTime,
  windowDuration,
  showAll,
}: {
  killmails: KillmailData[];
  positions: Map<number, THREE.Vector3>;
  currentTime: number;
  windowDuration: number;
  showAll?: boolean;
}) {
  const blobs = useHeatmapData(killmails, positions, currentTime, windowDuration, showAll);
  return <HeatmapBlobs blobs={blobs} />;
}

// ── Route rendering helpers ─────────────────────────────────────────

/**
 * Build the full ordered list of 3D points along all route arcs.
 * Gates get a shallow arc, jumps get a big arc.
 * Also returns per-point base color so pulses inherit leg color.
 */
function buildRouteGeometry(route: RouteResult, positions: Map<number, THREE.Vector3>) {
  const allPoints: THREE.Vector3[] = [];
  const allColors: Array<[number, number, number]> = []; // base RGB per point

  for (const leg of route.legs) {
    const from = positions.get(leg.fromId);
    const to = positions.get(leg.toId);
    if (!from || !to) continue;

    const isGate = leg.type === "gate_npc" || leg.type === "gate_player";
    const dangerT = Math.min(1, leg.dangerScore / 100);

    let r, g, b;
    if (isGate) {
      r = 0.1 + dangerT * 0.9; g = 0.5 * (1 - dangerT); b = 1.0 - dangerT * 0.8;
    } else {
      r = 1.0; g = 0.5 * (1 - dangerT * 0.8); b = 0.1 * (1 - dangerT);
    }

    const mid = from.clone().add(to).multiplyScalar(0.5);
    const chord = to.clone().sub(from);
    const chordLen = chord.length();
    const arcFactor = isGate ? 0.08 : 0.30;
    const arcHeight = chordLen * arcFactor;
    const perp = new THREE.Vector3(-chord.z, 0, chord.x).normalize();
    const legIdx = route.legs.indexOf(leg);
    const sign = (legIdx % 2 === 0) ? 1 : -1;
    const ctrl = mid.clone()
      .add(perp.clone().multiplyScalar(arcHeight * sign))
      .add(new THREE.Vector3(0, arcHeight * 0.5, 0));

    const curve = new THREE.QuadraticBezierCurve3(from, ctrl, to);
    const pts = curve.getPoints(isGate ? 10 : 20);
    for (const p of pts) {
      allPoints.push(p);
      allColors.push([r, g, b]);
    }
  }

  return { allPoints, allColors };
}

/** Dim static base track for the route */
function RouteLine({
  route,
  positions,
}: {
  route: RouteResult;
  positions: Map<number, THREE.Vector3>;
}) {
  const geometry = useMemo(() => {
    const { allPoints, allColors } = buildRouteGeometry(route, positions);
    if (allPoints.length < 2) return null;

    const pts: number[] = [];
    const cols: number[] = [];
    for (let i = 0; i < allPoints.length - 1; i++) {
      const a = allPoints[i];
      const b = allPoints[i + 1];
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const [r, g, bc] = allColors[i];
      // Dim base track — pulse will provide the brightness
      cols.push(r * 0.25, g * 0.25, bc * 0.25);
      cols.push(r * 0.25, g * 0.25, bc * 0.25);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    return geo;
  }, [route, positions]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

/**
 * Animated pulse that chases along the route.
 * Three staggered pulses repeat continuously, each a bright comet
 * with a glowing head and a fading tail.
 */
function RoutePulse({
  route,
  positions,
}: {
  route: RouteResult;
  positions: Map<number, THREE.Vector3>;
}) {
  const NUM_PULSES = 3;
  const PULSE_SPEED = 60;   // canvas units per second
  const TAIL_LENGTH = 18;   // segments per tail

  const routeData = useMemo(() => buildRouteGeometry(route, positions), [route, positions]);
  const pulseOffsets = useRef(Array.from({ length: NUM_PULSES }, (_, i) => i / NUM_PULSES));
  const meshRef = useRef<THREE.LineSegments>(null);
  const maxSegs = NUM_PULSES * TAIL_LENGTH;

  // Stable geometry created once
  const geo = useRef((() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(maxSegs * 2 * 3);
    const col = new Float32Array(maxSegs * 2 * 3);
    const pa = new THREE.BufferAttribute(pos, 3);
    const ca = new THREE.BufferAttribute(col, 3);
    pa.setUsage(THREE.DynamicDrawUsage);
    ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", pa);
    g.setAttribute("color", ca);
    g.setDrawRange(0, 0);
    return g;
  })()).current;

  useFrame((_, delta) => {
    const { allPoints, allColors } = routeData;
    const totalPoints = allPoints.length;
    if (totalPoints < 2) return;

    const pa = geo.attributes.position as THREE.BufferAttribute;
    const ca = geo.attributes.color as THREE.BufferAttribute;
    const posArr = pa.array as Float32Array;
    const colArr = ca.array as Float32Array;

    // Advance each pulse — offset is 0..1 representing position along the route.
    // We add extra space (1 + TAIL_LENGTH/totalPoints) so the tail fully exits
    // before the pulse restarts, preventing the wrap-around jump.
    const loopLength = 1 + TAIL_LENGTH / totalPoints;
    const step = (PULSE_SPEED * delta) / totalPoints;
    for (let p = 0; p < NUM_PULSES; p++) {
      pulseOffsets.current[p] = (pulseOffsets.current[p] + step) % loopLength;
    }

    let vi = 0;
    for (let p = 0; p < NUM_PULSES; p++) {
      // Only draw when pulse head is within the actual route (0..1)
      const offset = pulseOffsets.current[p];
      const headIdx = Math.floor(Math.min(offset, 1) * (totalPoints - 1));

      for (let t = 0; t < TAIL_LENGTH; t++) {
        const idxA = headIdx - t;
        const idxB = headIdx - t - 1;
        // Skip segments outside the route — no wrap
        if (idxA < 0 || idxB < 0) break;
        const a = allPoints[idxA];
        const b = allPoints[idxB];

        posArr[vi * 6 + 0] = a.x; posArr[vi * 6 + 1] = a.y; posArr[vi * 6 + 2] = a.z;
        posArr[vi * 6 + 3] = b.x; posArr[vi * 6 + 4] = b.y; posArr[vi * 6 + 5] = b.z;

        const brightness = Math.pow(1 - t / TAIL_LENGTH, 2);
        const [r, g, bc] = allColors[idxA];
        const wr = Math.min(1, r + (t === 0 ? 0.6 : 0));
        const wg = Math.min(1, g + (t === 0 ? 0.6 : 0));
        const wb = Math.min(1, bc + (t === 0 ? 0.8 : 0));

        colArr[vi * 6 + 0] = wr * brightness; colArr[vi * 6 + 1] = wg * brightness; colArr[vi * 6 + 2] = wb * brightness;
        colArr[vi * 6 + 3] = wr * brightness * 0.5; colArr[vi * 6 + 4] = wg * brightness * 0.5; colArr[vi * 6 + 5] = wb * brightness * 0.5;
        vi++;
      }
    }

    pa.needsUpdate = true;
    ca.needsUpdate = true;
    geo.setDrawRange(0, vi * 2);
  });

  return (
    <lineSegments ref={meshRef} geometry={geo}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function CameraController({ onReady }: { onReady?: () => void }) {
  const { camera } = useThree();
  const readyFired = useRef(false);

  useEffect(() => {
    if (!readyFired.current) {
      readyFired.current = true;
      // Set initial camera position
      camera.position.set(0, 300, 700);
      camera.lookAt(0, 0, 0);
      onReady?.();
    }
  }, [camera, onReady]);

  return null;
}

export const StarmapCanvas = forwardRef<StarmapCanvasHandle, StarmapCanvasProps>(
  function StarmapCanvas({
    systems,
    coords: _coords,
    killHeat,
    jumpRoutes,
    selectedSystem,
    onSelectSystem,
    onHoverSystem,
    onReady,
    killmails,
    heatmapCurrentTime,
    heatmapWindowDuration,
    heatmapEnabled = true,
    heatmapShowAll = false,
    route,
  }, ref) {
    const positions = useMemo(() => normalizePositions(systems), [systems]);
    const [gatedSystems, setGatedSystems] = useState<Set<number>>(new Set());

    // Expose navigateTo — move camera to look at a specific system
    const cameraRef = useRef<THREE.Camera | null>(null);
    const controlsRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      navigateTo(nx: number, nz: number, _targetZoom: number) {
        // Find the system by ID directly from positions map
        // nx/nz are passed but for 3D we use the positions map
        if (controlsRef.current && cameraRef.current) {
          const x = (nx - 0.5) * 1000;
          const z = (nz - 0.5) * 1000;
          controlsRef.current.target.set(x, 0, z);
          cameraRef.current.position.set(x, 80, z + 150);
          controlsRef.current.update();
        }
      },
    }), []);

    if (systems.size === 0) return null;

    return (
      <div style={{ width: "100%", height: "100%", background: "#050510" }}>
        <Canvas
          camera={{ position: [0, 300, 700], fov: 60, near: 0.1, far: 20000 }}
          onCreated={({ camera }) => { cameraRef.current = camera; }}
          style={{ cursor: "grab" }}
        >
          <ambientLight intensity={0.3} />

          <CameraController onReady={onReady} />

          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.1}
            rotateSpeed={0.5}
            zoomSpeed={1.2}
            panSpeed={0.8}
            minDistance={5}
            maxDistance={2000}
          />

          <GateNetwork positions={positions} onGatedSystems={setGatedSystems} />

          {heatmapEnabled && killmails && killmails.length > 0 && (
            <HeatmapLayer
              killmails={killmails}
              positions={positions}
              currentTime={heatmapCurrentTime ?? Date.now()}
              windowDuration={heatmapWindowDuration ?? 24 * 3600_000}
              showAll={heatmapShowAll}
            />
          )}

          <StarField
            systems={systems}
            positions={positions}
            killHeat={killHeat}
            selectedSystem={selectedSystem}
            onSelectSystem={onSelectSystem}
            onHoverSystem={onHoverSystem}
            controlsRef={controlsRef}
            gatedSystems={gatedSystems}
          />

          <TravelLines routes={jumpRoutes} positions={positions} />

          {route && route.found && route.legs.length > 0 && (
            <>
              <RouteLine route={route} positions={positions} />
              <RoutePulse route={route} positions={positions} />
            </>
          )}
        </Canvas>
      </div>
    );
  },
);
