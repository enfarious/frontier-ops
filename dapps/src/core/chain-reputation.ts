/**
 * On-chain reputation sync — aggregates events from intel_marketplace
 * and intel_bounty contracts into a local cache.
 */

import { query, execute } from "./database";
import type { ChainReputation } from "./rating-types";

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";
const INTEL_PKG = import.meta.env.VITE_INTEL_MARKET_PACKAGE_ID || "";
const BOUNTY_PKG = import.meta.env.VITE_INTEL_BOUNTY_PACKAGE_ID || "";

const CACHE_TTL = 5 * 60_000; // 5 minutes

async function countEvents(eventType: string, field: string, address: string): Promise<number> {
  if (!eventType) return 0;

  const gql = `{
    events(filter: { eventType: "${eventType}" }, first: 50) {
      nodes { json }
    }
  }`;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: gql }),
    });
    const data = await res.json();
    const events = data?.data?.events?.nodes ?? [];
    return events.filter((e: any) => e.json?.[field] === address).length;
  } catch {
    return 0;
  }
}

/** Fetch reputation from chain events and cache locally. */
export async function syncReputation(address: string): Promise<ChainReputation> {
  // Check cache first
  const cached = await query<any>(
    "SELECT * FROM chain_reputation_cache WHERE address = $addr",
    { $addr: address },
  );
  if (cached.length > 0 && Date.now() - cached[0].last_synced_at < CACHE_TTL) {
    return rowToReputation(cached[0]);
  }

  // Query on-chain events
  const [
    totalSales,
    totalPurchases,
    totalBountiesPosted,
    fulfillmentsAccepted,
    fulfillmentsRejected,
  ] = await Promise.all([
    INTEL_PKG ? countEvents(`${INTEL_PKG}::intel_marketplace::ListingPurchased`, "seller", address) : 0,
    INTEL_PKG ? countEvents(`${INTEL_PKG}::intel_marketplace::ListingPurchased`, "buyer", address) : 0,
    BOUNTY_PKG ? countEvents(`${BOUNTY_PKG}::intel_bounty::BountyCreated`, "poster", address) : 0,
    BOUNTY_PKG ? countEvents(`${BOUNTY_PKG}::intel_bounty::FulfillmentAccepted`, "hunter", address) : 0,
    BOUNTY_PKG ? countEvents(`${BOUNTY_PKG}::intel_bounty::FulfillmentRejected`, "hunter", address) : 0,
  ]);

  // Count fulfillments submitted as bounty_fulfilled proxy
  const totalBountiesFulfilled = BOUNTY_PKG
    ? await countEvents(`${BOUNTY_PKG}::intel_bounty::FulfillmentSubmitted`, "hunter", address)
    : 0;

  const rep: ChainReputation = {
    address,
    totalSales,
    totalPurchases,
    totalBountiesPosted,
    totalBountiesFulfilled,
    fulfillmentsAccepted,
    fulfillmentsRejected,
    lastSyncedAt: Date.now(),
  };

  // Upsert cache
  await execute(
    `INSERT OR REPLACE INTO chain_reputation_cache
      (address, total_sales, total_purchases, total_bounties_posted,
       total_bounties_fulfilled, fulfillments_accepted, fulfillments_rejected, last_synced_at)
    VALUES ($addr, $sales, $purchases, $bposted, $bfulfilled, $accepted, $rejected, $synced)`,
    {
      $addr: address,
      $sales: totalSales,
      $purchases: totalPurchases,
      $bposted: totalBountiesPosted,
      $bfulfilled: totalBountiesFulfilled,
      $accepted: fulfillmentsAccepted,
      $rejected: fulfillmentsRejected,
      $synced: Date.now(),
    },
  );

  return rep;
}

/** Get cached reputation without syncing (instant, may be stale). */
export async function getCachedReputation(address: string): Promise<ChainReputation | null> {
  const rows = await query<any>(
    "SELECT * FROM chain_reputation_cache WHERE address = $addr",
    { $addr: address },
  );
  if (rows.length === 0) return null;
  return rowToReputation(rows[0]);
}

function rowToReputation(row: any): ChainReputation {
  return {
    address: row.address,
    totalSales: row.total_sales ?? 0,
    totalPurchases: row.total_purchases ?? 0,
    totalBountiesPosted: row.total_bounties_posted ?? 0,
    totalBountiesFulfilled: row.total_bounties_fulfilled ?? 0,
    fulfillmentsAccepted: row.fulfillments_accepted ?? 0,
    fulfillmentsRejected: row.fulfillments_rejected ?? 0,
    lastSyncedAt: row.last_synced_at ?? 0,
  };
}
