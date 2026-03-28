import { Badge, Button, Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { OnChainJob } from "../../core/job-escrow-queries";
import { JOB_STATUS_OPTIONS } from "./jobs-types";
import { parseVisibility, stripVisibility } from "../../core/visibility";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000000000000000000000000000";

function addr(a: string) {
  return `${a.slice(0, 10)}...${a.slice(-6)}`;
}

interface JobDetailProps {
  job: OnChainJob;
  onAccept: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onApprove: (id: string) => void;
  isPending?: boolean;
  error?: string | null;
}

export function JobDetail({
  job,
  onAccept,
  onComplete,
  onCancel,
  onApprove,
  isPending,
  error,
}: JobDetailProps) {
  const account = useCurrentAccount();
  const isCreator = account?.address === job.creator;
  const isWorker = account?.address === job.worker;
  const isUnassigned = job.worker === ZERO_ADDR;
  const isContestant =
    job.competitive && account?.address
      ? job.contestants.includes(account.address)
      : false;

  const statusOpt = JOB_STATUS_OPTIONS.find((s) => s.value === job.status);
  const visibility = parseVisibility(job.description);
  const cleanDescription = stripVisibility(job.description);

  return (
    <Flex direction="column" gap="4">
      <Card>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center">
            <Flex align="center" gap="2">
              <Heading size="3">{job.title || "(untitled)"}</Heading>
              <Badge color="blue" size="1" variant="surface">On-Chain Escrow</Badge>
              {job.competitive && (
                <Badge color="orange" size="1" variant="surface">Competitive</Badge>
              )}
              {visibility !== "public" && (
                <Badge color={visibility === "tribe" ? "blue" : "orange"} size="1" variant="soft">
                  {visibility === "tribe" ? "Tribe" : "Friends"}
                </Badge>
              )}
            </Flex>
            <Badge color={statusOpt?.color ?? "gray"} size="2">
              {statusOpt?.label ?? `Status(${job.status})`}
            </Badge>
          </Flex>
          <Separator size="4" />

          {cleanDescription && (
            <Text size="2" style={{ whiteSpace: "pre-wrap" }}>
              {cleanDescription}
            </Text>
          )}
          {!cleanDescription && (
            <Text size="2" color="gray">No description.</Text>
          )}

          <Flex gap="4" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Reward</Text>
              <Text size="2" weight="bold" color="blue">
                {job.rewardSui.toFixed(job.rewardSui < 1 ? 4 : 2)} SUI
              </Text>
            </Flex>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Mode</Text>
              <Text size="2">{job.competitive ? "Race (Competitive)" : "Assigned"}</Text>
            </Flex>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Creator</Text>
              <Text size="2" style={{ fontFamily: "monospace" }}>{addr(job.creator)}</Text>
            </Flex>
          </Flex>

          {/* Assigned mode: show worker */}
          {!job.competitive && !isUnassigned && (
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Worker</Text>
              <Text size="2" style={{ fontFamily: "monospace" }}>
                {addr(job.worker)}
                {isWorker ? " (You)" : ""}
              </Text>
            </Flex>
          )}

          {/* Competitive: show contestants */}
          {job.competitive && job.contestants.length > 0 && (
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">
                Contestants ({job.contestants.length})
              </Text>
              {job.contestants.map((c) => (
                <Flex key={c} align="center" gap="1">
                  <Text size="1" style={{ fontFamily: "monospace" }}>
                    {addr(c)}
                  </Text>
                  {c === account?.address && <Badge size="1" color="green">You</Badge>}
                  {c === job.worker && job.status >= 2 && <Badge size="1" color="blue">Winner</Badge>}
                </Flex>
              ))}
            </Flex>
          )}

          {/* Competitive winner */}
          {job.competitive && !isUnassigned && job.status >= 2 && (
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">Winner</Text>
              <Text size="2" weight="bold" style={{ fontFamily: "monospace" }}>
                {addr(job.worker)}{isWorker ? " (You)" : ""}
              </Text>
            </Flex>
          )}

          {/* Object ID */}
          <Flex gap="1" align="center">
            <Text size="1" color="gray">Object:</Text>
            <Text size="1" style={{ fontFamily: "monospace" }}>
              {addr(job.objectId)}
            </Text>
          </Flex>

          {/* Actions */}
          <Flex gap="2" mt="2" wrap="wrap">
            {/* Assigned: Accept Job */}
            {job.status === 0 && account && !job.competitive && (
              <Button
                size="1"
                variant="soft"
                onClick={() => onAccept(job.objectId)}
                disabled={isPending}
              >
                {isCreator ? "Self-Assign" : "Accept Job"}
              </Button>
            )}

            {/* Competitive: Join Race */}
            {job.status === 0 && account && job.competitive && !isContestant && (
              <Button
                size="1"
                variant="soft"
                color="orange"
                onClick={() => onAccept(job.objectId)}
                disabled={isPending}
              >
                Join Race
              </Button>
            )}

            {/* Competitive: already joined */}
            {job.status === 0 && job.competitive && isContestant && (
              <Badge size="2" color="green">Joined</Badge>
            )}

            {/* Assigned: Mark Complete */}
            {job.status === 1 && !job.competitive && isWorker && (
              <Button
                size="1"
                variant="soft"
                color="green"
                onClick={() => onComplete(job.objectId)}
                disabled={isPending}
              >
                Mark Complete
              </Button>
            )}

            {/* Competitive: Deliver & Win */}
            {job.status === 0 && job.competitive && isContestant && (
              <Button
                size="1"
                variant="soft"
                color="green"
                onClick={() => onComplete(job.objectId)}
                disabled={isPending}
              >
                Deliver & Win
              </Button>
            )}

            {/* Approve & Pay */}
            {job.status === 2 && isCreator && (
              <Button
                size="1"
                variant="solid"
                color="green"
                onClick={() => onApprove(job.objectId)}
                disabled={isPending}
              >
                Approve & Pay ({job.rewardSui.toFixed(2)} SUI)
              </Button>
            )}

            {/* Cancel (only open jobs, only creator) */}
            {job.status === 0 && isCreator && (
              <Button
                size="1"
                variant="soft"
                color="red"
                onClick={() => onCancel(job.objectId)}
                disabled={isPending}
              >
                Cancel (Refund)
              </Button>
            )}
          </Flex>

          {error && (
            <Text size="1" color="red" style={{ whiteSpace: "pre-wrap" }}>
              {error}
            </Text>
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
