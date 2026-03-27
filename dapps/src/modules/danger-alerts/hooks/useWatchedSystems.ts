import { useCallback, useMemo } from "react";
import { useSQLQuery } from "../../../core/hooks/useSQL";
import { execute } from "../../../core/database";

export function useWatchedSystems() {
  const { data: rows } = useSQLQuery(
    "SELECT system_id FROM watched_systems WHERE scope = 'solo'",
  );

  const systems = useMemo(() => rows.map((r: any) => r.system_id as string), [rows]);

  const addSystem = useCallback(
    async (systemId: string) => {
      const id = systemId.trim();
      if (!id) return;
      await execute(
        "INSERT OR IGNORE INTO watched_systems (system_id, scope) VALUES ($sid, 'solo')",
        { $sid: id },
      );
    },
    [],
  );

  const removeSystem = useCallback(
    async (systemId: string) => {
      await execute(
        "DELETE FROM watched_systems WHERE system_id = $sid AND scope = 'solo'",
        { $sid: systemId },
      );
    },
    [],
  );

  const isWatched = useCallback(
    (systemId: string) => systems.includes(systemId),
    [systems],
  );

  return { systems, addSystem, removeSystem, isWatched };
}
