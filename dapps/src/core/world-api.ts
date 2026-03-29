/**
 * EVE Frontier World API client.
 * Base: https://world-api-stillness.live.tech.evefrontier.com
 * No auth required for public GET queries.
 *
 * Static reference data (solar systems, types, ships, constellations, tribes)
 * is cached in IndexedDB with a 24h TTL since it rarely changes.
 */

import { getFromCache, setCache, TTL } from "./cache";

const BASE = "https://world-api-stillness.live.tech.evefrontier.com";

// --- Paginated fetch helper ---

async function fetchAllPages<T>(path: string, limit = 500): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${BASE}${path}?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`World API ${path}: ${res.status}`);
    const json = await res.json();
    const items = json.data ?? [];
    all.push(...items);
    const total = json.metadata?.total ?? 0;
    offset += items.length;
    hasMore = items.length > 0 && offset < total;
  }

  return all;
}

// --- Solar Systems ---

export interface SolarSystem {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
  location: { x: number; y: number; z: number };
}

let solarSystemMap: Map<number, SolarSystem> | null = null;
let solarSystemPromise: Promise<Map<number, SolarSystem>> | null = null;

export async function getSolarSystemMap(): Promise<Map<number, SolarSystem>> {
  if (solarSystemMap) return solarSystemMap;
  if (solarSystemPromise) return solarSystemPromise;

  const cached = await getFromCache<SolarSystem[]>("solarsystems", TTL.REFERENCE);
  if (cached) {
    solarSystemMap = new Map(cached.map((s) => [s.id, s]));
    return solarSystemMap;
  }

  solarSystemPromise = (async () => {
    const systems = await fetchAllPages<SolarSystem>("/v2/solarsystems", 1000);
    await setCache("solarsystems", systems);
    solarSystemMap = new Map(systems.map((s) => [s.id, s]));
    solarSystemPromise = null;
    return solarSystemMap;
  })();

  return solarSystemPromise;
}

export async function resolveSolarSystemName(id: string): Promise<string> {
  const map = await getSolarSystemMap();
  const sys = map.get(Number(id));
  return sys?.name ?? id;
}

// --- Tribes ---

export interface Tribe {
  id: number;
  name: string;
  nameShort: string;
  description: string;
  taxRate: number;
}

let tribeMap: Map<number, Tribe> | null = null;
let tribePromise: Promise<Map<number, Tribe>> | null = null;

export async function getTribeMap(): Promise<Map<number, Tribe>> {
  if (tribeMap) return tribeMap;
  if (tribePromise) return tribePromise;

  const cached = await getFromCache<Tribe[]>("tribes", TTL.REFERENCE);
  if (cached) {
    tribeMap = new Map(cached.map((t) => [t.id, t]));
    return tribeMap;
  }

  tribePromise = (async () => {
    const tribes = await fetchAllPages<Tribe>("/v2/tribes", 500);
    await setCache("tribes", tribes);
    tribeMap = new Map(tribes.map((t) => [t.id, t]));
    tribePromise = null;
    return tribeMap;
  })();

  return tribePromise;
}

export async function resolveTribeName(id: number): Promise<string> {
  const map = await getTribeMap();
  const tribe = map.get(id);
  return tribe?.name ?? `Tribe ${id}`;
}

// --- Ships ---

export interface Ship {
  id: number;
  name: string;
  classId: number;
  className: string;
  description: string;
}

let shipMap: Map<number, Ship> | null = null;
let shipPromise: Promise<Map<number, Ship>> | null = null;

export async function getShipMap(): Promise<Map<number, Ship>> {
  if (shipMap) return shipMap;
  if (shipPromise) return shipPromise;

  const cached = await getFromCache<Ship[]>("ships", TTL.REFERENCE);
  if (cached) {
    shipMap = new Map(cached.map((s) => [s.id, s]));
    return shipMap;
  }

  shipPromise = (async () => {
    const ships = await fetchAllPages<Ship>("/v2/ships", 500);
    await setCache("ships", ships);
    shipMap = new Map(ships.map((s) => [s.id, s]));
    shipPromise = null;
    return shipMap;
  })();

  return shipPromise;
}

// --- Item Types ---

export interface ItemType {
  id: number;
  name: string;
  description: string;
  categoryName: string;
  groupName: string;
  volume: number;
  mass: number;
}

let typeMap: Map<number, ItemType> | null = null;
let typePromise: Promise<Map<number, ItemType>> | null = null;

export async function getItemTypeMap(): Promise<Map<number, ItemType>> {
  if (typeMap) return typeMap;
  if (typePromise) return typePromise;

  const cached = await getFromCache<ItemType[]>("types", TTL.REFERENCE);
  if (cached) {
    typeMap = new Map(cached.map((t) => [t.id, t]));
    return typeMap;
  }

  typePromise = (async () => {
    const types = await fetchAllPages<ItemType>("/v2/types", 500);
    await setCache("types", types);
    typeMap = new Map(types.map((t) => [t.id, t]));
    typePromise = null;
    return typeMap;
  })();

  return typePromise;
}

export async function resolveTypeName(typeId: number): Promise<string> {
  const map = await getItemTypeMap();
  const t = map.get(typeId);
  return t?.name ?? `Type ${typeId}`;
}

// --- Jump History (authenticated, per-character) ---

export interface JumpRecord {
  id: number;
  time: string;
  origin: { id: number; name: string };
  destination: { id: number; name: string };
  ship: { typeId: number; instanceId: number };
}

export async function getJumpHistory(token: string): Promise<JumpRecord[]> {
  const all: JumpRecord[] = [];
  let offset = 0;

  while (true) {
    const res = await fetch(`${BASE}/v2/characters/me/jumps?limit=500&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const json = await res.json();
    const items = json.data ?? [];
    all.push(...items);
    const total = json.metadata?.total ?? 0;
    offset += items.length;
    if (items.length === 0 || offset >= total) break;
  }

  return all;
}
