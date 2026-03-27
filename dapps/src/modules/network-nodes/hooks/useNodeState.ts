import { useQuery } from "@tanstack/react-query";
import { fetchNetworkNode, type NetworkNodeData } from "../../../core/network-node-data";

/**
 * Fetches detailed on-chain state for a single network node by ID.
 * Uses the fetchNetworkNode helper which queries GraphQL directly
 * and returns parsed NetworkNodeData.
 */
export function useNodeState(nodeId: string | null) {
  return useQuery<NetworkNodeData | null>({
    queryKey: ["node-state", nodeId],
    queryFn: async () => {
      if (!nodeId) return null;
      return fetchNetworkNode(nodeId);
    },
    enabled: !!nodeId,
  });
}
