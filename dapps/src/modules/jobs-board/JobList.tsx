import { useState } from "react";
import { Badge, Flex, SegmentedControl, Table, Text } from "@radix-ui/themes";
import type { OnChainJob } from "../../core/job-escrow-queries";
import { JOB_STATUS_OPTIONS } from "./jobs-types";

interface JobListProps {
  jobs: OnChainJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function statusColor(status: number) {
  return JOB_STATUS_OPTIONS.find((s) => s.value === status)?.color ?? "gray";
}

function statusLabel(status: number) {
  return JOB_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? `Status(${status})`;
}

type Filter = "all" | "open" | "active" | "done";

export function JobList({ jobs, selectedId, onSelect }: JobListProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = jobs.filter((j) => {
    if (filter === "all") return true;
    if (filter === "open") return j.status === 0;
    if (filter === "active") return j.status === 1;
    if (filter === "done") return j.status === 2 || j.status === 3;
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
        <SegmentedControl.Item value="open">Open</SegmentedControl.Item>
        <SegmentedControl.Item value="active">Active</SegmentedControl.Item>
        <SegmentedControl.Item value="done">Done</SegmentedControl.Item>
      </SegmentedControl.Root>

      {filtered.length === 0 ? (
        <Flex align="center" justify="center" py="6">
          <Text color="gray" size="2">
            {jobs.length === 0
              ? "No jobs on-chain yet."
              : "No jobs match this filter."}
          </Text>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Reward</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filtered.map((job) => (
              <Table.Row
                key={job.objectId}
                onClick={() => onSelect(job.objectId)}
                style={{
                  cursor: "pointer",
                  backgroundColor:
                    job.objectId === selectedId
                      ? "var(--color-button-background)"
                      : undefined,
                }}
              >
                <Table.Cell>
                  <Flex align="center" gap="1">
                    <Text size="2" truncate style={{ maxWidth: 180 }}>{job.title || "(untitled)"}</Text>
                    {job.competitive && (
                      <Badge color="orange" size="1" variant="surface">
                        {job.contestants.length > 0 ? `${job.contestants.length} racing` : "Race"}
                      </Badge>
                    )}
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={statusColor(job.status)} size="1">
                    {statusLabel(job.status)}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="blue" weight="bold">
                    {job.rewardSui.toFixed(job.rewardSui < 1 ? 4 : 2)} SUI
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
