/**
 * Tribe Intel Tab — clickable tribe list with full dossier dialog.
 * Sits between Players and Systems in the Intel tab.
 */
import { useState, useMemo } from "react";
import { Badge, Card, Dialog, Flex, Separator, Table, Text, TextField } from "@radix-ui/themes";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import type { KillmailData } from "../../danger-alerts/danger-types";
import type { PlayerProfile } from "../../../core/intel-types";
import { threatColor } from "./PlayerDossier";

// ── Analysis ─────────────────────────────────────────────────────────

export interface TribeProfile {
  name: string;
  membersSeen: number;
  kills: number;
  deaths: number;
  kdRatio: number;
  structureKills: number;
  activeSystems: { systemId: string; systemName: string; count: number }[];
  enemies: { tribe: string; killsAgainst: number; deathsTo: number }[];
  topPlayers: { id: string; name: string; kills: number; deaths: number; threatScore: number; threatLevel: string }[];
  lastActivityTimestamp: number;
  trend: "heating" | "cooling" | "stable";
  recentKills: number;
  priorKills: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function analyzeTribeProfiles(
  killmails: KillmailData[],
  playerMap: Map<string, PlayerProfile>,
): Map<string, TribeProfile> {
  const tribes = new Map<string, {
    kills: number;
    deaths: number;
    structureKills: number;
    members: Set<string>;
    memberNames: Map<string, string>;
    systemCounts: Map<string, { name: string; count: number }>;
    enemies: Map<string, { killsAgainst: number; deathsTo: number }>;
    timestamps: number[];
  }>();

  const get = (name: string) => {
    let t = tribes.get(name);
    if (!t) {
      t = {
        kills: 0, deaths: 0, structureKills: 0,
        members: new Set(), memberNames: new Map(),
        systemCounts: new Map(), enemies: new Map(), timestamps: [],
      };
      tribes.set(name, t);
    }
    return t;
  };

  for (const km of killmails) {
    if (km.killerTribe) {
      const t = get(km.killerTribe);
      t.kills++;
      if (km.lossType === "STRUCTURE") t.structureKills++;
      if (km.killerId) {
        t.members.add(km.killerId);
        if (km.killerName) t.memberNames.set(km.killerId, km.killerName);
      }
      const sys = t.systemCounts.get(km.solarSystemId);
      if (sys) sys.count++;
      else t.systemCounts.set(km.solarSystemId, { name: km.solarSystemName ?? km.solarSystemId, count: 1 });
      t.timestamps.push(km.killTimestamp);

      if (km.victimTribe && km.victimTribe !== km.killerTribe) {
        const e = t.enemies.get(km.victimTribe) ?? { killsAgainst: 0, deathsTo: 0 };
        e.killsAgainst++;
        t.enemies.set(km.victimTribe, e);
      }
    }

    if (km.victimTribe) {
      const t = get(km.victimTribe);
      t.deaths++;
      if (km.victimId) {
        t.members.add(km.victimId);
        if (km.victimName) t.memberNames.set(km.victimId, km.victimName);
      }
      t.timestamps.push(km.killTimestamp);

      if (km.killerTribe && km.killerTribe !== km.victimTribe) {
        const e = t.enemies.get(km.killerTribe) ?? { killsAgainst: 0, deathsTo: 0 };
        e.deathsTo++;
        t.enemies.set(km.killerTribe, e);
      }
    }
  }

  const now = Date.now();
  const week1 = now - 7 * DAY_MS;
  const week2 = now - 14 * DAY_MS;
  const result = new Map<string, TribeProfile>();

  for (const [name, t] of tribes) {
    const recentKills = killmails.filter(
      km => km.killerTribe === name && km.killTimestamp > week1
    ).length;
    const priorKills = killmails.filter(
      km => km.killerTribe === name && km.killTimestamp > week2 && km.killTimestamp <= week1
    ).length;

    let trend: TribeProfile["trend"] = "stable";
    if (priorKills > 0 && recentKills > priorKills * 1.5) trend = "heating";
    else if (priorKills > 0 && recentKills < priorKills * 0.5) trend = "cooling";
    else if (priorKills === 0 && recentKills > 0) trend = "heating";

    const topPlayers = Array.from(t.members)
      .map(id => {
        const p = playerMap.get(id);
        return {
          id,
          name: t.memberNames.get(id) ?? `Pilot #${id}`,
          kills: p?.kills ?? 0,
          deaths: p?.deaths ?? 0,
          threatScore: p?.threatScore ?? 0,
          threatLevel: p?.threatLevel ?? "low",
        };
      })
      .sort((a, b) => b.threatScore - a.threatScore)
      .slice(0, 8);

    result.set(name, {
      name,
      membersSeen: t.members.size,
      kills: t.kills,
      deaths: t.deaths,
      kdRatio: Math.round((t.kills / Math.max(t.deaths, 1)) * 100) / 100,
      structureKills: t.structureKills,
      activeSystems: Array.from(t.systemCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      enemies: Array.from(t.enemies.entries())
        .map(([tribe, e]) => ({ tribe, ...e }))
        .sort((a, b) => (b.killsAgainst + b.deathsTo) - (a.killsAgainst + a.deathsTo))
        .slice(0, 6),
      topPlayers,
      lastActivityTimestamp: t.timestamps.length > 0 ? Math.max(...t.timestamps) : 0,
      trend,
      recentKills,
      priorKills,
    });
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TrendBadge({ p }: { p: TribeProfile }) {
  if (p.trend === "heating") return <Badge size="1" color="red" variant="soft">↑ heating</Badge>;
  if (p.trend === "cooling") return <Badge size="1" color="gray" variant="soft">↓ cooling</Badge>;
  return <Badge size="1" color="blue" variant="soft">— stable</Badge>;
}

// ── Dossier Dialog ────────────────────────────────────────────────────

interface DossierProps {
  profile: TribeProfile | null;
  open: boolean;
  onClose: () => void;
  onSelectPlayer?: (id: string) => void;
}

function TribeDossier({ profile, open, onClose, onSelectPlayer }: DossierProps) {
  if (!profile) return null;

  const dominance = profile.kills + profile.deaths > 0
    ? Math.round((profile.kills / (profile.kills + profile.deaths)) * 100)
    : 0;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content style={{ maxWidth: 560 }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <Flex
              align="center" justify="center"
              style={{
                width: 40, height: 40, borderRadius: 8,
                background: "var(--orange-3)",
                border: "2px solid var(--orange-7)",
                flexShrink: 0,
              }}
            >
              <Text size="3" weight="bold" style={{ color: "var(--orange-11)" }}>
                {profile.name[0]?.toUpperCase() ?? "?"}
              </Text>
            </Flex>
            <Flex direction="column" gap="1">
              <Text size="4" weight="bold">{profile.name}</Text>
              <Flex gap="2" align="center">
                <Text size="1" color="gray">{profile.membersSeen} pilots observed</Text>
                <TrendBadge p={profile} />
              </Flex>
            </Flex>
          </Flex>
        </Dialog.Title>

        <Flex direction="column" gap="3" mt="3">
          {/* Stats row */}
          <Flex gap="2" wrap="wrap">
            {[
              { label: "Kills", value: profile.kills, color: "red" as const },
              { label: "Deaths", value: profile.deaths, color: undefined },
              { label: "K/D", value: profile.kdRatio, color: undefined },
              { label: "Dominance", value: `${dominance}%`, color: undefined },
            ].map(({ label, value, color }) => (
              <Card key={label} style={{ flex: 1, minWidth: 80 }}>
                <Flex direction="column" align="center" gap="1">
                  <Text size="1" color="gray">{label}</Text>
                  <Text size="3" weight="bold" color={color}>{value}</Text>
                </Flex>
              </Card>
            ))}
          </Flex>

          {/* Activity trend */}
          <Flex gap="3" align="center" wrap="wrap">
            <Text size="1" color="gray">
              Last 7d: <Text as="span" weight="bold" style={{ color: "var(--accent-11)" }}>{profile.recentKills} kills</Text>
            </Text>
            <Text size="1" color="gray">Prior 7d: {profile.priorKills} kills</Text>
            {profile.lastActivityTimestamp > 0 && (
              <Text size="1" color="gray">Last active: {timeAgo(profile.lastActivityTimestamp)}</Text>
            )}
          </Flex>

          {profile.structureKills > 0 && (
            <Text size="2" color="orange">
              ⚠ {profile.structureKills} structure kills — infrastructure threat
            </Text>
          )}

          <Separator size="4" />

          {/* Active systems */}
          {profile.activeSystems.length > 0 && (
            <Flex direction="column" gap="1">
              <Text size="2" weight="bold">Active Systems</Text>
              <Flex gap="1" wrap="wrap">
                {profile.activeSystems.map((s) => (
                  <Badge key={s.systemId} variant="soft" color="blue" size="1">
                    {s.name} ({s.count})
                  </Badge>
                ))}
              </Flex>
            </Flex>
          )}

          {/* Conflict history */}
          {profile.enemies.length > 0 && (
            <Flex direction="column" gap="1">
              <Text size="2" weight="bold">Conflict History</Text>
              <Flex direction="column" gap="1">
                {profile.enemies.map((e) => {
                  const total = e.killsAgainst + e.deathsTo;
                  const winPct = total > 0 ? Math.round((e.killsAgainst / total) * 100) : 0;
                  return (
                    <Flex key={e.tribe} align="center" gap="2" wrap="wrap">
                      <Badge variant="soft" color="orange" size="1" style={{ minWidth: 120 }}>
                        {e.tribe}
                      </Badge>
                      <Text size="1" color="green">{e.killsAgainst}↑</Text>
                      <Text size="1" color="red">{e.deathsTo}↓</Text>
                      <Text size="1" color="gray">{winPct}% win rate</Text>
                    </Flex>
                  );
                })}
              </Flex>
            </Flex>
          )}

          {/* Top members */}
          {profile.topPlayers.length > 0 && (
            <>
              <Separator size="4" />
              <Flex direction="column" gap="1">
                <Text size="2" weight="bold">Top Members</Text>
                <Table.Root size="1">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Kills</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Deaths</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Threat</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {profile.topPlayers.map((p) => (
                      <Table.Row
                        key={p.id}
                        style={{ cursor: onSelectPlayer ? "pointer" : "default" }}
                        onClick={() => {
                          if (onSelectPlayer) {
                            onClose();
                            onSelectPlayer(p.id);
                          }
                        }}
                      >
                        <Table.Cell>
                          <Text size="1" weight="bold">{p.name}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="1" color="red">{p.kills}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text size="1">{p.deaths}</Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge size="1" color={threatColor(p.threatLevel as any)}>
                            {p.threatScore}
                          </Badge>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
                {onSelectPlayer && (
                  <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
                    Click a member to open their dossier
                  </Text>
                )}
              </Flex>
            </>
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

// ── Tab Component ─────────────────────────────────────────────────────

interface TabProps {
  tribeProfiles: Map<string, TribeProfile>;
  onSelectPlayer?: (id: string) => void;
}

type SortKey = "kills" | "deaths" | "kd" | "members" | "last" | "name";

export function TribeIntelTab({ tribeProfiles, onSelectPlayer }: TabProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("kills");
  const [selectedTribe, setSelectedTribe] = useState<string | null>(null);

  const sorted = useMemo(() => {
    let list = Array.from(tribeProfiles.values());
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case "kills": return b.kills - a.kills;
        case "deaths": return b.deaths - a.deaths;
        case "kd": return b.kdRatio - a.kdRatio;
        case "members": return b.membersSeen - a.membersSeen;
        case "last": return b.lastActivityTimestamp - a.lastActivityTimestamp;
        case "name": return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [tribeProfiles, search, sortBy]);

  const selectedProfile = selectedTribe ? tribeProfiles.get(selectedTribe) ?? null : null;

  const col = (key: SortKey) => ({
    cursor: "pointer" as const,
    textDecoration: sortBy === key ? "underline" : "none",
    userSelect: "none" as const,
  });

  if (tribeProfiles.size === 0) {
    return <Text size="2" color="gray">No tribe activity detected in killmail data.</Text>;
  }

  return (
    <>
      <Flex direction="column" gap="3">
        <TextField.Root
          placeholder="Search tribes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>

        <Text size="1" color="gray">{sorted.length} tribes observed</Text>

        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
          <Table.Root size="1">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell style={col("name")} onClick={() => setSortBy("name")}>
                  Tribe
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={col("members")} onClick={() => setSortBy("members")}>
                  Members
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={col("kills")} onClick={() => setSortBy("kills")}>
                  Kills
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={col("deaths")} onClick={() => setSortBy("deaths")}>
                  Deaths
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={col("kd")} onClick={() => setSortBy("kd")}>
                  K/D
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={col("last")} onClick={() => setSortBy("last")}>
                  Last Active
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Trend</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sorted.map((t) => (
                <Table.Row
                  key={t.name}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedTribe(t.name)}
                >
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      <Badge variant="soft" color="orange" size="1">{t.name}</Badge>
                      {t.structureKills > 0 && (
                        <Text size="1" color="orange" title="Infrastructure hunter">⚠</Text>
                      )}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2">{t.membersSeen}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" color="red" weight="bold">{t.kills}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2">{t.deaths}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" weight="bold">{t.kdRatio}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="1" color="gray">
                      {t.lastActivityTimestamp > 0 ? timeAgo(t.lastActivityTimestamp) : "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell><TrendBadge p={t} /></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </div>
      </Flex>

      <TribeDossier
        profile={selectedProfile}
        open={!!selectedTribe}
        onClose={() => setSelectedTribe(null)}
        onSelectPlayer={onSelectPlayer}
      />
    </>
  );
}
