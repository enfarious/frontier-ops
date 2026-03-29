import { useState } from "react";
import { Button, Dialog, Flex, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";
import type { ThreatLevel } from "../../../core/intel-types";
import type { AssetType, AssetStatus } from "../../../core/tradecraft-types";
import { ASSET_TYPE_OPTIONS, ASSET_STATUS_OPTIONS } from "../../../core/tradecraft-types";
import { AutocompleteField } from "./AutocompleteField";

interface Props {
  onSubmit: (fields: {
    solarSystemName?: string;
    planet?: number;
    lpoint?: number;
    assetType: AssetType;
    ownerName?: string;
    ownerTribe?: string;
    notes?: string;
    threatLevel?: ThreatLevel;
    status?: AssetStatus;
  }) => void;
  systemNames: string[];
  playerNames: string[];
  tribeNames: string[];
}

export function AssetSightingForm({ onSubmit, systemNames, playerNames, tribeNames }: Props) {
  const [open, setOpen] = useState(false);
  const [systemName, setSystemName] = useState("");
  const [planet, setPlanet] = useState("");
  const [lpoint, setLpoint] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("ssu");
  const [ownerName, setOwnerName] = useState("");
  const [ownerTribe, setOwnerTribe] = useState("");
  const [threatLevel, setThreatLevel] = useState<ThreatLevel>("low");
  const [status, setStatus] = useState<AssetStatus>("active");
  const [notes, setNotes] = useState("");

  function reset() {
    setSystemName("");
    setPlanet("");
    setLpoint("");
    setAssetType("ssu");
    setOwnerName("");
    setOwnerTribe("");
    setThreatLevel("low");
    setStatus("active");
    setNotes("");
  }

  function handleSubmit() {
    const p = planet ? Math.max(1, Math.min(999, Number(planet) || 0)) : undefined;
    const l = lpoint ? Math.max(1, Math.min(999, Number(lpoint) || 0)) : undefined;
    onSubmit({
      solarSystemName: systemName || undefined,
      planet: p || undefined,
      lpoint: l || undefined,
      assetType,
      ownerName: ownerName || undefined,
      ownerTribe: ownerTribe || undefined,
      notes: notes.trim(),
      threatLevel,
      status,
    });
    reset();
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="soft"><PlusIcon /> Log Sighting</Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 420 }}>
        <Dialog.Title>Log Asset Sighting</Dialog.Title>

        <Flex direction="column" gap="3" mt="2">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">System</Text>
            <AutocompleteField
              placeholder="Solar system name..."
              value={systemName}
              onChange={setSystemName}
              suggestions={systemNames}
            />
          </Flex>

          <Flex gap="3">
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">Planet</Text>
              <TextField.Root
                type="number"
                placeholder="1-999"
                value={planet}
                onChange={(e) => setPlanet(e.target.value)}
              />
            </Flex>
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">L-Point</Text>
              <TextField.Root
                type="number"
                placeholder="1-999"
                value={lpoint}
                onChange={(e) => setLpoint(e.target.value)}
              />
            </Flex>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Asset Type</Text>
            <Select.Root value={assetType} onValueChange={(v) => setAssetType(v as AssetType)}>
              <Select.Trigger />
              <Select.Content>
                {ASSET_TYPE_OPTIONS.map((o) => (
                  <Select.Item key={o.value} value={o.value}>{o.label}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Owner (if known)</Text>
            <AutocompleteField
              placeholder="Owner name..."
              value={ownerName}
              onChange={setOwnerName}
              suggestions={playerNames}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Owner Tribe (if known)</Text>
            <AutocompleteField
              placeholder="Tribe name..."
              value={ownerTribe}
              onChange={setOwnerTribe}
              suggestions={tribeNames}
            />
          </Flex>

          <Flex gap="3">
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">Threat</Text>
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

            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">Status</Text>
              <Select.Root value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
                <Select.Trigger />
                <Select.Content>
                  {ASSET_STATUS_OPTIONS.map((o) => (
                    <Select.Item key={o.value} value={o.value}>{o.label}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Notes</Text>
            <TextArea
              placeholder="Details, defenses, vulnerabilities..."
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
          <Button onClick={handleSubmit}>Log Sighting</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
