/**
 * CRUD hook for intel packages + Dead Drop export.
 */

import { useCallback, useMemo } from "react";
import { useSQLQuery } from "../../../core/hooks/useSQL";
import { execute, query } from "../../../core/database";
import type {
  IntelPackage,
  PackageItem,
  PackageStatus,
  DeadDropPayload,
  AssetSighting,
  AssetType,
  AssetStatus,
  WatchTarget,
  WatchTargetType,
} from "../../../core/tradecraft-types";
import type { FieldReport, FieldReportType, ThreatLevel } from "../../../core/intel-types";

/** Import a Dead Drop JSON payload into local database. */
export async function importDeadDrop(payload: DeadDropPayload): Promise<{ sightings: number; reports: number; watchTargets: number }> {
  let sightings = 0;
  let reports = 0;
  let watchTargets = 0;

  // Import asset sightings
  for (const s of payload.contents.sightings) {
    const id = `as-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await execute(
      `INSERT OR IGNORE INTO asset_sightings (id, solar_system_id, solar_system_name, asset_type,
        owner_id, owner_name, owner_tribe, notes, threat_level, status,
        first_spotted_at, last_confirmed_at, scope)
      VALUES ($id, $ssid, $ssname, $atype, $oid, $oname, $otribe, $notes, $threat, $status,
        $spotted, $confirmed, 'solo')`,
      {
        $id: id,
        $ssid: s.solarSystemId ?? null,
        $ssname: s.solarSystemName ?? null,
        $atype: s.assetType,
        $oid: s.ownerId ?? null,
        $oname: s.ownerName ?? null,
        $otribe: s.ownerTribe ?? null,
        $notes: s.notes ?? "",
        $threat: s.threatLevel ?? "low",
        $status: s.status ?? "active",
        $spotted: s.firstSpottedAt ?? Date.now(),
        $confirmed: s.lastConfirmedAt ?? Date.now(),
      },
    );
    sightings++;
  }

  // Import field reports
  for (const r of payload.contents.fieldReports) {
    const id = `fr-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await execute(
      `INSERT OR IGNORE INTO field_reports (id, type, solar_system_id, solar_system_name,
        player_id, player_name, assembly_type, assembly_owner,
        title, notes, threat_level, reported_at, expires_at, scope)
      VALUES ($id, $type, $ssid, $ssname, $pid, $pname, $atype, $aowner,
        $title, $notes, $threat, $reported_at, $expires_at, 'solo')`,
      {
        $id: id,
        $type: r.type,
        $ssid: r.solarSystemId ?? null,
        $ssname: r.solarSystemName ?? null,
        $pid: r.playerId ?? null,
        $pname: r.playerName ?? null,
        $atype: r.assemblyType ?? null,
        $aowner: r.assemblyOwner ?? null,
        $title: r.title,
        $notes: r.notes ?? "",
        $threat: r.threatLevel ?? "low",
        $reported_at: r.reportedAt ?? Date.now(),
        $expires_at: r.expiresAt ?? null,
      },
    );
    reports++;
  }

  // Import watch targets
  for (const w of payload.contents.watchTargets ?? []) {
    const id = `wt-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await execute(
      `INSERT OR IGNORE INTO watch_targets (id, target_type, target_id, target_name, priority, notes, added_at, scope)
      VALUES ($id, $type, $tid, $tname, $priority, $notes, $added_at, 'solo')`,
      {
        $id: id,
        $type: w.targetType ?? "player",
        $tid: w.targetId ?? w.targetName,
        $tname: w.targetName,
        $priority: w.priority ?? "medium",
        $notes: w.notes ?? "",
        $added_at: w.addedAt ?? Date.now(),
      },
    );
    watchTargets++;
  }

  return { sightings, reports, watchTargets };
}

function rowToPackage(row: any): IntelPackage {
  let contents: PackageItem[] = [];
  try {
    contents = JSON.parse(row.contents ?? "[]");
  } catch { /* invalid JSON — empty */ }

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    contents,
    askingPrice: row.asking_price ?? "0",
    status: (row.status ?? "draft") as PackageStatus,
    createdAt: row.created_at,
    listedAt: row.listed_at ?? undefined,
    onChainId: row.on_chain_id ?? undefined,
  };
}

export function useIntelPackages() {
  const { data: rows } = useSQLQuery(
    "SELECT * FROM intel_packages ORDER BY created_at DESC",
  );

  const packages = useMemo(() => rows.map(rowToPackage), [rows]);

  const addPackage = useCallback(
    async (title: string, description = "", askingPrice = "0") => {
      const id = `ip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO intel_packages (id, title, description, contents, asking_price, status, created_at, scope)
        VALUES ($id, $title, $desc, '[]', $price, 'draft', $created, 'solo')`,
        {
          $id: id,
          $title: title,
          $desc: description,
          $price: askingPrice,
          $created: Date.now(),
        },
      );
      return id;
    },
    [],
  );

  const updatePackage = useCallback(
    async (id: string, updates: Partial<Omit<IntelPackage, "id" | "createdAt" | "contents">>) => {
      const sets: string[] = [];
      const params: Record<string, unknown> = { $id: id };

      if (updates.title !== undefined) { sets.push("title = $title"); params.$title = updates.title; }
      if (updates.description !== undefined) { sets.push("description = $desc"); params.$desc = updates.description; }
      if (updates.askingPrice !== undefined) { sets.push("asking_price = $price"); params.$price = updates.askingPrice; }
      if (updates.status !== undefined) {
        sets.push("status = $status");
        params.$status = updates.status;
        if (updates.status === "listed") {
          sets.push("listed_at = $listed");
          params.$listed = Date.now();
        }
      }

      if (sets.length === 0) return;
      await execute(`UPDATE intel_packages SET ${sets.join(", ")} WHERE id = $id`, params);
    },
    [],
  );

  const addItemToPackage = useCallback(
    async (packageId: string, item: PackageItem) => {
      const rows = await query<{ contents: string }>(
        "SELECT contents FROM intel_packages WHERE id = $id",
        { $id: packageId },
      );
      if (rows.length === 0) return;

      let contents: PackageItem[] = [];
      try { contents = JSON.parse(rows[0].contents ?? "[]"); } catch { /* empty */ }

      // Don't add duplicates
      if (contents.some((c) => c.type === item.type && c.id === item.id)) return;

      contents.push(item);
      await execute(
        "UPDATE intel_packages SET contents = $contents WHERE id = $id",
        { $id: packageId, $contents: JSON.stringify(contents) },
      );
    },
    [],
  );

  const removeItemFromPackage = useCallback(
    async (packageId: string, itemId: string) => {
      const rows = await query<{ contents: string }>(
        "SELECT contents FROM intel_packages WHERE id = $id",
        { $id: packageId },
      );
      if (rows.length === 0) return;

      let contents: PackageItem[] = [];
      try { contents = JSON.parse(rows[0].contents ?? "[]"); } catch { /* empty */ }

      contents = contents.filter((c) => c.id !== itemId);
      await execute(
        "UPDATE intel_packages SET contents = $contents WHERE id = $id",
        { $id: packageId, $contents: JSON.stringify(contents) },
      );
    },
    [],
  );

  const setOnChainId = useCallback(
    async (id: string, onChainId: string) => {
      await execute(
        "UPDATE intel_packages SET on_chain_id = $oid WHERE id = $id",
        { $id: id, $oid: onChainId },
      );
    },
    [],
  );

  const removePackage = useCallback(
    async (id: string) => {
      await execute("DELETE FROM intel_packages WHERE id = $id", { $id: id });
    },
    [],
  );

  const exportPackage = useCallback(
    async (packageId: string): Promise<DeadDropPayload | null> => {
      const pkgRows = await query<any>(
        "SELECT * FROM intel_packages WHERE id = $id",
        { $id: packageId },
      );
      if (pkgRows.length === 0) return null;

      const pkg = rowToPackage(pkgRows[0]);

      // Resolve all referenced items
      const sightingIds = pkg.contents.filter((c) => c.type === "sighting").map((c) => c.id);
      const reportIds = pkg.contents.filter((c) => c.type === "field_report").map((c) => c.id);

      const sightings: AssetSighting[] = [];
      for (const sid of sightingIds) {
        const sRows = await query<any>(
          "SELECT * FROM asset_sightings WHERE id = $id",
          { $id: sid },
        );
        if (sRows.length > 0) {
          const r = sRows[0];
          sightings.push({
            id: r.id,
            solarSystemId: r.solar_system_id ?? undefined,
            solarSystemName: r.solar_system_name ?? undefined,
            planet: r.planet ?? undefined,
            lpoint: r.lpoint ?? undefined,
            assetType: r.asset_type as AssetType,
            ownerId: r.owner_id ?? undefined,
            ownerName: r.owner_name ?? undefined,
            ownerTribe: r.owner_tribe ?? undefined,
            notes: r.notes ?? "",
            threatLevel: (r.threat_level ?? "low") as ThreatLevel,
            status: (r.status ?? "active") as AssetStatus,
            firstSpottedAt: r.first_spotted_at,
            lastConfirmedAt: r.last_confirmed_at,
          });
        }
      }

      const fieldReports: FieldReport[] = [];
      for (const rid of reportIds) {
        const rRows = await query<any>(
          "SELECT * FROM field_reports WHERE id = $id",
          { $id: rid },
        );
        if (rRows.length > 0) {
          const r = rRows[0];
          fieldReports.push({
            id: r.id,
            type: r.type as FieldReportType,
            solarSystemId: r.solar_system_id ?? undefined,
            solarSystemName: r.solar_system_name ?? undefined,
            playerId: r.player_id ?? undefined,
            playerName: r.player_name ?? undefined,
            assemblyType: r.assembly_type ?? undefined,
            assemblyOwner: r.assembly_owner ?? undefined,
            title: r.title,
            notes: r.notes ?? "",
            threatLevel: (r.threat_level ?? "low") as ThreatLevel,
            reportedAt: r.reported_at,
            expiresAt: r.expires_at ?? undefined,
          });
        }
      }

      const watchTargetIds = pkg.contents.filter((c) => c.type === "watch_target").map((c) => c.id);
      const watchTargets: WatchTarget[] = [];
      for (const wid of watchTargetIds) {
        const wRows = await query<any>(
          "SELECT * FROM watch_targets WHERE id = $id",
          { $id: wid },
        );
        if (wRows.length > 0) {
          const r = wRows[0];
          watchTargets.push({
            id: r.id,
            targetType: r.target_type as WatchTargetType,
            targetId: r.target_id,
            targetName: r.target_name,
            priority: (r.priority ?? "medium") as ThreatLevel,
            notes: r.notes ?? "",
            addedAt: r.added_at,
          });
        }
      }

      return {
        version: 1,
        packageId: pkg.id,
        title: pkg.title,
        description: pkg.description,
        askingPrice: pkg.askingPrice,
        exportedAt: new Date().toISOString(),
        contents: { sightings, fieldReports, watchTargets },
      };
    },
    [],
  );

  const copyDeadDrop = useCallback(async (payload: DeadDropPayload) => {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }, []);

  const downloadDeadDrop = useCallback((payload: DeadDropPayload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dead-drop-${payload.packageId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    packages,
    addPackage,
    updatePackage,
    setOnChainId,
    addItemToPackage,
    removeItemFromPackage,
    removePackage,
    exportPackage,
    copyDeadDrop,
    downloadDeadDrop,
  };
}
