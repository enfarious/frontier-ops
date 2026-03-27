import { useScopedAssemblies } from "../../../core/useScopedAssemblies";
import { MOVE_TYPES } from "../../../core/assembly-type-ids";
import type { StorageUnitData } from "../storage-types";

export function useStorageUnits() {
  const { data, isLoading, error, hasMoreMembers, loadMoreMembers, scannedMembers, totalMembers } = useScopedAssemblies();

  const units: StorageUnitData[] | undefined = data
    ?.filter((a) => a.moveType.includes(MOVE_TYPES.STORAGE_UNIT))
    .map((a) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      ownerId: a.ownerId,
      ownerName: a.ownerName,
      typeId: a.moveType,
    }));

  return {
    data: units,
    isLoading,
    error,
    hasMoreMembers,
    loadMoreMembers,
    scannedMembers,
    totalMembers,
  };
}
