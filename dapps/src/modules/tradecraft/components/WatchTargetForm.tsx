import { useState } from "react";
import { Button, Dialog, Flex, Select, Text, TextField } from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";
import type { ThreatLevel } from "../../../core/intel-types";
import type { WatchTargetType } from "../../../core/tradecraft-types";
import { AutocompleteField } from "./AutocompleteField";

interface Props {
  onSubmit: (
    targetType: WatchTargetType,
    targetId: string,
    targetName: string,
    priority: ThreatLevel,
  ) => void;
  playerNames: string[];
  tribeNames: string[];
}

export function WatchTargetForm({ onSubmit, playerNames, tribeNames }: Props) {
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<WatchTargetType>("player");
  const [targetName, setTargetName] = useState("");
  const [targetId, setTargetId] = useState("");
  const [priority, setPriority] = useState<ThreatLevel>("medium");

  function reset() {
    setTargetType("player");
    setTargetName("");
    setTargetId("");
    setPriority("medium");
  }

  function handleSubmit() {
    if (!targetName.trim()) return;
    onSubmit(targetType, targetId.trim() || targetName.trim(), targetName.trim(), priority);
    reset();
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="soft"><PlusIcon /> Add Target</Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 400 }}>
        <Dialog.Title>Add Watch Target</Dialog.Title>

        <Flex direction="column" gap="3" mt="2">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Target Type</Text>
            <Select.Root value={targetType} onValueChange={(v) => setTargetType(v as WatchTargetType)}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="player">Player</Select.Item>
                <Select.Item value="tribe">Tribe</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">
              {targetType === "player" ? "Character Name" : "Tribe Name"}
            </Text>
            <AutocompleteField
              placeholder={targetType === "player" ? "Character name..." : "Tribe name..."}
              value={targetName}
              onChange={setTargetName}
              suggestions={targetType === "player" ? playerNames : tribeNames}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">ID (optional)</Text>
            <TextField.Root
              placeholder="Smart character / tribe ID if known..."
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Priority</Text>
            <Select.Root value={priority} onValueChange={(v) => setPriority(v as ThreatLevel)}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="low">Low</Select.Item>
                <Select.Item value="medium">Medium</Select.Item>
                <Select.Item value="high">High</Select.Item>
                <Select.Item value="critical">Critical</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        </Flex>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button onClick={handleSubmit} disabled={!targetName.trim()}>Add to Watch List</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
