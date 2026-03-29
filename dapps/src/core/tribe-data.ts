/**
 * Tribe data queries — fetches tribe info, roster, and member assemblies.
 */

import { getFromCache, setCache, TTL } from "./cache";

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
const WORLD_PKG = import.meta.env.VITE_EVE_WORLD_PACKAGE_ID || "";
const WORLD_API = "https://world-api-stillness.live.tech.evefrontier.com";

// === Types ===

export interface TribeInfo {
  id: number;
  name: string;
  nameShort: string;
  description: string;
  taxRate: number;
  tribeUrl: string;
}

export interface TribeMember {
  characterId: string;        // on-chain object ID
  characterAddress: string;   // wallet address
  name: string;
  itemId: string;
  ownerCapId: string;
}

export interface TribeRoster {
  tribe: TribeInfo;
  members: TribeMember[];
  fetchedAt: number;
}

// === Tribe Info (World API) ===

export async function fetchTribeInfo(tribeId: number): Promise<TribeInfo | null> {
  const cacheKey = `tribe-info:${tribeId}`;
  const cached = await getFromCache<TribeInfo>(cacheKey, TTL.REFERENCE);
  if (cached) return cached;

  try {
    const res = await fetch(`${WORLD_API}/v2/tribes/${tribeId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const info: TribeInfo = {
      id: data.id,
      name: data.name || `Tribe ${tribeId}`,
      nameShort: data.nameShort || "",
      description: data.description || "",
      taxRate: data.taxRate ?? 0,
      tribeUrl: data.tribeUrl || "",
    };
    await setCache(cacheKey, info);
    return info;
  } catch {
    return null;
  }
}

// === Tribe Roster (on-chain) ===

/**
 * Fetch all characters belonging to a specific tribe.
 * Paginates through all Character objects on-chain.
 */
export async function fetchTribeRoster(tribeId: number): Promise<TribeMember[]> {
  const cacheKey = `tribe-roster:${tribeId}`;
  const cached = await getFromCache<TribeMember[]>(cacheKey, TTL.ASSEMBLIES);
  if (cached) {
    return cached;
  }

  const charType = `${WORLD_PKG}::character::Character`;
  const members: TribeMember[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (true) {
    const afterClause: string = cursor ? `, after: "${cursor}"` : "";
    const query: string = `{
      objects(filter: { type: "${charType}" }, first: 50${afterClause}) {
        nodes {
          asMoveObject {
            contents { json }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;

    try {
      const res = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      const nodes = data?.data?.objects?.nodes ?? [];
      const pageInfo = data?.data?.objects?.pageInfo;

      for (const node of nodes) {
        const json = node?.asMoveObject?.contents?.json;
        if (!json || json.tribe_id !== tribeId) continue;

        members.push({
          characterId: json.id,
          characterAddress: json.character_address || "",
          name: json.metadata?.name || "Unknown",
          itemId: json.key?.item_id || "",
          ownerCapId: json.owner_cap_id || "",
        });
      }

      page++;

      if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
      cursor = pageInfo.endCursor;
    } catch (err) {
      console.error("[FrontierOps] Tribe roster fetch error:", err);
      break;
    }
  }

  await setCache(cacheKey, members);
  return members;
}

/**
 * Fetch the full tribe data: info + roster.
 */
export async function fetchTribeData(tribeId: number): Promise<TribeRoster | null> {
  const [tribe, members] = await Promise.all([
    fetchTribeInfo(tribeId),
    fetchTribeRoster(tribeId),
  ]);

  if (!tribe) return null;

  return {
    tribe,
    members,
    fetchedAt: Date.now(),
  };
}

/**
 * Get the current user's tribe ID from their character data.
 */
export async function fetchMyTribeId(walletAddress: string): Promise<number | null> {
  const cacheKey = `my-tribe:${walletAddress}`;
  const cached = await getFromCache<number>(cacheKey, TTL.ASSEMBLIES);
  if (cached) return cached;

  const profileType = `${WORLD_PKG}::character::PlayerProfile`;
  const query = `{
    address(address: "${walletAddress}") {
      objects(filter: { type: "${profileType}" }, first: 1) {
        nodes {
          contents {
            extract(path: "character_id") {
              asAddress {
                asObject {
                  asMoveObject {
                    contents { json }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const json = data?.data?.address?.objects?.nodes?.[0]
      ?.contents?.extract?.asAddress?.asObject?.asMoveObject?.contents?.json;

    if (json?.tribe_id) {
      await setCache(cacheKey, json.tribe_id);
      return json.tribe_id;
    }
    return null;
  } catch {
    return null;
  }
}
