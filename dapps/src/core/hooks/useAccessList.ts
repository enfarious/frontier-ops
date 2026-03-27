import { useCallback, useMemo } from "react";
import { useSQLQuery } from "./useSQL";
import { execute } from "../database";
import type { AccessEntry } from "../access-types";

export function useAccessList(assemblyId: string) {
  const { data: rows } = useSQLQuery(
    "SELECT id, type, label, added_at FROM access_entries WHERE list_key = $key ORDER BY added_at DESC",
    { $key: assemblyId },
    [assemblyId],
  );

  const entries = useMemo(
    () =>
      rows.map((r: any) => ({
        id: r.id as string,
        type: r.type as AccessEntry["type"],
        label: r.label as string | undefined,
        addedAt: r.added_at as number,
      })),
    [rows],
  );

  const addEntry = useCallback(
    async (entry: Omit<AccessEntry, "addedAt">) => {
      await execute(
        `INSERT OR IGNORE INTO access_entries (id, type, label, added_at, list_key)
        VALUES ($id, $type, $label, $added_at, $key)`,
        {
          $id: entry.id,
          $type: entry.type,
          $label: entry.label ?? null,
          $added_at: Date.now(),
          $key: assemblyId,
        },
      );
    },
    [assemblyId],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      await execute(
        "DELETE FROM access_entries WHERE id = $id AND list_key = $key",
        { $id: id, $key: assemblyId },
      );
    },
    [assemblyId],
  );

  return { entries, addEntry, removeEntry };
}
