import { useState } from "react";
import { Badge, Flex, Table, Text, TextField } from "@radix-ui/themes";
import type { Contact, ContactStanding } from "./contacts-types";
import { STANDING_OPTIONS } from "./contacts-types";

interface ContactListProps {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function standingColor(standing: ContactStanding): "blue" | "gray" | "red" {
  return STANDING_OPTIONS.find((s) => s.value === standing)?.color ?? "gray";
}

export function ContactList({ contacts, selectedId, onSelect }: ContactListProps) {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Flex direction="column" gap="2">
      <TextField.Root
        size="1"
        placeholder="Search contacts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <Flex align="center" justify="center" py="6">
          <Text color="gray" size="2">
            {contacts.length === 0
              ? "No contacts yet. Add one to get started."
              : "No contacts match your search."}
          </Text>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Standing</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Notes</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filtered.map((contact) => (
              <Table.Row
                key={contact.id}
                onClick={() => onSelect(contact.id)}
                style={{
                  cursor: "pointer",
                  backgroundColor:
                    contact.id === selectedId
                      ? "var(--color-button-background)"
                      : undefined,
                }}
              >
                <Table.Cell>
                  <Text size="2">{contact.name}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={standingColor(contact.standing)} size="1">
                    {contact.standing}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text
                    size="1"
                    color="gray"
                    style={{
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                    }}
                  >
                    {contact.notes || "—"}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Flex>
  );
}
