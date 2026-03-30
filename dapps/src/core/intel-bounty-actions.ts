/**
 * PTB builders for the intel_bounty Move contract.
 * Supports escrowed bounties with sealed-key fulfillment.
 */
import { Transaction } from "@mysten/sui/transactions";

const BOUNTY_PKG = import.meta.env.VITE_INTEL_BOUNTY_PACKAGE_ID || "";
const MODULE = "intel_bounty";
const CLOCK = "0x6";

function target(fn: string): `${string}::${string}::${string}` {
  return `${BOUNTY_PKG}::${MODULE}::${fn}`;
}

/** Bounty category: 0=general, 1=gate, 2=asset, 3=fleet, 4=player */
export type BountyCategory = 0 | 1 | 2 | 3 | 4;

export const BOUNTY_CATEGORY_LABELS: Record<BountyCategory, string> = {
  0: "General",
  1: "Gate Intel",
  2: "Asset Recon",
  3: "Fleet Intel",
  4: "Player Intel",
};

/** Poster creates a bounty with escrowed SUI reward. */
export function buildCreateBountyTx(
  title: string,
  description: string,
  category: BountyCategory,
  targetSystem: string,
  targetTribe: string,
  rewardMist: bigint,
  expiresAt: number,
): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(rewardMist)]);
  tx.moveCall({
    target: target("create_bounty"),
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(description))),
      tx.pure.u8(category),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(targetSystem))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(targetTribe))),
      coin,
      tx.pure.u64(expiresAt),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Hunter submits a fulfillment with teaser + encrypted payload + sealed key. */
export function buildSubmitFulfillmentTx(
  bountyObjectId: string,
  teaser: string,
  encryptedPayload: Uint8Array,
  encryptionKey: Uint8Array,
  keyHash: Uint8Array,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("submit_fulfillment"),
    arguments: [
      tx.object(bountyObjectId),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(teaser))),
      tx.pure.vector("u8", Array.from(encryptedPayload)),
      tx.pure.vector("u8", Array.from(encryptionKey)),
      tx.pure.vector("u8", Array.from(keyHash)),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Poster accepts fulfillment — releases escrow, reveals key. */
export function buildAcceptFulfillmentTx(bountyObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("accept_fulfillment"),
    arguments: [
      tx.object(bountyObjectId),
      tx.object(CLOCK),
    ],
  });
  return tx;
}

/** Poster rejects fulfillment — bounty reopens, sealed key destroyed. */
export function buildRejectFulfillmentTx(bountyObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("reject_fulfillment"),
    arguments: [tx.object(bountyObjectId)],
  });
  return tx;
}

/** Poster cancels an open bounty and reclaims escrow. */
export function buildCancelBountyTx(bountyObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("cancel_bounty"),
    arguments: [tx.object(bountyObjectId)],
  });
  return tx;
}
