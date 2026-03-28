import { Badge, Flex, Table, Text } from "@radix-ui/themes";
import type { TribeConflict } from "../../../core/intel-types";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  conflicts: TribeConflict[];
}

export function TribesTab({ conflicts }: Props) {
  if (conflicts.length === 0) {
    return <Text size="2" color="gray">No inter-tribe conflicts detected in killmail data.</Text>;
  }

  return (
    <Flex direction="column" gap="3">
      <Text size="1" color="gray">{conflicts.length} tribe conflicts detected</Text>

      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Tribe A</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>vs</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Tribe B</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>A Kills</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>B Kills</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Total</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Last Fight</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {conflicts.map((c) => {
              const winner = c.killsByA > c.killsByB ? "A" : c.killsByB > c.killsByA ? "B" : null;
              return (
                <Table.Row key={`${c.tribeA}|${c.tribeB}`}>
                  <Table.Cell>
                    <Badge variant="soft" color={winner === "A" ? "green" : "orange"} size="1">
                      {c.tribeA}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="1" color="gray">vs</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant="soft" color={winner === "B" ? "green" : "orange"} size="1">
                      {c.tribeB}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" weight={winner === "A" ? "bold" : "regular"} color={winner === "A" ? "green" : undefined}>
                      {c.killsByA}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" weight={winner === "B" ? "bold" : "regular"} color={winner === "B" ? "green" : undefined}>
                      {c.killsByB}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" weight="bold">{c.totalEngagements}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="1" color="gray">{timeAgo(c.lastEngagement)}</Text>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </div>
    </Flex>
  );
}
