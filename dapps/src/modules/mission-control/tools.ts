/**
 * Mission Control tool definitions — gives the LLM access to
 * assembly data, on-chain actions, and game context.
 */

import type { ToolDefinition } from "./llm-client";

export const MISSION_CONTROL_TOOLS: ToolDefinition[] = [
  // === DATA QUERIES ===
  {
    type: "function",
    function: {
      name: "list_assemblies",
      description:
        "List all of the user's owned assemblies (turrets, SSUs, gates, network nodes) with their current status, type, name, and object ID. Use this to get an overview of the user's infrastructure.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "turrets", "ssus", "gates", "network_nodes"],
            description: "Filter by assembly type. Default: all",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_assembly_details",
      description:
        "Get detailed information about a specific assembly by its item ID or name, including status, type ID, location, energy source, and metadata.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "string",
            description: "The item ID (numeric string) of the assembly",
          },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_network_node_fuel",
      description:
        "Get fuel and energy information for network nodes. Returns fuel quantity, burn rate, max capacity, energy production, and connected assemblies.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "string",
            description: "The item ID of a specific network node (optional — omit to get all nodes)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_danger_alerts",
      description:
        "Get recent killmails and threat data. Returns kills with solar system, attacker/victim info, ship types, and timestamps. Use to assess threat levels near the user's assets.",
      parameters: {
        type: "object",
        properties: {
          system_name: {
            type: "string",
            description: "Filter kills to a specific solar system name (optional)",
          },
          hours: {
            type: "number",
            description: "Look back this many hours. Default: 24",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_solar_system",
      description:
        "Look up a solar system by name or ID. Returns coordinates, constellation, region, and any gate connections.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "System name or numeric ID",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contacts",
      description:
        "Get the user's contacts list with their standing (blue=friendly, grey=neutral, red=hostile) and any notes.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_roles",
      description:
        "Get the custom roles defined by the user (e.g., Leader, Builder, Recruit) and which characters are assigned to each role.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },

  // === CRAFTING & INDUSTRY ===
  {
    type: "function",
    function: {
      name: "lookup_recipe",
      description:
        "Look up the crafting recipe for an item. Returns the required input materials and quantities. Use this to answer questions like 'what do I need to build X?' or 'what goes into making Y?'",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "Item name or type ID to look up the recipe for",
          },
        },
        required: ["item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_full_bill_of_materials",
      description:
        "Recursively expand a recipe to get the complete list of raw mineable/harvestable materials needed, accounting for sub-components. Use this to build targeted mining plans — e.g. 'what raw materials do I need to build 10 Turrets?'",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "Item name or type ID to expand",
          },
          quantity: {
            type: "number",
            description: "How many of the item you want to produce. Default: 1",
          },
        },
        required: ["item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_refinery",
      description:
        "Look up refinery data for an item. If the item is a refinery source (e.g. Rich Common Ore), shows what it refines into. If it's a refinery output (e.g. Water Ice, Silicon Dust), shows which source materials can produce it. Use this when a raw material lookup shows something that might come from refining.",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "Item name or type ID to look up refinery info for",
          },
        },
        required: ["item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_raw_materials",
      description:
        "List all known raw materials (mineable resources, salvage, etc.) in EVE Frontier. Use this to understand what resources exist before planning a mining operation.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },

  // === ON-CHAIN ACTIONS (require user confirmation) ===
  {
    type: "function",
    function: {
      name: "set_power",
      description:
        "Bring an assembly online or offline. Executes an on-chain transaction — the UI will show a Confirm button to the user.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "string",
            description: "The item ID of the assembly",
          },
          action: {
            type: "string",
            enum: ["online", "offline"],
            description: "Whether to bring the assembly online or offline",
          },
        },
        required: ["item_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_assembly",
      description:
        "Rename an assembly on-chain. Executes an on-chain transaction — the UI will show a Confirm button to the user.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "string",
            description: "The item ID of the assembly",
          },
          new_name: {
            type: "string",
            description: "The new name for the assembly",
          },
        },
        required: ["item_id", "new_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_ssu_access",
      description:
        "Set access control rules on a Smart Storage Unit. Controls who can deposit and withdraw. Executes an on-chain transaction — the UI will show a Confirm button to the user.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "string",
            description: "The item ID of the SSU",
          },
          open_deposit: {
            type: "boolean",
            description: "Whether anyone can deposit items",
          },
          open_withdraw: {
            type: "boolean",
            description: "Whether anyone can withdraw items",
          },
          withdraw_tribes: {
            type: "array",
            items: { type: "number" },
            description: "List of tribe IDs allowed to withdraw",
          },
        },
        required: ["item_id"],
      },
    },
  },
];

/**
 * Build the system prompt with the user's current context
 */
export function buildSystemPrompt(context: {
  characterName?: string;
  tribeId?: number;
  walletAddress?: string;
  assemblyCount?: number;
}): string {
  return `You are Mission Control, an AI operations assistant for EVE Frontier — a blockchain-based space game built on Sui. You help the player manage their smart assemblies (turrets, Smart Storage Units, gates, network nodes) and provide strategic advice.

CURRENT OPERATOR:
- Character: ${context.characterName ?? "Unknown"}
- Tribe ID: ${context.tribeId ?? "Unknown"}
- Wallet: ${context.walletAddress ?? "Not connected"}
- Assemblies owned: ${context.assemblyCount ?? "Unknown"}

YOUR CAPABILITIES:
- Query assembly status, fuel, energy, access rules
- Power assemblies on/off (on-chain transaction)
- Rename assemblies (on-chain transaction)
- Set SSU access control (on-chain transaction)
- Check threat levels from killmail data
- Look up solar systems, contacts, and roles

IMPORTANT RULES:
1. For on-chain actions (power, rename, access), call the tool immediately — the UI will present a Confirm/Cancel button to the user automatically. Do NOT ask for verbal confirmation first.
2. Be concise — this may be viewed on a narrow in-game panel or phone screen.
3. Use EVE Frontier terminology (assemblies, smart storage units, network nodes, tribes).
4. When listing assemblies, show name (or "Unnamed"), status, and item ID.
5. Proactively warn about issues (low fuel, offline nodes, threats nearby).
6. If you don't have enough info, use the available tools to look it up rather than guessing.
7. After an action is confirmed, always re-query the relevant assemblies with list_assemblies or get_assembly_details to report the updated state.

You have a dry, competent tone — like a military operations center. Brief status reports, clear recommendations, decisive language.`;
}
