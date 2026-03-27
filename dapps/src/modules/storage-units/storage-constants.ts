const WORLD_PACKAGE_ID =
  import.meta.env.VITE_EVE_WORLD_PACKAGE_ID ?? "0x0";

export const STORAGE_MODULE = "storage_unit";

/** Full type string for storage unit assemblies on chain */
export const STORAGE_TYPE = `${WORLD_PACKAGE_ID}::assembly::Assembly`;
