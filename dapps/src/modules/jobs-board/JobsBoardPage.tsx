import { useCallback, useState } from "react";
import { Badge, Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { useOnChainJobs } from "./hooks/useOnChainJobs";
import { invalidateJobCache } from "../../core/job-escrow-queries";
import {
  buildCreateJobTx,
  buildCreateCompetitiveJobTx,
  buildAcceptJobTx,
  buildMarkCompleteTx,
  buildApproveAndPayTx,
  buildCancelJobTx,
} from "../../core/job-escrow-actions";
import { JobList } from "./JobList";
import { JobDetail } from "./JobDetail";
import { JobCreateDialog } from "./JobCreateDialog";

export default function JobsBoardPage() {
  const { jobs, loading, refresh } = useOnChainJobs();
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = jobs.find((j) => j.objectId === selectedId);

  /** Execute a PTB, wait for indexer, then refresh. */
  const exec = useCallback(
    async (tx: any) => {
      setIsPending(true);
      setError(null);
      try {
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        console.log("[JobsBoard] Transaction success:", result);
        invalidateJobCache();
        await new Promise((r) => setTimeout(r, 3000));
        await refresh();
        return result;
      } catch (e: any) {
        console.error("[JobsBoard] Transaction failed:", e);
        setError(e?.message || "Transaction failed");
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [dAppKit, refresh],
  );

  const handleCreate = useCallback(
    async (title: string, description: string, amountSui: number, competitive: boolean) => {
      const amountMist = BigInt(Math.round(amountSui * 1_000_000_000));
      const tx = competitive
        ? buildCreateCompetitiveJobTx(title, description, amountMist)
        : buildCreateJobTx(title, description, amountMist);
      await exec(tx);
    },
    [exec],
  );

  const handleAccept = useCallback(
    async (objectId: string) => {
      await exec(buildAcceptJobTx(objectId));
    },
    [exec],
  );

  const handleComplete = useCallback(
    async (objectId: string) => {
      await exec(buildMarkCompleteTx(objectId));
    },
    [exec],
  );

  const handleCancel = useCallback(
    async (objectId: string) => {
      await exec(buildCancelJobTx(objectId));
    },
    [exec],
  );

  const handleApprove = useCallback(
    async (objectId: string) => {
      await exec(buildApproveAndPayTx(objectId));
    },
    [exec],
  );

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Heading size="5">Jobs Board</Heading>
        <Flex align="center" gap="3">
          {isPending && <Badge color="orange" size="1">Tx pending...</Badge>}
          {loading && <Badge color="gray" size="1">Loading...</Badge>}
          <Text size="1" color="gray">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} on-chain
          </Text>
          <Button size="1" variant="ghost" onClick={refresh} disabled={isPending || loading}>
            <ReloadIcon />
          </Button>
          {account && (
            <Button size="1" variant="soft" onClick={() => setShowCreate(true)} disabled={isPending}>
              <PlusIcon /> Create Job
            </Button>
          )}
        </Flex>
      </Flex>

      <Flex gap="4" style={{ flex: 1, overflow: "hidden" }}>
        <Box style={{ width: "40%", minWidth: 280, overflow: "auto" }}>
          <JobList
            jobs={jobs}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Box>

        <Box style={{ flex: 1, overflow: "auto" }}>
          {selected ? (
            <JobDetail
              job={selected}
              onAccept={handleAccept}
              onComplete={handleComplete}
              onCancel={handleCancel}
              onApprove={handleApprove}
              isPending={isPending}
              error={error}
            />
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray">Select a job or create a new one</Text>
            </Flex>
          )}
        </Box>
      </Flex>

      <JobCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={handleCreate}
      />
    </Flex>
  );
}
