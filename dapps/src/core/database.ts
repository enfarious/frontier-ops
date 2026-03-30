/**
 * SQLite database layer using sql.js (WASM).
 * Single portable .db file, persisted to IndexedDB.
 * All user data (bounties, jobs, contacts, settings) lives here.
 */

import initSqlJs, { type Database, type BindParams } from "sql.js";

const DB_NAME = "frontier-ops";
const IDB_KEY = "frontier-ops-db";
const IDB_STORE = "database";

let db: Database | null = null;
let dbReady: Promise<Database> | null = null;
let changeListeners: Array<() => void> = [];

// ─── Schema ──────────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS bounties (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    target_id TEXT NOT NULL,
    target_name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    reward_currency TEXT NOT NULL DEFAULT 'item',
    reward_item_name TEXT NOT NULL,
    reward_quantity INTEGER NOT NULL DEFAULT 1,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_by TEXT NOT NULL,
    created_by_name TEXT,
    claimed_by TEXT,
    claimed_by_name TEXT,
    killmail_id TEXT,
    matched_killmail_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    claimed_at INTEGER,
    scope TEXT NOT NULL DEFAULT 'solo'
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_by TEXT NOT NULL,
    created_by_name TEXT,
    assigned_to TEXT,
    assigned_to_name TEXT,
    reward_currency TEXT DEFAULT 'item',
    reward_item_name TEXT NOT NULL,
    reward_item_type_id INTEGER,
    reward_quantity INTEGER NOT NULL DEFAULT 1,
    payout_type TEXT NOT NULL DEFAULT 'confirmation',
    visibility TEXT NOT NULL DEFAULT 'solo',
    allowed_roles TEXT,
    deliverables TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    completed_at INTEGER,
    on_chain_id TEXT,
    scope TEXT NOT NULL DEFAULT 'solo'
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    standing TEXT NOT NULL DEFAULT 'neutral',
    notes TEXT DEFAULT '',
    added_at INTEGER NOT NULL,
    scope TEXT NOT NULL DEFAULT 'solo'
  );

  CREATE TABLE IF NOT EXISTS watched_systems (
    system_id TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'solo',
    PRIMARY KEY (system_id, scope)
  );

  CREATE TABLE IF NOT EXISTS access_entries (
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT,
    added_at INTEGER NOT NULL,
    list_key TEXT NOT NULL,
    PRIMARY KEY (id, list_key)
  );

  CREATE TABLE IF NOT EXISTS tribe_roles (
    tribe_id TEXT NOT NULL,
    roles TEXT NOT NULL DEFAULT '[]',
    assignments TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (tribe_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS field_reports (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    solar_system_id TEXT,
    solar_system_name TEXT,
    player_id TEXT,
    player_name TEXT,
    assembly_type TEXT,
    assembly_owner TEXT,
    title TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    threat_level TEXT DEFAULT 'low',
    reported_at INTEGER NOT NULL,
    expires_at INTEGER,
    scope TEXT NOT NULL DEFAULT 'solo'
  );

  CREATE TABLE IF NOT EXISTS watch_targets (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_name TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    notes TEXT NOT NULL DEFAULT '',
    added_at INTEGER NOT NULL,
    scope TEXT NOT NULL DEFAULT 'solo'
  );

  CREATE TABLE IF NOT EXISTS asset_sightings (
    id TEXT PRIMARY KEY,
    solar_system_id TEXT,
    solar_system_name TEXT,
    planet INTEGER,
    lpoint INTEGER,
    asset_type TEXT NOT NULL,
    owner_id TEXT,
    owner_name TEXT,
    owner_tribe TEXT,
    notes TEXT NOT NULL DEFAULT '',
    threat_level TEXT DEFAULT 'low',
    status TEXT NOT NULL DEFAULT 'active',
    first_spotted_at INTEGER NOT NULL,
    last_confirmed_at INTEGER NOT NULL,
    scope TEXT NOT NULL DEFAULT 'solo'
  );

  CREATE TABLE IF NOT EXISTS intel_packages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    contents TEXT NOT NULL DEFAULT '[]',
    asking_price TEXT NOT NULL DEFAULT '0',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    listed_at INTEGER,
    on_chain_id TEXT,
    scope TEXT NOT NULL DEFAULT 'solo'
  );

  CREATE TABLE IF NOT EXISTS intel_bounties (
    id TEXT PRIMARY KEY,
    on_chain_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category INTEGER NOT NULL DEFAULT 0,
    target_system TEXT,
    target_tribe TEXT,
    reward_sui TEXT NOT NULL DEFAULT '0',
    status TEXT NOT NULL DEFAULT 'open',
    role TEXT NOT NULL DEFAULT 'poster',
    encryption_key TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    scope TEXT NOT NULL DEFAULT 'solo'
  );
`;

// ─── IndexedDB persistence ──────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Database lifecycle ─────────────────────────────────────────────

async function initDatabase(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });

  // Try loading existing database from IndexedDB
  const saved = await loadFromIDB();
  const database = saved ? new SQL.Database(saved) : new SQL.Database();

  // Ensure schema exists (CREATE IF NOT EXISTS is safe to re-run)
  database.run(SCHEMA);

  // Migrations for existing databases
  try { database.run("ALTER TABLE jobs ADD COLUMN on_chain_id TEXT"); } catch { /* column already exists */ }
  try { database.run("ALTER TABLE jobs ADD COLUMN reward_item_type_id INTEGER"); } catch { /* column already exists */ }
  try { database.run("ALTER TABLE asset_sightings ADD COLUMN planet INTEGER"); } catch { /* column already exists */ }
  try { database.run("ALTER TABLE asset_sightings ADD COLUMN lpoint INTEGER"); } catch { /* column already exists */ }
  try { database.run("ALTER TABLE intel_packages ADD COLUMN on_chain_id TEXT"); } catch { /* column already exists */ }
  try { database.run("ALTER TABLE intel_packages ADD COLUMN encryption_key TEXT"); } catch { /* column already exists */ }

  return database;
}

/** Get the database instance. Initializes on first call. */
export function getDatabase(): Promise<Database> {
  if (db) return Promise.resolve(db);
  if (dbReady) return dbReady;

  dbReady = initDatabase().then((database) => {
    db = database;
    return database;
  });

  return dbReady;
}

/** Persist the current database state to IndexedDB. */
export async function saveDatabase(): Promise<void> {
  if (!db) return;
  const data = db.export();
  await saveToIDB(data);
}

/** Auto-save after mutations. Debounced to batch rapid changes. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDatabase().catch((err) =>
      console.error("[FrontierOps] DB save failed:", err),
    );
  }, 500);
}

// ─── Query helpers ──────────────────────────────────────────────────

/** Run a SELECT query and return rows as objects. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const database = await getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params as BindParams);

  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

/** Run an INSERT/UPDATE/DELETE and auto-save. */
export async function execute(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  const database = await getDatabase();
  database.run(sql, params as BindParams);
  scheduleSave();
  notifyListeners();
}

/** Run multiple statements in a transaction. */
export async function transaction(
  fn: (db: Database) => void,
): Promise<void> {
  const database = await getDatabase();
  database.run("BEGIN TRANSACTION");
  try {
    fn(database);
    database.run("COMMIT");
  } catch (err) {
    database.run("ROLLBACK");
    throw err;
  }
  scheduleSave();
  notifyListeners();
}

// ─── Change notification (for React re-renders) ─────────────────────

function notifyListeners() {
  for (const fn of changeListeners) fn();
}

export function subscribe(listener: () => void): () => void {
  changeListeners.push(listener);
  return () => {
    changeListeners = changeListeners.filter((l) => l !== listener);
  };
}

// ─── Import / Export ────────────────────────────────────────────────

/** Export the database as a downloadable .db file. */
export async function exportDatabase(): Promise<void> {
  const database = await getDatabase();
  const data = database.export();
  const blob = new Blob([data.buffer as ArrayBuffer], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `frontier-ops-${new Date().toISOString().slice(0, 10)}.db`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a .db file, replacing the current database. */
export async function importDatabase(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });

  // Validate it's a real SQLite database
  const testDb = new SQL.Database(data);
  testDb.close();

  // Replace current database
  if (db) db.close();
  db = new SQL.Database(data);
  db.run(SCHEMA); // ensure schema is up to date
  dbReady = Promise.resolve(db);

  await saveToIDB(data);
  notifyListeners();
}

// ─── Migration from localStorage ────────────────────────────────────

/** One-time migration of localStorage data into SQLite. */
export async function migrateFromLocalStorage(): Promise<void> {
  const database = await getDatabase();

  // Check if migration already happened
  const result = database.exec(
    "SELECT value FROM settings WHERE key = 'migrated_from_localstorage'",
  );
  if (result.length > 0 && result[0].values.length > 0) return;


  let migrated = 0;

  // Migrate bounties
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("frontier-ops:bounties")) continue;
    try {
      const bounties = JSON.parse(localStorage.getItem(key)!) as any[];
      const scope = key.includes(":bounties:") ? `tribe:${key.split(":bounties:")[1]}` : "solo";
      for (const b of bounties) {
        database.run(
          `INSERT OR IGNORE INTO bounties (id, title, description, target_id, target_name, status,
            reward_currency, reward_item_name, reward_quantity, visibility, created_by,
            created_by_name, claimed_by, claimed_by_name, killmail_id, matched_killmail_id,
            created_at, expires_at, claimed_at, scope)
          VALUES ($id, $title, $desc, $tid, $tname, $status, $rcurr, $ritem, $rqty, $vis,
            $cby, $cbyname, $clby, $clbyname, $kmid, $mkmid, $cat, $eat, $clat, $scope)`,
          {
            $id: b.id, $title: b.title, $desc: b.description ?? "", $tid: b.targetId,
            $tname: b.targetName ?? null, $status: b.status,
            $rcurr: b.reward?.currency ?? "item",
            $ritem: b.reward?.itemName ?? "", $rqty: b.reward?.quantity ?? 1,
            $vis: b.visibility ?? "public", $cby: b.createdBy,
            $cbyname: b.createdByName ?? null, $clby: b.claimedBy ?? null,
            $clbyname: b.claimedByName ?? null, $kmid: b.killmailId ?? null,
            $mkmid: b.matchedKillmailId ?? null, $cat: b.createdAt,
            $eat: b.expiresAt ?? null, $clat: b.claimedAt ?? null, $scope: scope,
          },
        );
        migrated++;
      }
    } catch {}
  }

  // Migrate jobs
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("frontier-ops:jobs")) continue;
    try {
      const jobs = JSON.parse(localStorage.getItem(key)!) as any[];
      const scope = key.includes(":jobs:") ? `tribe:${key.split(":jobs:")[1]}` : "solo";
      for (const j of jobs) {
        database.run(
          `INSERT OR IGNORE INTO jobs (id, title, description, status, created_by, created_by_name,
            assigned_to, assigned_to_name, reward_currency, reward_item_name, reward_quantity,
            payout_type, visibility, allowed_roles, deliverables, created_at, expires_at,
            completed_at, scope)
          VALUES ($id, $title, $desc, $status, $cby, $cbyname, $ato, $atoname, $rcurr, $ritem,
            $rqty, $ptype, $vis, $roles, $delivs, $cat, $eat, $coat, $scope)`,
          {
            $id: j.id, $title: j.title, $desc: j.description ?? "",
            $status: j.status, $cby: j.createdBy, $cbyname: j.createdByName ?? null,
            $ato: j.assignedTo ?? null, $atoname: j.assignedToName ?? null,
            $rcurr: j.reward?.currency ?? "item",
            $ritem: j.reward?.itemName ?? "", $rqty: j.reward?.quantity ?? 1,
            $ptype: j.payoutType ?? "confirmation", $vis: j.visibility ?? "solo",
            $roles: j.allowedRoles ? JSON.stringify(j.allowedRoles) : null,
            $delivs: j.deliverables ? JSON.stringify(j.deliverables) : null,
            $cat: j.createdAt, $eat: j.expiresAt ?? null,
            $coat: j.completedAt ?? null, $scope: scope,
          },
        );
        migrated++;
      }
    } catch {}
  }

  // Migrate contacts
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("frontier-ops:contacts")) continue;
    try {
      const contacts = JSON.parse(localStorage.getItem(key)!) as any[];
      const scope = key.includes(":contacts:") ? `tribe:${key.split(":contacts:")[1]}` : "solo";
      for (const c of contacts) {
        database.run(
          `INSERT OR IGNORE INTO contacts (id, name, standing, notes, added_at, scope)
          VALUES ($id, $name, $standing, $notes, $added_at, $scope)`,
          {
            $id: c.id, $name: c.name, $standing: c.standing ?? "neutral",
            $notes: c.notes ?? "", $added_at: c.addedAt ?? Date.now(), $scope: scope,
          },
        );
        migrated++;
      }
    } catch {}
  }

  // Migrate watched systems
  try {
    const ws = JSON.parse(localStorage.getItem("frontier-ops:watched-systems") ?? "[]") as string[];
    for (const sid of ws) {
      database.run(
        "INSERT OR IGNORE INTO watched_systems (system_id, scope) VALUES ($sid, 'solo')",
        { $sid: sid },
      );
      migrated++;
    }
  } catch {}

  // Migrate access lists
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("frontier-ops:access-list:")) continue;
    try {
      const listKey = key.replace("frontier-ops:access-list:", "");
      const entries = JSON.parse(localStorage.getItem(key)!) as any[];
      for (const e of entries) {
        database.run(
          `INSERT OR IGNORE INTO access_entries (id, type, label, added_at, list_key)
          VALUES ($id, $type, $label, $added_at, $key)`,
          {
            $id: e.id, $type: e.type, $label: e.label ?? null,
            $added_at: e.addedAt ?? Date.now(), $key: listKey,
          },
        );
        migrated++;
      }
    } catch {}
  }

  // Migrate tribe roles
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("frontier-ops:tribe-roles:")) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key)!) as any;
      if (!data.tribeId || data.tribeId === "none") continue;
      database.run(
        `INSERT OR IGNORE INTO tribe_roles (tribe_id, roles, assignments)
        VALUES ($tid, $roles, $assignments)`,
        {
          $tid: data.tribeId,
          $roles: JSON.stringify(data.roles ?? []),
          $assignments: JSON.stringify(data.assignments ?? []),
        },
      );
      migrated++;
    } catch {}
  }

  // Mark migration complete
  database.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated_from_localstorage', $v)",
    { $v: String(Date.now()) },
  );

  await saveDatabase();
}
