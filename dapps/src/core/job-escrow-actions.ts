/**
 * PTB builders for the job_escrow Move contract.
 *
 * Contract flow (assigned):
 *   create_job(title, description, payment: Coin<SUI>)
 *   accept_job(job)
 *   mark_complete(job)
 *   approve_and_pay(job, platform)
 *   cancel_job(job)
 *
 * Contract flow (competitive):
 *   create_competitive_job(title, description, payment: Coin<SUI>)
 *   accept_job(job)           — adds to contestants, stays Open
 *   mark_complete(job)        — first caller wins
 *   approve_and_pay(job, platform)
 *   withdraw_from_job(job)    — bow out of race
 *   cancel_job(job)
 */
import { Transaction } from "@mysten/sui/transactions";

const JOB_ESCROW_PKG = import.meta.env.VITE_JOB_ESCROW_PACKAGE_ID || "";
const JOB_PLATFORM_ID = import.meta.env.VITE_JOB_ESCROW_PLATFORM_ID || "";
const MODULE = "job_escrow";

function target(fn: string): `${string}::${string}::${string}` {
  return `${JOB_ESCROW_PKG}::${MODULE}::${fn}`;
}

/**
 * Create an assigned job (single worker) with SUI escrowed from the sender's gas coin.
 * @param amountMist reward in MIST (1 SUI = 1_000_000_000 MIST)
 */
export function buildCreateJobTx(
  title: string,
  description: string,
  amountMist: bigint,
): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.moveCall({
    target: target("create_job"),
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(description))),
      coin,
    ],
  });
  return tx;
}

/**
 * Create a competitive job (race mode) — multiple workers can accept,
 * first to mark_complete wins the reward.
 */
export function buildCreateCompetitiveJobTx(
  title: string,
  description: string,
  amountMist: bigint,
): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
  tx.moveCall({
    target: target("create_competitive_job"),
    arguments: [
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(description))),
      coin,
    ],
  });
  return tx;
}

/** Worker accepts a job (assigned: locks worker; competitive: joins race). */
export function buildAcceptJobTx(jobObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("accept_job"),
    arguments: [tx.object(jobObjectId)],
  });
  return tx;
}

/** Worker marks job as complete. In competitive mode, first caller wins. */
export function buildMarkCompleteTx(jobObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("mark_complete"),
    arguments: [tx.object(jobObjectId)],
  });
  return tx;
}

/** Creator approves work and releases escrow to worker (fee sent to platform treasury). */
export function buildApproveAndPayTx(jobObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("approve_and_pay"),
    arguments: [tx.object(jobObjectId), tx.object(JOB_PLATFORM_ID)],
  });
  return tx;
}

/** Creator cancels an open job and reclaims escrowed SUI. */
export function buildCancelJobTx(jobObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("cancel_job"),
    arguments: [tx.object(jobObjectId)],
  });
  return tx;
}

/** Contestant withdraws from a competitive job before completion. */
export function buildWithdrawFromJobTx(jobObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("withdraw_from_job"),
    arguments: [tx.object(jobObjectId)],
  });
  return tx;
}

/** Either party flags a dispute. */
export function buildDisputeTx(jobObjectId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target("dispute"),
    arguments: [tx.object(jobObjectId)],
  });
  return tx;
}
