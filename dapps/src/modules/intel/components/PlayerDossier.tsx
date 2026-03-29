import { Badge, Card, Dialog, Flex, Separator, Text, Table } from "@radix-ui/themes";
import type { PlayerProfile, KnownAssociate, ThreatLevel } from "../../../core/intel-types";

export function threatColor(level: ThreatLevel): "gray" | "orange" | "red" | "crimson" {
  switch (level) {
    case "low": return "gray";
    case "medium": return "orange";
    case "high": return "red";
    case "critical": return "crimson";
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
  profile: PlayerProfile | undefined;
  associates?: KnownAssociate[];
  open: boolean;
  onClose: () => void;
}

export function PlayerDossier({ profile, associates, open, onClose }: Props) {
  if (!profile) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content style={{ maxWidth: 520 }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <Flex
              align="center"
              justify="center"
              style={{
                width: 40, height: 40, borderRadius: 8,
                background: `var(--${threatColor(profile.threatLevel)}-3)`,
                border: `2px solid var(--${threatColor(profile.threatLevel)}-7)`,
                flexShrink: 0,
              }}
            >
              <Text size="4" weight="bold" style={{ color: `var(--${threatColor(profile.threatLevel)}-11)` }}>
                {profile.playerName[0]?.toUpperCase() ?? "?"}
              </Text>
            </Flex>
            <Flex direction="column" gap="0">
              <Text size="4" weight="bold">{profile.playerName}</Text>
              {profile.tribe && (
                <Badge size="1" variant="soft" color="orange">{profile.tribe}</Badge>
              )}
            </Flex>
          </Flex>
        </Dialog.Title>

        <Flex direction="column" gap="3" mt="3">
          {/* Threat + Stats */}
          <Flex gap="3" wrap="wrap">
            <Card style={{ flex: 1, minWidth: 100 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Threat</Text>
                <Badge size="2" color={threatColor(profile.threatLevel)}>
                  {profile.threatScore}/100
                </Badge>
              </Flex>
            </Card>
            <Card style={{ flex: 1, minWidth: 80 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Kills</Text>
                <Text size="4" weight="bold" color="red">{profile.kills}</Text>
              </Flex>
            </Card>
            <Card style={{ flex: 1, minWidth: 80 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Deaths</Text>
                <Text size="4" weight="bold">{profile.deaths}</Text>
              </Flex>
            </Card>
            <Card style={{ flex: 1, minWidth: 80 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">K/D</Text>
                <Text size="4" weight="bold">{profile.kdRatio}</Text>
              </Flex>
            </Card>
          </Flex>

          {/* Last seen */}
          {profile.lastSeenTimestamp > 0 && (
            <Text size="2" color="gray">
              Last seen: {profile.lastSeenSystem ?? "unknown system"} — {timeAgo(profile.lastSeenTimestamp)}
            </Text>
          )}

          <Separator size="4" />

          {/* Active Systems */}
          {profile.activeSystems.length > 0 && (
            <Flex direction="column" gap="1">
              <Text size="2" weight="bold">Active Systems</Text>
              <Flex gap="1" wrap="wrap">
                {profile.activeSystems.slice(0, 6).map((s) => (
                  <Badge key={s.systemId} variant="soft" color="blue" size="1">
                    {s.systemName} ({s.count})
                  </Badge>
                ))}
              </Flex>
            </Flex>
          )}

          {/* Tribes Engaged */}
          {profile.tribesEngaged.length > 0 && (
            <Flex direction="column" gap="1">
              <Text size="2" weight="bold">Tribes Engaged</Text>
              <Flex gap="1" wrap="wrap">
                {profile.tribesEngaged.slice(0, 6).map((t) => (
                  <Badge key={t.tribe} variant="soft" color="orange" size="1">
                    {t.tribe} (atk:{t.asAttacker} def:{t.asVictim})
                  </Badge>
                ))}
              </Flex>
            </Flex>
          )}

          {/* Known Associates */}
          {associates && associates.length > 0 && (
            <>
              <Separator size="4" />
              <Flex direction="column" gap="1">
                <Text size="2" weight="bold">Known Associates</Text>
                <Table.Root size="1">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Tribe</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Shared Kills</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {associates.slice(0, 8).map((a) => (
                      <Table.Row key={a.playerId}>
                        <Table.Cell>
                          <Text size="1">{a.playerName}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="1" color="gray">{a.tribe ?? "—"}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="1">{a.sharedKills}</Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Flex>
            </>
          )}

          {/* Structure Kills */}
          {profile.structureKills > 0 && (
            <Text size="2" color="orange">
              Structure kills: {profile.structureKills} (infrastructure hunter)
            </Text>
          )}
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
