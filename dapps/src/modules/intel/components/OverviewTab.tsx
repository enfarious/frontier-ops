import { Badge, Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { IntelAnalysis } from "../hooks/useIntelAnalysis";
import type { FieldReport } from "../../../core/intel-types";
import { threatColor } from "./PlayerDossier";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  intel: IntelAnalysis;
  reports: FieldReport[];
  onSelectPlayer: (id: string) => void;
  onSelectSystem: (id: string) => void;
}

export function OverviewTab({ intel, reports, onSelectPlayer, onSelectSystem }: Props) {
  const criticalReports = reports.filter((r) => r.threatLevel === "critical" || r.threatLevel === "high");

  return (
    <Flex direction="column" gap="4">
      <Text size="2" color="gray">
        Analyzing {intel.totalKillmails} killmails — {intel.playerMap.size} players — {intel.systemMap.size} systems
      </Text>

      <Flex gap="4" wrap="wrap">
        {/* Top Threats */}
        <Flex direction="column" gap="2" style={{ flex: 1, minWidth: 260 }}>
          <Heading size="3">Top Threats</Heading>
          {intel.topThreats.length === 0 && (
            <Text size="2" color="gray">No killmail data yet</Text>
          )}
          {intel.topThreats.slice(0, 5).map((p) => (
            <Card
              key={p.playerId}
              style={{ cursor: "pointer", borderLeft: `3px solid var(--${threatColor(p.threatLevel)}-9)` }}
              onClick={() => onSelectPlayer(p.playerId)}
            >
              <Flex justify="between" align="center">
                <Flex direction="column" gap="0">
                  <Text size="2" weight="bold">{p.playerName}</Text>
                  <Flex gap="1" align="center">
                    {p.tribe && <Text size="1" color="gray">{p.tribe}</Text>}
                    <Text size="1" color="gray">K:{p.kills} D:{p.deaths}</Text>
                  </Flex>
                </Flex>
                <Badge color={threatColor(p.threatLevel)} size="1">
                  {p.threatScore}
                </Badge>
              </Flex>
            </Card>
          ))}
        </Flex>

        {/* Hot Systems */}
        <Flex direction="column" gap="2" style={{ flex: 1, minWidth: 260 }}>
          <Heading size="3">Hot Systems</Heading>
          {intel.hotSystems.length === 0 && (
            <Text size="2" color="gray">No killmail data yet</Text>
          )}
          {intel.hotSystems.slice(0, 5).map((s) => (
            <Card
              key={s.systemId}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectSystem(s.systemId)}
            >
              <Flex justify="between" align="center">
                <Flex direction="column" gap="0">
                  <Text size="2" weight="bold">{s.systemName}</Text>
                  <Text size="1" color="gray">
                    {s.totalKills} kills — {s.uniqueAttackers} attackers
                  </Text>
                </Flex>
                <Flex direction="column" align="end" gap="0">
                  <Text size="2" weight="bold">{s.killsPerDay}/d</Text>
                  <Badge
                    size="1"
                    variant="soft"
                    color={s.trend === "heating" ? "red" : s.trend === "cooling" ? "green" : "gray"}
                  >
                    {s.trend}
                  </Badge>
                </Flex>
              </Flex>
            </Card>
          ))}
        </Flex>
      </Flex>

      {/* High Priority Field Reports */}
      {criticalReports.length > 0 && (
        <Flex direction="column" gap="2">
          <Heading size="3">Priority Reports</Heading>
          {criticalReports.slice(0, 5).map((r) => (
            <Card key={r.id} style={{ borderLeft: `3px solid var(--${threatColor(r.threatLevel)}-9)` }}>
              <Flex justify="between" align="center">
                <Flex direction="column" gap="0">
                  <Flex gap="2" align="center">
                    <Badge size="1" variant="soft" color={r.type === "spotted_assembly" ? "orange" : r.type === "player_sighting" ? "blue" : "gray"}>
                      {r.type.replace("_", " ")}
                    </Badge>
                    <Text size="2" weight="bold">{r.title}</Text>
                  </Flex>
                  {r.solarSystemName && <Text size="1" color="gray">{r.solarSystemName}</Text>}
                </Flex>
                <Text size="1" color="gray">{timeAgo(r.reportedAt)}</Text>
              </Flex>
            </Card>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
