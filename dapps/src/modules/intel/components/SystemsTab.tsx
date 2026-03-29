import { useState, useMemo } from "react";
import { Badge, Flex, Table, Text, TextField } from "@radix-ui/themes";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import type { SystemThreat } from "../../../core/intel-types";

interface Props {
  systems: Map<string, SystemThreat>;
  onSelect: (id: string) => void;
}

type SortKey = "kills" | "kpd" | "recent" | "name";

export function SystemsTab({ systems, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("kpd");

  const sorted = useMemo(() => {
    let list = Array.from(systems.values());

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.systemName.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "kills": return b.totalKills - a.totalKills;
        case "kpd": return b.killsPerDay - a.killsPerDay;
        case "recent": return b.recentKills - a.recentKills;
        case "name": return a.systemName.localeCompare(b.systemName);
      }
    });

    return list;
  }, [systems, search, sortBy]);

  const headerStyle = (key: SortKey) => ({
    cursor: "pointer" as const,
    textDecoration: sortBy === key ? "underline" : "none",
  });

  return (
    <Flex direction="column" gap="3">
      <TextField.Root
        placeholder="Search systems..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      >
        <TextField.Slot>
          <MagnifyingGlassIcon />
        </TextField.Slot>
      </TextField.Root>

      <Text size="1" color="gray">{sorted.length} systems with activity</Text>

      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell style={headerStyle("name")} onClick={() => setSortBy("name")}>
                System
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={headerStyle("kills")} onClick={() => setSortBy("kills")}>
                Total Kills
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={headerStyle("kpd")} onClick={() => setSortBy("kpd")}>
                Kills/Day
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={headerStyle("recent")} onClick={() => setSortBy("recent")}>
                Last 24h
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Attackers</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Trend</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sorted.slice(0, 100).map((s) => (
              <Table.Row
                key={s.systemId}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(s.systemId)}
              >
                <Table.Cell>
                  <Text size="2" weight="bold">{s.systemName}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2" color="red">{s.totalKills}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2" weight="bold">{s.killsPerDay}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2" color={s.recentKills > 0 ? "orange" : "gray"}>
                    {s.recentKills}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2">{s.uniqueAttackers}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    size="1"
                    variant="soft"
                    color={s.trend === "heating" ? "red" : s.trend === "cooling" ? "green" : "gray"}
                  >
                    {s.trend}
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
