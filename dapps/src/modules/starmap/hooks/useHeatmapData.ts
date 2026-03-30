/**
 * React hook wrapping the pure heatmap blob computation.
 * Memoizes results — recomputes when killmails or time params change.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { KillmailData } from "../../danger-alerts/danger-types";
import { computeHeatmapBlobs, type HeatmapBlobData } from "../helpers/violence-score";

export function useHeatmapData(
  killmails: KillmailData[] | undefined,
  positions: Map<number, THREE.Vector3>,
  currentTime: number,
  windowDuration: number,
  showAll = false,
): HeatmapBlobData[] {
  return useMemo(
    () => computeHeatmapBlobs(killmails ?? [], positions, currentTime, windowDuration, showAll),
    [killmails, positions, currentTime, windowDuration, showAll],
  );
}
