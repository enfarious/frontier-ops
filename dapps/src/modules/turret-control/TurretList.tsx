import { Badge, Flex, Table, Text, Tooltip } from "@radix-ui/themes";
import { TURRET_TYPE_INFO } from "../../core/assembly-type-ids";
import type { TurretData } from "./turret-types";

interface TurretListProps {
  turrets: TurretData[];
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

export function TurretList({ turrets, selectedId, onSelect }: TurretListProps) {
  if (turrets.length === 0) {
    return (
      <Flex align="center" justify="center" py="6">
        <Text color="gray">No turrets found for this address</Text>
      </Flex>
    );
  }

  return (
    <Table.Root variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Owner</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {turrets.map((turret) => {
          const typeInfo = TURRET_TYPE_INFO[Number(turret.typeId)] ?? { name: "Unknown", effectiveAgainst: "" };
          return (
            <Table.Row
              key={turret.id}
              onClick={() => onSelect(turret.id)}
              style={{
                cursor: "pointer",
                backgroundColor:
                  turret.id === selectedId
                    ? "var(--color-button-background)"
                    : undefined,
              }}
            >
              <Table.Cell>
                <Text size="2">{turret.name}</Text>
              </Table.Cell>
              <Table.Cell>
                <Tooltip content={typeInfo.effectiveAgainst ? `Effective vs: ${typeInfo.effectiveAgainst}` : "General purpose"}>
                  <Badge size="1" variant="soft" color="blue">{typeInfo.name}</Badge>
                </Tooltip>
              </Table.Cell>
              <Table.Cell>
                <Badge color={stateColor(turret.state)}>{turret.state}</Badge>
              </Table.Cell>
              <Table.Cell>
                <Text size="1" color="gray">
                  {turret.ownerName ?? turret.ownerId.slice(0, 10) + "..."}
                </Text>
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table.Root>
  );
}
