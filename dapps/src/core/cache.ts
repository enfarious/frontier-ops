/**
 * Shared localStorage cache with configurable TTL.
 * Used across the app to reduce redundant API/GraphQL calls.
 */

const CACHE_PREFIX = "frontier-ops:cache:";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/** Read from localStorage cache. Returns null if expired or missing. */
export function getFromCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > ttlMs) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/** Write to localStorage cache. Silently fails on quota exceeded. */
export function setCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, fetchedAt: Date.now() } satisfies CacheEntry<T>),
    );
  } catch {
    // quota exceeded — ignore
  }
}

/** Remove a specific cache entry. */
export function clearCache(key: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Clear all frontier-ops cache entries. */
export function clearAllCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// Common TTLs
export const TTL = {
  /** 24 hours — static reference data (solar systems, item types, ships, tribes) */
  REFERENCE: 24 * 60 * 60 * 1000,
  /** 10 minutes — character map (names rarely change) */
  CHARACTERS: 10 * 60 * 1000,
  /** 5 minutes — assembly ownership data (solo) */
  ASSEMBLIES: 5 * 60 * 1000,
  /** 30 minutes — tribe assembly data (assemblies rarely change hands) */
  TRIBE_ASSEMBLIES: 30 * 60 * 1000,
  /** 2 minutes — killmails (semi-dynamic but slow-changing) */
  KILLMAILS: 2 * 60 * 1000,
} as const;
