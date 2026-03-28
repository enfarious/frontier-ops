/**
 * CRUD hook for asset sightings (enemy infrastructure scouting log).
 */

import { useCallback, useMemo } from "react";
import { useSQLQuery } from "../../../core/hooks/useSQL";
import { execute } from "../../../core/database";
import type { ThreatLevel } from "../../../core/intel-types";
import type { AssetSighting, AssetType, AssetStatus } from "../../../core/tradecraft-types";

function rowToSighting(row: any): AssetSighting {
  return {
    id: row.id,
    solarSystemId: row.solar_system_id ?? undefined,
    solarSystemName: row.solar_system_name ?? undefined,
    planet: row.planet ?? undefined,
    lpoint: row.lpoint ?? undefined,
    assetType: row.asset_type as AssetType,
    ownerId: row.owner_id ?? undefined,
    ownerName: row.owner_name ?? undefined,
    ownerTribe: row.owner_tribe ?? undefined,
    notes: row.notes ?? "",
    threatLevel: (row.threat_level ?? "low") as ThreatLevel,
    status: (row.status ?? "active") as AssetStatus,
    firstSpottedAt: row.first_spotted_at,
    lastConfirmedAt: row.last_confirmed_at,
  };
}

export function useAssetSightings() {
  const { data: rows } = useSQLQuery(
    "SELECT * FROM asset_sightings ORDER BY last_confirmed_at DESC",
  );

  const sightings = useMemo(() => rows.map(rowToSighting), [rows]);

  const addSighting = useCallback(
    async (fields: {
      solarSystemName?: string;
      planet?: number;
      lpoint?: number;
      assetType: AssetType;
      ownerName?: string;
      ownerTribe?: string;
      notes?: string;
      threatLevel?: ThreatLevel;
      status?: AssetStatus;
    }) => {
      const id = `as-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      await execute(
        `INSERT INTO asset_sightings (id, solar_system_name, planet, lpoint, asset_type,
          owner_name, owner_tribe, notes, threat_level, status,
          first_spotted_at, last_confirmed_at, scope)
        VALUES ($id, $ssname, $planet, $lpoint, $atype, $oname, $otribe, $notes, $threat, $status,
          $spotted, $confirmed, 'solo')`,
        {
          $id: id,
          $ssname: fields.solarSystemName ?? null,
          $planet: fields.planet ?? null,
          $lpoint: fields.lpoint ?? null,
          $atype: fields.assetType,
          $oname: fields.ownerName ?? null,
          $otribe: fields.ownerTribe ?? null,
          $notes: fields.notes ?? "",
          $threat: fields.threatLevel ?? "low",
          $status: fields.status ?? "active",
          $spotted: now,
          $confirmed: now,
        },
      );
      return id;
    },
    [],
  );

  const confirmSighting = useCallback(
    async (id: string) => {
      await execute(
        "UPDATE asset_sightings SET last_confirmed_at = $now WHERE id = $id",
        { $id: id, $now: Date.now() },
      );
    },
    [],
  );

  const updateSighting = useCallback(
    async (id: string, updates: Partial<Omit<AssetSighting, "id" | "firstSpottedAt">>) => {
      const sets: string[] = [];
      const params: Record<string, unknown> = { $id: id };

      if (updates.solarSystemName !== undefined) { sets.push("solar_system_name = $ssname"); params.$ssname = updates.solarSystemName; }
      if (updates.planet !== undefined) { sets.push("planet = $planet"); params.$planet = updates.planet; }
      if (updates.lpoint !== undefined) { sets.push("lpoint = $lpoint"); params.$lpoint = updates.lpoint; }
      if (updates.assetType !== undefined) { sets.push("asset_type = $atype"); params.$atype = updates.assetType; }
      if (updates.ownerName !== undefined) { sets.push("owner_name = $oname"); params.$oname = updates.ownerName; }
      if (updates.ownerTribe !== undefined) { sets.push("owner_tribe = $otribe"); params.$otribe = updates.ownerTribe; }
      if (updates.notes !== undefined) { sets.push("notes = $notes"); params.$notes = updates.notes; }
      if (updates.threatLevel !== undefined) { sets.push("threat_level = $threat"); params.$threat = updates.threatLevel; }
      if (updates.status !== undefined) { sets.push("status = $status"); params.$status = updates.status; }
      if (updates.lastConfirmedAt !== undefined) { sets.push("last_confirmed_at = $confirmed"); params.$confirmed = updates.lastConfirmedAt; }

      if (sets.length === 0) return;
      await execute(`UPDATE asset_sightings SET ${sets.join(", ")} WHERE id = $id`, params);
    },
    [],
  );

  const removeSighting = useCallback(
    async (id: string) => {
      await execute("DELETE FROM asset_sightings WHERE id = $id", { $id: id });
    },
    [],
  );

  return { sightings, addSighting, confirmSighting, updateSighting, removeSighting };
}
