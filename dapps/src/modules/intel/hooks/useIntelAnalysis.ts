/**
 * Memoized intel analysis over cached killmail data.
 * Wraps the pure analyzer functions with React state.
 */

import { useMemo } from "react";
import {
  analyzeAllPlayers,
  analyzeAllSystems,
  analyzeTribeConflicts,
  rankPlayersByThreat,
  rankSystemsByThreat,
  findKnownAssociates,
} from "../../../core/intel-analyzer";
import type {
  PlayerProfile,
  SystemThreat,
} from "../../../core/intel-types";
import type { KillmailData } from "../../danger-alerts/danger-types";

export function useIntelAnalysis(killmails: KillmailData[] | undefined) {
  const kms = killmails ?? [];

  const playerMap = useMemo(() => analyzeAllPlayers(kms), [kms]);
  const systemMap = useMemo(() => analyzeAllSystems(kms), [kms]);
  const tribeConflicts = useMemo(() => analyzeTribeConflicts(kms), [kms]);
  const topThreats = useMemo(() => rankPlayersByThreat(kms, 10), [kms]);
  const hotSystems = useMemo(() => rankSystemsByThreat(kms, 10), [kms]);

  const getPlayerProfile = useMemo(
    () => (id: string): PlayerProfile | undefined => playerMap.get(id),
    [playerMap],
  );

  const getSystemThreat = useMemo(
    () => (id: string): SystemThreat | undefined => systemMap.get(id),
    [systemMap],
  );

  const getKnownAssociates = useMemo(
    () => (playerId: string) => findKnownAssociates(playerId, kms),
    [kms],
  );

  return {
    playerMap,
    systemMap,
    tribeConflicts,
    topThreats,
    hotSystems,
    getPlayerProfile,
    getSystemThreat,
    getKnownAssociates,
    totalKillmails: kms.length,
  };
}

export type IntelAnalysis = ReturnType<typeof useIntelAnalysis>;
