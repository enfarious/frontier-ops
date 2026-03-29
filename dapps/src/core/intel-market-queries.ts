/**
 * Query on-chain IntelListing objects from the intel_marketplace contract via GraphQL.
 */

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
const INTEL_PKG = import.meta.env.VITE_INTEL_MARKET_PACKAGE_ID || "";
const LISTING_TYPE = `${INTEL_PKG}::intel_marketplace::IntelListing`;

export interface OnChainListing {
  objectId: string;
  seller: string;
  buyer: string;
  title: string;
  description: string;
  priceMist: number;
  priceSui: number;
  rewardMist: number; // 0 after direct payment
  visibility: number; // 0=global, 1=tribe, 2=local
  sellerTribe: string;
  payload: string; // Dead Drop JSON (only revealed to buyer in UI)
  status: number;
  statusLabel: string;
  createdAt: number;
  purchasedAt: number;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Listed",
  1: "Sold",
  2: "Cancelled",
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

let cache: { listings: OnChainListing[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30_000;

export async function fetchOnChainListings(): Promise<OnChainListing[]> {
  if (!INTEL_PKG) return [];

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.listings;
  }

  const query = `{
    objects(filter: { type: "${LISTING_TYPE}" }, first: 50) {
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

    const listings: OnChainListing[] = nodes.map((node: any) => {
      const json = node.asMoveObject?.contents?.json ?? {};
      const status = Number(json.status ?? 0);
      const priceMist = Number(json.price_mist ?? 0);
      const rewardMist = Number(json.reward ?? 0);

      return {
        objectId: node.address,
        seller: json.seller ?? "",
        buyer: json.buyer ?? "",
        title: decodeVecU8(json.title),
        description: decodeVecU8(json.description),
        priceMist,
        priceSui: priceMist / 1_000_000_000,
        rewardMist,
        visibility: Number(json.visibility ?? 0),
        sellerTribe: decodeVecU8(json.seller_tribe),
        payload: decodeVecU8(json.payload),
        status,
        statusLabel: STATUS_LABELS[status] ?? `Unknown(${status})`,
        createdAt: Number(json.created_at ?? 0),
        purchasedAt: Number(json.purchased_at ?? 0),
      };
    });

    cache = { listings, fetchedAt: Date.now() };
    return listings;
  } catch (err) {
    console.error("[IntelMarket] Failed to fetch on-chain listings:", err);
    return cache?.listings ?? [];
  }
}

export function invalidateListingCache() {
  cache = null;
}
