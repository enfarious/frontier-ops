/**
 * PTB builders for the intel_marketplace Move contract.
 */
import { Transaction } from "@mysten/sui/transactions";

const INTEL_PKG = import.meta.env.VITE_INTEL_MARKET_PACKAGE_ID || "";
const MODULE = "intel_marketplace";
const CLOCK = "0x6"; // Sui system clock

function target(fn: string): `${string}::${string}::${string}` {
  return `${INTEL_PKG}::${MODULE}::${fn}`;
}

/** Visibility: 0=global, 1=tribe, 2=local */
export type ListingVisibility = 0 | 1 | 2;

/** Seller creates a new intel listing on-chain with embedded Dead Drop payload. */
export function buildCreateListingTx(
  title: string,
  description: string,
  priceMist: bigint,
  visibility: ListingVisibility = 0,
  sellerTribe = "",
  payloadJson = "",
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("create_listing"),
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(description))),
      tx.pure.u64(priceMist),
      tx.pure.u8(visibility),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(sellerTribe))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(payloadJson))),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Buyer purchases a listing by paying SUI. */
export function buildPurchaseListingTx(
  listingObjectId: string,
  priceMist: bigint,
): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);
  tx.moveCall({
    target: target("purchase_listing"),
    arguments: [
      tx.object(listingObjectId),
      coin,
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Seller cancels a listing (only while LISTED). */
export function buildCancelListingTx(listingObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("cancel_listing"),
    arguments: [tx.object(listingObjectId)],
  });
  return tx;
}
