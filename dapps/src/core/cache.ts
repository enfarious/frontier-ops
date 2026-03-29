/**
 * Shared IndexedDB cache with configurable TTL.
 * Uses idb-keyval for async key-value storage — no 5-10MB localStorage cap.
 * Used across the app to reduce redundant API/GraphQL calls.
 */

import { createStore, get, set, del, clear } from "idb-keyval";

const CACHE_PREFIX = "frontier-ops:cache:";
const cacheStore = createStore("frontier-ops-cache", "cache-entries");

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// One-time cleanup: remove old localStorage cache entries from before the IndexedDB migration
try {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
} catch {
  // ignore
}

/** Read from IndexedDB cache. Returns null if expired or missing. */
export async function getFromCache<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const entry = await get<CacheEntry<T>>(CACHE_PREFIX + key, cacheStore);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > ttlMs) {
      del(CACHE_PREFIX + key, cacheStore).catch(() => {});
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** Write to IndexedDB cache. Silently fails on errors. */
export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    await set(CACHE_PREFIX + key, { data, fetchedAt: Date.now() } satisfies CacheEntry<T>, cacheStore);
  } catch {
    // storage error — ignore
  }
}

/** Remove a specific cache entry. */
export async function clearCache(key: string): Promise<void> {
  try {
    await del(CACHE_PREFIX + key, cacheStore);
  } catch {
    // ignore
  }
}

/** Clear all frontier-ops cache entries. */
export async function clearAllCache(): Promise<void> {
  try {
    await clear(cacheStore);
  } catch {
    // ignore
  }
}

// Common TTLs
export const TTL = {
  /** 24 hours — static reference data (solar systems, item types, ships, tribes) */
  REFERENCE: 24 * 60 * 60 * 1000,
  /** 30 minutes — character map (names rarely change) */
  CHARACTERS: 30 * 60 * 1000,
  /** 5 minutes — assembly ownership data (solo) */
  ASSEMBLIES: 5 * 60 * 1000,
  /** 30 minutes — tribe assembly data (assemblies rarely change hands) */
  TRIBE_ASSEMBLIES: 30 * 60 * 1000,
  /** 1 hour — killmails (immutable historical records) */
  KILLMAILS: 60 * 60 * 1000,
} as const;
