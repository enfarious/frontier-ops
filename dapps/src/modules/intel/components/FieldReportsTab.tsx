import { useState } from "react";
import { Badge, Card, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import { TrashIcon } from "@radix-ui/react-icons";
import type { FieldReport, FieldReportType } from "../../../core/intel-types";
import { threatColor } from "./PlayerDossier";
import { FieldReportForm } from "./FieldReportForm";

function typeColor(type: FieldReportType): "gray" | "blue" | "orange" {
  switch (type) {
    case "system_note": return "gray";
    case "player_sighting": return "blue";
    case "spotted_assembly": return "orange";
  }
}

function typeLabel(type: FieldReportType): string {
  switch (type) {
    case "system_note": return "System Note";
    case "player_sighting": return "Player Sighting";
    case "spotted_assembly": return "Spotted Assembly";
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  reports: FieldReport[];
  systemNames: string[];
  onAdd: (report: Omit<FieldReport, "id" | "reportedAt">) => void;
  onRemove: (id: string) => void;
}

export function FieldReportsTab({ reports, systemNames, onAdd, onRemove }: Props) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? reports
    : reports.filter((r) => r.type === filter);

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center">
        <SegmentedControl.Root value={filter} onValueChange={setFilter} size="1">
          <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          <SegmentedControl.Item value="system_note">Systems</SegmentedControl.Item>
          <SegmentedControl.Item value="player_sighting">Players</SegmentedControl.Item>
          <SegmentedControl.Item value="spotted_assembly">Assemblies</SegmentedControl.Item>
        </SegmentedControl.Root>
        <FieldReportForm onSubmit={onAdd} systemNames={systemNames} />
      </Flex>

      <Text size="1" color="gray">{filtered.length} reports</Text>

      {filtered.length === 0 && (
        <Text size="2" color="gray">No field reports yet. Use "New Report" to log observations.</Text>
      )}

      <Flex direction="column" gap="2" style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
        {filtered.map((r) => (
          <Card key={r.id} style={{ borderLeft: `3px solid var(--${threatColor(r.threatLevel)}-9)` }}>
            <Flex justify="between" align="start">
              <Flex direction="column" gap="1" style={{ flex: 1 }}>
                <Flex gap="2" align="center">
                  <Badge size="1" variant="soft" color={typeColor(r.type)}>
                    {typeLabel(r.type)}
                  </Badge>
                  <Badge size="1" variant="soft" color={threatColor(r.threatLevel)}>
                    {r.threatLevel}
                  </Badge>
                </Flex>
                <Text size="2" weight="bold">{r.title}</Text>
                {r.notes && (
                  <Text size="1" color="gray" style={{ whiteSpace: "pre-wrap" }}>
                    {r.notes.length > 200 ? r.notes.slice(0, 200) + "..." : r.notes}
                  </Text>
                )}
                <Flex gap="2" align="center">
                  {r.solarSystemName && <Text size="1" color="blue">{r.solarSystemName}</Text>}
                  {r.playerName && <Text size="1" color="orange">{r.playerName}</Text>}
                  {r.assemblyType && <Text size="1" color="orange">{r.assemblyType}</Text>}
                  <Text size="1" color="gray">{timeAgo(r.reportedAt)}</Text>
                </Flex>
              </Flex>
              <Text
                size="1"
                color="red"
                style={{ cursor: "pointer", padding: 4 }}
                onClick={() => onRemove(r.id)}
              >
                <TrashIcon />
              </Text>
            </Flex>
          </Card>
        ))}
      </Flex>
    </Flex>
  );
}
