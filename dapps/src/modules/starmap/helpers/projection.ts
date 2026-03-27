/**
 * Coordinate projection helpers for the starmap.
 * Projects 3D solar system coordinates to 2D canvas space.
 * Uses x,z plane (y is vertical in EVE space, less useful for flat map).
 */

import type { SolarSystem } from "../../../core/world-api";

export interface NormalizedCoord {
  nx: number; // 0-1 normalized x
  nz: number; // 0-1 normalized z
}

export interface ScreenCoord {
  x: number;
  y: number;
}

export interface ViewBounds {
  minNx: number;
  maxNx: number;
  minNz: number;
  maxNz: number;
}

/**
 * Normalize all system coordinates to 0-1 range.
 * Uses isometric-style projection mixing all 3 axes to avoid overlap:
 *   screen_x = x + y * cos(30°)
 *   screen_y = z + y * sin(30°)
 * This spreads systems that share x,z but differ in y.
 */
export function normalizeCoordinates(
  systems: Map<number, SolarSystem>,
): Map<number, NormalizedCoord> {
  const cos30 = Math.cos(Math.PI / 6); // ~0.866
  const sin30 = Math.sin(Math.PI / 6); // ~0.5

  // First pass: compute projected coordinates
  const projected = new Map<number, { px: number; pz: number }>();
  let minPx = Infinity, maxPx = -Infinity;
  let minPz = Infinity, maxPz = -Infinity;

  for (const [id, sys] of systems) {
    const px = sys.location.x + sys.location.y * cos30;
    const pz = sys.location.z + sys.location.y * sin30;
    projected.set(id, { px, pz });

    if (px < minPx) minPx = px;
    if (px > maxPx) maxPx = px;
    if (pz < minPz) minPz = pz;
    if (pz > maxPz) maxPz = pz;
  }

  const rangePx = maxPx - minPx || 1;
  const rangePz = maxPz - minPz || 1;
  const result = new Map<number, NormalizedCoord>();

  for (const [id, { px, pz }] of projected) {
    result.set(id, {
      nx: (px - minPx) / rangePx,
      nz: (pz - minPz) / rangePz,
    });
  }

  return result;
}

/** Convert normalized coordinates to screen position */
export function worldToScreen(
  nx: number,
  nz: number,
  zoom: number,
  panX: number,
  panY: number,
  canvasW: number,
  canvasH: number,
): ScreenCoord {
  const padding = 40;
  const drawW = canvasW - padding * 2;
  const drawH = canvasH - padding * 2;

  // Center the map and apply zoom + pan
  const x = padding + nx * drawW * zoom + panX;
  const y = padding + nz * drawH * zoom + panY;
  return { x, y };
}

/** Convert screen position back to normalized coordinates */
export function screenToWorld(
  sx: number,
  sy: number,
  zoom: number,
  panX: number,
  panY: number,
  canvasW: number,
  canvasH: number,
): { nx: number; nz: number } {
  const padding = 40;
  const drawW = canvasW - padding * 2;
  const drawH = canvasH - padding * 2;

  const nx = (sx - padding - panX) / (drawW * zoom);
  const nz = (sy - padding - panY) / (drawH * zoom);
  return { nx, nz };
}

/** Get the visible bounds in normalized coordinates */
export function getVisibleBounds(
  zoom: number,
  panX: number,
  panY: number,
  canvasW: number,
  canvasH: number,
): ViewBounds {
  const topLeft = screenToWorld(0, 0, zoom, panX, panY, canvasW, canvasH);
  const bottomRight = screenToWorld(canvasW, canvasH, zoom, panX, panY, canvasW, canvasH);

  return {
    minNx: Math.min(topLeft.nx, bottomRight.nx) - 0.01,
    maxNx: Math.max(topLeft.nx, bottomRight.nx) + 0.01,
    minNz: Math.min(topLeft.nz, bottomRight.nz) - 0.01,
    maxNz: Math.max(topLeft.nz, bottomRight.nz) + 0.01,
  };
}

/** Check if a normalized coordinate is within view bounds */
export function isInView(nx: number, nz: number, bounds: ViewBounds): boolean {
  return nx >= bounds.minNx && nx <= bounds.maxNx &&
         nz >= bounds.minNz && nz <= bounds.maxNz;
}

/** Find the nearest system to a screen position */
export function findNearestSystem(
  sx: number,
  sy: number,
  coords: Map<number, NormalizedCoord>,
  zoom: number,
  panX: number,
  panY: number,
  canvasW: number,
  canvasH: number,
  maxDistance = 15,
): number | null {
  let nearest: number | null = null;
  let nearestDist = maxDistance;

  const bounds = getVisibleBounds(zoom, panX, panY, canvasW, canvasH);

  for (const [id, coord] of coords) {
    if (!isInView(coord.nx, coord.nz, bounds)) continue;

    const screen = worldToScreen(coord.nx, coord.nz, zoom, panX, panY, canvasW, canvasH);
    const dist = Math.hypot(screen.x - sx, screen.y - sy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = id;
    }
  }

  return nearest;
}

/** Generate a color from constellation ID for visual grouping */
export function constellationColor(constellationId: number, alpha = 1): string {
  // Use golden ratio hashing for good color distribution
  const hue = ((constellationId * 137.508) % 360);
  return `hsla(${hue}, 50%, 60%, ${alpha})`;
}
