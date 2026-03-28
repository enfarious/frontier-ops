/**
 * CRUD hook for watch targets + killmail activity enrichment.
 */

import { useCallback, useMemo } from "react";
import { useSQLQuery } from "../../../core/hooks/useSQL";
import { execute } from "../../../core/database";
import type { ThreatLevel } from "../../../core/intel-types";
import type { WatchTarget, WatchTargetType } from "../../../core/tradecraft-types";
import type { KillmailData } from "../../danger-alerts/danger-types";

function rowToTarget(row: any): WatchTarget {
  return {
    id: row.id,
    targetType: row.target_type as WatchTargetType,
    targetId: row.target_id,
    targetName: row.target_name,
    priority: (row.priority ?? "medium") as ThreatLevel,
    notes: row.notes ?? "",
    addedAt: row.added_at,
  };
}

export function useWatchTargets() {
  const { data: rows } = useSQLQuery(
    "SELECT * FROM watch_targets ORDER BY added_at DESC",
  );

  const targets = useMemo(() => rows.map(rowToTarget), [rows]);

  const addTarget = useCallback(
    async (
      targetType: WatchTargetType,
      targetId: string,
      targetName: string,
      priority: ThreatLevel = "medium",
    ) => {
      const id = `wt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO watch_targets (id, target_type, target_id, target_name, priority, notes, added_at, scope)
        VALUES ($id, $type, $tid, $tname, $priority, '', $added_at, 'solo')`,
        {
          $id: id,
          $type: targetType,
          $tid: targetId,
          $tname: targetName,
          $priority: priority,
          $added_at: Date.now(),
        },
      );
      return id;
    },
    [],
  );

  const updateTarget = useCallback(
    async (id: string, updates: Partial<Omit<WatchTarget, "id" | "addedAt">>) => {
      const sets: string[] = [];
      const params: Record<string, unknown> = { $id: id };

      if (updates.targetType !== undefined) { sets.push("target_type = $type"); params.$type = updates.targetType; }
      if (updates.targetId !== undefined) { sets.push("target_id = $tid"); params.$tid = updates.targetId; }
      if (updates.targetName !== undefined) { sets.push("target_name = $tname"); params.$tname = updates.targetName; }
      if (updates.priority !== undefined) { sets.push("priority = $priority"); params.$priority = updates.priority; }
      if (updates.notes !== undefined) { sets.push("notes = $notes"); params.$notes = updates.notes; }

      if (sets.length === 0) return;
      await execute(`UPDATE watch_targets SET ${sets.join(", ")} WHERE id = $id`, params);
    },
    [],
  );

  const removeTarget = useCallback(
    async (id: string) => {
      await execute("DELETE FROM watch_targets WHERE id = $id", { $id: id });
    },
    [],
  );

  return { targets, addTarget, updateTarget, removeTarget };
}

/**
 * Enrich watch targets with recent killmail activity.
 * Returns a map of targetId → matching killmails (last 24h).
 */
export function useWatchActivity(
  targets: WatchTarget[],
  killmails: KillmailData[] | undefined,
): Map<string, KillmailData[]> {
  return useMemo(() => {
    const map = new Map<string, KillmailData[]>();
    if (!killmails?.length || !targets.length) return map;

    const cutoff = Date.now() - 24 * 3600_000;

    for (const target of targets) {
      const matches = killmails.filter((km) => {
        if (km.killTimestamp < cutoff) return false;
        if (target.targetType === "player") {
          return km.killerId === target.targetId || km.victimId === target.targetId;
        }
        // tribe match
        return km.killerTribe === target.targetName || km.victimTribe === target.targetName;
      });
      if (matches.length > 0) {
        map.set(target.id, matches);
      }
    }
    return map;
  }, [targets, killmails]);
}
