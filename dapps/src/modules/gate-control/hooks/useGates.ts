import { useScopedAssemblies } from "../../../core/useScopedAssemblies";
import { MOVE_TYPES } from "../../../core/assembly-type-ids";
import type { GateData } from "../gate-types";

export function useGates() {
  const { data, isLoading, error, hasMoreMembers, loadMoreMembers, scannedMembers, totalMembers } = useScopedAssemblies();

  const gates: GateData[] | undefined = data
    ?.filter((a) => a.moveType.includes(MOVE_TYPES.GATE))
    .map((a) => ({
      id: a.id,
      name: a.name,
      state: a.state,
      ownerId: a.ownerId,
      ownerName: a.ownerName,
      typeId: a.moveType,
    }));

  return {
    data: gates,
    isLoading,
    error,
    hasMoreMembers,
    loadMoreMembers,
    scannedMembers,
    totalMembers,
  };
}
