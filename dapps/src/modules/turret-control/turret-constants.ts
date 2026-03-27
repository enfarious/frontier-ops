/**
 * Turret-related type strings, module names, and singleton addresses.
 */

export const WORLD_PACKAGE_ID =
  import.meta.env.VITE_EVE_WORLD_PACKAGE_ID ?? "0x0";

export const TURRET_MODULE = "smart_turret";

/** Full type string for turret assemblies on chain */
export const TURRET_TYPE = `${WORLD_PACKAGE_ID}::assembly::Assembly`;

/** EnergyConfig singleton — required for online/offline transitions */
export const ENERGY_CONFIG_ID =
  "0xd77693d0df5656d68b1b833e2a23cc81eb3875d8d767e7bd249adde82bdbc952";

/** Extension package ID for custom turret logic (if deployed) */
export const TURRET_EXTENSION_PACKAGE_ID =
  import.meta.env.VITE_TURRET_EXTENSION_PACKAGE_ID ?? "";

/** Extension config object ID (if deployed) */
export const TURRET_EXTENSION_CONFIG_ID =
  import.meta.env.VITE_TURRET_EXTENSION_CONFIG_ID ?? "";
