import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useAssemblyActions } from "../../core/useAssemblyActions";
import { useTurretState } from "./hooks/useTurretState";
import type { AssemblyData } from "../../core/useCharacterAssemblies";

interface TurretConfigFormProps {
  turretId: string;
  assembly?: AssemblyData;
}

export function TurretConfigForm({ turretId, assembly }: TurretConfigFormProps) {
  const { bringOnline, bringOffline, rename, isPending } = useAssemblyActions();
  const { data: turretState, refetch } = useTurretState(turretId);

  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  // Extract on-chain state
  const json = turretState?.json as Record<string, unknown> | undefined;
  const currentStatus = (
    ((json?.status as any)?.status?.["@variant"] as string) ?? "UNKNOWN"
  ).toUpperCase();
  const isOnline = currentStatus === "ONLINE";
  const currentName = ((json?.metadata as any)?.name as string) || "";
  const energySourceId = (json?.energy_source_id as string) || assembly?.energySourceId || "";
  const ownerCapId = (json?.owner_cap_id as string) || assembly?.ownerCapId || "";

  const assemblyInfo = {
    id: turretId,
    ownerCapId,
    assemblyModule: "turret",
    assemblyTypeName: "Turret",
    energySourceId,
  };

  async function handleToggleOnline() {
    if (!ownerCapId || !energySourceId) {
      setStatus("Error: Missing OwnerCap or EnergySource ID");
      return;
    }
    setStatus(null);
    try {
      if (isOnline) {
        await bringOffline(assemblyInfo);
        setStatus("Turret taken offline");
      } else {
        await bringOnline(assemblyInfo);
        setStatus("Turret brought online");
      }
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleUpdateName() {
    if (!ownerCapId || !newName.trim()) return;
    setStatus(null);
    try {
      await rename(assemblyInfo, newName.trim());
      setStatus("Name updated on-chain");
      setNewName("");
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Heading size="3">Configuration</Heading>
        <Separator size="4" />

        {/* Online/Offline Toggle */}
        <Flex direction="column" gap="2">
          <Text size="2" weight="bold">Status</Text>
          <Flex gap="2" align="center">
            <Badge color={isOnline ? "green" : "red"} size="2">
              {currentStatus}
            </Badge>
            <Button
              size="1"
              variant="soft"
              color={isOnline ? "red" : "green"}
              onClick={handleToggleOnline}
              disabled={isPending || !ownerCapId}
            >
              {isPending
                ? "Processing..."
                : isOnline
                  ? "Take Offline"
                  : "Bring Online"}
            </Button>
          </Flex>
        </Flex>

        <Separator size="4" />

        {/* Name */}
        <Flex direction="column" gap="2">
          <Text size="2" weight="bold">Name</Text>
          {currentName && (
            <Text size="1" color="gray">Current: {currentName}</Text>
          )}
          <Flex gap="2">
            <TextField.Root
              size="1"
              placeholder="New name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUpdateName()}
              style={{ flex: 1 }}
            />
            <Button
              size="1"
              onClick={handleUpdateName}
              disabled={isPending || !newName.trim() || !ownerCapId}
            >
              {isPending ? "..." : "Rename"}
            </Button>
          </Flex>
        </Flex>

        {status && (
          <Text
            size="1"
            color={status.startsWith("Error") ? "red" : "green"}
          >
            {status}
          </Text>
        )}

        <Text size="1" color="gray">
          Direct wallet transactions (no sponsored tx needed)
        </Text>
      </Flex>
    </Card>
  );
}
