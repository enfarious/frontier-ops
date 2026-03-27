import { Badge, Button, Card, Flex, Spinner, Text } from "@radix-ui/themes";
import type { KillmailData } from "./danger-types";

interface KillFeedProps {
  killmails: KillmailData[];
  watchedSystems: string[];
  onSelect?: (killmail: KillmailData) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  totalLoaded?: number;
  isLoading?: boolean;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatActor(name?: string, id?: string, tribe?: string): string {
  const display = name || `Pilot #${id ?? "?"}`;
  if (tribe) return `${display} [${tribe}]`;
  return display;
}

export function KillFeed({ killmails, watchedSystems, onSelect, hasMore, onLoadMore, totalLoaded, isLoading }: KillFeedProps) {
  if (killmails.length === 0) {
    return (
      <Flex align="center" justify="center" py="6">
        <Text color="gray">No killmails found on-chain.</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="2">
      {killmails.map((km) => {
        const isWatched = watchedSystems.includes(km.solarSystemId);
        const systemDisplay = km.solarSystemName || km.solarSystemId;

        return (
          <Card
            key={km.id}
            onClick={() => onSelect?.(km)}
            style={{
              borderLeft: isWatched
                ? "3px solid var(--red-9)"
                : "3px solid transparent",
              cursor: onSelect ? "pointer" : undefined,
            }}
          >
            <Flex direction="column" gap="1">
              <Flex justify="between" align="center">
                <Flex align="center" gap="2">
                  <Badge
                    color={km.lossType === "STRUCTURE" ? "orange" : "red"}
                    size="1"
                  >
                    {km.lossType}
                  </Badge>
                  <Badge color="gray" size="1" variant="soft">
                    {systemDisplay}
                  </Badge>
                  {isWatched && (
                    <Badge color="red" size="1" variant="solid">
                      WATCHED
                    </Badge>
                  )}
                </Flex>
                <Text size="1" color="gray">
                  {timeAgo(km.killTimestamp)}
                </Text>
              </Flex>

              <Flex gap="2" align="center" wrap="wrap">
                <Text size="2" color="red" weight="bold">
                  {formatActor(km.killerName, km.killerId, km.killerTribe)}
                </Text>
                <Text size="1" color="gray">
                  destroyed
                </Text>
                <Text size="2" weight="bold">
                  {formatActor(km.victimName, km.victimId, km.victimTribe)}
                </Text>
              </Flex>

              <Text size="1" color="gray">
                {new Date(km.killTimestamp).toLocaleString()}
              </Text>
            </Flex>
          </Card>
        );
      })}

      {hasMore && (
        <Flex justify="center" py="2">
          {isLoading ? (
            <Flex align="center" gap="2">
              <Spinner size="1" />
              <Text size="1" color="gray">Loading more killmails...</Text>
            </Flex>
          ) : (
            <Button size="1" variant="soft" onClick={onLoadMore}>
              Load More Killmails {totalLoaded ? `(${totalLoaded} loaded)` : ""}
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
}
