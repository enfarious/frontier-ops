import { useQuery } from "@tanstack/react-query";
import { getObjectWithJson } from "@evefrontier/dapp-kit";

export function useGateState(gateId: string | null) {
  return useQuery({
    queryKey: ["gate-state", gateId],
    queryFn: async () => {
      if (!gateId) return null;
      const result = await getObjectWithJson(gateId);
      const json = result.data?.object?.asMoveObject?.contents?.json;
      const type = result.data?.object?.asMoveObject?.contents?.type?.repr;
      return { json, type };
    },
    enabled: !!gateId,
  });
}
