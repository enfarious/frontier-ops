/**
 * EVE Frontier Route Planner
 *
 * Freeform jump navigation — no fixed gate requirement.
 * Ships can jump to any system within range, but gates save fuel.
 *
 * Coordinate units: raw API values are in meters (~9.46e15 m per LY).
 * The player-facing jump range input is in light-years; we convert internally.
 *
 * Edge types:
 *   - gate_npc:    NPC static gates, near-zero fuel, safer
 *   - gate_player: player-deployed gates (reserved, not yet wired)
 *   - jump:        freeform jump to any system within jump range
 */

import type { SolarSystem } from "../../core/world-api";
import type { KillmailData } from "../danger-alerts/danger-types";

export type LegType = "gate_npc" | "gate_player" | "jump";

export interface RouteLeg {
  fromId: number;
  toId: number;
  fromName: string;
  toName: string;
  type: LegType;
  /** Distance in light-years */
  distanceLy: number;
  /** Estimated fuel in LY-equivalent units (gates ≈ 0) */
  fuelCost: number;
  /** Danger score of destination system 0–100 */
  dangerScore: number;
}

export interface RouteResult {
  legs: RouteLeg[];
  /** Total number of individual jumps/gate transits */
  totalJumps: number;
  gateJumps: number;
  freeJumps: number;
  /** Total estimated fuel in LY */
  totalFuelLy: number;
  totalDanger: number;
  found: boolean;
}

// --- Constants ---

/** Meters per light-year */
const METERS_PER_LY = 9.461e15;

/** Fixed fuel cost for a gate transit */
const GATE_FUEL_COST = 0.1;

/** Max freeform neighbors to consider per node (performance cap) */
const MAX_JUMP_NEIGHBORS = 100;

// --- Coordinate helpers ---

