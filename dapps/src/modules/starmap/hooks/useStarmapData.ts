/**
 * Aggregates all data needed for the starmap:
 * - Solar systems with normalized coordinates
 * - Killmail activity by system (most recent kill timestamp)
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { executeGraphQLQuery } from "@evefrontier/dapp-kit";
import { getSolarSystemMap, type SolarSystem } from "../../../core/world-api";
import { normalizeCoordinates, type NormalizedCoord } from "../helpers/projection";
import { getFromCache, setCache, TTL } from "../../../core/cache";

const WORLD_PKG = import.meta.env.VITE_EVE_WORLD_PACKAGE_ID || "";

const GET_KILLMAILS = `
query GetKillmails {
  objects(
    filter: { type: "${WORLD_PKG}::killmail::Killmail" }
    first: 50
  ) {
    nodes {
      asMoveObject {
        contents { json }
      }
    }
  }
}
`;

/** systemId → most recent kill timestamp (ms) */
export type KillHeatMap = Map<number, number>;

export interface StarmapData {
  systems: Map<number, SolarSystem>;
  coords: Map<number, NormalizedCoord>;
  killHeat: KillHeatMap;
  isLoading: boolean;
  error: string | null;
}

function parseKillHeat(data: any): KillHeatMap {
  const heat = new Map<number, number>();
  const nodes = data?.objects?.nodes ?? [];

  for (const node of nodes) {
    const json = node?.asMoveObject?.contents?.json;
    if (!json) continue;

    const solarSystemId = Number(json?.solar_system_id?.item_id ?? 0);
    const timestamp = Number(json?.kill_timestamp ?? 0);

    if (solarSystemId > 0 && timestamp > 0) {
      const existing = heat.get(solarSystemId) ?? 0;
      if (timestamp > existing) {
        heat.set(solarSystemId, timestamp);
      }
    }
  }

  return heat;
}

export function useStarmapData(): StarmapData {
  const [systems, setSystems] = useState<Map<number, SolarSystem>>(new Map());
  const [coords, setCoords] = useState<Map<number, NormalizedCoord>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load solar systems
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sysMap = await getSolarSystemMap();
        if (cancelled) return;

        const normalized = normalizeCoordinates(sysMap);
        setSystems(sysMap);
        setCoords(normalized);
        console.log(`[Starmap] Loaded ${sysMap.size} systems`);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load systems");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Load killmails for heat map
  const { data: killHeat = new Map<number, number>() } = useQuery({
    queryKey: ["starmap-killheat"],
    queryFn: async () => {
      const cached = getFromCache<Array<[number, number]>>("starmap-killheat", TTL.KILLMAILS);
      if (cached) return new Map(cached);

      const result = await executeGraphQLQuery(GET_KILLMAILS, {});
      const heat = parseKillHeat(result);
      setCache("starmap-killheat", Array.from(heat.entries()));
      return heat;
    },
    refetchInterval: 60_000, // refresh every minute
  });

  return { systems, coords, killHeat, isLoading, error };
}
