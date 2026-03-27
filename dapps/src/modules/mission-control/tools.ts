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

  // === ON-CHAIN ACTIONS (require user confirmation) ===
  {
    type: "function",
    function: {
      name: "set_power",
      description:
        "Bring an assembly online or offline. IMPORTANT: This executes an on-chain transaction — always confirm with the user first.",
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
        "Rename an assembly on-chain. IMPORTANT: This executes an on-chain transaction — always confirm with the user first.",
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
        "Set access control rules on a Smart Storage Unit. Controls who can deposit and withdraw. IMPORTANT: This executes an on-chain transaction — always confirm with the user first.",
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
1. For ANY on-chain action (power, rename, access), ALWAYS describe what you're about to do and ask for confirmation BEFORE executing.
2. Be concise — this may be viewed on a narrow in-game panel or phone screen.
3. Use EVE Frontier terminology (assemblies, smart storage units, network nodes, tribes).
4. When listing assemblies, show name (or "Unnamed"), status, and item ID.
5. Proactively warn about issues (low fuel, offline nodes, threats nearby).
6. If you don't have enough info, use the available tools to look it up rather than guessing.

You have a dry, competent tone — like a military operations center. Brief status reports, clear recommendations, decisive language.`;
}
