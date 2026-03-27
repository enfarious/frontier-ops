import { Badge, Flex, Table, Text } from "@radix-ui/themes";
import type { StorageUnitData } from "./storage-types";

interface StorageListProps {
  units: StorageUnitData[];
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

export function StorageList({ units, selectedId, onSelect }: StorageListProps) {
  if (units.length === 0) {
    return (
      <Flex align="center" justify="center" py="6">
        <Text color="gray">No storage units found for this address</Text>
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
        {units.map((unit) => (
          <Table.Row
            key={unit.id}
            onClick={() => onSelect(unit.id)}
            style={{
              cursor: "pointer",
              backgroundColor:
                unit.id === selectedId
                  ? "var(--color-button-background)"
                  : undefined,
            }}
          >
            <Table.Cell>
              <Text size="2">{unit.name}</Text>
            </Table.Cell>
            <Table.Cell>
              <Badge color={stateColor(unit.state)}>{unit.state}</Badge>
            </Table.Cell>
            <Table.Cell>
              <Text size="1" color="gray">
                {unit.ownerName ?? unit.ownerId.slice(0, 10) + "..."}
              </Text>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}
