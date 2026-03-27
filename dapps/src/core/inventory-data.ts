/**
 * SSU Inventory data queries.
 * Reads inventory contents from SSU dynamic fields on-chain.
 */

import { resolveTypeName } from "./world-api";

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
export interface InventoryItem {
  typeId: number;
  typeName: string;
  quantity: number;
  volume: number;
}

export interface InventoryData {
  ssuId: string;
  items: InventoryItem[];
  totalVolume: number;
  maxVolume: number;
}

/**
 * Fetch the primary inventory of an SSU.
 * The inventory is stored as a dynamic field on the SSU keyed by the owner_cap_id.
 */
export async function fetchSSUInventory(ssuObjectId: string): Promise<InventoryData | null> {
  // Query SSU dynamic fields — inventory is stored as a dynamic field keyed by owner_cap_id.
  // The Inventory struct contains items: VecMap<u64, ItemEntry>.
  // Sui serializes VecMap as { contents: [{ key, value }, ...] }.
  const ssuQuery = `{
    object(address: "${ssuObjectId}") {
      asMoveObject {
        contents { json }
      }
      dynamicFields(first: 50) {
        nodes {
          name { json type { repr } }
          value {
            ... on MoveValue { json type { repr } }
          }
        }
      }
    }
  }`;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ssuQuery }),
    });
    const data = await res.json();
    const obj = data?.data?.object;
    if (!obj) return null;

    const dynamicFields = obj?.dynamicFields?.nodes || [];

    // Look for inventory dynamic fields
    const inventoryItems: InventoryItem[] = [];
    let maxVolume = 0;
    let totalVolume = 0;

    for (const field of dynamicFields) {
      const valueType = field?.value?.type?.repr || "";
      const valueJson = field?.value?.json;

      if (valueType.includes("inventory::Inventory") && valueJson) {
        console.log("[FrontierOps] Raw inventory JSON:", JSON.stringify(valueJson));

        // Inventory struct: { max_capacity, used_capacity, items: VecMap }
        maxVolume = Number(valueJson.max_capacity || 0);

        // VecMap<u64, ItemEntry> serializes as { contents: [{ key, value }, ...] }
        const vecMapContents = valueJson.items?.contents || [];
        console.log(`[FrontierOps] Inventory has ${vecMapContents.length} item entries`);

        for (const entry of vecMapContents) {
          // entry = { key: typeId (u64), value: { tenant, type_id, item_id, volume, quantity } }
          const itemData = entry.value || entry;
          const typeId = Number(entry.key || itemData.type_id || 0);
          const quantity = Number(itemData.quantity || 0);
          const volume = Number(itemData.volume || 0);
          const typeName = await resolveTypeName(typeId);

          console.log(`[FrontierOps] Inventory item: ${typeName} (type ${typeId}) x${quantity}, vol ${volume}`);

          inventoryItems.push({
            typeId,
            typeName,
            quantity,
            volume,
          });
          totalVolume += volume * quantity;
        }
      }
    }

    if (inventoryItems.length === 0) {
      // Debug: log all dynamic field types so we can see what's there
      console.log("[FrontierOps] No inventory found. Dynamic field types:",
        dynamicFields.map((f: any) => f?.value?.type?.repr || "unknown"));
    }

    return {
      ssuId: ssuObjectId,
      items: inventoryItems,
      totalVolume,
      maxVolume,
    };
  } catch (err) {
    console.error("[FrontierOps] Failed to fetch SSU inventory:", err);
    return null;
  }
}

// ── SSU Transaction History ─────────────────────────────────────

export interface SSUTransaction {
  digest: string;
  timestamp: number;
  sender: string;
  /** Move function called (e.g. "deposit_to_inventory") */
  functionName: string;
  /** Module that emitted the event/call */
  moduleName: string;
  /** Event data if available */
  eventData?: Record<string, unknown>;
}

/**
 * Fetch recent transactions that affected an SSU object.
 * Shows deposit/withdraw activity as a transaction log.
 */
export async function fetchSSUTransactionHistory(
  ssuObjectId: string,
  limit = 20,
): Promise<SSUTransaction[]> {
  const query = `{
    address(address: "${ssuObjectId}") {
      transactions(first: ${limit}, relation: AFFECTED) {
        nodes {
          digest
          effects {
            timestamp
          }
          sender {
            address
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
    const nodes = data?.data?.address?.transactions?.nodes ?? [];

    return nodes.map((node: any) => ({
      digest: node.digest || "",
      timestamp: node.effects?.timestamp ? new Date(node.effects.timestamp).getTime() : 0,
      sender: node.sender?.address || "",
      functionName: "",
      moduleName: "",
    }));
  } catch (err) {
    console.error("[FrontierOps] Failed to fetch SSU tx history:", err);
    return [];
  }
}

/**
 * Build a summary of all inventories across multiple SSUs.
 * Useful for the LLM to understand total resource picture.
 */
export async function buildInventorySummary(
  ssuIds: string[],
): Promise<{
  totalItems: Map<number, { typeName: string; totalQuantity: number }>;
  perSSU: Map<string, InventoryData>;
}> {
  const totalItems = new Map<number, { typeName: string; totalQuantity: number }>();
  const perSSU = new Map<string, InventoryData>();

  for (const ssuId of ssuIds) {
    const inv = await fetchSSUInventory(ssuId);
    if (!inv) continue;
    perSSU.set(ssuId, inv);

    for (const item of inv.items) {
      const existing = totalItems.get(item.typeId);
      if (existing) {
        existing.totalQuantity += item.quantity;
      } else {
        totalItems.set(item.typeId, {
          typeName: item.typeName,
          totalQuantity: item.quantity,
        });
      }
    }
  }

  return { totalItems, perSSU };
}
