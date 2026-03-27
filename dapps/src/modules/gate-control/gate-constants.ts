const WORLD_PACKAGE_ID =
  import.meta.env.VITE_EVE_WORLD_PACKAGE_ID ?? "0x0";

export const GATE_MODULE = "gate";

/** Full type string for gate assemblies on chain */
export const GATE_TYPE = `${WORLD_PACKAGE_ID}::assembly::Assembly`;

/** Extension package ID for custom gate logic (if deployed) */
export const GATE_EXTENSION_PACKAGE_ID =
  import.meta.env.VITE_GATE_EXTENSION_PACKAGE_ID ?? "";

/** Extension config object ID (if deployed) */
export const GATE_EXTENSION_CONFIG_ID =
  import.meta.env.VITE_GATE_EXTENSION_CONFIG_ID ?? "";
