/**
 * PTB builders for the bounty_escrow Move contract.
 */
import { Transaction } from "@mysten/sui/transactions";

const BOUNTY_ESCROW_PKG = import.meta.env.VITE_BOUNTY_ESCROW_PACKAGE_ID || "";
const BOUNTY_PLATFORM_ID = import.meta.env.VITE_BOUNTY_ESCROW_PLATFORM_ID || "";
const MODULE = "bounty_escrow";

function target(fn: string): `${string}::${string}::${string}` {
  return `${BOUNTY_ESCROW_PKG}::${MODULE}::${fn}`;
}

/** Create a bounty with SUI escrowed from the sender's gas coin. */
export function buildCreateBountyTx(
  title: string,
  description: string,
  targetInfo: string,
  amountMist: bigint,
): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.moveCall({
    target: target("create_bounty"),
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(description))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(targetInfo))),
      coin,
    ],
  });
  return tx;
}

/** Hunter submits a claim with proof. */
export function buildSubmitClaimTx(bountyObjectId: string, proof: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("submit_claim"),
    arguments: [
      tx.object(bountyObjectId),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(proof))),
    ],
  });
  return tx;
}

/** Creator approves claim, releasing escrow to hunter (fee sent to platform treasury). */
export function buildApproveClaimTx(bountyObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("approve_claim"),
    arguments: [tx.object(bountyObjectId), tx.object(BOUNTY_PLATFORM_ID)],
  });
  return tx;
}

/** Creator rejects a pending claim, re-opening the bounty. */
export function buildRejectClaimTx(bountyObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("reject_claim"),
    arguments: [tx.object(bountyObjectId)],
  });
  return tx;
}

/** Creator cancels an active bounty and reclaims SUI. */
export function buildCancelBountyTx(bountyObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("cancel_bounty"),
    arguments: [tx.object(bountyObjectId)],
  });
  return tx;
}
