/**
 * Frontier Ops local database — IndexedDB wrapper.
 * Zero setup, async, handles all persistent data.
 *
 * Stores:
 * - cache: TTL-based cache for API/GraphQL responses (solar systems, assemblies, killmails, etc.)
 * - settings: User preferences (LLM config, home system, module order, etc.)
 * - contacts: Player contacts with standings
 * - roles: Custom role definitions
 * - jobs: Jobs board entries
 * - bounties: Bounty board entries
 * - chat: Mission Control conversation history
 */

const DB_NAME = "frontier-ops";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // TTL cache store — key/value with timestamps
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }

      // User settings — simple key/value
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      // Contacts
      if (!db.objectStoreNames.contains("contacts")) {
        db.createObjectStore("contacts", { keyPath: "id", autoIncrement: true });
      }

      // Roles
      if (!db.objectStoreNames.contains("roles")) {
        db.createObjectStore("roles", { keyPath: "id", autoIncrement: true });
      }

      // Jobs
      if (!db.objectStoreNames.contains("jobs")) {
        db.createObjectStore("jobs", { keyPath: "id" });
      }

      // Bounties
      if (!db.objectStoreNames.contains("bounties")) {
        db.createObjectStore("bounties", { keyPath: "id" });
      }

      // Chat messages
      if (!db.objectStoreNames.contains("chat")) {
        db.createObjectStore("chat", { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

// === CACHE (TTL-based) ===

interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  fetchedAt: number;
}

export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readonly");
      const store = tx.objectStore("cache");
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry) return resolve(null);
        if (Date.now() - entry.fetchedAt > ttlMs) {
          // Expired — clean up async
          cacheDelete(key).catch(() => {});
          return resolve(null);
        }
        resolve(entry.data);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readwrite");
      const store = tx.objectStore("cache");
      store.put({ key, data, fetchedAt: Date.now() } satisfies CacheEntry<T>);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function cacheClearAll(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// === SETTINGS (key/value) ===

export async function settingsGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("settings", "readonly");
      const req = tx.objectStore("settings").get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function settingsSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// === GENERIC STORE (for contacts, roles, jobs, bounties) ===

export async function storeGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function storePut<T>(storeName: string, item: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function storeDelete(storeName: string, key: IDBValidKey): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function storeClear(storeName: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// === CHAT (Mission Control) ===

export async function chatGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("chat", "readonly");
      const req = tx.objectStore("chat").get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function chatSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("chat", "readwrite");
      tx.objectStore("chat").put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function chatClear(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("chat", "readwrite");
      tx.objectStore("chat").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// === TTL CONSTANTS ===

export const TTL = {
  /** 24 hours — static reference data (solar systems, item types, ships, tribes) */
  REFERENCE: 24 * 60 * 60 * 1000,
  /** 10 minutes — character name map */
  CHARACTERS: 10 * 60 * 1000,
  /** 5 minutes — assembly/network node ownership data */
  ASSEMBLIES: 5 * 60 * 1000,
  /** 2 minutes — killmails, embedded assembly status */
  KILLMAILS: 2 * 60 * 1000,
  /** 1 hour — gate connections (rarely change) */
  GATES: 60 * 60 * 1000,
} as const;

// === MIGRATION: localStorage → IndexedDB ===

/**
 * One-time migration of existing localStorage data into IndexedDB.
 * Call this once on app startup. Safe to call multiple times.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  const migrated = await settingsGet<boolean>("migrated-from-localstorage");
  if (migrated) return;



  // Migrate cache entries
  const cachePrefix = "frontier-ops:cache:";
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (key.startsWith(cachePrefix)) {
      try {
        const raw = JSON.parse(localStorage.getItem(key)!);
        const cacheKey = key.slice(cachePrefix.length);
        await cacheSet(cacheKey, raw.data);
        keysToRemove.push(key);
      } catch {}
    }
  }

  // Migrate specific keys
  const directMigrations: Array<{ lsKey: string; store: string; dbKey: string }> = [
    { lsKey: "frontier-ops-contacts", store: "settings", dbKey: "contacts-list" },
    { lsKey: "frontier-ops-roles", store: "settings", dbKey: "roles-list" },
    { lsKey: "frontier-ops-llm-config", store: "settings", dbKey: "llm-config" },
    { lsKey: "frontier-ops-home-system", store: "settings", dbKey: "home-system" },
    { lsKey: "frontier-ops-module-order", store: "settings", dbKey: "module-order" },
    { lsKey: "frontier-ops-mission-control-messages", store: "chat", dbKey: "messages" },
    { lsKey: "frontier-ops-mission-control-chat", store: "chat", dbKey: "history" },
  ];

  for (const { lsKey, store, dbKey } of directMigrations) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (store === "settings") {
          await settingsSet(dbKey, data);
        } else if (store === "chat") {
          await chatSet(dbKey, data);
        }
        keysToRemove.push(lsKey);
      }
    } catch {}
  }

  // Mark as migrated
  await settingsSet("migrated-from-localstorage", true);

  // Clean up localStorage (leave module-enabled flags since those are tiny)
  for (const key of keysToRemove) {
    try { localStorage.removeItem(key); } catch {}
  }

}
