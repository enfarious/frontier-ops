/**
 * Pure killmail analysis engine.
 * All functions accept KillmailData[] and return aggregated intelligence.
 * No React, no side effects, no data fetching.
 */

import type { KillmailData } from "../modules/danger-alerts/danger-types";
import type {
  PlayerProfile,
  SystemThreat,
  TribeConflict,
  KnownAssociate,
  ThreatLevel,
  SystemTrend,
} from "./intel-types";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Threat Scoring ──────────────────────────────────────────────────

export function computeThreatScore(stats: {
  kills: number;
  deaths: number;
  structureKills: number;
  lastSeenTimestamp: number;
  uniqueSystems: number;
}): number {
  const { kills, deaths, structureKills, lastSeenTimestamp, uniqueSystems } = stats;

  // Kill volume: logarithmic, 0-30 pts
  const killPts = Math.min(30, Math.log2(kills + 1) * 6);

  // K/D ratio: 0-20 pts
  const kd = kills / Math.max(deaths, 1);
  const kdPts = Math.min(20, kd * 5);

  // Recency: linear decay over 30 days, 0-25 pts
  const daysSinceSeen = (Date.now() - lastSeenTimestamp) / DAY_MS;
  const recencyPts = 25 * Math.max(0, 1 - daysSinceSeen / 30);

  // Structure hunter: 0-15 pts
  const structurePts = Math.min(15, structureKills * 5);

  // Activity breadth: multi-system presence, 0-10 pts
  const breadthPts = Math.min(10, uniqueSystems * 2);

  return Math.round(killPts + kdPts + recencyPts + structurePts + breadthPts);
}

export function threatLevelFromScore(score: number): ThreatLevel {
  if (score >= 76) return "critical";
  if (score >= 51) return "high";
  if (score >= 26) return "medium";
  return "low";
}

// ─── Player Analysis ─────────────────────────────────────────────────

interface PlayerAccum {
  playerId: string;
  playerName: string;
  tribe?: string;
  address?: string;
  kills: number;
  deaths: number;
  structureKills: number;
  lastSeenTimestamp: number;
  lastSeenSystem?: string;
  systemCounts: Map<string, { name: string; count: number }>;
  tribeCounts: Map<string, { asAttacker: number; asVictim: number }>;
}

function buildPlayerAccumulators(killmails: KillmailData[]): Map<string, PlayerAccum> {
  const players = new Map<string, PlayerAccum>();

  function getOrCreate(id: string, name: string | undefined, tribe: string | undefined, address: string | undefined): PlayerAccum {
    let p = players.get(id);
    if (!p) {
      p = {
        playerId: id,
        playerName: name || `Pilot #${id}`,
        tribe,
        address,
        kills: 0,
        deaths: 0,
        structureKills: 0,
        lastSeenTimestamp: 0,
        systemCounts: new Map(),
        tribeCounts: new Map(),
      };
      players.set(id, p);
    }
    // Update name/tribe if we have better info
    if (name && p.playerName.startsWith("Pilot #")) p.playerName = name;
    if (tribe && !p.tribe) p.tribe = tribe;
    if (address && !p.address) p.address = address;
    return p;
  }

  for (const km of killmails) {
    // Attacker stats
    const attacker = getOrCreate(km.killerId, km.killerName, km.killerTribe, km.killerAddress);
    attacker.kills++;
    if (km.lossType === "STRUCTURE") attacker.structureKills++;

    if (km.killTimestamp > attacker.lastSeenTimestamp) {
      attacker.lastSeenTimestamp = km.killTimestamp;
      attacker.lastSeenSystem = km.solarSystemName;
    }

    const aSys = attacker.systemCounts.get(km.solarSystemId);
    if (aSys) aSys.count++;
    else attacker.systemCounts.set(km.solarSystemId, { name: km.solarSystemName || km.solarSystemId, count: 1 });

    if (km.victimTribe) {
      const tc = attacker.tribeCounts.get(km.victimTribe);
      if (tc) tc.asAttacker++;
      else attacker.tribeCounts.set(km.victimTribe, { asAttacker: 1, asVictim: 0 });
    }

    // Victim stats
    const victim = getOrCreate(km.victimId, km.victimName, km.victimTribe, km.victimAddress);
    victim.deaths++;

    if (km.killTimestamp > victim.lastSeenTimestamp) {
      victim.lastSeenTimestamp = km.killTimestamp;
      victim.lastSeenSystem = km.solarSystemName;
    }

    const vSys = victim.systemCounts.get(km.solarSystemId);
    if (vSys) vSys.count++;
    else victim.systemCounts.set(km.solarSystemId, { name: km.solarSystemName || km.solarSystemId, count: 1 });

    if (km.killerTribe) {
      const tc = victim.tribeCounts.get(km.killerTribe);
      if (tc) tc.asVictim++;
      else victim.tribeCounts.set(km.killerTribe, { asAttacker: 0, asVictim: 1 });
    }
  }

  return players;
}

