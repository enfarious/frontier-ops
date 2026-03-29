/**
 * Returns assemblies scoped to the current operating mode.
 * - Solo mode: queries only the connected wallet's assemblies.
 * - Tribe mode: paginates through roster members (PAGE_SIZE at a time),
 *   with "load more" support. Caches aggressively (30min).
 */
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOperatingContext } from "./OperatingContext";
import {
  fetchAssembliesForWallet,
  type AssemblyData,
} from "./useCharacterAssemblies";
import { getFromCache, setCache, TTL } from "./cache";

const TRIBE_PAGE_SIZE = 25; // members per page
const CONCURRENCY = 3;

/** Fetch assemblies for a list of wallets, max `concurrency` at a time. */
async function fetchTribeAssemblies(addresses: string[]): Promise<AssemblyData[]> {
  const all: AssemblyData[] = [];

  for (let i = 0; i < addresses.length; i += CONCURRENCY) {
    const batch = addresses.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((addr) => fetchAssembliesForWallet(addr)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        all.push(...r.value);
      }
    }
  }

  return all;
}

function dedup(assemblies: AssemblyData[]): AssemblyData[] {
  const seen = new Set<string>();
  return assemblies.filter((a) => {
    if (!a.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

export function useScopedAssemblies() {
  const { mode, scopeAddress, tribeRoster, tribeLoading, tribe } =
    useOperatingContext();

  const [tribePageCount, setTribePageCount] = useState(1);

  // Solo mode — single wallet query
  const soloQuery = useQuery({
    queryKey: ["character-assemblies", scopeAddress],
    queryFn: () => fetchAssembliesForWallet(scopeAddress!),
    enabled: mode === "solo" && !!scopeAddress,
  });

  // Tribe mode — paginated member scanning
  const tribeId = tribe?.id;
  const memberAddresses =
    mode === "tribe"
      ? [...new Set(tribeRoster.map((m) => m.characterAddress).filter(Boolean))]
      : [];

  const membersToScan = memberAddresses.slice(0, tribePageCount * TRIBE_PAGE_SIZE);
  const hasMoreMembers = membersToScan.length < memberAddresses.length;

  const tribeQuery = useQuery({
    queryKey: ["tribe-assemblies", tribeId, membersToScan.length],
    queryFn: async (): Promise<AssemblyData[]> => {
      if (membersToScan.length === 0) return [];

      // Check tribe-level cache first (30min TTL)
      const cacheKey = `tribe-assemblies:${tribeId}:${membersToScan.length}`;
      const cached = await getFromCache<AssemblyData[]>(cacheKey, TTL.TRIBE_ASSEMBLIES);
      if (cached) {
        console.log(`[FrontierOps] Tribe assemblies from cache: ${cached.length} items`);
        return cached;
      }

      console.log(`[FrontierOps] Fetching assemblies for ${membersToScan.length}/${memberAddresses.length} tribe members...`);

      const results = await fetchTribeAssemblies(membersToScan);
      const unique = dedup(results);

      console.log(`[FrontierOps] Tribe assemblies complete: ${unique.length} total`);
      await setCache(cacheKey, unique);

      return unique;
    },
    enabled: mode === "tribe" && !tribeLoading && membersToScan.length > 0,
    staleTime: TTL.TRIBE_ASSEMBLIES,
  });

  const loadMoreMembers = useCallback(() => {
    setTribePageCount((p) => p + 1);
  }, []);

  if (mode === "solo") {
    return {
      ...soloQuery,
      hasMoreMembers: false,
      loadMoreMembers: () => {},
      scannedMembers: 0,
      totalMembers: 0,
    };
  }

  return {
    ...tribeQuery,
    hasMoreMembers,
    loadMoreMembers,
    scannedMembers: membersToScan.length,
    totalMembers: memberAddresses.length,
  };
}
