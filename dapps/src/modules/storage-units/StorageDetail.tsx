import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  Flex,
  Heading,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useStorageState } from "./hooks/useStorageState";
import { useAssemblyActions } from "../../core/useAssemblyActions";
import { AccessListManager } from "../../core/components/AccessListManager";
import type { AssemblyData } from "../../core/useCharacterAssemblies";

interface StorageDetailProps {
  unitId: string;
  assembly?: AssemblyData;
}

export function StorageDetail({ unitId, assembly }: StorageDetailProps) {
  const { data, isLoading, error, refetch } = useStorageState(unitId);
  const { bringOnline, bringOffline, rename, isPending } = useAssemblyActions();

  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  if (isLoading) return <Text>Loading storage unit details...</Text>;
  if (error) return <Text color="red">Error loading storage unit: {String(error)}</Text>;

  const json = data?.json as Record<string, unknown> | undefined;
  const currentStatus = (
    ((json?.status as any)?.status?.["@variant"] as string) ?? "UNKNOWN"
  ).toUpperCase();
  const isOnline = currentStatus === "ONLINE";
  const currentName = ((json?.metadata as any)?.name as string) || "";
  const typeId = Number(json?.type_id ?? 0);
  const energySourceId = (json?.energy_source_id as string) || assembly?.energySourceId || "";
  const ownerCapId = (json?.owner_cap_id as string) || assembly?.ownerCapId || "";

  const assemblyInfo = {
    id: unitId,
    ownerCapId,
    assemblyModule: "storage_unit",
    assemblyTypeName: "StorageUnit",
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
        setStatus("Storage unit taken offline");
      } else {
        await bringOnline(assemblyInfo);
        setStatus("Storage unit brought online");
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
    <Flex direction="column" gap="4">
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">{currentName || "Storage Unit"}</Heading>
          <Separator size="4" />

          <Flex gap="4" wrap="wrap">
            <Box>
              <Text size="1" color="gray">Status</Text>
              <Flex mt="1">
                <Badge color={isOnline ? "green" : "red"} size="2">{currentStatus}</Badge>
              </Flex>
            </Box>
            <Box>
              <Text size="1" color="gray">Type ID</Text>
              <Text size="2" as="p">{typeId}</Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Object ID</Text>
              <Code size="1" variant="ghost">{unitId.slice(0, 16)}...{unitId.slice(-8)}</Code>
            </Box>
          </Flex>

          {energySourceId && (
            <Box>
              <Text size="1" color="gray">Energy Source</Text>
              <Code size="1" variant="ghost">{energySourceId.slice(0, 16)}...{energySourceId.slice(-8)}</Code>
            </Box>
          )}
        </Flex>
      </Card>

      {/* Controls */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Controls</Heading>
          <Separator size="4" />

          {/* Power */}
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">Power</Text>
            <Flex gap="2" align="center">
              <Badge color={isOnline ? "green" : "red"} size="2">{currentStatus}</Badge>
              <Button
                size="1"
                variant="soft"
                color={isOnline ? "red" : "green"}
                onClick={handleToggleOnline}
                disabled={isPending || !ownerCapId}
              >
                {isPending ? "Processing..." : isOnline ? "Take Offline" : "Bring Online"}
              </Button>
            </Flex>
          </Flex>

          <Separator size="4" />

          {/* Rename */}
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">Name</Text>
            {currentName && <Text size="1" color="gray">Current: {currentName}</Text>}
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
            <Text size="1" color={status.startsWith("Error") ? "red" : "green"}>
              {status}
            </Text>
          )}
        </Flex>
      </Card>

      <AccessListManager assemblyId={unitId} assemblyLabel="storage unit" />
    </Flex>
  );
}
