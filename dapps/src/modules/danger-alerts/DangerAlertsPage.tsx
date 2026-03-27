import { useState } from "react";
import { Badge, Flex, Heading, Spinner, Text } from "@radix-ui/themes";
import { useKillmails } from "./hooks/useKillmails";
import { useWatchedSystems } from "./hooks/useWatchedSystems";
import { KillFeed } from "./KillFeed";
import { KillmailDetailDialog } from "./KillmailDetailDialog";
import { WatchedSystemsConfig } from "./WatchedSystemsConfig";
import type { KillmailData } from "./danger-types";

export default function DangerAlertsPage() {
  const { data: killmails, isLoading, error, hasMore, loadMore, totalLoaded } = useKillmails();
  const { systems, addSystem, removeSystem } = useWatchedSystems();
  const [selectedKillmail, setSelectedKillmail] = useState<KillmailData | null>(null);

  const watchedKills =
    killmails?.filter((km) => systems.includes(km.solarSystemId)) ?? [];

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Flex align="center" gap="3">
          <Heading size="5">Danger Alerts</Heading>
          {watchedKills.length > 0 && (
            <Badge color="red" size="2" variant="solid">
              {watchedKills.length} in watched systems
            </Badge>
          )}
        </Flex>
        <Text size="1" color="gray">
          {killmails?.length ?? 0} killmail{killmails?.length !== 1 ? "s" : ""}{" "}
          on-chain
        </Text>
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Loading killmails from chain...</Text>
        </Flex>
      )}

      {error && (
        <Text color="red" size="2">
          Error loading killmails: {String(error)}
        </Text>
      )}

      <Flex gap="4" style={{ flex: 1, overflow: "hidden" }}>
        <Flex
          direction="column"
          style={{ flex: 1, overflow: "auto" }}
          gap="2"
        >
          <KillFeed
            killmails={killmails ?? []}
            watchedSystems={systems}
            onSelect={setSelectedKillmail}
            hasMore={hasMore}
            onLoadMore={loadMore}
            totalLoaded={totalLoaded}
            isLoading={isLoading}
          />
        </Flex>

        <Flex
          direction="column"
          style={{ width: 280, minWidth: 280 }}
          gap="2"
        >
          <WatchedSystemsConfig
            systems={systems}
            onAdd={addSystem}
            onRemove={removeSystem}
          />

          <Text size="1" color="gray" mt="2">
            Click a killmail for details. Auto-refreshes every 30s from the Sui
            blockchain.
          </Text>
        </Flex>
      </Flex>

      <KillmailDetailDialog
        killmail={selectedKillmail}
        onClose={() => setSelectedKillmail(null)}
      />
    </Flex>
  );
}
