import { useEffect, useState } from "react";
import { Flex, Heading, Spinner, Tabs, Text } from "@radix-ui/themes";
import { getSolarSystemMap } from "../../core/world-api";
import { useKillmails } from "../danger-alerts/hooks/useKillmails";
import { useIntelAnalysis } from "./hooks/useIntelAnalysis";
import { useFieldReports } from "./hooks/useFieldReports";
import { OverviewTab } from "./components/OverviewTab";
import { PlayersTab } from "./components/PlayersTab";
import { SystemsTab } from "./components/SystemsTab";
import { FieldReportsTab } from "./components/FieldReportsTab";
import { TribesTab } from "./components/TribesTab";
import { PlayerDossier } from "./components/PlayerDossier";
import { SystemIntelCard } from "./components/SystemIntelCard";

export default function IntelPage() {
  const { data: killmails, isLoading } = useKillmails();
  const intel = useIntelAnalysis(killmails);
  const { reports, addReport, removeReport } = useFieldReports();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [systemNames, setSystemNames] = useState<string[]>([]);

  useEffect(() => {
    getSolarSystemMap().then((map) => {
      setSystemNames(Array.from(map.values()).map((s) => s.name).sort());
    });
  }, []);

  const selectedProfile = selectedPlayerId ? intel.getPlayerProfile(selectedPlayerId) : undefined;
  const selectedAssociates = selectedPlayerId ? intel.getKnownAssociates(selectedPlayerId) : undefined;
  const selectedSystem = selectedSystemId ? intel.getSystemThreat(selectedSystemId) : undefined;

  if (isLoading) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Spinner size="3" />
        <Text size="2" color="gray" ml="2">Loading killmail intelligence...</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3" style={{ height: "100%", overflow: "hidden" }}>
      <Heading size="4">Intel</Heading>

      <Tabs.Root defaultValue="overview" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Tabs.List size="2">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="players">Players</Tabs.Trigger>
          <Tabs.Trigger value="systems">Systems</Tabs.Trigger>
          <Tabs.Trigger value="reports">Field Reports</Tabs.Trigger>
          <Tabs.Trigger value="tribes">Tribes</Tabs.Trigger>
        </Tabs.List>

        <div style={{ flex: 1, overflow: "auto", paddingTop: 16 }}>
          <Tabs.Content value="overview">
            <OverviewTab
              intel={intel}
              reports={reports}
              onSelectPlayer={setSelectedPlayerId}
              onSelectSystem={setSelectedSystemId}
            />
          </Tabs.Content>

          <Tabs.Content value="players">
            <PlayersTab
              players={intel.playerMap}
              onSelect={setSelectedPlayerId}
            />
          </Tabs.Content>

          <Tabs.Content value="systems">
            <SystemsTab
              systems={intel.systemMap}
              onSelect={setSelectedSystemId}
            />
          </Tabs.Content>

          <Tabs.Content value="reports">
            <FieldReportsTab
              reports={reports}
              systemNames={systemNames}
              onAdd={addReport}
              onRemove={removeReport}
            />
          </Tabs.Content>

          <Tabs.Content value="tribes">
            <TribesTab conflicts={intel.tribeConflicts} />
          </Tabs.Content>
        </div>
      </Tabs.Root>

      {/* Dialogs */}
      <PlayerDossier
        profile={selectedProfile}
        associates={selectedAssociates}
        open={!!selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />
      <SystemIntelCard
        system={selectedSystem}
        open={!!selectedSystemId}
        onClose={() => setSelectedSystemId(null)}
      />
    </Flex>
  );
}
