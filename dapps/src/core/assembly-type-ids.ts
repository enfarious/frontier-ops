/**
 * Move type repr substrings used to categorize on-chain objects.
 * We match against the `type.repr` field from the GraphQL response.
 */
export const MOVE_TYPES = {
  TURRET: "turret::Turret",
  GATE: "gate::Gate",
  STORAGE_UNIT: "storage_unit::StorageUnit",
  ASSEMBLY: "assembly::Assembly",
  CHARACTER: "character::Character",
  NETWORK_NODE: "network_node::NetworkNode",
} as const;

/**
 * Known assembly type IDs on EVE Frontier Stillness testnet.
 * Queried directly from the chain — the SDK's TYPEIDS enum uses
 * different values that don't match Stillness.
 */
export const STILLNESS_TYPE_IDS = {
  // Distinct Move types (not assembly::Assembly)
  TURRET: 92401,
  GATE: 88086,
  STORAGE_UNIT: 88082,
  NETWORK_NODE: 88092,

  // Turret sub-types (from docs)
  TURRET_AUTOCANNON: 92402,
  TURRET_PLASMA: 92403,
  TURRET_HOWITZER: 92484,

  // Generic assembly::Assembly subtypes (identified by numeric typeId)
  // Known typeIds on Stillness: 87119, 87120, 88063, 88067, 88068, 88069, 88070, 90184
} as const;

/** Turret type ID → human-readable name and effective-against info */
export const TURRET_TYPE_INFO: Record<number, { name: string; effectiveAgainst: string }> = {
  92279: { name: "Mini Turret", effectiveAgainst: "Shuttle" },
  92280: { name: "Mini Turret", effectiveAgainst: "Shuttle" },
  92401: { name: "Turret", effectiveAgainst: "General" },
  92402: { name: "Autocannon", effectiveAgainst: "Shuttle, Corvette" },
  92403: { name: "Plasma", effectiveAgainst: "Frigate, Destroyer" },
  92404: { name: "Heavy Turret", effectiveAgainst: "Cruiser, Battlecruiser" },
  92406: { name: "Turret", effectiveAgainst: "General" },
  92407: { name: "Heavy Turret", effectiveAgainst: "Cruiser, Battlecruiser" },
  92484: { name: "Howitzer", effectiveAgainst: "Cruiser, Battlecruiser" },
  92511: { name: "Howitzer", effectiveAgainst: "Cruiser, Battlecruiser" },
};

/**
 * Full type ID → friendly name for all known player-deployable assembly types.
 * Used as a fallback when the on-chain object carries no metadata name.
 * Source: EVE Frontier game data (type_names_all.json).
 */
export const ASSEMBLY_TYPE_NAMES: Record<number, string> = {
  // Turrets
  92279: "Mini Turret",
  92280: "Mini Turret",
  92401: "Turret",
  92402: "Autocannon Turret",
  92403: "Plasma Turret",
  92404: "Heavy Turret",
  92406: "Turret",
  92407: "Heavy Turret",
  92484: "Howitzer Turret",
  92511: "Howitzer Turret",

  // Gates
  79787: "Stargate (O-Type)",
  79880: "Stargate (M-Type)",
  79881: "Stargate (R-Type)",
  79882: "Stargate (L-Type)",
  79883: "Stargate (S-Type)",
  84955: "Heavy Gate",
  88086: "Mini Gate",
  91711: "Mini Gate",
  91712: "Heavy Gate",

  // Storage Units / SSUs
  77917: "Heavy Storage",
  82167: "Secured Storage Silo",
  82341: "Hybrid Storage Array",
  83502: "Hybrid Storage Array V",
  83503: "Hybrid Storage Array VI",
  83504: "Hybrid Storage Array II",
  83505: "Hybrid Storage Array III",
  83506: "Hybrid Storage Array IV",
  86830: "Ore Storage Silo",
  87446: "Storage Silo",
  87447: "Unusual Storage Silo",
  87566: "Field Storage",
  88082: "Mini Storage",
  88083: "Storage",
  88084: "Large Storage Unit",
  88240: "Smart Hangar",
  88283: "Construction Storage",
  88827: "Secured Storage Silo",
  91229: "Unremarkable Storage Complex",
  91230: "Unremarkable Storage Silo",
  91713: "Mini Storage",
  91714: "Storage",
  91715: "Heavy Storage",
  91756: "Field Storage",

  // Network Nodes & utility
  88092: "Network Node",
  88284: "Defensive Node",
  90184: "Relay",

  // Industry / assembly subtypes
  87119: "Mini Printer",
  87120: "Heavy Printer",
  88063: "Refinery",
  88067: "Printer",
  88068: "Assembler",
  88069: "Mini Berth",
  88070: "Berth",
};