function accumToProfile(p: PlayerAccum): PlayerProfile {
  const activeSystems = Array.from(p.systemCounts.entries())
    .map(([systemId, { name, count }]) => ({ systemId, systemName: name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const tribesEngaged = Array.from(p.tribeCounts.entries())
    .map(([tribe, stats]) => ({ tribe, ...stats }))
    .sort((a, b) => (b.asAttacker + b.asVictim) - (a.asAttacker + a.asVictim));

  const threatScore = computeThreatScore({
    kills: p.kills,
    deaths: p.deaths,
    structureKills: p.structureKills,
    lastSeenTimestamp: p.lastSeenTimestamp,
    uniqueSystems: p.systemCounts.size,
  });

  return {
    playerId: p.playerId,
    playerName: p.playerName,
    tribe: p.tribe,
    address: p.address,
    kills: p.kills,
    deaths: p.deaths,
    kdRatio: Math.round((p.kills / Math.max(p.deaths, 1)) * 100) / 100,
    activeSystems,
    tribesEngaged,
    lastSeenTimestamp: p.lastSeenTimestamp,
    lastSeenSystem: p.lastSeenSystem,
    threatScore,
    threatLevel: threatLevelFromScore(threatScore),
    structureKills: p.structureKills,
  };
}

/** Analyze all players in a single pass. */
export function analyzeAllPlayers(killmails: KillmailData[]): Map<string, PlayerProfile> {
  const accums = buildPlayerAccumulators(killmails);
  const profiles = new Map<string, PlayerProfile>();
  for (const [id, accum] of accums) {
    profiles.set(id, accumToProfile(accum));
  }
  return profiles;
}

/** Top N players ranked by threat score descending. */
export function rankPlayersByThreat(killmails: KillmailData[], limit = 10): PlayerProfile[] {
  const profiles = analyzeAllPlayers(killmails);
  return Array.from(profiles.values())
    .sort((a, b) => b.threatScore - a.threatScore)
    .slice(0, limit);
}

// ─── System Analysis ─────────────────────────────────────────────────

/** Analyze all systems in a single pass. */
export function analyzeAllSystems(killmails: KillmailData[]): Map<string, SystemThreat> {
  const systems = new Map<string, {
    systemId: string;
    systemName: string;
    kills: KillmailData[];
    attackers: Set<string>;
    victims: Set<string>;
    tribeCounts: Map<string, number>;
  }>();

  for (const km of killmails) {
    let sys = systems.get(km.solarSystemId);
    if (!sys) {
      sys = {
        systemId: km.solarSystemId,
        systemName: km.solarSystemName || km.solarSystemId,
        kills: [],
        attackers: new Set(),
        victims: new Set(),
        tribeCounts: new Map(),
      };
      systems.set(km.solarSystemId, sys);
    }
    sys.kills.push(km);
    sys.attackers.add(km.killerId);
    sys.victims.add(km.victimId);

    if (km.killerTribe) {
      sys.tribeCounts.set(km.killerTribe, (sys.tribeCounts.get(km.killerTribe) || 0) + 1);
    }
  }

  const now = Date.now();
  const result = new Map<string, SystemThreat>();

  for (const [id, sys] of systems) {
    const timestamps = sys.kills.map((k) => k.killTimestamp);
    const oldest = Math.min(...timestamps);
    const newest = Math.max(...timestamps);
    const spanDays = Math.max(1, (now - oldest) / DAY_MS);

    const recentCutoff = now - DAY_MS;
    const recentKills = sys.kills.filter((k) => k.killTimestamp > recentCutoff).length;
    const structureKills = sys.kills.filter((k) => k.lossType === "STRUCTURE").length;

    // Trend: compare last 7d vs prior 7d
    const week1Cutoff = now - 7 * DAY_MS;
    const week2Cutoff = now - 14 * DAY_MS;
    const lastWeek = sys.kills.filter((k) => k.killTimestamp > week1Cutoff).length;
    const priorWeek = sys.kills.filter((k) => k.killTimestamp > week2Cutoff && k.killTimestamp <= week1Cutoff).length;

    let trend: SystemTrend = "stable";
    if (priorWeek > 0 && lastWeek > priorWeek * 1.5) trend = "heating";
    else if (priorWeek > 0 && lastWeek < priorWeek * 0.5) trend = "cooling";
    else if (priorWeek === 0 && lastWeek > 0) trend = "heating";

    // Most active tribe
    let mostActiveTribe: string | undefined;
    let maxTribeKills = 0;
    for (const [tribe, count] of sys.tribeCounts) {
      if (count > maxTribeKills) {
        maxTribeKills = count;
        mostActiveTribe = tribe;
      }
    }

    result.set(id, {
      systemId: id,
      systemName: sys.systemName,
      totalKills: sys.kills.length,
      uniqueAttackers: sys.attackers.size,
      uniqueVictims: sys.victims.size,
      killsPerDay: Math.round((sys.kills.length / spanDays) * 100) / 100,
      mostActiveTribe,
      lastActivityTimestamp: newest,
      trend,
      recentKills,
      structureKills,
    });
  }

  return result;
}

/** Top N systems ranked by kills/day descending. */
export function rankSystemsByThreat(killmails: KillmailData[], limit = 10): SystemThreat[] {
  const systems = analyzeAllSystems(killmails);
  return Array.from(systems.values())
    .sort((a, b) => b.killsPerDay - a.killsPerDay)
    .slice(0, limit);
}

// ─── Tribe Conflict Analysis ─────────────────────────────────────────

/** Compute all tribe-vs-tribe conflict pairs. */
export function analyzeTribeConflicts(killmails: KillmailData[]): TribeConflict[] {
  // Key: sorted pair "tribeA|tribeB" so (A attacks B) and (B attacks A) merge
  const conflicts = new Map<string, {
    tribeA: string;
    tribeB: string;
    killsByA: number;
    killsByB: number;
    lastEngagement: number;
  }>();

  for (const km of killmails) {
    if (!km.killerTribe || !km.victimTribe || km.killerTribe === km.victimTribe) continue;

    const [first, second] = [km.killerTribe, km.victimTribe].sort();
    const key = `${first}|${second}`;

    let c = conflicts.get(key);
    if (!c) {
      c = { tribeA: first, tribeB: second, killsByA: 0, killsByB: 0, lastEngagement: 0 };
      conflicts.set(key, c);
    }

    if (km.killerTribe === first) c.killsByA++;
    else c.killsByB++;

    if (km.killTimestamp > c.lastEngagement) c.lastEngagement = km.killTimestamp;
  }

  return Array.from(conflicts.values())
    .map((c) => ({
      ...c,
      totalEngagements: c.killsByA + c.killsByB,
    }))
    .sort((a, b) => b.totalEngagements - a.totalEngagements);
}

// ─── Known Associates ────────────────────────────────────────────────

/**
 * Find players who killed the same victim within a time window.
 * In EVE Frontier, killmails are 1-attacker-per-record, so "same fleet"
 * means different attackers killing the same victim within the window.
 */
export function findKnownAssociates(
  playerId: string,
  killmails: KillmailData[],
  timeWindowMs = 5 * 60 * 1000,
): KnownAssociate[] {
  // Find all kills by this player
  const playerKills = killmails.filter((km) => km.killerId === playerId);
  if (playerKills.length === 0) return [];

  // For each of their kills, find other attackers who killed the same victim near the same time
  const associates = new Map<string, { name: string; tribe?: string; count: number; lastSeen: number }>();

  for (const pk of playerKills) {
    const nearby = killmails.filter(
      (km) =>
        km.killerId !== playerId &&
        km.victimId === pk.victimId &&
        Math.abs(km.killTimestamp - pk.killTimestamp) <= timeWindowMs,
    );

    for (const km of nearby) {
      const existing = associates.get(km.killerId);
      if (existing) {
        existing.count++;
        if (km.killTimestamp > existing.lastSeen) existing.lastSeen = km.killTimestamp;
      } else {
        associates.set(km.killerId, {
          name: km.killerName || `Pilot #${km.killerId}`,
          tribe: km.killerTribe,
          count: 1,
          lastSeen: km.killTimestamp,
        });
      }
    }
  }

  return Array.from(associates.entries())
    .map(([id, a]) => ({
      playerId: id,
      playerName: a.name,
      tribe: a.tribe,
      sharedKills: a.count,
      lastSeenTogether: a.lastSeen,
    }))
    .sort((a, b) => b.sharedKills - a.sharedKills);
}
