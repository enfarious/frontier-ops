/**
 * React hooks for SQL-backed state.
 * Drop-in replacement for useLocalStorage with SQLite persistence.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { query, execute, subscribe } from "../database";

/**
 * Subscribe to database changes. Returns a monotonically increasing
 * version number that bumps on every write, triggering React re-renders.
 */
let version = 0;

function getVersion() {
  return version;
}

function subscribeToChanges(callback: () => void) {
  return subscribe(() => {
    version++;
    callback();
  });
}

/** Force components using useSQL hooks to re-render on any DB write. */
export function useDBVersion(): number {
  return useSyncExternalStore(subscribeToChanges, getVersion);
}

/**
 * Query rows from a table with optional WHERE clause.
 * Re-renders when the database changes.
 */
export function useSQLQuery<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
  deps: unknown[] = [],
): { data: T[]; isLoading: boolean; error: Error | null } {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const dbVersion = useDBVersion();

  useEffect(() => {
    let cancelled = false;

    query<T>(sql, params)
      .then((rows) => {
        if (!cancelled) {
          setData(rows);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql, dbVersion, ...deps]);

  return { data, isLoading, error };
}

/**
 * Execute a SQL mutation (INSERT/UPDATE/DELETE).
 * Returns a stable callback function.
 */
export function useSQLMutation() {
  return useCallback(
    async (sql: string, params: Record<string, unknown> = {}) => {
      await execute(sql, params);
    },
    [],
  );
}
