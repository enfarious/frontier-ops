import { useState, useMemo } from "react";
import { Box, Button, Flex, Heading, Spinner, Text, Table, Badge, TextField } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useOperatingContext } from "../../core/OperatingContext";
import { abbreviateAddress } from "@evefrontier/dapp-kit";

const PAGE_SIZE = 50;

export default function TribeRosterPage() {
  const account = useCurrentAccount();
  const { mode, tribe, tribeRoster, tribeLoading } = useOperatingContext();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return tribeRoster;
    const lower = search.toLowerCase();
    return tribeRoster.filter(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        m.characterAddress.toLowerCase().includes(lower),
    );
  }, [tribeRoster, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (!account) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="gray">Connect your wallet to view tribe roster</Text>
      </Flex>
    );
  }

  if (mode !== "tribe") {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="gray">Switch to Tribe mode to view the roster</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" style={{ height: "100%", overflow: "auto" }}>
      <Flex align="center" justify="between">
        <Flex align="center" gap="3">
          <Heading size="5">Tribe Roster</Heading>
          {tribe && (
            <Badge size="1" variant="soft">
              {tribe.name} [{tribe.nameShort}]
            </Badge>
          )}
        </Flex>
        <Text size="1" color="gray">
          {tribeRoster.length} member{tribeRoster.length !== 1 ? "s" : ""}
        </Text>
      </Flex>

      {tribe && (
        <Flex gap="4" wrap="wrap">
          <Stat label="Tax Rate" value={`${((tribe.taxRate ?? 0) / 100).toFixed(1)}%`} />
          <Stat label="Members" value={String(tribeRoster.length)} />
        </Flex>
      )}

      {tribeRoster.length > PAGE_SIZE && (
        <TextField.Root
          size="1"
          placeholder="Search members..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setSearch(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          style={{ maxWidth: 300 }}
        />
      )}

      {tribeLoading ? (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Loading roster...</Text>
        </Flex>
      ) : filtered.length === 0 ? (
        <Text size="2" color="gray">
          {search ? "No members match your search" : "No members found"}
        </Text>
      ) : (
        <>
          <Table.Root size="1" variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Wallet</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {visible.map((member) => {
                const isYou = member.characterAddress === account.address;
                return (
                  <Table.Row key={member.characterId}>
                    <Table.Cell>
                      <Flex align="center" gap="2">
                        <Text size="2" weight={isYou ? "bold" : "regular"}>
                          {member.name}
                        </Text>
                        {isYou && (
                          <Badge size="1" variant="soft" color="green">
                            You
                          </Badge>
                        )}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="1" style={{ fontFamily: "monospace" }}>
                        {abbreviateAddress(member.characterAddress)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="1" variant="soft" color="green">
                        Active
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>

          {hasMore && (
            <Flex justify="center" py="2">
              <Button
                size="1"
                variant="soft"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Show More ({filtered.length - visibleCount} remaining)
              </Button>
            </Flex>
          )}

          {!hasMore && filtered.length > PAGE_SIZE && (
            <Text size="1" color="gray" align="center">
              Showing all {filtered.length} members
            </Text>
          )}
        </>
      )}
    </Flex>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box
      p="3"
      style={{
        borderRadius: 6,
        border: "1px solid var(--color-border)",
        minWidth: 100,
      }}
    >
      <Text size="1" color="gray">{label}</Text>
      <Text size="4" weight="bold" as="div">{value}</Text>
    </Box>
  );
}
