/**
 * Tool executor — bridges LLM tool calls to actual data queries and on-chain actions.
 * Data queries execute immediately. On-chain actions return a confirmation request.
 */

import type { ToolCall } from "./llm-client";
import {
  fetchCharacterNetworkNodes,
  estimateFuelHours,
  energyUtilization,
  type NetworkNodeData,
} from "../../core/network-node-data";

/** Assembly data from the app's hooks */
export interface AssemblyData {
  id: string;
  itemId: string;
  name: string;
  typeId: number;
  state: string;
  moveType: string;
  ownerCapId?: string;
  energySourceId?: string;
  fuel?: {
    quantity: string;
    maxCapacity: string;
    burnRateMs: string;
    isBurning: boolean;
  };
  energySource?: {
    maxEnergyProduction: string;
    currentEnergyProduction: string;
    totalReservedEnergy: string;
  };
  connectedAssemblyIds?: string[];
}

/** Pending action that needs user confirmation */
export interface PendingAction {
  type: "power" | "rename" | "access";
  description: string;
  params: Record<string, unknown>;
}

export interface ToolExecutorContext {
  assemblies: AssemblyData[];
  walletAddress?: string;
  contacts: Array<{ name: string; standing: string; notes: string; characterId?: string }>;
  roles: Array<{ name: string; members: string[] }>;
  killmails: Array<{ timestamp: number; solarSystem?: string; attacker?: string; victim?: string; shipType?: string }>;
  solarSystems: Map<number, { id: number; name: string; x: number; y: number; z: number }>;
}

/**
 * Execute a tool call and return the result as a string.
 * On-chain actions return a PendingAction instead of executing directly.
 */
export async function executeTool(
  toolCall: ToolCall,
  context: ToolExecutorContext,
): Promise<{ result: string; pendingAction?: PendingAction }> {
  const name = toolCall.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    return { result: `Error parsing tool arguments: ${toolCall.function.arguments}` };
  }

  switch (name) {
    case "list_assemblies":
      return listAssemblies(context, args.filter as string);
    case "get_assembly_details":
      return getAssemblyDetails(context, args.item_id as string);
    case "get_network_node_fuel":
      return await getNetworkNodeFuel(context, args.item_id as string | undefined);
    case "get_danger_alerts":
      return getDangerAlerts(context, args.system_name as string | undefined, args.hours as number | undefined);
    case "lookup_solar_system":
      return lookupSolarSystem(context, args.query as string);
    case "get_contacts":
      return getContacts(context);
    case "get_roles":
      return getRoles(context);
    case "set_power":
      return setPower(args.item_id as string, args.action as string, context);
    case "rename_assembly":
      return renameAssembly(args.item_id as string, args.new_name as string, context);
    case "set_ssu_access":
      return setSSUAccess(args, context);
    default:
      return { result: `Unknown tool: ${name}` };
  }
}

// === DATA QUERIES ===

function classifyAssembly(a: AssemblyData): string {
  if (a.moveType.includes("turret::Turret")) return "turret";
  if (a.moveType.includes("storage_unit::StorageUnit")) return "ssu";
  if (a.moveType.includes("gate::Gate")) return "gate";
  if (a.moveType.includes("network_node::NetworkNode")) return "network_node";
  return "assembly";
}

function listAssemblies(ctx: ToolExecutorContext, filter?: string): { result: string } {
  let items = ctx.assemblies;
  if (filter && filter !== "all") {
    const typeMap: Record<string, string> = {
      turrets: "turret",
      ssus: "ssu",
      gates: "gate",
      network_nodes: "network_node",
    };
    const target = typeMap[filter];
    if (target) items = items.filter(a => classifyAssembly(a) === target);
  }

  if (items.length === 0) {
    return { result: `No ${filter ?? "assemblies"} found.` };
  }

  const lines = items.map(a => {
    const type = classifyAssembly(a);
    const name = a.name || "Unnamed";
    return `- ${name} [${type}] — ${a.state.toUpperCase()} (item: ${a.itemId})`;
  });

  return { result: `${items.length} assemblies:\n${lines.join("\n")}` };
}

