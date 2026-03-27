import { Badge, Flex, Table, Text } from "@radix-ui/themes";
import type { GateData } from "./gate-types";

interface GateListProps {
  gates: GateData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function stateColor(state: string): "green" | "red" | "orange" | "gray" {
  switch (state) {
    case "online":
      return "green";
    case "anchored":
      return "orange";
    case "offline":
    case "unanchored":
      return "red";
    default:
      return "gray";
  }
}

export function GateList({ gates, selectedId, onSelect }: GateListProps) {
  if (gates.length === 0) {
    return (
      <Flex align="center" justify="center" py="6">
        <Text color="gray">No gates found for this address</Text>
      </Flex>
    );
  }

  return (
    <Table.Root variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Owner</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {gates.map((gate) => (
          <Table.Row
            key={gate.id}
            onClick={() => onSelect(gate.id)}
            style={{
              cursor: "pointer",
              backgroundColor:
                gate.id === selectedId
                  ? "var(--color-button-background)"
                  : undefined,
            }}
          >
            <Table.Cell>
              <Text size="2">{gate.name}</Text>
            </Table.Cell>
            <Table.Cell>
              <Badge color={stateColor(gate.state)}>{gate.state}</Badge>
            </Table.Cell>
            <Table.Cell>
              <Text size="1" color="gray">
                {gate.ownerName ?? gate.ownerId.slice(0, 10) + "..."}
              </Text>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}
