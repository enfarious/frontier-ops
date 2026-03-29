/**
 * CRUD hook for field reports (SQLite-backed).
 * Same pattern as useContacts.
 */

import { useCallback, useMemo } from "react";
import { useSQLQuery } from "../../../core/hooks/useSQL";
import { execute } from "../../../core/database";
import type { FieldReport, FieldReportType, ThreatLevel } from "../../../core/intel-types";

function rowToReport(row: any): FieldReport {
  return {
    id: row.id,
    type: row.type as FieldReportType,
    solarSystemId: row.solar_system_id ?? undefined,
    solarSystemName: row.solar_system_name ?? undefined,
    playerId: row.player_id ?? undefined,
    playerName: row.player_name ?? undefined,
    assemblyType: row.assembly_type ?? undefined,
    assemblyOwner: row.assembly_owner ?? undefined,
    title: row.title,
    notes: row.notes ?? "",
    threatLevel: (row.threat_level ?? "low") as ThreatLevel,
    reportedAt: row.reported_at,
    expiresAt: row.expires_at ?? undefined,
  };
}

export function useFieldReports() {
  const { data: rows } = useSQLQuery(
    "SELECT * FROM field_reports ORDER BY reported_at DESC",
  );

  const reports = useMemo(() => rows.map(rowToReport), [rows]);

  const addReport = useCallback(
    async (report: Omit<FieldReport, "id" | "reportedAt">) => {
      const id = `fr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO field_reports (id, type, solar_system_id, solar_system_name,
          player_id, player_name, assembly_type, assembly_owner,
          title, notes, threat_level, reported_at, expires_at, scope)
        VALUES ($id, $type, $ssid, $ssname, $pid, $pname, $atype, $aowner,
          $title, $notes, $threat, $reported_at, $expires_at, 'solo')`,
        {
          $id: id,
          $type: report.type,
          $ssid: report.solarSystemId ?? null,
          $ssname: report.solarSystemName ?? null,
          $pid: report.playerId ?? null,
          $pname: report.playerName ?? null,
          $atype: report.assemblyType ?? null,
          $aowner: report.assemblyOwner ?? null,
          $title: report.title,
          $notes: report.notes,
          $threat: report.threatLevel,
          $reported_at: Date.now(),
          $expires_at: report.expiresAt ?? null,
        },
      );
      return id;
    },
    [],
  );

  const updateReport = useCallback(
    async (id: string, updates: Partial<Omit<FieldReport, "id" | "reportedAt">>) => {
      const sets: string[] = [];
      const params: Record<string, unknown> = { $id: id };

      if (updates.type !== undefined) { sets.push("type = $type"); params.$type = updates.type; }
      if (updates.solarSystemId !== undefined) { sets.push("solar_system_id = $ssid"); params.$ssid = updates.solarSystemId; }
      if (updates.solarSystemName !== undefined) { sets.push("solar_system_name = $ssname"); params.$ssname = updates.solarSystemName; }
      if (updates.playerId !== undefined) { sets.push("player_id = $pid"); params.$pid = updates.playerId; }
      if (updates.playerName !== undefined) { sets.push("player_name = $pname"); params.$pname = updates.playerName; }
      if (updates.assemblyType !== undefined) { sets.push("assembly_type = $atype"); params.$atype = updates.assemblyType; }
      if (updates.assemblyOwner !== undefined) { sets.push("assembly_owner = $aowner"); params.$aowner = updates.assemblyOwner; }
      if (updates.title !== undefined) { sets.push("title = $title"); params.$title = updates.title; }
      if (updates.notes !== undefined) { sets.push("notes = $notes"); params.$notes = updates.notes; }
      if (updates.threatLevel !== undefined) { sets.push("threat_level = $threat"); params.$threat = updates.threatLevel; }
      if (updates.expiresAt !== undefined) { sets.push("expires_at = $expires"); params.$expires = updates.expiresAt; }

      if (sets.length === 0) return;
      await execute(`UPDATE field_reports SET ${sets.join(", ")} WHERE id = $id`, params);
    },
    [],
  );

  const removeReport = useCallback(
    async (id: string) => {
      await execute("DELETE FROM field_reports WHERE id = $id", { $id: id });
    },
    [],
  );

  return { reports, addReport, updateReport, removeReport };
}
