import { useState } from "react";
import { Button, Dialog, Flex, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";
import type { FieldReportType, ThreatLevel } from "../../../core/intel-types";
import { AutocompleteField } from "../../tradecraft/components/AutocompleteField";

interface Props {
  onSubmit: (report: {
    type: FieldReportType;
    solarSystemId?: string;
    solarSystemName?: string;
    playerId?: string;
    playerName?: string;
    assemblyType?: string;
    assemblyOwner?: string;
    title: string;
    notes: string;
    threatLevel: ThreatLevel;
  }) => void;
  systemNames: string[];
}

export function FieldReportForm({ onSubmit, systemNames }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FieldReportType>("system_note");
  const [systemName, setSystemName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [assemblyType, setAssemblyType] = useState("");
  const [assemblyOwner, setAssemblyOwner] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [threatLevel, setThreatLevel] = useState<ThreatLevel>("low");

  function reset() {
    setType("system_note");
    setSystemName("");
    setPlayerName("");
    setAssemblyType("");
    setAssemblyOwner("");
    setTitle("");
    setNotes("");
    setThreatLevel("low");
  }

  function handleSubmit() {
    if (!title.trim()) return;
    onSubmit({
      type,
      solarSystemName: systemName || undefined,
      playerName: playerName || undefined,
      assemblyType: assemblyType || undefined,
      assemblyOwner: assemblyOwner || undefined,
      title: title.trim(),
      notes: notes.trim(),
      threatLevel,
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="soft"><PlusIcon /> New Report</Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 420 }}>
        <Dialog.Title>File Field Report</Dialog.Title>

        <Flex direction="column" gap="3" mt="2">
          {/* Report type */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Report Type</Text>
            <Select.Root value={type} onValueChange={(v) => setType(v as FieldReportType)}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="system_note">System Note</Select.Item>
                <Select.Item value="player_sighting">Player Sighting</Select.Item>
                <Select.Item value="spotted_assembly">Spotted Assembly</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>

          {/* Title */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Title</Text>
            <TextField.Root
              placeholder="Brief summary..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Flex>

          {/* Threat level */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Threat Level</Text>
            <Select.Root value={threatLevel} onValueChange={(v) => setThreatLevel(v as ThreatLevel)}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="low">Low</Select.Item>
                <Select.Item value="medium">Medium</Select.Item>
                <Select.Item value="high">High</Select.Item>
                <Select.Item value="critical">Critical</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>

          {/* System name — shown for all types */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">System</Text>
            <AutocompleteField
              placeholder="Solar system name..."
              value={systemName}
              onChange={setSystemName}
              suggestions={systemNames}
            />
          </Flex>

          {/* Player sighting fields */}
          {type === "player_sighting" && (
            <Flex direction="column" gap="1">
              <Text size="1" color="gray" weight="bold">Player Name</Text>
              <TextField.Root
                placeholder="Character name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </Flex>
          )}

          {/* Spotted assembly fields */}
          {type === "spotted_assembly" && (
            <>
              <Flex direction="column" gap="1">
                <Text size="1" color="gray" weight="bold">Assembly Type</Text>
                <Select.Root value={assemblyType} onValueChange={setAssemblyType}>
                  <Select.Trigger placeholder="Select type..." />
                  <Select.Content>
                    <Select.Item value="SSU">SSU</Select.Item>
                    <Select.Item value="Gate">Gate</Select.Item>
                    <Select.Item value="Turret">Turret</Select.Item>
                    <Select.Item value="Unknown">Unknown</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Flex>
              <Flex direction="column" gap="1">
                <Text size="1" color="gray" weight="bold">Owner (if known)</Text>
                <TextField.Root
                  placeholder="Owner name..."
                  value={assemblyOwner}
                  onChange={(e) => setAssemblyOwner(e.target.value)}
                />
              </Flex>
            </>
          )}

          {/* Notes */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Notes</Text>
            <TextArea
              placeholder="Details, observations, context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </Flex>
        </Flex>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button onClick={handleSubmit} disabled={!title.trim()}>Submit Report</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
