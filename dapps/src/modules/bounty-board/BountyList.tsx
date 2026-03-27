import { useState } from "react";
import { Badge, Flex, SegmentedControl, Table, Text } from "@radix-ui/themes";
import type { EnrichedBounty } from "./hooks/useOnChainBounties";
import { BOUNTY_STATUS_OPTIONS } from "./bounty-types";

interface BountyListProps {
  bounties: EnrichedBounty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function statusColor(status: number) {
  return BOUNTY_STATUS_OPTIONS.find((s) => s.value === status)?.color ?? "gray";
}

function statusLabel(status: number) {
  return BOUNTY_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? `Status(${status})`;
}

type Filter = "all" | "active" | "pending" | "claimed";

export function BountyList({ bounties, selectedId, onSelect }: BountyListProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = bounties.filter((b) => {
    if (filter === "all") return true;
    if (filter === "active") return b.status === 0;
    if (filter === "pending") return b.status === 1;
    if (filter === "claimed") return b.status === 2;
    return true;
  });

  return (
    <Flex direction="column" gap="2">
      <SegmentedControl.Root
        value={filter}
        onValueChange={(v) => setFilter(v as Filter)}
        size="1"
      >
        <SegmentedControl.Item value="all">All</SegmentedControl.Item>
        <SegmentedControl.Item value="active">Active</SegmentedControl.Item>
        <SegmentedControl.Item value="pending">Pending</SegmentedControl.Item>
        <SegmentedControl.Item value="claimed">Claimed</SegmentedControl.Item>
      </SegmentedControl.Root>

      {filtered.length === 0 ? (
        <Flex align="center" justify="center" py="6">
          <Text color="gray" size="2">
            {bounties.length === 0
              ? "No bounties on-chain yet."
              : "No bounties match this filter."}
          </Text>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Target</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Reward</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filtered.map((bounty) => (
              <Table.Row
                key={bounty.objectId}
                onClick={() => onSelect(bounty.objectId)}
                style={{
                  cursor: "pointer",
                  backgroundColor:
                    bounty.objectId === selectedId
                      ? "var(--color-button-background)"
                      : undefined,
                }}
              >
                <Table.Cell>
                  <Flex align="center" gap="2">
                    <Text size="2" weight="bold" truncate style={{ maxWidth: 160 }}>
                      {bounty.title || bounty.target || "(untitled)"}
                    </Text>
                    {bounty.matchedKillmailId && bounty.status === 0 && (
                      <Badge color="red" size="1" variant="solid">KILL</Badge>
                    )}
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={statusColor(bounty.status)} size="1">
                    {statusLabel(bounty.status)}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="blue" weight="bold">
                    {bounty.rewardSui.toFixed(bounty.rewardSui < 1 ? 4 : 2)} SUI
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Flex>
  );
}
