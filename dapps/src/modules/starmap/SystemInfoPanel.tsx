import { Badge, Button, Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import type { SolarSystem } from "../../core/world-api";

interface SystemInfoPanelProps {
  system: SolarSystem | null;
  lastKillTime: number;
  isHome: boolean;
  onClose: () => void;
  onSetHome?: () => void;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getThreatLevel(timestamp: number): { label: string; color: "red" | "orange" | "yellow" | "gray" } {
  if (!timestamp) return { label: "Quiet", color: "gray" };
  const age = Date.now() - timestamp;
  const HOUR = 3600_000;
  if (age < HOUR) return { label: "ACTIVE", color: "red" };
  if (age < 6 * HOUR) return { label: "Recent", color: "orange" };
  if (age < 24 * HOUR) return { label: "Cooling", color: "yellow" };
  return { label: "Cold", color: "gray" };
}

export function SystemInfoPanel({ system, lastKillTime, isHome, onClose, onSetHome }: SystemInfoPanelProps) {
  if (!system) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text size="2" color="gray">Click a system to see details</Text>
      </Flex>
    );
  }

  const threat = getThreatLevel(lastKillTime);

  return (
    <Card style={{ background: "rgba(10, 10, 20, 0.95)", border: "1px solid rgba(100, 100, 140, 0.3)" }}>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Heading size="3">{system.name}</Heading>
          <Text
            size="1"
            color="gray"
            style={{ cursor: "pointer" }}
            onClick={onClose}
          >
            ✕
          </Text>
        </Flex>

        <Separator size="4" />

        <Flex direction="column" gap="2">
          <Flex justify="between">
            <Text size="1" color="gray">System ID</Text>
            <Text size="1">{system.id}</Text>
          </Flex>
          <Flex justify="between">
            <Text size="1" color="gray">Constellation</Text>
            <Text size="1">{system.constellationId}</Text>
          </Flex>
          <Flex justify="between">
            <Text size="1" color="gray">Region</Text>
            <Text size="1">{system.regionId}</Text>
          </Flex>
        </Flex>

        <Separator size="4" />

        <Flex direction="column" gap="1">
          <Flex justify="between" align="center">
            <Text size="2" weight="medium">Threat</Text>
            <Badge color={threat.color} size="1">{threat.label}</Badge>
          </Flex>
          {lastKillTime > 0 ? (
            <Text size="1" color="gray">Last kill: {formatTimeAgo(lastKillTime)}</Text>
          ) : (
            <Text size="1" color="gray">No recorded kills</Text>
          )}
        </Flex>

        <Separator size="4" />

        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">Your Assets</Text>
          <Text size="1" color="gray">
            Assembly location mapping coming soon
          </Text>
        </Flex>

        <Separator size="4" />
        {isHome ? (
          <Badge size="2" color="green" variant="soft" style={{ justifyContent: "center" }}>
            Home System
          </Badge>
        ) : onSetHome ? (
          <Button size="1" variant="soft" onClick={onSetHome} style={{ width: "100%" }}>
            Set as Home System
          </Button>
        ) : null}
      </Flex>
    </Card>
  );
}
