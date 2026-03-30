/**
 * Pure utility functions for computing heatmap blob data from killmails.
 * No React, no side effects.
 *
 * Two-layer heat model:
 *
 *   FLARE  — based on the most recent kill in the system.
 *            White-hot for 30min, fully faded by 2h.
 *            Always visible regardless of duration setting —
 *            a fresh kill is always a flare even on a 1h window.
 *
 *   HEAT   — based on accumulated kill volume across the full
 *            duration window. Fades linearly over the window.
 *            Represents a system's ongoing danger reputation.
 *
 * Final blob color/opacity blends both layers, taking whichever
 * is brighter at each point.
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
const MIN  = 60_000;

// ─── Loss Weight ─────────────────────────────────────────────────────

export function getLossWeight(lossType: string): number {
  const upper = lossType.toUpperCase();
  if (
    upper === "STRUCTURE" ||
    upper.includes("SSU") ||
    upper.includes("STORAGE") ||
    upper.includes("NODE") ||
    upper.includes("GATE") ||
    upper.includes("TURRET")
  ) return 10;
  if (upper.includes("BATTLE") || upper.includes("CAPITAL")) return 5;
  return 2;
}

// ─── Flare layer (mostRecent age) ────────────────────────────────────

const FLARE_PEAK   = 30 * MIN;   // full brightness up to 30 min
const FLARE_FADEOUT = 2 * HOUR;  // completely gone by 2h

/** Flare opacity — spikes at kill time, fully fades in 2h */
function flareOpacity(ageMs: number): number {
  if (ageMs <= FLARE_PEAK) return 1.0;
  if (ageMs >= FLARE_FADEOUT) return 0;
  return 1.0 - (ageMs - FLARE_PEAK) / (FLARE_FADEOUT - FLARE_PEAK);
}

/** Flare color — white-hot → bright red → gone */
function flareColor(ageMs: number): THREE.Color {
  if (ageMs <= FLARE_PEAK) {
    // White-hot
    const t = ageMs / FLARE_PEAK;
    return new THREE.Color(1.0, 1.0 - t * 0.7, 1.0 - t * 0.9);
  }
  // Bright red fading out
  const t = (ageMs - FLARE_PEAK) / (FLARE_FADEOUT - FLARE_PEAK);
  return new THREE.Color(1.0, 0.3 * (1 - t), 0.05 * (1 - t));
}

// ─── Heat layer (volume over window) ─────────────────────────────────

/** Heat opacity — scales with kill volume, fades linearly over window */
function heatOpacity(volume: number, ageOfOldestKillMs: number, windowDuration: number): number {
  // Volume intensity: single kill (weight 2) = 0.1 base, scales up
  const volumeT = Math.min(1, volume / 30);
  const baseOpacity = 0.1 + volumeT * 0.6;

  // Fade: how far through the window is the system's activity?
  // Use oldest kill age as a proxy — recent activity = fresh heat
  const ageFraction = Math.min(1, ageOfOldestKillMs / windowDuration);
  const fadeFactor = 1 - ageFraction * 0.7; // never fully fades, min 30% of base

  return baseOpacity * fadeFactor;
}

/** Heat color — warm amber through orange-red, scales with volume */
function heatColor(volume: number): THREE.Color {
  const t = Math.min(1, volume / 30); // 0 = single kill, 1 = heavy system
  // Low volume: dim amber. High volume: bright orange-red.
  return new THREE.Color(
    0.6 + t * 0.4,   // R: 0.6 → 1.0
    0.25 - t * 0.15, // G: 0.25 → 0.1
    0.05,            // B: flat
  );
}

// ─── Blob Computation ────────────────────────────────────────────────

export function computeHeatmapBlobs(
  killmails: KillmailData[],
  positions: Map<number, THREE.Vector3>,
  currentTime: number,
  windowDuration: number,
  showAll = false,
): HeatmapBlobData[] {
  const windowStart = currentTime - Math.max(windowDuration, 60_000);

  // Per-system: accumulate volume + track most recent and oldest kill in window
  const systemStats = new Map<number, {
    volume: number;
    mostRecent: number;
    oldest: number;
  }>();

  for (const km of killmails) {
    if (km.killTimestamp < windowStart || km.killTimestamp > currentTime) continue;
    const sysId = Number(km.solarSystemId);
    if (!sysId || !positions.has(sysId)) continue;
    const weight = getLossWeight(km.lossType);
    const existing = systemStats.get(sysId);
    if (existing) {
      existing.volume += weight;
      if (km.killTimestamp > existing.mostRecent) existing.mostRecent = km.killTimestamp;
      if (km.killTimestamp < existing.oldest) existing.oldest = km.killTimestamp;
    } else {
      systemStats.set(sysId, {
        volume: weight,
        mostRecent: km.killTimestamp,
        oldest: km.killTimestamp,
      });
    }
  }

  const blobs: HeatmapBlobData[] = [];

  for (const [sysId, stats] of systemStats) {
    const pos = positions.get(sysId)!;
    const radius = Math.min(40, Math.max(3, 3 * Math.sqrt(stats.volume)));

    if (showAll) {
      // Static snapshot — color by volume, full brightness
      const intensity = Math.min(1, stats.volume / 20);
      blobs.push({
        systemId: sysId,
        position: pos,
        violenceVolume: stats.volume,
        radius,
        mostRecentKill: stats.mostRecent,
        color: new THREE.Color(0.4 + intensity * 0.6, 0.1 + intensity * 0.1, 0.05),
        opacity: 0.3 + intensity * 0.5,
      });
      continue;
    }

    // ── Two-layer blend ──────────────────────────────────────────────

    const recentAge = currentTime - stats.mostRecent;
    const oldestAge = currentTime - stats.oldest;

    // Flare signal (mostRecent kill)
    const fOpacity = flareOpacity(recentAge);
    const fColor   = flareColor(recentAge);

    // Heat signal (volume over window)
    const hOpacity = heatOpacity(stats.volume, oldestAge, windowDuration);
    const hColor   = heatColor(stats.volume);

    // Blend: additive for color (clamped), max for opacity
    // Flare dominates when fresh, heat persists afterward
    const blendOpacity = Math.min(1, Math.max(fOpacity, hOpacity));
    if (blendOpacity <= 0.02) continue;

    // Lerp color toward flare when flare is dominant
    const flareWeight = fOpacity / Math.max(0.001, fOpacity + hOpacity);
    const blendColor = new THREE.Color(
      Math.min(1, fColor.r * flareWeight + hColor.r * (1 - flareWeight)),
      Math.min(1, fColor.g * flareWeight + hColor.g * (1 - flareWeight)),
      Math.min(1, fColor.b * flareWeight + hColor.b * (1 - flareWeight)),
    );

    blobs.push({
      systemId: sysId,
      position: pos,
      violenceVolume: stats.volume,
      radius,
      mostRecentKill: stats.mostRecent,
      color: blendColor,
      opacity: blendOpacity,
    });
  }

  return blobs;
}
