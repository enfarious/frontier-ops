import { useScopedAssemblies } from "../../../core/useScopedAssemblies";
import { MOVE_TYPES } from "../../../core/assembly-type-ids";
import type { TurretData } from "../turret-types";

export function useTurrets() {
  const { data, isLoading, error, hasMoreMembers, loadMoreMembers, scannedMembers, totalMembers } = useScopedAssemblies();

  const turrets: TurretData[] | undefined = data
    ?.filter((a) => a.moveType.includes(MOVE_TYPES.TURRET))
    .map((a) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      ownerId: a.ownerId,
      ownerName: a.ownerName,
      typeId: String(a.typeId),
    }));

  return {
    data: turrets,
    isLoading,
    error,
    hasMoreMembers,
    loadMoreMembers,
    scannedMembers,
    totalMembers,
  };
}
