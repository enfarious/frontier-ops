import { useQuery } from "@tanstack/react-query";
import {
  getCharacterAndOwnedObjects,
  executeGraphQLQuery,
} from "@evefrontier/dapp-kit";
import { getFromCache, setCache, clearCache, TTL } from "./cache";
import { ASSEMBLY_TYPE_NAMES } from "./assembly-type-ids";

const WORLD_PKG = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

/**
 * Supplementary query: fetch objects of specific types (StorageUnit, Gate)
 * that the SDK's main query fails to resolve (asObject returns null).
 * We query the character's OwnerCaps filtered by type, get the authorized_object_id,
 * then fetch each object directly.
 */
const GET_TYPED_OWNERCAPS = `
query GetTypedOwnerCaps($characterAddress: SuiAddress!, $ownerCapType: String!) {
  address(address: $characterAddress) {
    objects(filter: { type: $ownerCapType }) {
      nodes {
        contents {
          json
        }
      }
    }
  }
}
`;

const GET_OBJECT_BY_ADDRESS = `
query GetObjectByAddress($address: SuiAddress!) {
  object(address: $address) {
    asMoveObject {
      contents {
        type { repr }
        json
      }
    }
  }
}
`;

export interface AssemblyData {
  id: string;
  name: string;
  state: string;
  typeId: number;
  moveType: string;
  ownerId: string;
  ownerName?: string;
  ownerCapId: string;
  energySourceId: string;
  raw: Record<string, unknown>;
}

function parseAssemblyFromJson(
  json: Record<string, unknown>,
  typeRepr: string,
  walletAddress: string,
  ownerName?: string,
): AssemblyData {
  const typeId = Number(json.type_id ?? json.typeId ?? 0);
  const idStr = (json.id as string) || "";
  const metadataName = (json.metadata as any)?.name as string | undefined;
  const name = metadataName || (json.name as string) || ASSEMBLY_TYPE_NAMES[typeId] || `Assembly ${typeId}`;

  const statusObj = json.status as Record<string, unknown> | undefined;
  const innerStatus = statusObj?.status as Record<string, unknown> | undefined;
  const state = ((innerStatus?.["@variant"] as string) ?? (json.state as string) ?? "unknown").toLowerCase();

  return {
    id: idStr,
    name,
    state,
    typeId,
    moveType: typeRepr,
    ownerId: walletAddress,
    ownerName,
    ownerCapId: (json.owner_cap_id as string) || "",
    energySourceId: (json.energy_source_id as string) || "",
    raw: json,
  };
}

/**
 * Fetch StorageUnit and Gate objects owned by the character via their typed OwnerCaps.
 * The main SDK query can't resolve these because asObject returns null for them.
 */
