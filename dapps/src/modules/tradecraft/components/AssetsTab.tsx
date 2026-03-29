import { useState } from "react";
import { Badge, Button, Card, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import { CheckIcon, TrashIcon } from "@radix-ui/react-icons";
import type { ThreatLevel } from "../../../core/intel-types";
import type { AssetSighting, AssetType, AssetStatus } from "../../../core/tradecraft-types";
import { ASSET_TYPE_OPTIONS, ASSET_STATUS_OPTIONS } from "../../../core/tradecraft-types";
import { AssetSightingForm } from "./AssetSightingForm";

function threatColor(level: ThreatLevel): "gray" | "blue" | "orange" | "red" {
  switch (level) {
    case "low": return "gray";
    case "medium": return "blue";
    case "high": return "orange";
    case "critical": return "red";
  }
}

function statusColor(status: AssetStatus): "green" | "red" | "gray" {
  const opt = ASSET_STATUS_OPTIONS.find((o) => o.value === status);
  return opt?.color ?? "gray";
}

function assetLabel(type: AssetType): string {
  return ASSET_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type Freshness = "fresh" | "recent" | "aging" | "stale";

function getFreshness(lastConfirmedAt: number): Freshness {
  const ageMs = Date.now() - lastConfirmedAt;
  if (ageMs < 24 * 3600_000) return "fresh";
  if (ageMs < 3 * 24 * 3600_000) return "recent";
  if (ageMs < 7 * 24 * 3600_000) return "aging";
  return "stale";
}

function freshnessColor(f: Freshness): "green" | "blue" | "yellow" | "red" {
  switch (f) {
    case "fresh": return "green";
    case "recent": return "blue";
    case "aging": return "yellow";
    case "stale": return "red";
  }
}

interface Props {
  sightings: AssetSighting[];
  systemNames: string[];
  playerNames: string[];
  tribeNames: string[];
  onAdd: (fields: {
    solarSystemName?: string;
    planet?: number;
    lpoint?: number;
    assetType: AssetType;
    ownerName?: string;
    ownerTribe?: string;
    notes?: string;
    threatLevel?: ThreatLevel;
    status?: AssetStatus;
  }) => void;
  onConfirm: (id: string) => void;
  onRemove: (id: string) => void;
}

export function AssetsTab({ sightings, systemNames, playerNames, tribeNames, onAdd, onConfirm, onRemove }: Props) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? sightings
    : sightings.filter((s) => s.assetType === filter);

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center">
        <SegmentedControl.Root value={filter} onValueChange={setFilter} size="1">
          <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          <SegmentedControl.Item value="ssu">SSU</SegmentedControl.Item>
          <SegmentedControl.Item value="gate">Gate</SegmentedControl.Item>
          <SegmentedControl.Item value="turret">Turret</SegmentedControl.Item>
          <SegmentedControl.Item value="network_node">Node</SegmentedControl.Item>
        </SegmentedControl.Root>
        <AssetSightingForm onSubmit={onAdd} systemNames={systemNames} playerNames={playerNames} tribeNames={tribeNames} />
      </Flex>

      <Text size="1" color="gray">{filtered.length} assets logged</Text>

      {filtered.length === 0 && (
        <Text size="2" color="gray">
          No asset sightings. Log enemy structures you've spotted in the field.
        </Text>
      )}

      <Flex direction="column" gap="2" style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
        {filtered.map((s) => {
          const freshness = getFreshness(s.lastConfirmedAt);
          return (
          <Card key={s.id} style={{ borderLeft: `3px solid var(--${threatColor(s.threatLevel)}-9)` }}>
            <Flex justify="between" align="start">
              <Flex direction="column" gap="1" style={{ flex: 1 }}>
                <Flex gap="2" align="center" wrap="wrap">
                  <Badge size="1" variant="soft" color="orange">
                    {assetLabel(s.assetType)}
                  </Badge>
                  <Badge size="1" variant="soft" color={statusColor(s.status)}>
                    {s.status}
                  </Badge>
                  <Badge size="1" variant="soft" color={threatColor(s.threatLevel)}>
                    {s.threatLevel}
                  </Badge>
                  <Badge size="1" variant={freshness === "stale" ? "solid" : "outline"} color={freshnessColor(freshness)}>
                    {freshness}
                  </Badge>
                </Flex>
                {s.solarSystemName && (
                  <Text size="2" weight="bold">
                    {s.solarSystemName}
                    {s.planet ? ` P${s.planet}` : ""}
                    {s.lpoint ? ` L${s.lpoint}` : ""}
                  </Text>
                )}
                {(s.ownerName || s.ownerTribe) && (
                  <Text size="1" color="blue">
                    {s.ownerName}{s.ownerName && s.ownerTribe ? " / " : ""}{s.ownerTribe}
                  </Text>
                )}
                {s.notes && (
                  <Text size="1" color="gray" style={{ whiteSpace: "pre-wrap" }}>
                    {s.notes.length > 200 ? s.notes.slice(0, 200) + "..." : s.notes}
                  </Text>
                )}
                <Flex gap="2" align="center">
                  <Text size="1" color="gray">Spotted {timeAgo(s.firstSpottedAt)}</Text>
                  <Text size="1" color="gray">Confirmed {timeAgo(s.lastConfirmedAt)}</Text>
                </Flex>
              </Flex>

              <Flex direction="column" gap="1" align="end">
                <Button
                  size="1"
                  variant="ghost"
                  color="green"
                  onClick={() => onConfirm(s.id)}
                  title="Re-confirm sighting"
                >
                  <CheckIcon />
                </Button>
                <Text
                  size="1"
                  color="red"
                  style={{ cursor: "pointer", padding: 4 }}
                  onClick={() => onRemove(s.id)}
                >
                  <TrashIcon />
                </Text>
              </Flex>
            </Flex>
          </Card>
          );
        })}
      </Flex>
    </Flex>
  );
}
