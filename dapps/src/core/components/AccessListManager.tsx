import { useState } from "react";
import {
  Badge,
  Card,
  Flex,
  Heading,
  IconButton,
  SegmentedControl,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import { useAccessList } from "../hooks/useAccessList";
import { useOperatingContext } from "../OperatingContext";
import type { AccessEntryType } from "../access-types";

interface AccessListManagerProps {
  assemblyId: string;
  assemblyLabel: string;
}

export function AccessListManager({
  assemblyId,
  assemblyLabel,
}: AccessListManagerProps) {
  const { mode, checkPermission } = useOperatingContext();
  const { entries, addEntry, removeEntry } = useAccessList(assemblyId);
  const [entryType, setEntryType] = useState<AccessEntryType>("address");
  const [newValue, setNewValue] = useState("");
  const canManage = checkPermission("manage_access_lists");

  function handleAdd() {
    const value = newValue.trim();
    if (!value) return;
    addEntry({ id: value, type: entryType });
    setNewValue("");
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Heading size="3">Access Control</Heading>
        <Separator size="4" />

        {mode === "tribe" && (
          <Text size="1" color="gray">
            Managing access for tribe members on this {assemblyLabel}.
          </Text>
        )}

        <SegmentedControl.Root
          value={entryType}
          onValueChange={(v) => setEntryType(v as AccessEntryType)}
          size="1"
        >
          <SegmentedControl.Item value="address">Addresses</SegmentedControl.Item>
          <SegmentedControl.Item value="tribe">Tribes</SegmentedControl.Item>
        </SegmentedControl.Root>

        <Flex direction="column" gap="2">
          {entries.length === 0 && (
            <Text size="1" color="gray">
              No entries — only owner can access this {assemblyLabel}
            </Text>
          )}

          {entries.map((entry) => (
            <Flex key={entry.id} align="center" gap="2">
              <Badge
                size="1"
                color={entry.type === "address" ? "blue" : "orange"}
                variant="soft"
              >
                {entry.type === "address" ? "Addr" : "Tribe"}
              </Badge>
              <Text
                size="1"
                style={{
                  fontFamily: "monospace",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {entry.label || entry.id}
              </Text>
              {canManage && (
                <IconButton
                  size="1"
                  variant="ghost"
                  color="red"
                  onClick={() => removeEntry(entry.id)}
                >
                  <Cross1Icon />
                </IconButton>
              )}
            </Flex>
          ))}

          {canManage && (
            <Flex gap="2">
              <TextField.Root
                size="1"
                placeholder={
                  entryType === "address" ? "0x..." : "Tribe ID..."
                }
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                style={{ flex: 1 }}
              />
              <IconButton size="1" onClick={handleAdd}>
                <PlusIcon />
              </IconButton>
            </Flex>
          )}

          {!canManage && (
            <Text size="1" color="gray">
              You don't have permission to manage access lists.
            </Text>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}