async function fetchTypedObjects(
  characterAddress: string,
  walletAddress: string,
  ownerName?: string,
): Promise<AssemblyData[]> {
  const typesToQuery = [
    { ownerCapType: `${WORLD_PKG}::access::OwnerCap<${WORLD_PKG}::storage_unit::StorageUnit>`, label: "StorageUnit" },
    { ownerCapType: `${WORLD_PKG}::access::OwnerCap<${WORLD_PKG}::gate::Gate>`, label: "Gate" },
  ];

  const results: AssemblyData[] = [];

  for (const { ownerCapType, label } of typesToQuery) {
    try {
      const capsResult = await executeGraphQLQuery<any>(GET_TYPED_OWNERCAPS, {
        characterAddress,
        ownerCapType,
      });

      const capNodes = capsResult.data?.address?.objects?.nodes ?? [];

      for (const capNode of capNodes) {
        const capJson = capNode?.contents?.json as Record<string, unknown> | undefined;
        const authorizedObjectId = capJson?.authorized_object_id as string | undefined;
        if (!authorizedObjectId) continue;

        // Fetch the actual object
        try {
          const objResult = await executeGraphQLQuery<any>(GET_OBJECT_BY_ADDRESS, {
            address: authorizedObjectId,
          });
          const objContents = objResult.data?.object?.asMoveObject?.contents;
          if (!objContents?.json) continue;

          const typeRepr = (objContents.type?.repr as string) ?? "";
          const assembly = parseAssemblyFromJson(objContents.json, typeRepr, walletAddress, ownerName);
          results.push(assembly);
        } catch (err) {
          console.error(`[FrontierOps] Error fetching ${label} ${authorizedObjectId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[FrontierOps] Error querying ${label} OwnerCaps:`, err);
    }
  }

  return results;
}

/**
 * Standalone fetch function for assemblies owned by a wallet address.
 * Exported so it can be reused by useScopedAssemblies for tribe mode.
 */
/**
 * Ensures the character ID is in localStorage for the given wallet address.
 * Reads from IndexedDB cache if available, otherwise resolves from chain.
 * Call before any action that requires the character ID.
 */
/** Bust the assembly cache for a wallet so the next fetch goes to chain. */
export async function invalidateAssemblyCache(walletAddress: string): Promise<void> {
  await clearCache(`assemblies:${walletAddress}`);
  try { localStorage.removeItem("frontier-ops-assemblies-cache"); } catch {}
}

export async function ensureCharacterId(walletAddress: string): Promise<string | null> {
  const existing = localStorage.getItem("frontier-ops-character-id");
  if (existing) return existing;

  const charIdKey = `charId:${walletAddress}`;
  const cached = await getFromCache<string>(charIdKey, TTL.REFERENCE);
  if (cached) {
    localStorage.setItem("frontier-ops-character-id", cached);
    return cached;
  }

  // Resolve from chain
  const result = await getCharacterAndOwnedObjects(walletAddress);
  const profileNode = result.data?.address?.objects?.nodes?.[0];
  const characterAddress =
    (profileNode?.contents?.extract?.asAddress?.asObject as any)?.address as string | undefined;
  const characterJson =
    profileNode?.contents?.extract?.asAddress?.asObject?.asMoveObject?.contents?.json as any;
  const charAddr = characterAddress || (characterJson?.id as string) || null;

  if (charAddr) {
    localStorage.setItem("frontier-ops-character-id", charAddr);
    await setCache(charIdKey, charAddr);
  }

  return charAddr;
}

export async function fetchAssembliesForWallet(walletAddress: string): Promise<AssemblyData[]> {
  const cacheKey = `assemblies:${walletAddress}`;
  const charIdKey = `charId:${walletAddress}`;

  const cached = await getFromCache<AssemblyData[]>(cacheKey, TTL.ASSEMBLIES);
  if (cached) {
    // Restore localStorage entries that may have been cleared
    try {
      localStorage.setItem("frontier-ops-assemblies-cache", JSON.stringify(cached));
      const cachedCharId = await getFromCache<string>(charIdKey, TTL.REFERENCE);
      if (cachedCharId) localStorage.setItem("frontier-ops-character-id", cachedCharId);
    } catch {}
    return cached;
  }

  const result = await getCharacterAndOwnedObjects(walletAddress);
  const data = result.data;

  if (!data) {
    return [];
  }

  const profileNode = data.address?.objects?.nodes?.[0];
  if (!profileNode) {
    return [];
  }

  const characterJson =
    profileNode.contents?.extract?.asAddress?.asObject?.asMoveObject
      ?.contents?.json as Record<string, unknown> | undefined;

  const characterAddress =
    (profileNode.contents?.extract?.asAddress?.asObject as any)?.address as string | undefined;

  const ownerName = (characterJson?.name as string) ??
    ((characterJson?.metadata as any)?.name as string) ?? undefined;


  const ownerCapNodes =
    profileNode.contents?.extract?.asAddress?.objects?.nodes ?? [];


  const assemblies: AssemblyData[] = [];

  for (let i = 0; i < ownerCapNodes.length; i++) {
    const capNode = ownerCapNodes[i];
    try {
      const assemblyContents =
        (capNode as any).contents?.extract?.asAddress?.asObject?.asMoveObject
          ?.contents;
      if (!assemblyContents) {
        continue;
      }

      const json = assemblyContents.json as Record<string, unknown>;
      const typeRepr = (assemblyContents.type?.repr as string) ?? "";

      if (!json) continue;

      // Skip characters and network nodes
      if (typeRepr.includes("character::Character") || typeRepr.includes("network_node::NetworkNode")) {
        continue;
      }

      assemblies.push(parseAssemblyFromJson(json, typeRepr, walletAddress, ownerName));
    } catch (err) {
      console.error(`[FrontierOps] Error processing OwnerCap[${i}]:`, err);
    }
  }

  // Supplementary: fetch StorageUnit and Gate objects that the SDK query misses
  const charAddr = characterAddress || (characterJson?.id as string);

  if (charAddr) {
    const typedObjects = await fetchTypedObjects(charAddr, walletAddress, ownerName);
    assemblies.push(...typedObjects);
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = assemblies.filter((a) => {
    if (!a.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });


  // Cache the results
  await setCache(cacheKey, unique);
  if (charAddr) await setCache(charIdKey, charAddr);

  // Also cache for Mission Control LLM access and other hooks
  try {
    localStorage.setItem("frontier-ops-assemblies-cache", JSON.stringify(unique));
    if (charAddr) {
      localStorage.setItem("frontier-ops-character-id", charAddr);
    }
  } catch {}

  return unique;
}

/**
 * Fetches all assemblies owned by the character associated with the given wallet address.
 * Follows the EVE Frontier ownership chain: Wallet -> PlayerProfile -> Character -> OwnerCap -> Assembly
 */
export function useCharacterAssemblies(walletAddress: string | undefined) {
  return useQuery({
    queryKey: ["character-assemblies", walletAddress],
    queryFn: () => fetchAssembliesForWallet(walletAddress!),
    enabled: !!walletAddress,
  });
}
