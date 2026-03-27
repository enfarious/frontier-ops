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
    // Negate X to match EVE Frontier's coordinate handedness
    positions.set(id, new THREE.Vector3(
      -((sys.location.x - (minX + maxX) / 2) * scale),
      (sys.location.y - (minY + maxY) / 2) * scale,
      (sys.location.z - (minZ + maxZ) / 2) * scale,
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
}: {
  systems: Map<number, SolarSystem>;
  positions: Map<number, THREE.Vector3>;
  killHeat: Map<number, number>;
  selectedSystem: number | null;
  onSelectSystem: (id: number | null, pos?: { x: number; y: number }) => void;
  onHoverSystem: (id: number | null) => void;
  controlsRef: React.RefObject<any>;
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
      } else {
        // No kills ever — cool blue-white star
        color.setRGB(0.35, 0.4, 0.65);
        size = 1.2;
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
  }, [systems, positions, killHeat]);

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
  }, ref) {
    const positions = useMemo(() => normalizePositions(systems), [systems]);

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

          <StarField
            systems={systems}
            positions={positions}
            killHeat={killHeat}
            selectedSystem={selectedSystem}
            onSelectSystem={onSelectSystem}
            onHoverSystem={onHoverSystem}
            controlsRef={controlsRef}
          />

          <TravelLines routes={jumpRoutes} positions={positions} />
        </Canvas>
      </div>
    );
  },
);
