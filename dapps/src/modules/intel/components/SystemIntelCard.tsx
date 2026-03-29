import { Badge, Card, Dialog, Flex, Separator, Text } from "@radix-ui/themes";
import type { SystemThreat, SystemTrend } from "../../../core/intel-types";

function trendColor(trend: SystemTrend): "red" | "green" | "gray" {
  switch (trend) {
    case "heating": return "red";
    case "cooling": return "green";
    case "stable": return "gray";
  }
}

function trendLabel(trend: SystemTrend): string {
  switch (trend) {
    case "heating": return "Heating Up";
    case "cooling": return "Cooling Down";
    case "stable": return "Stable";
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
  system: SystemThreat | undefined;
  open: boolean;
  onClose: () => void;
}

export function SystemIntelCard({ system, open, onClose }: Props) {
  if (!system) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content style={{ maxWidth: 440 }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <Text size="5" weight="bold">{system.systemName}</Text>
            <Badge color={trendColor(system.trend)} variant="soft">
              {trendLabel(system.trend)}
            </Badge>
          </Flex>
        </Dialog.Title>

        <Flex direction="column" gap="3" mt="3">
          {/* Key metrics */}
          <Flex gap="3" wrap="wrap">
            <Card style={{ flex: 1, minWidth: 100 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Total Kills</Text>
                <Text size="4" weight="bold" color="red">{system.totalKills}</Text>
              </Flex>
            </Card>
            <Card style={{ flex: 1, minWidth: 100 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Kills/Day</Text>
                <Text size="4" weight="bold">{system.killsPerDay}</Text>
              </Flex>
            </Card>
            <Card style={{ flex: 1, minWidth: 100 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Last 24h</Text>
                <Text size="4" weight="bold" color={system.recentKills > 0 ? "orange" : "gray"}>
                  {system.recentKills}
                </Text>
              </Flex>
            </Card>
          </Flex>

          <Separator size="4" />

          {/* Details */}
          <Flex direction="column" gap="2">
            <Flex justify="between">
              <Text size="2" color="gray">Unique Attackers</Text>
              <Text size="2" weight="bold">{system.uniqueAttackers}</Text>
            </Flex>
            <Flex justify="between">
              <Text size="2" color="gray">Unique Victims</Text>
              <Text size="2" weight="bold">{system.uniqueVictims}</Text>
            </Flex>
            {system.structureKills > 0 && (
              <Flex justify="between">
                <Text size="2" color="gray">Structure Kills</Text>
                <Text size="2" weight="bold" color="orange">{system.structureKills}</Text>
              </Flex>
            )}
            {system.mostActiveTribe && (
              <Flex justify="between">
                <Text size="2" color="gray">Dominant Tribe</Text>
                <Badge variant="soft" color="orange" size="1">{system.mostActiveTribe}</Badge>
              </Flex>
            )}
            <Flex justify="between">
              <Text size="2" color="gray">Last Activity</Text>
              <Text size="2">{timeAgo(system.lastActivityTimestamp)}</Text>
            </Flex>
          </Flex>
        </Flex>

        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Text size="2" color="gray" style={{ cursor: "pointer" }}>Close</Text>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
