import { useState, useEffect } from "react";
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
import { searchCharactersByName, type CharacterSearchResult } from "../../core/character-search";

export default function ContactsPage() {
  const { contacts, addContact, updateContact, removeContact, getContact } =
    useContacts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newStanding, setNewStanding] = useState<ContactStanding>("neutral");
  const [charSearch, setCharSearch] = useState("");
  const [charResults, setCharResults] = useState<CharacterSearchResult[]>([]);

  const selected = selectedId ? getContact(selectedId) : undefined;

  // Debounced character search
  useEffect(() => {
    if (charSearch.length < 2) { setCharResults([]); return; }
    const timer = setTimeout(() => {
      searchCharactersByName(charSearch).then(setCharResults);
    }, 200);
    return () => clearTimeout(timer);
  }, [charSearch]);

  function handleAdd() {
    if (!newName.trim()) return;
    const id = newId.trim() || `contact-${Date.now()}`;
    addContact(newName.trim(), newStanding, id);
    setNewName("");
    setNewId("");
    setNewStanding("neutral");
    setCharSearch("");
    setCharResults([]);
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
                <Flex direction="column" style={{ position: "relative" }}>
                  <TextField.Root
                    placeholder="Search character name..."
                    value={newName || charSearch}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (newName) {
                        // User is typing over a selection
                        setNewName("");
                        setNewId("");
                      }
                      setCharSearch(v);
                    }}
                  />
                  {charResults.length > 0 && (
                    <Flex
                      direction="column"
                      style={{
                        position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                        background: "var(--color-background)", border: "1px solid var(--color-border)",
                        borderRadius: 4, maxHeight: 200, overflowY: "auto",
                      }}
                    >
                      {charResults.map((c) => (
                        <Flex
                          key={c.characterId}
                          align="center" justify="between" p="2"
                          onClick={() => {
                            setNewName(c.name);
                            setNewId(c.address);
                            setCharSearch("");
                            setCharResults([]);
                          }}
                          style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}
                        >
                          <Text size="1" weight="bold">{c.name}</Text>
                          <Text size="1" color="gray" style={{ fontFamily: "monospace" }}>
                            {c.address.slice(0, 6)}...{c.address.slice(-4)}
                          </Text>
                        </Flex>
                      ))}
                    </Flex>
                  )}
                </Flex>
                {newName && newId && (
                  <Text size="1" color="green">
                    {newName} → {newId.slice(0, 10)}...{newId.slice(-6)}
                  </Text>
                )}
                {!newName && (
                  <TextField.Root
                    placeholder="Or paste wallet address / ID"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                  />
                )}
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
