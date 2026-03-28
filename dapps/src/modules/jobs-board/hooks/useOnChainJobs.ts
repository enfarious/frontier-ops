/**
 * Hook for fetching on-chain Job objects with visibility filtering.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import {
  fetchOnChainJobs,
  invalidateJobCache,
  type OnChainJob,
} from "../../../core/job-escrow-queries";
import { parseVisibility, isVisibleTo } from "../../../core/visibility";

export function useOnChainJobs() {
  const [allJobs, setAllJobs] = useState<OnChainJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const account = useCurrentAccount();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchOnChainJobs();
      setAllJobs(all);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    invalidateJobCache();
    await load();
  }, [load]);

  // Load viewer context for visibility filtering
  const viewerContext = useMemo(() => {
    const address = account?.address;

    // Load tribe ID from cached character data
    let tribeId: number | undefined;
    try {
      const cached = localStorage.getItem("frontier-ops-tribe-id");
      if (cached) tribeId = Number(cached);
    } catch {}

    // Load friend addresses from contacts
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

  // Filter jobs by visibility
  const jobs = useMemo(() => {
    return allJobs.filter((job) => {
      const visibility = parseVisibility(job.description);
      return isVisibleTo(
        visibility,
        job.creator,
        viewerContext.address,
        viewerContext.tribeId,
        undefined, // We don't know creator's tribe from chain data alone
        viewerContext.friendAddresses,
      );
    });
  }, [allJobs, viewerContext]);

  return { jobs, loading, error, refresh };
}
