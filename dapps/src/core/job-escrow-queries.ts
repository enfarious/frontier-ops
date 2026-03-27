/**
 * Query on-chain Job objects from the job_escrow contract via GraphQL.
 * No backend needed — reads directly from Sui's indexer.
 */

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
const JOB_ESCROW_PKG = import.meta.env.VITE_JOB_ESCROW_PACKAGE_ID || "";
const JOB_TYPE = `${JOB_ESCROW_PKG}::job_escrow::Job`;

export interface OnChainJob {
  objectId: string;
  creator: string;
  worker: string;
  title: string;
  description: string;
  rewardMist: number;
  rewardSui: number;
  status: number;
  statusLabel: string;
  createdAtEpoch: number;
  competitive: boolean;
  contestants: string[];
}

const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Accepted",
  2: "Completed",
  3: "Paid",
  4: "Cancelled",
  5: "Disputed",
};

/** Decode a base64-encoded vector<u8> field to a UTF-8 string. */
function decodeVecU8(val: unknown): string {
  // GraphQL returns vector<u8> as a JSON array of numbers or as base64
  if (Array.isArray(val)) {
    return new TextDecoder().decode(new Uint8Array(val));
  }
  if (typeof val === "string") {
    // Try base64 decode
    try {
      const binary = atob(val);
      return binary;
    } catch {
      return val;
    }
  }
  return String(val ?? "");
}

/** Fetch all Job objects from chain. Caches for 30 seconds. */
let cache: { jobs: OnChainJob[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30_000;

export async function fetchOnChainJobs(): Promise<OnChainJob[]> {
  if (!JOB_ESCROW_PKG) return [];

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.jobs;
  }

  const query = `{
    objects(filter: { type: "${JOB_TYPE}" }, first: 50) {
      nodes {
        address
        asMoveObject {
          contents {
            json
          }
        }
      }
    }
  }`;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const nodes = data?.data?.objects?.nodes ?? [];

    const jobs: OnChainJob[] = nodes.map((node: any) => {
      const json = node.asMoveObject?.contents?.json ?? {};
      const status = Number(json.status ?? 0);
      const rewardMist = Number(json.reward ?? 0);

      return {
        objectId: node.address,
        creator: json.creator ?? "",
        worker: json.worker ?? "",
        title: decodeVecU8(json.title),
        description: decodeVecU8(json.description),
        rewardMist,
        rewardSui: rewardMist / 1_000_000_000,
        status,
        statusLabel: STATUS_LABELS[status] ?? `Unknown(${status})`,
        createdAtEpoch: Number(json.created_at ?? 0),
        competitive: json.competitive ?? false,
        contestants: Array.isArray(json.contestants) ? json.contestants : [],
      };
    });

    cache = { jobs, fetchedAt: Date.now() };
    console.log(`[JobEscrow] Fetched ${jobs.length} on-chain jobs`);
    return jobs;
  } catch (err) {
    console.error("[JobEscrow] Failed to fetch on-chain jobs:", err);
    return cache?.jobs ?? [];
  }
}

/** Invalidate the cache (call after a write transaction). */
export function invalidateJobCache() {
  cache = null;
}
