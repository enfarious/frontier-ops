import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCharacterNetworkNodes,
  energyUtilization,
  type NetworkNodeData,
} from "../../../core/network-node-data";
import { useOperatingContext } from "../../../core/OperatingContext";
import { getFromCache, setCache, TTL } from "../../../core/cache";
import type { NodeListItem } from "../types";

const TRIBE_PAGE_SIZE = 25;
const CONCURRENCY = 3;

function nodesToListItems(nodes: NetworkNodeData[], ownerAddress: string): NodeListItem[] {
  return nodes.map((node) => ({
    id: node.id,
    name: "Network Node",
    state: node.status,
    ownerId: ownerAddress,
    ownerCapId: node.ownerCapId,
    energySourceId: "",
    fuelQuantity: node.fuel.quantity,
    fuelMaxCapacity: node.fuel.maxCapacity,
    energyUtilPct: energyUtilization(node),
  }));
}

/**
 * Fetches network nodes, scoped to current operating mode.
 * Solo: queries only the connected wallet.
 * Tribe: paginates through members (25 at a time), 30min cache.
 */
export function useNetworkNodes() {
  const { mode, scopeAddress, tribeRoster, tribeLoading, tribe } = useOperatingContext();
  const [tribePageCount, setTribePageCount] = useState(1);

  // Solo mode
  const soloQuery = useQuery({
    queryKey: ["network-nodes-enriched", scopeAddress],
    queryFn: async (): Promise<NodeListItem[]> => {
      if (!scopeAddress) return [];
      const nodes = await fetchCharacterNetworkNodes(scopeAddress);
      return nodesToListItems(nodes, scopeAddress);
    },
    enabled: mode === "solo" && !!scopeAddress,
  });

  const tribeId = tribe?.id;
  const memberAddresses =
    mode === "tribe"
      ? [...new Set(tribeRoster.map((m) => m.characterAddress).filter(Boolean))]
      : [];

  const membersToScan = memberAddresses.slice(0, tribePageCount * TRIBE_PAGE_SIZE);
  const hasMoreMembers = membersToScan.length < memberAddresses.length;

  const tribeQuery = useQuery({
    queryKey: ["tribe-network-nodes", tribeId, membersToScan.length],
    queryFn: async (): Promise<NodeListItem[]> => {
      if (membersToScan.length === 0) return [];

      const cacheKey = `tribe-network-nodes:${tribeId}:${membersToScan.length}`;
      const cached = getFromCache<NodeListItem[]>(cacheKey, TTL.TRIBE_ASSEMBLIES);
      if (cached) {
        console.log(`[FrontierOps] Tribe network nodes from cache: ${cached.length}`);
        return cached;
      }

      const all: NodeListItem[] = [];
      for (let i = 0; i < membersToScan.length; i += CONCURRENCY) {
        const batch = membersToScan.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (addr) => {
            const nodes = await fetchCharacterNetworkNodes(addr);
            return nodesToListItems(nodes, addr);
          }),
        );
        for (const r of results) {
          if (r.status === "fulfilled") all.push(...r.value);
        }
      }

      const seen = new Set<string>();
      const unique = all.filter((n) => {
        if (!n.id || seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      });

      setCache(cacheKey, unique);
      return unique;
    },
    enabled: mode === "tribe" && !tribeLoading && membersToScan.length > 0,
    staleTime: TTL.TRIBE_ASSEMBLIES,
  });

  const loadMoreMembers = useCallback(() => {
    setTribePageCount((p) => p + 1);
  }, []);

  if (mode === "solo") {
    return { ...soloQuery, hasMoreMembers: false, loadMoreMembers: () => {} };
  }

  return { ...tribeQuery, hasMoreMembers, loadMoreMembers };
}
