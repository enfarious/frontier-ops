/**
 * Hook for on-chain job escrow operations.
 * Wraps PTB builders with wallet sign+execute and syncs results to local DB.
 */
import { useCallback, useState } from "react";
import { useDAppKit } from "@mysten/dapp-kit-react";
import {
  buildCreateJobTx,
  buildAcceptJobTx,
  buildMarkCompleteTx,
  buildApproveAndPayTx,
  buildCancelJobTx,
  buildDisputeTx,
} from "../../../core/job-escrow-actions";

export function useJobEscrow() {
  const dAppKit = useDAppKit();
  const [isPending, setIsPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const exec = useCallback(
    async (tx: any) => {
      setIsPending(true);
      setLastError(null);
      try {
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        console.log("[JobEscrow] Transaction success:", result);
        return result;
      } catch (e: any) {
        console.error("[JobEscrow] Transaction failed:", e);
        const msg = e?.message || "Transaction failed";
        setLastError(msg);
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit],
  );

  /** Create an on-chain escrowed job. Returns the transaction result (contains created object ID). */
  const createEscrowJob = useCallback(
    async (title: string, description: string, amountSui: number) => {
      const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
      const tx = buildCreateJobTx(title, description, amountMist);
      const result = await exec(tx);
      // Extract created object ID from transaction effects
      const createdId = extractCreatedObjectId(result);
      return { result, onChainId: createdId };
    },
    [exec],
  );

  const acceptEscrowJob = useCallback(
    async (jobObjectId: string) => {
      const tx = buildAcceptJobTx(jobObjectId);
      return exec(tx);
    },
    [exec],
  );

  const markCompleteEscrow = useCallback(
    async (jobObjectId: string) => {
      const tx = buildMarkCompleteTx(jobObjectId);
      return exec(tx);
    },
    [exec],
  );

  const approveAndPay = useCallback(
    async (jobObjectId: string) => {
      const tx = buildApproveAndPayTx(jobObjectId);
      return exec(tx);
    },
    [exec],
  );

  const cancelEscrowJob = useCallback(
    async (jobObjectId: string) => {
      const tx = buildCancelJobTx(jobObjectId);
      return exec(tx);
    },
    [exec],
  );

  const disputeEscrowJob = useCallback(
    async (jobObjectId: string) => {
      const tx = buildDisputeTx(jobObjectId);
      return exec(tx);
    },
    [exec],
  );

  return {
    createEscrowJob,
    acceptEscrowJob,
    markCompleteEscrow,
    approveAndPay,
    cancelEscrowJob,
    disputeEscrowJob,
    isPending,
    lastError,
  };
}

/** Pull the first created object ID from transaction effects. */
function extractCreatedObjectId(result: any): string | null {
  try {
    // dapp-kit returns { effects } with created objects
    const created = result?.effects?.created;
    if (Array.isArray(created) && created.length > 0) {
      return created[0].reference?.objectId ?? created[0].objectId ?? null;
    }
    // Fallback: check objectChanges
    const changes = result?.objectChanges;
    if (Array.isArray(changes)) {
      const c = changes.find((ch: any) => ch.type === "created");
      if (c) return c.objectId ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
