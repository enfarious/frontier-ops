import { useQuery } from "@tanstack/react-query";
import { getObjectWithJson } from "@evefrontier/dapp-kit";

export function useStorageState(unitId: string | null) {
  return useQuery({
    queryKey: ["storage-state", unitId],
    queryFn: async () => {
      if (!unitId) return null;
      const result = await getObjectWithJson(unitId);
      const json = result.data?.object?.asMoveObject?.contents?.json;
      const type = result.data?.object?.asMoveObject?.contents?.type?.repr;
      return { json, type };
    },
    enabled: !!unitId,
  });
}
