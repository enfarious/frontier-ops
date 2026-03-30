/**
 * Pure utility functions for computing heatmap blob data from killmails.
 * No React, no side effects.
 */

import * as THREE from "three";
import type { KillmailData } from "../../danger-alerts/danger-types";

export interface HeatmapBlobData {
  systemId: number;
  position: THREE.Vector3;
  violenceVolume: number;
  radius: number;
  mostRecentKill: number;
  color: THREE.Color;
  opacity: number;
}

const HOUR = 3600_000;

// ─── Loss Weight ─────────────────────────────────────────────────────

/** Weight a kill by what was destroyed. Structures >> ships. */
export function getLossWeight(lossType: string): number {
  const upper = lossType.toUpperCase();
  if (
    upper === "STRUCTURE" ||
    upper.includes("SSU") ||
    upper.includes("STORAGE") ||
    upper.includes("NODE") ||
    upper.includes("GATE") ||
    upper.includes("TURRET")
  ) {
    return 10;
  }
  // Battleship-class hints
  if (upper.includes("BATTLE") || upper.includes("CAPITAL")) return 5;
  // Default ship
  return 2;
}

// ─── Recency → Color ────────────────────────────────────────────────

/** Map age in ms to a color on the hot-to-cold gradient. */
export function recencyColor(ageMs: number): THREE.Color {
  if (ageMs < 1 * HOUR) {
    // White-hot → bright red
    const t = ageMs / HOUR;
    return new THREE.Color(1.0, 0.95 - t * 0.65, 0.9 - t * 0.85);
  }
  if (ageMs < 6 * HOUR) {
    // Bright red → orange
    const t = (ageMs - HOUR) / (5 * HOUR);
    return new THREE.Color(1.0, 0.3 + t * 0.2, 0.05 + t * 0.05);
  }
  if (ageMs < 24 * HOUR) {
    // Orange → warm amber
    const t = (ageMs - 6 * HOUR) / (18 * HOUR);
    return new THREE.Color(0.9 - t * 0.3, 0.5 - t * 0.15, 0.1 + t * 0.2);
  }
  if (ageMs < 72 * HOUR) {
    // Amber → cool blue
    const t = (ageMs - 24 * HOUR) / (48 * HOUR);
    return new THREE.Color(0.6 - t * 0.4, 0.35 - t * 0.15, 0.3 + t * 0.4);
  }
  // Very old — dim blue
  return new THREE.Color(0.15, 0.15, 0.4);
}

// ─── Recency → Opacity ──────────────────────────────────────────────

/** Map age in ms to opacity 0–1. */
export function recencyOpacity(ageMs: number): number {
  if (ageMs < 1 * HOUR) return 0.8;
  if (ageMs < 72 * HOUR) {
    // Linear decay from 0.8 → 0.05 over 71 hours
    const t = (ageMs - HOUR) / (71 * HOUR);
    return 0.8 - t * 0.75;
  }
  return 0;
}

// ─── Blob Computation ────────────────────────────────────────────────

/**
 * Compute heatmap blob data from killmails within a time window.
 *
 * showAll mode: renders every kill in the window at full brightness,
 * bypassing the age-based opacity/color decay that's only meaningful
 * during timeline playback.
 */
export function computeHeatmapBlobs(
  killmails: KillmailData[],
  positions: Map<number, THREE.Vector3>,
  currentTime: number,
  windowDuration: number,
  showAll = false,
): HeatmapBlobData[] {
  const windowStart = currentTime - Math.max(windowDuration, 60_000);

  const systemStats = new Map<number, { volume: number; mostRecent: number }>();

  for (const km of killmails) {
    if (km.killTimestamp < windowStart || km.killTimestamp > currentTime) continue;
    const sysId = Number(km.solarSystemId);
    if (!sysId || !positions.has(sysId)) continue;
    const weight = getLossWeight(km.lossType);
    const existing = systemStats.get(sysId);
    if (existing) {
      existing.volume += weight;
      if (km.killTimestamp > existing.mostRecent) existing.mostRecent = km.killTimestamp;
    } else {
      systemStats.set(sysId, { volume: weight, mostRecent: km.killTimestamp });
    }
  }

  const blobs: HeatmapBlobData[] = [];

  for (const [sysId, stats] of systemStats) {
    const pos = positions.get(sysId)!;
    const radius = Math.min(40, Math.max(2, 3 * Math.sqrt(stats.volume)));

    if (showAll) {
      // Full brightness — color by kill volume, not recency
      const intensity = Math.min(1, stats.volume / 20);
      blobs.push({
        systemId: sysId,
        position: pos,
        violenceVolume: stats.volume,
        radius,
        mostRecentKill: stats.mostRecent,
        color: new THREE.Color(
          0.4 + intensity * 0.6,   // red channel scales with volume
          0.1 + intensity * 0.1,
          0.05,
        ),
        opacity: 0.3 + intensity * 0.5, // 0.3 minimum so even single kills show
      });
    } else {
      const age = currentTime - stats.mostRecent;
      const opacity = recencyOpacity(age);
      if (opacity <= 0) continue;
      blobs.push({
        systemId: sysId,
        position: pos,
        violenceVolume: stats.volume,
        radius,
        mostRecentKill: stats.mostRecent,
        color: recencyColor(age),
        opacity,
      });
    }
  }

  return blobs;
}
