/**
 * Hook for fetching on-chain Bounty objects with killmail enrichment
 * and visibility filtering.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import {
  fetchOnChainBounties,
  invalidateBountyCache,
  type OnChainBounty,
} from "../../../core/bounty-escrow-queries";
import { useKillmails } from "../../danger-alerts/hooks/useKillmails";
import { parseVisibility, isVisibleTo } from "../../../core/visibility";

export interface EnrichedBounty extends OnChainBounty {
  /** Auto-detected killmail matching the target */
  matchedKillmailId?: string;
}

export function useOnChainBounties() {
  const [allBounties, setAllBounties] = useState<OnChainBounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: killmails } = useKillmails();
  const account = useCurrentAccount();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchOnChainBounties();
      setAllBounties(all);
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

  // Load viewer context for visibility filtering
  const viewerContext = useMemo(() => {
    const address = account?.address;

    let tribeId: number | undefined;
    try {
      const cached = localStorage.getItem("frontier-ops-tribe-id");
      if (cached) tribeId = Number(cached);
    } catch {}

    const friendAddresses = new Set<string>();
    try {
      const contacts = localStorage.getItem("frontier-ops-contacts");
      if (contacts) {
        for (const c of JSON.parse(contacts)) {
          if (c.standing === "friendly" && c.address) {
            friendAddresses.add(c.address);
          }
        }
      }
    } catch {}

    return { address, tribeId, friendAddresses };
  }, [account?.address]);

  // Filter by visibility, then enrich with killmail matches
  const bounties: EnrichedBounty[] = useMemo(() => {
    const visible = allBounties.filter((bounty) => {
      const visibility = parseVisibility(bounty.description);
      return isVisibleTo(
        visibility,
        bounty.creator,
        viewerContext.address,
        viewerContext.tribeId,
        undefined,
        viewerContext.friendAddresses,
      );
    });

    if (!killmails?.length) return visible;

    return visible.map((b) => {
      if (b.status !== 0) return b;
      const match = killmails.find(
        (km) =>
          km.victimId === b.target ||
          km.victimAddress === b.target ||
          km.victimName === b.target,
      );
      return match ? { ...b, matchedKillmailId: match.id } : b;
    });
  }, [allBounties, killmails, viewerContext]);

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

  return { bounties, loading, error, refresh, killmails, getMatchingKillmails };
}