/** Raw 3D distance between two systems in meters */
function dist3m(a: SolarSystem, b: SolarSystem): number {
  const dx = a.location.x - b.location.x;
  const dy = a.location.y - b.location.y;
  const dz = a.location.z - b.location.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Distance in light-years between two systems */
function dist3ly(a: SolarSystem, b: SolarSystem): number {
  return dist3m(a, b) / METERS_PER_LY;
}

// --- Danger scoring ---

function dangerHoursWindow(sliderValue: number): number {
  if (sliderValue <= 0) return 0;
  if (sliderValue >= 1) return 9999;
  return 3 + sliderValue * sliderValue * 9996;
}

function systemDangerScore(
  systemId: number,
  killmails: KillmailData[],
  hoursWindow: number,
): number {
  if (hoursWindow <= 0 || killmails.length === 0) return 0;
  const cutoff = Date.now() - hoursWindow * 3600_000;
  const sysIdStr = String(systemId);
  let score = 0;
  for (const km of killmails) {
    if (km.solarSystemId !== sysIdStr) continue;
    if (km.killTimestamp < cutoff) continue;
    const ageFraction = (km.killTimestamp - cutoff) / (hoursWindow * 3600_000);
    score += 10 * ageFraction;
    if (km.lossType === "STRUCTURE") score += 5;
  }
  return Math.min(100, score);
}

// --- Gate graph ---

export interface GateGraph {
  npc: Map<number, Set<number>>;
}

let cachedGateGraph: GateGraph | null = null;

export async function loadGateGraph(): Promise<GateGraph> {
  if (cachedGateGraph) return cachedGateGraph;
  const mod = await import("./data/gate-connections.json");
  const connections = mod.default as Array<{ from: number; to: number }>;
  const npc = new Map<number, Set<number>>();
  for (const { from, to } of connections) {
    if (!npc.has(from)) npc.set(from, new Set());
    if (!npc.has(to)) npc.set(to, new Set());
    npc.get(from)!.add(to);
    npc.get(to)!.add(from);
  }
  cachedGateGraph = { npc };
  return cachedGateGraph;
}

// --- Jump neighbor lookup ---

function jumpNeighbors(
  systemId: number,
  systems: Map<number, SolarSystem>,
  jumpRangeLy: number,
): Array<{ id: number; distanceLy: number }> {
  const src = systems.get(systemId);
  if (!src) return [];

  const results: Array<{ id: number; distanceLy: number }> = [];

  for (const [id, sys] of systems) {
    if (id === systemId) continue;
    const dly = dist3ly(src, sys);
    if (dly <= jumpRangeLy) {
      results.push({ id, distanceLy: dly });
    }
  }

  results.sort((a, b) => a.distanceLy - b.distanceLy);
  return results.slice(0, MAX_JUMP_NEIGHBORS);
}

// --- A* ---

interface AStarNode {
  id: number;
  gCost: number;
  fCost: number;
  parent: number | null;
  legType: LegType;
  legDistanceLy: number;
  legFuel: number;
}

function heuristic(a: SolarSystem, b: SolarSystem): number {
  // Straight-line LY distance, slightly deflated so A* doesn't over-commit
  return dist3ly(a, b) * 0.5;
}

export async function planRoute(
  originId: number,
  destinationId: number,
  systems: Map<number, SolarSystem>,
  killmails: KillmailData[],
  jumpRangeLy: number,
  dangerSlider: number,
  useNpcGates: boolean,
  _usePlayerGates: boolean,
): Promise<RouteResult> {
  const empty = (found: boolean): RouteResult =>
    ({ legs: [], totalJumps: 0, gateJumps: 0, freeJumps: 0, totalFuelLy: 0, totalDanger: 0, found });

  if (originId === destinationId) return empty(true);

  const origin = systems.get(originId);
  const destination = systems.get(destinationId);
  if (!origin || !destination) return empty(false);

  const gateGraph = await loadGateGraph();
  const hoursWindow = dangerHoursWindow(dangerSlider);

  const dangerCache = new Map<number, number>();
  const getDanger = (id: number) => {
    if (!dangerCache.has(id)) dangerCache.set(id, systemDangerScore(id, killmails, hoursWindow));
    return dangerCache.get(id)!;
  };

  // Keep ALL visited nodes (open + settled) so we can reconstruct the path
  const allNodes = new Map<number, AStarNode>();
  const open = new Set<number>();       // IDs currently in the frontier
  const closed = new Set<number>();     // IDs fully settled

  const startNode: AStarNode = {
    id: originId,
    gCost: 0,
    fCost: heuristic(origin, destination),
    parent: null,
    legType: "jump",
    legDistanceLy: 0,
    legFuel: 0,
  };
  allNodes.set(originId, startNode);
  open.add(originId);

  const MAX_ITER = 12000;
  const CHUNK_SIZE = 200; // iterations per tick before yielding to the UI

  return new Promise<RouteResult>((resolve) => {
    let iterations = 0;

    function step() {
      let chunk = 0;

      while (open.size > 0 && iterations++ < MAX_ITER && chunk++ < CHUNK_SIZE) {
        // Pick lowest fCost from open set
        let currentId: number | null = null;
        let bestF = Infinity;
        for (const id of open) {
          const node = allNodes.get(id)!;
          if (node.fCost < bestF) { bestF = node.fCost; currentId = id; }
        }
        if (currentId === null) break;

        if (currentId === destinationId) {
          resolve(reconstructPath(destinationId, allNodes, systems, killmails, hoursWindow));
          return;
        }

        open.delete(currentId);
        closed.add(currentId);

        const current = allNodes.get(currentId)!;
        const currentSys = systems.get(currentId)!;

        const neighbors: Array<{ id: number; type: LegType; distanceLy: number; fuel: number }> = [];

        if (useNpcGates) {
          const gateSet = gateGraph.npc.get(currentId);
          if (gateSet) {
            for (const nId of gateSet) {
              const nSys = systems.get(nId);
              if (!nSys) continue;
              neighbors.push({
                id: nId,
                type: "gate_npc",
                distanceLy: dist3ly(currentSys, nSys),
                fuel: GATE_FUEL_COST,
              });
            }
          }
        }

        for (const { id: nId, distanceLy } of jumpNeighbors(currentId, systems, jumpRangeLy)) {
          neighbors.push({ id: nId, type: "jump", distanceLy, fuel: distanceLy });
        }

        for (const nb of neighbors) {
          if (closed.has(nb.id)) continue;
          const nbSys = systems.get(nb.id);
          if (!nbSys) continue;

          let moveCost = nb.fuel;
          if (dangerSlider > 0) {
            moveCost += dangerSlider * getDanger(nb.id) * 0.5;
          }

          const gCost = current.gCost + moveCost;
          const existing = allNodes.get(nb.id);

          if (!existing || gCost < existing.gCost) {
            allNodes.set(nb.id, {
              id: nb.id,
              gCost,
              fCost: gCost + heuristic(nbSys, destination!) * (1 - dangerSlider * 0.3),
              parent: currentId,
              legType: nb.type,
              legDistanceLy: nb.distanceLy,
              legFuel: nb.fuel,
            });
            open.add(nb.id);
          }
        }
      }

      // Check if exhausted
      if (open.size === 0 || iterations >= MAX_ITER) {
        resolve(empty(false));
        return;
      }

      // Yield to browser, then continue
      setTimeout(step, 0);
    }

    step();
  });
}

function reconstructPath(
  destinationId: number,
  allNodes: Map<number, AStarNode>,
  systems: Map<number, SolarSystem>,
  killmails: KillmailData[],
  hoursWindow: number,
): RouteResult {
  // Walk parent chain from destination back to origin
  const path: AStarNode[] = [];
  let cur: number | null = destinationId;

  while (cur !== null) {
    const node = allNodes.get(cur);
    if (!node) break;
    path.unshift(node);
    cur = node.parent;
  }

  if (path.length < 2) {
    return { legs: [], totalJumps: 0, gateJumps: 0, freeJumps: 0, totalFuelLy: 0, totalDanger: 0, found: false };
  }

  const legs: RouteLeg[] = [];
  let totalFuelLy = 0;
  let totalDanger = 0;
  let gateJumps = 0;
  let freeJumps = 0;

  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const fromSys = systems.get(from.id);
    const toSys = systems.get(to.id);
    const danger = systemDangerScore(to.id, killmails, hoursWindow);

    totalFuelLy += to.legFuel;
    totalDanger += danger;

    if (to.legType === "gate_npc" || to.legType === "gate_player") gateJumps++;
    else freeJumps++;

    legs.push({
      fromId: from.id,
      toId: to.id,
      fromName: fromSys?.name ?? `#${from.id}`,
      toName: toSys?.name ?? `#${to.id}`,
      type: to.legType,
      distanceLy: Math.round(to.legDistanceLy * 100) / 100,
      fuelCost: Math.round(to.legFuel * 100) / 100,
      dangerScore: danger,
    });
  }

  return {
    legs,
    totalJumps: legs.length,
    gateJumps,
    freeJumps,
    totalFuelLy: Math.round(totalFuelLy * 10) / 10,
    totalDanger,
    found: true,
  };
}
