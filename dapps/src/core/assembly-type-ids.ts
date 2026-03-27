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
  // TODO: map these to their in-game names once confirmed
  // Known typeIds on Stillness: 87119, 87120, 88063, 88067, 88068, 88069, 88070, 90184
} as const;

/** Turret type ID → human-readable name and effective-against info */
export const TURRET_TYPE_INFO: Record<number, { name: string; effectiveAgainst: string }> = {
  92401: { name: "Turret", effectiveAgainst: "General" },
  92402: { name: "Autocannon", effectiveAgainst: "Shuttle, Corvette" },
  92403: { name: "Plasma", effectiveAgainst: "Frigate, Destroyer" },
  92484: { name: "Howitzer", effectiveAgainst: "Cruiser, Battlecruiser" },
};
