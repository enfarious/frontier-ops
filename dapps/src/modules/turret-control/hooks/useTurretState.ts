import { useQuery } from "@tanstack/react-query";
import { getObjectWithJson } from "@evefrontier/dapp-kit";

/**
 * Fetches detailed on-chain state for a single turret by ID.
 * Returns the raw JSON contents from the Move object.
 */
export function useTurretState(turretId: string | null) {
  return useQuery({
    queryKey: ["turret-state", turretId],
    queryFn: async () => {
      if (!turretId) return null;
      const result = await getObjectWithJson(turretId);
      const json = result.data?.object?.asMoveObject?.contents?.json;
      const type = result.data?.object?.asMoveObject?.contents?.type?.repr;
      return { json, type };
    },
    enabled: !!turretId,
  });
}
