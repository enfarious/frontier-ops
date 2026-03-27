/**
 * Hook for fetching on-chain Job objects.
 * Replaces the old SQLite-based useJobs hook.
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchOnChainJobs,
  invalidateJobCache,
  type OnChainJob,
} from "../../../core/job-escrow-queries";

export function useOnChainJobs() {
  const [jobs, setJobs] = useState<OnChainJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchOnChainJobs();
      setJobs(all);
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

  return { jobs, loading, error, refresh };
}
