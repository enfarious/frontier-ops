/**
 * Hook for fetching on-chain Bounty objects with killmail enrichment.
 * Replaces the old SQLite-based useBounties hook.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOnChainBounties,
  invalidateBountyCache,
  type OnChainBounty,
} from "../../../core/bounty-escrow-queries";
import { useKillmails } from "../../danger-alerts/hooks/useKillmails";

export interface EnrichedBounty extends OnChainBounty {
  /** Auto-detected killmail matching the target */
  matchedKillmailId?: string;
}

export function useOnChainBounties() {
  const [bounties, setBounties] = useState<OnChainBounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: killmails } = useKillmails();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchOnChainBounties();
      setBounties(all);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch bounties");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    invalidateBountyCache();
    await load();
  }, [load]);

  // Enrich bounties with killmail matches
  const enriched: EnrichedBounty[] = useMemo(() => {
    if (!killmails?.length) return bounties;

    return bounties.map((b) => {
      if (b.status !== 0) return b; // only match active bounties

      const match = killmails.find(
        (km) =>
          km.victimId === b.target ||
          km.victimAddress === b.target ||
          km.victimName === b.target,
      );

      return match ? { ...b, matchedKillmailId: match.id } : b;
    });
  }, [bounties, killmails]);

  // Matching killmails for a specific target
  const getMatchingKillmails = useCallback(
    (target: string) => {
      if (!killmails?.length) return [];
      return killmails.filter(
        (km) =>
          km.victimId === target ||
          km.victimAddress === target ||
          km.victimName === target,
      );
    },
    [killmails],
  );

  return { bounties: enriched, loading, error, refresh, killmails, getMatchingKillmails };
}
