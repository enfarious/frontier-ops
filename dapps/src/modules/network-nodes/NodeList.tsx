import { Badge, Flex, Table, Text } from "@radix-ui/themes";
import { LOW_FUEL_THRESHOLD } from "./constants";
import type { NodeListItem } from "./types";

interface NodeListProps {
  nodes: NodeListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function stateColor(state: string): "green" | "red" | "gray" {
  switch (state) {
    case "online":
      return "green";
    case "offline":
      return "red";
    default:
      return "gray";
  }
}

function fuelPct(node: NodeListItem): number {
  if (!node.fuelMaxCapacity || node.fuelMaxCapacity === 0) return 0;
  return Math.round(((node.fuelQuantity ?? 0) / node.fuelMaxCapacity) * 100);
}

export function NodeList({ nodes, selectedId, onSelect }: NodeListProps) {
  if (nodes.length === 0) {
    return (
      <Flex align="center" justify="center" py="6">
        <Text color="gray">No network nodes found for this address</Text>
      </Flex>
    );
  }

  return (
    <Table.Root variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Fuel %</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Energy %</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {nodes.map((node) => {
          const fuel = fuelPct(node);
          const isLowFuel = (node.fuelQuantity ?? 0) < LOW_FUEL_THRESHOLD;

          return (
            <Table.Row
              key={node.id}
              onClick={() => onSelect(node.id)}
              style={{
                cursor: "pointer",
                backgroundColor:
                  node.id === selectedId
                    ? "var(--color-button-background)"
                    : undefined,
              }}
            >
              <Table.Cell>
                <Text size="2">{node.name}</Text>
              </Table.Cell>
              <Table.Cell>
                <Badge color={stateColor(node.state)}>{node.state}</Badge>
              </Table.Cell>
              <Table.Cell>
                <Text size="2" color={isLowFuel ? "red" : undefined}>
                  {fuel}%
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="2">{node.energyUtilPct ?? 0}%</Text>
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table.Root>
  );
}
