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
import { loadRecipeData, findRecipes, expandToRawMaterials } from "../../core/recipe-data";

/** Assembly data from the app's hooks */
export interface AssemblyData {
  id: string;
  itemId: string;
  name: string;
  typeId: number;
  state: string;
  moveType: string;
  ownerName?: string;
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
    case "lookup_recipe":
      return await lookupRecipe(args.item as string);
    case "get_full_bill_of_materials":
      return await getFullBOM(args.item as string, (args.quantity as number) ?? 1);
    case "list_raw_materials":
      return await listRawMaterials();
    case "lookup_refinery":
      return await lookupRefinery(args.item as string);
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
    return `- ${name} [${type}] — ${a.state.toUpperCase()} (id: ${a.itemId})`;
  });

  return { result: `${items.length} assemblies:\n${lines.join("\n")}` };
}

function getAssemblyDetails(ctx: ToolExecutorContext, itemId: string): { result: string } {
  const a = ctx.assemblies.find(x => x.itemId === itemId)
    ?? ctx.assemblies.find(x => x.name.toLowerCase() === itemId.toLowerCase());
  if (!a) return { result: `Assembly "${itemId}" not found. Use list_assemblies to see available assemblies and their IDs.` };

  const lines = [
    `Name: ${a.name || "Unnamed"}`,
    `Type: ${classifyAssembly(a)}`,
    `Status: ${a.state.toUpperCase()}`,
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
    if (itemId) filtered = nodes.filter(n => n.itemId === itemId || n.id === itemId);

    const lines = filtered.map(n => {
      const fuelPct = n.fuel.maxCapacity > 0
        ? ((n.fuel.quantity / n.fuel.maxCapacity) * 100).toFixed(1)
        : "?";
      const hoursLeft = estimateFuelHours(n);
      const utilPct = energyUtilization(n);
      const parts = [
        `Network Node — ${n.status.toUpperCase()} (id: ${n.id}, eve_item_id: ${n.itemId})`,
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

// === CRAFTING & INDUSTRY ===

async function lookupRecipe(item: string): Promise<{ result: string }> {
  try {
    const data = await loadRecipeData();
    const recipes = findRecipes(data, item);
    if (recipes.length === 0) {
      return { result: `No recipe found for "${item}". Use list_raw_materials to see base resources.` };
    }
    const lines = recipes.map(r => {
      const inputs = r.inputs.map(i => `${i.name} x${i.qty}${i.isRaw ? " [raw]" : ""}`).join(", ");
      return `${r.outputName} x${r.outputQty} (${r.runTime}s)\n  Requires: ${inputs}`;
    });
    return { result: lines.join("\n\n") };
  } catch {
    return { result: "Recipe data unavailable." };
  }
}

async function getFullBOM(item: string, quantity: number): Promise<{ result: string }> {
  try {
    const data = await loadRecipeData();
    const recipes = findRecipes(data, item);
    if (recipes.length === 0) {
      return { result: `No recipe found for "${item}".` };
    }
    const recipe = recipes[0];
    const bom = expandToRawMaterials(data, recipe.outputId, quantity);
    if (bom.size === 0) {
      return { result: `${recipe.outputName} has no sub-components — it is a raw material itself.` };
    }

    const lines: string[] = [];
    for (const entry of [...bom.values()].sort((a, b) => b.qty - a.qty)) {
      if (entry.refineryOptions && entry.refineryOptions.length > 0) {
        // Refinery-sourced intermediate: show all ore alternatives
        lines.push(`  ${entry.name}: ${entry.qty.toLocaleString()} needed — refine from (pick one):`);
        for (const opt of entry.refineryOptions) {
          lines.push(`    • ${opt.name}: ${opt.qty.toLocaleString()} units  (${opt.qtyPerSource}/unit)`);
        }
      } else {
        lines.push(`  ${entry.name}: ${entry.qty.toLocaleString()}`);
      }
    }

    return {
      result: `Raw materials to produce ${quantity}x ${recipe.outputName}:\n${lines.join("\n")}`,
    };
  } catch {
    return { result: "Recipe data unavailable." };
  }
}

async function lookupRefinery(item: string): Promise<{ result: string }> {
  try {
    const data = await loadRecipeData();
    const q = item.toLowerCase();
    const numId = parseInt(item);
    const sections: string[] = [];

    const matchesId = (id: number) => (!isNaN(numId) && id === numId);
    const matchesName = (name: string) => name.toLowerCase().includes(q);
    const matches = (id: number, name: string) => matchesId(id) || matchesName(name);

    // 1. If it's a refinery SOURCE → show what it yields when refined
    const asSource = data.refinery.filter(e => matches(e.sourceId, e.sourceName));
    if (asSource.length > 0) {
      const lines = asSource.map(e => {
        const outs = e.outputs.map(o => `${o.qty}x ${o.name}`).join(", ");
        return `  Refine 1x ${e.sourceName} → ${outs}`;
      });
      sections.push(`REFINERY (yields when refined):\n${lines.join("\n")}`);
    }

    // 2. If it's a refinery OUTPUT → show which ores/materials produce it
    const allRefineryOutputs = data.refinery.flatMap(e => e.outputs);
    const asRefineryOutput = allRefineryOutputs.filter(o => matches(o.id, o.name));
    if (asRefineryOutput.length > 0) {
      const seen = new Set<number>();
      const lines: string[] = [];
      for (const out of asRefineryOutput) {
        if (seen.has(out.id)) continue;
        seen.add(out.id);
        const sources = data.refinery.filter(e => e.outputs.some(o => o.id === out.id));
        sources.forEach(s => {
          const qty = s.outputs.find(o => o.id === out.id)!.qty;
          lines.push(`  1x ${s.sourceName} → ${qty}x ${out.name}`);
        });
      }
      sections.push(`OBTAINED BY REFINING:\n${lines.join("\n")}`);
    }

    // 3. If it's used as INPUT in blueprints → show what gets produced
    const asInput = data.recipes.filter(r =>
      r.inputs.some(i => matches(i.id, i.name)),
    );
    if (asInput.length > 0) {
      const lines = asInput.map(r => {
        const ins = r.inputs.map(i => `${i.qty}x ${i.name}`).join(", ");
        const outs = r.allOutputs.map(o => `${o.qty}x ${o.name}`).join(", ");
        return `  ${ins} → ${outs}`;
      });
      sections.push(`USED IN PROCESSING (produces):\n${lines.join("\n")}`);
    }

    // 4. Show what gets made from the OUTPUTS of any processing recipes found above
    const processingOutputIds = new Set(asInput.flatMap(r => r.allOutputs.map(o => o.id)));
    const furtherUsed = data.recipes.filter(r =>
      r.inputs.some(i => processingOutputIds.has(i.id)) && !asInput.includes(r),
    );
    if (furtherUsed.length > 0) {
      const lines = furtherUsed.slice(0, 8).map(r => {
        const relevantInput = r.inputs.find(i => processingOutputIds.has(i.id))!;
        return `  ${relevantInput.qty}x ${relevantInput.name} + ... → ${r.allOutputs.map(o => `${o.qty}x ${o.name}`).join(", ")}`;
      });
      sections.push(`FURTHER PROCESSED INTO:\n${lines.join("\n")}`);
    }

    if (sections.length === 0) {
      return { result: `"${item}" not found in refinery or processing data.` };
    }

    return { result: sections.join("\n\n") };
  } catch {
    return { result: "Refinery data unavailable." };
  }
}

async function listRawMaterials(): Promise<{ result: string }> {
  try {
    const data = await loadRecipeData();
    const lines = data.rawMaterials.map(m => `  ${m.name} (ID: ${m.id})`);
    return { result: `${data.rawMaterials.length} raw materials in EVE Frontier:\n${lines.join("\n")}` };
  } catch {
    return { result: "Recipe data unavailable." };
  }
}

// === ON-CHAIN ACTIONS ===

/** Maps classify result to Move module/type names needed by assembly actions */
function assemblyModuleInfo(type: string): { assemblyModule: string; assemblyTypeName: string } {
  if (type === "turret") return { assemblyModule: "turret", assemblyTypeName: "Turret" };
  if (type === "ssu") return { assemblyModule: "storage_unit", assemblyTypeName: "StorageUnit" };
  if (type === "gate") return { assemblyModule: "gate", assemblyTypeName: "Gate" };
  return { assemblyModule: "assembly", assemblyTypeName: "Assembly" };
}

function setPower(
  itemId: string,
  action: string,
  ctx: ToolExecutorContext,
): { result: string; pendingAction?: PendingAction } {
  const a = ctx.assemblies.find(x => x.itemId === itemId)
    ?? ctx.assemblies.find(x => x.name.toLowerCase() === itemId.toLowerCase());
  if (!a) return { result: `Assembly "${itemId}" not found. Use list_assemblies to see available assemblies.` };

  const name = a.name || `Assembly ${a.itemId}`;
  const type = classifyAssembly(a);

  return {
    result: `Ready to bring ${name} (${type}) ${action.toUpperCase()}. Awaiting confirmation.`,
    pendingAction: {
      type: "power",
      description: `Bring ${name} ${action}`,
      params: {
        objectId: a.id,
        ownerCapId: a.ownerCapId,
        energySourceId: a.energySourceId,
        action,
        ...assemblyModuleInfo(type),
      },
    },
  };
}

function renameAssembly(
  itemId: string,
  newName: string,
  ctx: ToolExecutorContext,
): { result: string; pendingAction?: PendingAction } {
  const a = ctx.assemblies.find(x => x.itemId === itemId)
    ?? ctx.assemblies.find(x => x.name.toLowerCase() === itemId.toLowerCase());
  if (!a) return { result: `Assembly "${itemId}" not found. Use list_assemblies to see available assemblies.` };

  const type = classifyAssembly(a);
  const oldName = a.name || "Unnamed";
  return {
    result: `Ready to rename "${oldName}" → "${newName}". Awaiting confirmation.`,
    pendingAction: {
      type: "rename",
      description: `Rename "${oldName}" to "${newName}"`,
      params: {
        objectId: a.id,
        ownerCapId: a.ownerCapId,
        newName,
        ...assemblyModuleInfo(type),
      },
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
