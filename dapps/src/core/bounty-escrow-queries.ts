/**
 * Query on-chain Bounty objects from the bounty_escrow contract via GraphQL.
 */

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
const BOUNTY_ESCROW_PKG = import.meta.env.VITE_BOUNTY_ESCROW_PACKAGE_ID || "";
const BOUNTY_TYPE = `${BOUNTY_ESCROW_PKG}::bounty_escrow::Bounty`;

export interface OnChainBounty {
  objectId: string;
  creator: string;
  hunter: string;
  title: string;
  description: string;
  target: string;
  proof: string;
  rewardMist: number;
  rewardSui: number;
  status: number;
  statusLabel: string;
  createdAtEpoch: number;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Active",
  1: "Pending",
  2: "Claimed",
  3: "Cancelled",
  4: "Expired",
};

function decodeVecU8(val: unknown): string {
  if (Array.isArray(val)) {
    return new TextDecoder().decode(new Uint8Array(val));
  }
  if (typeof val === "string") {
    try { return atob(val); } catch { return val; }
  }
  return String(val ?? "");
}

let cache: { bounties: OnChainBounty[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30_000;

export async function fetchOnChainBounties(): Promise<OnChainBounty[]> {
  if (!BOUNTY_ESCROW_PKG) return [];

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.bounties;
  }

  const query = `{
    objects(filter: { type: "${BOUNTY_TYPE}" }, first: 50) {
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

    const bounties: OnChainBounty[] = nodes.map((node: any) => {
      const json = node.asMoveObject?.contents?.json ?? {};
      const status = Number(json.status ?? 0);
      const rewardMist = Number(json.reward ?? 0);

      return {
        objectId: node.address,
        creator: json.creator ?? "",
        hunter: json.hunter ?? "",
        title: decodeVecU8(json.title),
        description: decodeVecU8(json.description),
        target: decodeVecU8(json.target),
        proof: decodeVecU8(json.proof),
        rewardMist,
        rewardSui: rewardMist / 1_000_000_000,
        status,
        statusLabel: STATUS_LABELS[status] ?? `Unknown(${status})`,
        createdAtEpoch: Number(json.created_at ?? 0),
      };
    });

    cache = { bounties, fetchedAt: Date.now() };
    console.log(`[BountyEscrow] Fetched ${bounties.length} on-chain bounties`);
    return bounties;
  } catch (err) {
    console.error("[BountyEscrow] Failed to fetch on-chain bounties:", err);
    return cache?.bounties ?? [];
  }
}

export function invalidateBountyCache() {
  cache = null;
}
