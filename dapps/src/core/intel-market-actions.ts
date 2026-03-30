/**
 * PTB builders for the intel_marketplace Move contract.
 * Supports encrypted Dead Drop payloads with sealed-key atomic reveal.
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

/**
 * Seller creates a new encrypted intel listing on-chain.
 * The encryption key is sealed in a dynamic field; only revealed on purchase.
 */
export function buildCreateListingTx(
  title: string,
  description: string,
  priceMist: bigint,
  visibility: ListingVisibility = 0,
  sellerTribe: string,
  encryptedPayload: Uint8Array,
  encryptionKey: Uint8Array,
  keyHash: Uint8Array,
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
      tx.pure.vector("u8", Array.from(encryptedPayload)),
      tx.pure.vector("u8", Array.from(encryptionKey)),
      tx.pure.vector("u8", Array.from(keyHash)),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Buyer purchases a listing by paying SUI. Key is revealed atomically. */
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

/** Seller cancels a listing (only while LISTED). Sealed key is destroyed. */
export function buildCancelListingTx(listingObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("cancel_listing"),
    arguments: [tx.object(listingObjectId)],
  });
  return tx;
}
