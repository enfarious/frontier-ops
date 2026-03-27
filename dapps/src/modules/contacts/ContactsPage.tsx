import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  Flex,
  Heading,
  SegmentedControl,
  Text,
  TextField,
} from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";
import { useContacts } from "./hooks/useContacts";
import { ContactList } from "./ContactList";
import { ContactDetail } from "./ContactDetail";
import type { ContactStanding } from "./contacts-types";

export default function ContactsPage() {
  const { contacts, addContact, updateContact, removeContact, getContact } =
    useContacts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newStanding, setNewStanding] = useState<ContactStanding>("neutral");

  const selected = selectedId ? getContact(selectedId) : undefined;

  function handleAdd() {
    if (!newName.trim()) return;
    const id = newId.trim() || `contact-${Date.now()}`;
    addContact(newName.trim(), newStanding, id);
    setNewName("");
    setNewId("");
    setNewStanding("neutral");
    setShowAdd(false);
    setSelectedId(id);
  }

  function handleRemove(id: string) {
    removeContact(id);
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Heading size="5">Contacts</Heading>
        <Flex align="center" gap="3">
          <Text size="1" color="gray">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
          </Text>
          <Dialog.Root open={showAdd} onOpenChange={setShowAdd}>
            <Dialog.Trigger>
              <Button size="1" variant="soft">
                <PlusIcon /> Add Contact
              </Button>
            </Dialog.Trigger>
            <Dialog.Content style={{ maxWidth: 380 }}>
              <Dialog.Title>Add Contact</Dialog.Title>
              <Flex direction="column" gap="3" mt="3">
                <TextField.Root
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <TextField.Root
                  placeholder="Address or ID (optional)"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                />
                <SegmentedControl.Root
                  value={newStanding}
                  onValueChange={(v) => setNewStanding(v as ContactStanding)}
                  size="1"
                >
                  <SegmentedControl.Item value="friendly">
                    Friendly
                  </SegmentedControl.Item>
                  <SegmentedControl.Item value="neutral">
                    Neutral
                  </SegmentedControl.Item>
                  <SegmentedControl.Item value="hostile">
                    Hostile
                  </SegmentedControl.Item>
                </SegmentedControl.Root>
              </Flex>
              <Flex gap="3" mt="4" justify="end">
                <Dialog.Close>
                  <Button variant="soft" color="gray">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button onClick={handleAdd} disabled={!newName.trim()}>
                  Add
                </Button>
              </Flex>
            </Dialog.Content>
          </Dialog.Root>
        </Flex>
      </Flex>

      <Flex gap="4" style={{ flex: 1, overflow: "hidden" }}>
        <Box style={{ width: "40%", minWidth: 280, overflow: "auto" }}>
          <ContactList
            contacts={contacts}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Box>

        <Box style={{ flex: 1, overflow: "auto" }}>
          {selected ? (
            <ContactDetail
              contact={selected}
              onUpdate={updateContact}
              onRemove={handleRemove}
            />
          ) : (
            <Flex
              align="center"
              justify="center"
              style={{ height: "100%" }}
            >
              <Text color="gray">Select a contact or add a new one</Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
