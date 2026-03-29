/**
 * Network Node data queries.
 * Extracts fuel levels, energy production, and connected assembly info
 * from the on-chain network node objects.
 */

import { getFromCache, setCache, TTL } from "./cache";

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
const WORLD_PKG = import.meta.env.VITE_EVE_WORLD_PACKAGE_ID || "";

/** Resolve wallet address → character object address via PlayerProfile */
async function resolveCharacterAddress(walletAddress: string): Promise<string | null> {
  const profileType = `${WORLD_PKG}::character::PlayerProfile`;
  const query = `{
    address(address: "${walletAddress}") {
      objects(filter: { type: "${profileType}" }, first: 1) {
        nodes {
          contents {
            extract(path: "character_id") {
              asAddress {
                address
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
    const addr = data?.data?.address?.objects?.nodes?.[0]?.contents?.extract?.asAddress?.address;
    return addr || null;
  } catch {
    return null;
  }
}

export interface NetworkNodeData {
  id: string;
  itemId: string;
  status: "online" | "offline" | "unknown";
  ownerCapId: string;
  fuel: {
    maxCapacity: number;
    burnRateMs: number;
    fuelTypeId: number;
    unitVolume: number;
    quantity: number;
    isBurning: boolean;
    previousCycleElapsedTime: number;
    burnStartTime: number;
    lastUpdated: number;
  };
  energy: {
    maxProduction: number;
    currentProduction: number;
    totalReserved: number;
  };
  connectedAssemblyIds: string[];
  locationHash: string;
}

/** Fetch a single network node by object ID */
export async function fetchNetworkNode(objectId: string): Promise<NetworkNodeData | null> {
  const query = `{
    object(address: "${objectId}") {
      asMoveObject {
        contents {
          type { repr }
          json
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
    const json = data?.data?.object?.asMoveObject?.contents?.json;
    if (!json) return null;

    return parseNetworkNode(json);
  } catch {
    return null;
  }
}

/**
 * Fetch all network nodes owned by a character (via their OwnerCaps).
 * Accepts either the wallet address (derives character) or character address directly.
 * Uses the same wallet → PlayerProfile → Character → OwnerCap chain.
 */
export async function fetchCharacterNetworkNodes(walletAddress: string): Promise<NetworkNodeData[]> {
  // Check cache first (5 min TTL)
  const cacheKey = `network-nodes:${walletAddress}`;
  const cached = await getFromCache<NetworkNodeData[]>(cacheKey, TTL.ASSEMBLIES);
  if (cached) {
    console.log(`[FrontierOps] Network nodes loaded from cache: ${cached.length}`);
    return cached;
  }

  // First resolve wallet → character address
  const characterAddress = await resolveCharacterAddress(walletAddress);
  if (!characterAddress) return [];

  const ownerCapType = `${WORLD_PKG}::access::OwnerCap<${WORLD_PKG}::network_node::NetworkNode>`;
  const query = `{
    address(address: "${characterAddress}") {
      objects(filter: { type: "${ownerCapType}" }) {
        nodes {
          contents { json }
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
    const caps = data?.data?.address?.objects?.nodes || [];

    const nodes: NetworkNodeData[] = [];
    for (const cap of caps) {
      const authorizedId = cap?.contents?.json?.authorized_object_id;
      if (!authorizedId) continue;

      const node = await fetchNetworkNode(authorizedId);
      if (node) nodes.push(node);
    }

    // Cache the results
    await setCache(cacheKey, nodes);
    return nodes;
  } catch {
    return [];
  }
}

function parseNetworkNode(json: any): NetworkNodeData {
  const fuel = json.fuel || {};
  const energy = json.energy_source || {};
  const statusVariant = json?.status?.status?.["@variant"] || "";

  const rawQuantity = Number(fuel.quantity || 0);
  const burnRateMs = Number(fuel.burn_rate_in_ms || 0);
  const isBurning = fuel.is_burning === true;
  const lastUpdated = Number(fuel.last_updated || 0);

  // On-chain quantity is a snapshot at last_updated time.
  // If burning, compute how much has been consumed since then.
  let liveQuantity = rawQuantity;
  if (isBurning && burnRateMs > 0 && lastUpdated > 0) {
    const elapsedMs = Date.now() - lastUpdated;
    const consumed = Math.floor(elapsedMs / burnRateMs);
    liveQuantity = Math.max(0, rawQuantity - consumed);
  }

  return {
    id: json.id || "",
    itemId: json?.key?.item_id || "",
    status: statusVariant === "ONLINE" ? "online" : statusVariant === "OFFLINE" ? "offline" : "unknown",
    ownerCapId: json.owner_cap_id || "",
    fuel: {
      maxCapacity: Number(fuel.unit_volume || 0) > 0
        ? Math.floor(Number(fuel.max_capacity || 0) / Number(fuel.unit_volume))
        : Number(fuel.max_capacity || 0),
      burnRateMs,
      fuelTypeId: Number(fuel.type_id || 0),
      unitVolume: Number(fuel.unit_volume || 0),
      quantity: liveQuantity,
      isBurning,
      previousCycleElapsedTime: Number(fuel.previous_cycle_elapsed_time || 0),
      burnStartTime: Number(fuel.burn_start_time || 0),
      lastUpdated,
    },
    energy: {
      maxProduction: Number(energy.max_energy_production || 0),
      currentProduction: Number(energy.current_energy_production || 0),
      totalReserved: Number(energy.total_reserved_energy || 0),
    },
    connectedAssemblyIds: json.connected_assembly_ids || [],
    locationHash: json?.location?.location_hash || "",
  };
}

/** Calculate estimated fuel hours remaining */
export function estimateFuelHours(node: NetworkNodeData): number | null {
  if (!node.fuel.isBurning || node.fuel.burnRateMs === 0) return null;
  const burnRatePerHour = 3600000 / node.fuel.burnRateMs; // units per hour
  if (burnRatePerHour === 0) return null;
  return node.fuel.quantity / burnRatePerHour;
}

/** Calculate energy utilization percentage */
export function energyUtilization(node: NetworkNodeData): number {
  if (node.energy.maxProduction === 0) return 0;
  return Math.round((node.energy.totalReserved / node.energy.maxProduction) * 100);
}
