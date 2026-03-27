import { useEffect, useState } from "react";
import { getJumpHistory, type JumpRecord } from "../../../core/world-api";

/** Unique route between two systems with a travel count */
export interface JumpRoute {
  originSystem: number;
  destinationSystem: number;
  count: number;
  lastJump: number; // timestamp ms
}

/**
 * Fetches the authenticated player's jump history and aggregates
 * it into unique routes with travel frequency.
 */
export function useJumpHistory(authToken: string | null): {
  routes: JumpRoute[];
  jumps: JumpRecord[];
  isLoading: boolean;
} {
  const [jumps, setJumps] = useState<JumpRecord[]>([]);
  const [routes, setRoutes] = useState<JumpRoute[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authToken) {
      setJumps([]);
      setRoutes([]);
      return;
    }

    setIsLoading(true);
    getJumpHistory(authToken)
      .then((records) => {
        setJumps(records);

        // Aggregate into unique routes
        const routeMap = new Map<string, JumpRoute>();
        for (const j of records) {
          const key = [j.origin.id, j.destination.id].sort().join("-");
          const existing = routeMap.get(key);
          const ts = new Date(j.time).getTime() || j.id;
          if (existing) {
            existing.count++;
            existing.lastJump = Math.max(existing.lastJump, ts);
          } else {
            routeMap.set(key, {
              originSystem: j.origin.id,
              destinationSystem: j.destination.id,
              count: 1,
              lastJump: ts,
            });
          }
        }
        setRoutes([...routeMap.values()]);
      })
      .catch((err) => {
        console.error("[FrontierOps] Failed to load jump history:", err);
      })
      .finally(() => setIsLoading(false));
  }, [authToken]);

  return { routes, jumps, isLoading };
}
