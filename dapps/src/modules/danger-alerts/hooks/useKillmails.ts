import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { executeGraphQLQuery } from "@evefrontier/dapp-kit";
import { resolveSolarSystemName, resolveTribeName } from "../../../core/world-api";
import { getFromCache, setCache, TTL } from "../../../core/cache";
import type { KillmailData } from "../danger-types";

const WORLD_PKG =
  "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

const PAGE_SIZE = 50;

const GET_KILLMAILS_PAGE = `
query GetKillmails($after: String) {
  objects(
    filter: { type: "${WORLD_PKG}::killmail::Killmail" }
    first: ${PAGE_SIZE}
    after: $after
  ) {
    nodes {
      asMoveObject {
        contents {
          json
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

// Paginated query for all characters
const GET_CHARACTERS_PAGE = `
query GetCharacters($charType: String!, $after: String) {
  objects(
    filter: { type: $charType }
    first: 50
    after: $after
  ) {
    nodes {
      asMoveObject {
        contents {
          json
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

interface KillmailJson {
  id: string;
  killer_id?: { item_id: string; tenant: string };
  victim_id?: { item_id: string; tenant: string };
  solar_system_id?: { item_id: string; tenant: string };
  kill_timestamp?: string;
  loss_type?: { "@variant": string };
  reported_by_character_id?: { item_id: string; tenant: string };
}

interface CharacterJson {
  key?: { item_id: string };
  tribe_id?: number;
  character_address?: string;
  metadata?: { name?: string };
}

// Build a character lookup map: item_id -> { name, tribeId }
export type CharacterInfo = { name: string; tribeId: number; address: string };

// Serializable version for localStorage
type CharacterMapData = Array<[string, CharacterInfo]>;

let characterMapPromise: Promise<Map<string, CharacterInfo>> | null = null;

/** Get the full character lookup map. Shared across modules. */
export { fetchCharacterMap as getCharacterMap };

function fetchCharacterMap() {
  if (characterMapPromise) return characterMapPromise;

  characterMapPromise = (async () => {
    // Try localStorage cache first
    const cached = await getFromCache<CharacterMapData>("character-map", TTL.CHARACTERS);
    if (cached) {
      const map = new Map<string, CharacterInfo>(cached);
      console.log(`[FrontierOps] Character map loaded from cache: ${map.size} characters`);
      return map;
    }

    const map = new Map<string, CharacterInfo>();
    try {
      const charType = `${WORLD_PKG}::character::Character`;
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const result: { data?: any } = await executeGraphQLQuery<any>(GET_CHARACTERS_PAGE, {
          charType,
          after: cursor,
        });
        const nodes = result.data?.objects?.nodes ?? [];
        for (const node of nodes) {
          const json = node?.asMoveObject?.contents?.json as CharacterJson | undefined;
          if (!json?.key?.item_id) continue;
          map.set(json.key.item_id, {
            name: json.metadata?.name || `Pilot #${json.key.item_id}`,
            tribeId: json.tribe_id ?? 0,
            address: json.character_address ?? "",
          });
        }
        hasMore = result.data?.objects?.pageInfo?.hasNextPage ?? false;
        cursor = result.data?.objects?.pageInfo?.endCursor ?? null;
      }
      console.log(`[FrontierOps] Fetched ${map.size} characters from chain, caching`);

      // Cache to IndexedDB
      await setCache("character-map", Array.from(map.entries()));
    } catch (err) {
      console.error("[FrontierOps] Failed to fetch character map:", err);
    }
    return map;
  })();

  // Allow re-fetch after TTL expires (in-memory guard)
  setTimeout(() => { characterMapPromise = null; }, TTL.CHARACTERS);

  return characterMapPromise;
}

async function enrichKillmail(json: KillmailJson): Promise<KillmailData> {
  const charMap = await fetchCharacterMap();

  const killerId = json.killer_id?.item_id ?? "unknown";
  const victimId = json.victim_id?.item_id ?? "unknown";
  const solarSystemId = json.solar_system_id?.item_id ?? "unknown";

  const killerInfo = charMap.get(killerId);
  const victimInfo = charMap.get(victimId);

  // Resolve system name and tribe names in parallel
  const [solarSystemName, killerTribe, victimTribe] = await Promise.all([
    resolveSolarSystemName(solarSystemId),
    killerInfo?.tribeId ? resolveTribeName(killerInfo.tribeId) : Promise.resolve(undefined),
    victimInfo?.tribeId ? resolveTribeName(victimInfo.tribeId) : Promise.resolve(undefined),
  ]);

  return {
    id: json.id,
    killerId,
    killerName: killerInfo?.name,
    killerTribe,
    killerAddress: killerInfo?.address,
    victimId,
    victimName: victimInfo?.name,
    victimTribe,
    victimAddress: victimInfo?.address,
    solarSystemId,
    solarSystemName,
    killTimestamp: Number(json.kill_timestamp ?? 0) * 1000,
    lossType: json.loss_type?.["@variant"] ?? "UNKNOWN",
  };
}

/** Fetch a specific page of killmails from chain */
async function fetchKillmailPage(cursor: string | null): Promise<{
  killmails: KillmailData[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const result = await executeGraphQLQuery<any>(GET_KILLMAILS_PAGE, {
    after: cursor,
  });

  const nodes = result.data?.objects?.nodes ?? [];
  const pageInfo = result.data?.objects?.pageInfo;

  const rawKillmails: KillmailJson[] = [];
  for (const node of nodes) {
    const json = node?.asMoveObject?.contents?.json as KillmailJson | undefined;
    if (json) rawKillmails.push(json);
  }

  const killmails = await Promise.all(rawKillmails.map(enrichKillmail));
  killmails.sort((a, b) => b.killTimestamp - a.killTimestamp);

  return {
    killmails,
    nextCursor: pageInfo?.endCursor ?? null,
    hasMore: pageInfo?.hasNextPage ?? false,
  };
}

export function useKillmails() {
  const [pageCount, setPageCount] = useState(1);

  const query = useQuery({
    queryKey: ["killmails", pageCount],
    queryFn: async (): Promise<{
      killmails: KillmailData[];
      hasMore: boolean;
      nextCursor: string | null;
    }> => {
      // Try localStorage cache first
      const cacheKey = `killmails:${pageCount}`;
      const cached = await getFromCache<{ killmails: KillmailData[]; hasMore: boolean; nextCursor: string | null }>(cacheKey, TTL.KILLMAILS);
      if (cached) {
        console.log(`[FrontierOps] Killmails loaded from cache: ${cached.killmails.length} entries`);
        return cached;
      }

      let allKillmails: KillmailData[] = [];
      let cursor: string | null = null;
      let hasMore = false;

      for (let page = 0; page < pageCount; page++) {
        const result = await fetchKillmailPage(cursor);
        allKillmails.push(...result.killmails);
        cursor = result.nextCursor;
        hasMore = result.hasMore;

        if (!hasMore) break;
      }

      // Sort all accumulated killmails
      allKillmails.sort((a, b) => b.killTimestamp - a.killTimestamp);

      const result = { killmails: allKillmails, hasMore, nextCursor: cursor };

      // Cache the results
      await setCache(cacheKey, result);

      // Also cache in plain format for Mission Control LLM access
      try {
        const forLLM = allKillmails.map(k => ({
          timestamp: k.killTimestamp,
          solarSystem: k.solarSystemName,
          attacker: k.killerName,
          victim: k.victimName,
          shipType: k.lossType,
        }));
        localStorage.setItem("frontier-ops-killmails-cache", JSON.stringify(forLLM));
      } catch {}

      console.log(`[FrontierOps] Fetched ${allKillmails.length} killmails (${pageCount} pages)`);

      return result;
    },
    refetchInterval: TTL.KILLMAILS,
  });

  const loadMore = useCallback(() => {
    setPageCount((p) => p + 1);
  }, []);

  return {
    data: query.data?.killmails,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.data?.hasMore ?? false,
    loadMore,
    totalLoaded: query.data?.killmails?.length ?? 0,
  };
}
