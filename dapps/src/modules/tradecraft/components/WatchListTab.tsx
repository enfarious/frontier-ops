import { Badge, Card, Flex, Text } from "@radix-ui/themes";
import { TrashIcon } from "@radix-ui/react-icons";
import type { ThreatLevel } from "../../../core/intel-types";
import type { WatchTarget } from "../../../core/tradecraft-types";
import type { KillmailData } from "../../danger-alerts/danger-types";
import { WatchTargetForm } from "./WatchTargetForm";

function priorityColor(level: ThreatLevel): "gray" | "blue" | "orange" | "red" {
  switch (level) {
    case "low": return "gray";
    case "medium": return "blue";
    case "high": return "orange";
    case "critical": return "red";
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
  targets: WatchTarget[];
  activity: Map<string, KillmailData[]>;
  playerNames: string[];
  tribeNames: string[];
  onAdd: (
    targetType: "player" | "tribe",
    targetId: string,
    targetName: string,
    priority: ThreatLevel,
  ) => void;
  onRemove: (id: string) => void;
}

export function WatchListTab({ targets, activity, playerNames, tribeNames, onAdd, onRemove }: Props) {
  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center">
        <Text size="1" color="gray">{targets.length} targets</Text>
        <WatchTargetForm onSubmit={onAdd} playerNames={playerNames} tribeNames={tribeNames} />
      </Flex>

      {targets.length === 0 && (
        <Text size="2" color="gray">
          No watch targets. Add players or tribes to track their activity across killmails.
        </Text>
      )}

      <Flex direction="column" gap="2" style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
        {targets.map((t) => {
          const kills = activity.get(t.id);
          const hasActivity = kills && kills.length > 0;

          return (
            <Card
              key={t.id}
              style={{
                borderLeft: `3px solid var(--${priorityColor(t.priority)}-9)`,
                background: hasActivity ? "var(--red-2)" : undefined,
              }}
            >
              <Flex justify="between" align="start">
                <Flex direction="column" gap="1" style={{ flex: 1 }}>
                  <Flex gap="2" align="center">
                    <Badge size="1" variant="soft" color={t.targetType === "player" ? "blue" : "purple"}>
                      {t.targetType}
                    </Badge>
                    <Badge size="1" variant="soft" color={priorityColor(t.priority)}>
                      {t.priority}
                    </Badge>
                    {hasActivity && (
                      <Badge size="1" variant="solid" color="red">
                        {kills.length} recent
                      </Badge>
                    )}
                  </Flex>
                  <Text size="2" weight="bold">{t.targetName}</Text>
                  {t.notes && (
                    <Text size="1" color="gray">{t.notes}</Text>
                  )}

                  {/* Recent activity */}
                  {hasActivity && (
                    <Flex direction="column" gap="1" mt="1">
                      {kills.slice(0, 3).map((km) => (
                        <Text key={km.id} size="1" color="red">
                          {km.killerName ?? km.killerId} killed {km.victimName ?? km.victimId}
                          {km.solarSystemName ? ` in ${km.solarSystemName}` : ""}
                          {" "}{timeAgo(km.killTimestamp)}
                        </Text>
                      ))}
                      {kills.length > 3 && (
                        <Text size="1" color="gray">+{kills.length - 3} more</Text>
                      )}
                    </Flex>
                  )}

                  <Text size="1" color="gray">Added {timeAgo(t.addedAt)}</Text>
                </Flex>
                <Text
                  size="1"
                  color="red"
                  style={{ cursor: "pointer", padding: 4 }}
                  onClick={() => onRemove(t.id)}
                >
                  <TrashIcon />
                </Text>
              </Flex>
            </Card>
          );
        })}
      </Flex>
    </Flex>
  );
}
