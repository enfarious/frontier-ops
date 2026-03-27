import { useQuery } from "@tanstack/react-query";
import {
  getCharacterAndOwnedObjects,
  executeGraphQLQuery,
} from "@evefrontier/dapp-kit";
import { getFromCache, setCache, TTL } from "./cache";

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
  const name = metadataName || (json.name as string) || `Assembly ${typeId}`;

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
      console.log(`[FrontierOps] Found ${capNodes.length} ${label} OwnerCaps`);

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
          console.log(`[FrontierOps] ${label} found: id=${assembly.id}, state=${assembly.state}, moveType=${typeRepr}`);
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
export async function fetchAssembliesForWallet(walletAddress: string): Promise<AssemblyData[]> {
  // Try localStorage cache first
  const cacheKey = `assemblies:${walletAddress}`;
  const cached = getFromCache<AssemblyData[]>(cacheKey, TTL.ASSEMBLIES);
  if (cached) {
    console.log(`[FrontierOps] Assemblies loaded from cache (${walletAddress.slice(0, 8)}…): ${cached.length} items`);
    return cached;
  }

  console.log("[FrontierOps] Querying character assemblies for:", walletAddress);

  const result = await getCharacterAndOwnedObjects(walletAddress);
  const data = result.data;

  if (!data) {
    console.warn("[FrontierOps] No data returned from getCharacterAndOwnedObjects");
    return [];
  }

  const profileNode = data.address?.objects?.nodes?.[0];
  if (!profileNode) {
    console.warn("[FrontierOps] No PlayerProfile found for this wallet");
    return [];
  }

  const characterJson =
    profileNode.contents?.extract?.asAddress?.asObject?.asMoveObject
      ?.contents?.json as Record<string, unknown> | undefined;

  const characterAddress =
    (profileNode.contents?.extract?.asAddress?.asObject as any)?.address as string | undefined;

  const ownerName = (characterJson?.name as string) ??
    ((characterJson?.metadata as any)?.name as string) ?? undefined;

  console.log("[FrontierOps] Character:", ownerName, "at", characterAddress);

  const ownerCapNodes =
    profileNode.contents?.extract?.asAddress?.objects?.nodes ?? [];

  console.log("[FrontierOps] OwnerCap nodes count:", ownerCapNodes.length);

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

  console.log(`[FrontierOps] Total assemblies: ${assemblies.length}, unique: ${unique.length}`, unique);

  // Cache the results
  setCache(cacheKey, unique);

  // Also cache for Mission Control LLM access
  try {
    localStorage.setItem("frontier-ops-assemblies-cache", JSON.stringify(unique));
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
