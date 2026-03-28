import { useState, useMemo } from "react";
import { Badge, Flex, Table, Text, TextField } from "@radix-ui/themes";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import type { PlayerProfile } from "../../../core/intel-types";
import { threatColor } from "./PlayerDossier";

interface Props {
  players: Map<string, PlayerProfile>;
  onSelect: (id: string) => void;
}

type SortKey = "threat" | "kills" | "deaths" | "kd" | "name";

export function PlayersTab({ players, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("threat");

  const sorted = useMemo(() => {
    let list = Array.from(players.values());

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.playerName.toLowerCase().includes(q) ||
          (p.tribe?.toLowerCase().includes(q) ?? false),
      );
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "threat": return b.threatScore - a.threatScore;
        case "kills": return b.kills - a.kills;
        case "deaths": return b.deaths - a.deaths;
        case "kd": return b.kdRatio - a.kdRatio;
        case "name": return a.playerName.localeCompare(b.playerName);
      }
    });

    return list;
  }, [players, search, sortBy]);

  const headerStyle = (key: SortKey) => ({
    cursor: "pointer" as const,
    textDecoration: sortBy === key ? "underline" : "none",
  });

  return (
    <Flex direction="column" gap="3">
      <TextField.Root
        placeholder="Search players or tribes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      >
        <TextField.Slot>
          <MagnifyingGlassIcon />
        </TextField.Slot>
      </TextField.Root>

      <Text size="1" color="gray">{sorted.length} players</Text>

      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell style={headerStyle("name")} onClick={() => setSortBy("name")}>
                Name
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Tribe</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={headerStyle("kills")} onClick={() => setSortBy("kills")}>
                Kills
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={headerStyle("deaths")} onClick={() => setSortBy("deaths")}>
                Deaths
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={headerStyle("kd")} onClick={() => setSortBy("kd")}>
                K/D
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={headerStyle("threat")} onClick={() => setSortBy("threat")}>
                Threat
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sorted.slice(0, 100).map((p) => (
              <Table.Row
                key={p.playerId}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(p.playerId)}
              >
                <Table.Cell>
                  <Text size="2" weight="bold">{p.playerName}</Text>
                </Table.Cell>
                <Table.Cell>
                  {p.tribe ? (
                    <Badge size="1" variant="soft" color="orange">{p.tribe}</Badge>
                  ) : (
                    <Text size="1" color="gray">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="2" color="red">{p.kills}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2">{p.deaths}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2" weight="bold">{p.kdRatio}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="1" color={threatColor(p.threatLevel)}>
                    {p.threatScore}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
    </Flex>
  );
}
