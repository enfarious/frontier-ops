/**
 * Query on-chain IntelBounty objects and KeyRevealed events
 * from the intel_bounty contract via GraphQL.
 */

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
const BOUNTY_PKG = import.meta.env.VITE_INTEL_BOUNTY_PACKAGE_ID || "";
const BOUNTY_TYPE = `${BOUNTY_PKG}::intel_bounty::IntelBounty`;
const KEY_REVEALED_TYPE = `${BOUNTY_PKG}::intel_bounty::KeyRevealed`;

export interface OnChainBounty {
  objectId: string;
  poster: string;
  hunter: string;
  title: string;
  description: string;
  category: number;
  targetSystem: string;
  targetTribe: string;
  rewardMist: number;
  rewardSui: number;
  teaser: string;
  encryptedPayload: Uint8Array;
  keyHash: Uint8Array;
  status: number;
  statusLabel: string;
  createdAt: number;
  expiresAt: number;
  fulfilledAt: number;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Pending",
  2: "Completed",
  3: "Cancelled",
};

function decodeVecU8ToString(val: unknown): string {
  if (Array.isArray(val)) {
    return new TextDecoder().decode(new Uint8Array(val));
  }
  if (typeof val === "string") {
    try { return atob(val); } catch { return val; }
  }
  return String(val ?? "");
}

function decodeVecU8ToBytes(val: unknown): Uint8Array {
  if (Array.isArray(val)) {
    return new Uint8Array(val);
  }
  if (typeof val === "string") {
    try {
      const binary = atob(val);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch { /* fall through */ }
  }
  return new Uint8Array(0);
}

let cache: { bounties: OnChainBounty[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30_000;

export async function fetchOnChainBounties(): Promise<OnChainBounty[]> {
  if (!BOUNTY_PKG) return [];

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
      // Reward is a Balance, extract its value
      const rewardMist = Number(json.reward?.value ?? json.reward ?? 0);

      return {
        objectId: node.address,
        poster: json.poster ?? "",
        hunter: json.hunter ?? "",
        title: decodeVecU8ToString(json.title),
        description: decodeVecU8ToString(json.description),
        category: Number(json.category ?? 0),
        targetSystem: decodeVecU8ToString(json.target_system),
        targetTribe: decodeVecU8ToString(json.target_tribe),
        rewardMist,
        rewardSui: rewardMist / 1_000_000_000,
        teaser: decodeVecU8ToString(json.teaser),
        encryptedPayload: decodeVecU8ToBytes(json.encrypted_payload),
        keyHash: decodeVecU8ToBytes(json.key_hash),
        status,
        statusLabel: STATUS_LABELS[status] ?? `Unknown(${status})`,
        createdAt: Number(json.created_at ?? 0),
        expiresAt: Number(json.expires_at ?? 0),
        fulfilledAt: Number(json.fulfilled_at ?? 0),
      };
    });

    cache = { bounties, fetchedAt: Date.now() };
    return bounties;
  } catch (err) {
    console.error("[IntelBounty] Failed to fetch on-chain bounties:", err);
    return cache?.bounties ?? [];
  }
}

export function invalidateBountyCache() {
  cache = null;
}

/** Fetch the encryption key from a KeyRevealed event after acceptance. */
export async function fetchBountyKeyRevealedEvent(
  bountyId: string,
  posterAddress: string,
): Promise<Uint8Array | null> {
  if (!BOUNTY_PKG) return null;

  const query = `{
    events(
      filter: {
        eventType: "${KEY_REVEALED_TYPE}",
      },
      first: 20
    ) {
      nodes {
        json
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
    const events = data?.data?.events?.nodes ?? [];

    for (const ev of events) {
      const json = ev.json ?? {};
      if (json.bounty_id === bountyId && json.poster === posterAddress) {
        return decodeVecU8ToBytes(json.encryption_key);
      }
    }

    return null;
  } catch (err) {
    console.error("[IntelBounty] Failed to fetch KeyRevealed event:", err);
    return null;
  }
}