function getAssemblyDetails(ctx: ToolExecutorContext, itemId: string): { result: string } {
  const a = ctx.assemblies.find(x => x.itemId === itemId);
  if (!a) return { result: `Assembly with item ID ${itemId} not found.` };

  const lines = [
    `Name: ${a.name || "Unnamed"}`,
    `Type: ${classifyAssembly(a)}`,
    `Status: ${a.state.toUpperCase()}`,
    `Item ID: ${a.itemId}`,
    `Object ID: ${a.id}`,
    `Type ID: ${a.typeId}`,
  ];

  if (a.energySourceId) lines.push(`Energy Source: ${a.energySourceId}`);

  return { result: lines.join("\n") };
}

async function getNetworkNodeFuel(ctx: ToolExecutorContext, itemId?: string): Promise<{ result: string }> {
  // Fetch network nodes directly from chain
  if (!ctx.walletAddress) {
    return { result: "Wallet not connected — cannot query network nodes." };
  }

  try {
    const nodes: NetworkNodeData[] = await fetchCharacterNetworkNodes(ctx.walletAddress);
    if (nodes.length === 0) return { result: "No network nodes found." };

    let filtered = nodes;
    if (itemId) filtered = nodes.filter(n => n.itemId === itemId);

    const lines = filtered.map(n => {
      const fuelPct = n.fuel.maxCapacity > 0
        ? ((n.fuel.quantity / n.fuel.maxCapacity) * 100).toFixed(1)
        : "?";
      const hoursLeft = estimateFuelHours(n);
      const utilPct = energyUtilization(n);
      const parts = [
        `Network Node (${n.itemId}) — ${n.status.toUpperCase()}`,
        `  Fuel: ${n.fuel.quantity}/${n.fuel.maxCapacity} (${fuelPct}%) | Burning: ${n.fuel.isBurning}`,
      ];
      if (hoursLeft !== null) {
        parts.push(`  Estimated fuel: ${hoursLeft.toFixed(1)} hours remaining`);
      }
      parts.push(`  Energy: ${n.energy.currentProduction}/${n.energy.maxProduction} production | ${n.energy.totalReserved} reserved (${utilPct}% util)`);
      if (n.connectedAssemblyIds.length > 0) {
        parts.push(`  Connected assemblies: ${n.connectedAssemblyIds.length}`);
      }
      return parts.join("\n");
    });

    // Also cache for future use
    try {
      localStorage.setItem("frontier-ops-network-nodes-cache", JSON.stringify(nodes));
    } catch {}

    return { result: `${filtered.length} network node(s):\n\n${lines.join("\n\n")}` };
  } catch (err) {
    return { result: `Error fetching network nodes: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function getDangerAlerts(ctx: ToolExecutorContext, systemName?: string, hours?: number): { result: string } {
  const cutoff = Date.now() - (hours ?? 24) * 3600_000;
  let kills = ctx.killmails.filter(k => k.timestamp > cutoff);

  if (systemName) {
    kills = kills.filter(k =>
      k.solarSystem?.toLowerCase().includes(systemName.toLowerCase()),
    );
  }

  if (kills.length === 0) {
    return { result: `No kills found${systemName ? ` in "${systemName}"` : ""} in the last ${hours ?? 24} hours.` };
  }

  const lines = kills.slice(0, 20).map(k => {
    const time = new Date(k.timestamp).toLocaleTimeString();
    return `- ${time} in ${k.solarSystem ?? "unknown"}: ${k.attacker ?? "?"} killed ${k.victim ?? "?"} (${k.shipType ?? "unknown ship"})`;
  });

  return { result: `${kills.length} kills${systemName ? ` near "${systemName}"` : ""} (showing latest ${Math.min(kills.length, 20)}):\n${lines.join("\n")}` };
}

function lookupSolarSystem(ctx: ToolExecutorContext, query: string): { result: string } {
  // Try numeric ID first
  const numId = parseInt(query);
  if (!isNaN(numId)) {
    const sys = ctx.solarSystems.get(numId);
    if (sys) return { result: `System ${sys.name} (ID: ${sys.id})\nCoords: x=${sys.x.toExponential(2)}, y=${sys.y.toExponential(2)}, z=${sys.z.toExponential(2)}` };
  }

  // Search by name
  const matches: Array<{ id: number; name: string }> = [];
  ctx.solarSystems.forEach((sys) => {
    if (sys.name.toLowerCase().includes(query.toLowerCase())) {
      matches.push(sys);
    }
  });

  if (matches.length === 0) return { result: `No solar system found matching "${query}".` };
  if (matches.length === 1) {
    const s = matches[0];
    return { result: `System ${s.name} (ID: ${s.id})` };
  }

  return { result: `${matches.length} systems match "${query}":\n${matches.slice(0, 10).map(s => `- ${s.name} (${s.id})`).join("\n")}` };
}

function getContacts(ctx: ToolExecutorContext): { result: string } {
  if (ctx.contacts.length === 0) return { result: "No contacts saved." };
  const lines = ctx.contacts.map(c =>
    `- ${c.name} [${c.standing.toUpperCase()}]${c.notes ? ` — ${c.notes}` : ""}`,
  );
  return { result: `${ctx.contacts.length} contacts:\n${lines.join("\n")}` };
}

function getRoles(ctx: ToolExecutorContext): { result: string } {
  if (ctx.roles.length === 0) return { result: "No roles defined." };
  const lines = ctx.roles.map(r =>
    `- ${r.name}: ${r.members.length} members`,
  );
  return { result: `${ctx.roles.length} roles:\n${lines.join("\n")}` };
}

// === ON-CHAIN ACTIONS ===

function setPower(
  itemId: string,
  action: string,
  ctx: ToolExecutorContext,
): { result: string; pendingAction?: PendingAction } {
  const a = ctx.assemblies.find(x => x.itemId === itemId);
  if (!a) return { result: `Assembly ${itemId} not found.` };

  const name = a.name || `Assembly ${a.itemId}`;
  const type = classifyAssembly(a);

  return {
    result: `Ready to bring ${name} (${type}) ${action.toUpperCase()}. Awaiting confirmation.`,
    pendingAction: {
      type: "power",
      description: `Bring ${name} ${action}`,
      params: { itemId, objectId: a.id, action, assemblyType: type },
    },
  };
}

function renameAssembly(
  itemId: string,
  newName: string,
  ctx: ToolExecutorContext,
): { result: string; pendingAction?: PendingAction } {
  const a = ctx.assemblies.find(x => x.itemId === itemId);
  if (!a) return { result: `Assembly ${itemId} not found.` };

  const oldName = a.name || "Unnamed";
  return {
    result: `Ready to rename "${oldName}" → "${newName}". Awaiting confirmation.`,
    pendingAction: {
      type: "rename",
      description: `Rename "${oldName}" to "${newName}"`,
      params: { itemId, objectId: a.id, newName },
    },
  };
}

function setSSUAccess(
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
): { result: string; pendingAction?: PendingAction } {
  const itemId = args.item_id as string;
  const a = ctx.assemblies.find(x => x.itemId === itemId);
  if (!a) return { result: `SSU ${itemId} not found.` };

  const name = a.name || `SSU ${itemId}`;
  const parts: string[] = [];
  if (args.open_deposit !== undefined) parts.push(`deposit: ${args.open_deposit ? "open" : "restricted"}`);
  if (args.open_withdraw !== undefined) parts.push(`withdraw: ${args.open_withdraw ? "open" : "restricted"}`);
  if (args.withdraw_tribes) parts.push(`withdraw tribes: ${JSON.stringify(args.withdraw_tribes)}`);

  return {
    result: `Ready to update access on ${name}: ${parts.join(", ")}. Awaiting confirmation.`,
    pendingAction: {
      type: "access",
      description: `Update access on ${name}`,
      params: { itemId, objectId: a.id, ...args },
    },
  };
}
