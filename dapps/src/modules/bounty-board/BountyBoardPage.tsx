import { useCallback, useState } from "react";
import { Badge, Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { useOnChainBounties } from "./hooks/useOnChainBounties";
import { invalidateBountyCache } from "../../core/bounty-escrow-queries";
import {
  buildCreateBountyTx,
  buildSubmitClaimTx,
  buildApproveClaimTx,
  buildRejectClaimTx,
  buildCancelBountyTx,
} from "../../core/bounty-escrow-actions";
import { BountyList } from "./BountyList";
import { BountyDetail } from "./BountyDetail";
import { BountyCreateDialog } from "./BountyCreateDialog";

export default function BountyBoardPage() {
  const { bounties, loading, refresh, killmails } = useOnChainBounties();
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = bounties.find((b) => b.objectId === selectedId);
  const activeBounties = bounties.filter((b) => b.status === 0);
  const pendingBounties = bounties.filter((b) => b.status === 1);
  const matchedBounties = bounties.filter((b) => b.status === 0 && b.matchedKillmailId);

  /** Execute a PTB, wait for indexer, then refresh. */
  const exec = useCallback(
    async (tx: any) => {
      setIsPending(true);
      setError(null);
      try {
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        console.log("[BountyBoard] Transaction success:", result);
        invalidateBountyCache();
        await new Promise((r) => setTimeout(r, 3000));
        await refresh();
        return result;
      } catch (e: any) {
        console.error("[BountyBoard] Transaction failed:", e);
        setError(e?.message || "Transaction failed");
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, refresh],
  );

  const handleCreate = useCallback(
    async (title: string, description: string, target: string, amountSui: number) => {
      const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
      const tx = buildCreateBountyTx(title, description, target, amountMist);
      await exec(tx);
    },
    [exec],
  );

  const handleSubmitClaim = useCallback(
    async (objectId: string, proof: string) => {
      await exec(buildSubmitClaimTx(objectId, proof));
    },
    [exec],
  );

  const handleApproveClaim = useCallback(
    async (objectId: string) => {
      await exec(buildApproveClaimTx(objectId));
    },
    [exec],
  );

  const handleRejectClaim = useCallback(
    async (objectId: string) => {
      await exec(buildRejectClaimTx(objectId));
    },
    [exec],
  );

  const handleCancel = useCallback(
    async (objectId: string) => {
      await exec(buildCancelBountyTx(objectId));
    },
    [exec],
  );

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Heading size="5">Bounty Board</Heading>
        <Flex align="center" gap="3">
          {isPending && <Badge color="orange" size="1">Tx pending...</Badge>}
          {matchedBounties.length > 0 && (
            <Badge color="red" size="1" variant="solid">
              {matchedBounties.length} kill detected
            </Badge>
          )}
          {pendingBounties.length > 0 && (
            <Badge color="orange" size="1" variant="solid">
              {pendingBounties.length} pending
            </Badge>
          )}
          <Text size="1" color="gray">
            {activeBounties.length} active / {bounties.length} total
          </Text>
          <Button size="1" variant="ghost" onClick={refresh} disabled={isPending || loading}>
            <ReloadIcon />
          </Button>
          {account && (
            <Button size="1" variant="soft" onClick={() => setShowCreate(true)} disabled={isPending}>
              <PlusIcon /> Post Bounty
            </Button>
          )}
        </Flex>
      </Flex>

      <Flex gap="4" style={{ flex: 1, overflow: "hidden" }}>
        <Box style={{ width: "40%", minWidth: 280, overflow: "auto" }}>
          <BountyList
            bounties={bounties}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Box>

        <Box style={{ flex: 1, overflow: "auto" }}>
          {selected ? (
            <BountyDetail
              bounty={selected}
              onSubmitClaim={handleSubmitClaim}
              onApproveClaim={handleApproveClaim}
              onRejectClaim={handleRejectClaim}
              onCancel={handleCancel}
              killmails={killmails ?? []}
              isPending={isPending}
              error={error}
            />
          ) : (
            <Flex align="center" justify="center" direction="column" gap="2" style={{ height: "100%" }}>
              <Text color="gray">Select a bounty or post a new one</Text>
              {bounties.length === 0 && (
                <Text size="1" color="gray">
                  Post a bounty to put a price on someone's head.
                  Kills are verified via on-chain killmails.
                </Text>
              )}
            </Flex>
          )}
        </Box>
      </Flex>

      <BountyCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={handleCreate}
      />
    </Flex>
  );
}
