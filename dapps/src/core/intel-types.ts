/**
 * Shared intel types — imported by core/intel-analyzer.ts and the intel module UI.
 * Lives in core/ so any module can use these without depending on the intel module.
 */

export type ThreatLevel = "low" | "medium" | "high" | "critical";
export type FieldReportType = "system_note" | "player_sighting" | "spotted_assembly";
export type SystemTrend = "heating" | "cooling" | "stable";

export interface PlayerProfile {
  playerId: string;
  playerName: string;
  tribe?: string;
  address?: string;
  kills: number;
  deaths: number;
  kdRatio: number;
  activeSystems: Array<{ systemId: string; systemName: string; count: number }>;
  tribesEngaged: Array<{ tribe: string; asAttacker: number; asVictim: number }>;
  lastSeenTimestamp: number;
  lastSeenSystem?: string;
  threatScore: number;
  threatLevel: ThreatLevel;
  structureKills: number;
}

export interface SystemThreat {
  systemId: string;
  systemName: string;
  totalKills: number;
  uniqueAttackers: number;
  uniqueVictims: number;
  killsPerDay: number;
  mostActiveTribe?: string;
  lastActivityTimestamp: number;
  trend: SystemTrend;
  recentKills: number; // kills in last 24h
  structureKills: number;
}

export interface TribeConflict {
  tribeA: string;
  tribeB: string;
  killsByA: number;
  killsByB: number;
  totalEngagements: number;
  lastEngagement: number;
}

export interface KnownAssociate {
  playerId: string;
  playerName: string;
  tribe?: string;
  sharedKills: number;
  lastSeenTogether: number;
}

export interface FieldReport {
  id: string;
  type: FieldReportType;
  solarSystemId?: string;
  solarSystemName?: string;
  playerId?: string;
  playerName?: string;
  assemblyType?: string;
  assemblyOwner?: string;
  title: string;
  notes: string;
  threatLevel: ThreatLevel;
  reportedAt: number;
  expiresAt?: number;
}
