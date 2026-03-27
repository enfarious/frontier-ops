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
import { useNodeState } from "./hooks/useNodeState";
import { useResolvedAssemblies } from "./hooks/useResolvedAssemblies";
import { useAssemblyActions } from "../../core/useAssemblyActions";
import { estimateFuelHours, energyUtilization } from "../../core/network-node-data";
import { LOW_FUEL_THRESHOLD, NETWORK_NODE_MODULE, NETWORK_NODE_TYPE_NAME } from "./constants";

interface NodeDetailProps {
  nodeId: string;
}

export function NodeDetail({ nodeId }: NodeDetailProps) {
  const { data: node, isLoading, error, refetch } = useNodeState(nodeId);
  const { bringOnline, bringOffline, rename, isPending } = useAssemblyActions();
  const connectedIds = node?.connectedAssemblyIds ?? [];
  const resolved = useResolvedAssemblies(connectedIds);

  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  if (isLoading) return <Text>Loading node details...</Text>;
  if (error) return <Text color="red">Error loading node: {String(error)}</Text>;
  if (!node) return <Text color="gray">Node not found</Text>;

  const isOnline = node.status === "online";
  const fuelPct =
    node.fuel.maxCapacity > 0
      ? Math.round((node.fuel.quantity / node.fuel.maxCapacity) * 100)
      : 0;
  const hoursRemaining = estimateFuelHours(node);
  const utilPct = energyUtilization(node);
  const isLowFuel = node.fuel.quantity < LOW_FUEL_THRESHOLD;

  const assemblyInfo = {
    id: nodeId,
    ownerCapId: node.ownerCapId,
    assemblyModule: NETWORK_NODE_MODULE,
    assemblyTypeName: NETWORK_NODE_TYPE_NAME,
    energySourceId: nodeId, // Network nodes are their own energy source
  };

  async function handleToggleOnline() {
    if (!node?.ownerCapId) {
      setStatus("Error: Missing OwnerCap ID");
      return;
    }
    setStatus(null);
    try {
      if (isOnline) {
        await bringOffline(assemblyInfo);
        setStatus("Node taken offline");
      } else {
        await bringOnline(assemblyInfo);
        setStatus("Node brought online");
      }
      setTimeout(() => refetch(), 2000);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleUpdateName() {
    if (!node?.ownerCapId || !newName.trim()) return;
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
      {/* Status Card */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Network Node</Heading>
          <Separator size="4" />

          <Flex gap="4" wrap="wrap">
            <Box>
              <Text size="1" color="gray">Status</Text>
              <Flex mt="1">
                <Badge color={isOnline ? "green" : "red"} size="2">
                  {node.status.toUpperCase()}
                </Badge>
              </Flex>
            </Box>
            <Box>
              <Text size="1" color="gray">Object ID</Text>
              <Code size="1" variant="ghost">
                {nodeId.slice(0, 16)}...{nodeId.slice(-8)}
              </Code>
            </Box>
            {node.locationHash && (
              <Box>
                <Text size="1" color="gray">Location Hash</Text>
                <Code size="1" variant="ghost">
                  {node.locationHash.slice(0, 20)}...
                </Code>
              </Box>
            )}
          </Flex>
        </Flex>
      </Card>

      {/* Fuel Card */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Fuel</Heading>
          <Separator size="4" />

          <Flex gap="4" wrap="wrap">
            <Box>
              <Text size="1" color="gray">Quantity</Text>
              <Text size="2" as="p" color={isLowFuel ? "red" : undefined} weight={isLowFuel ? "bold" : undefined}>
                {node.fuel.quantity}
                {isLowFuel && " (LOW)"}
              </Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Max Capacity</Text>
              <Text size="2" as="p">{node.fuel.maxCapacity}</Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Burn Rate</Text>
              <Text size="2" as="p">
                {node.fuel.burnRateMs > 0
                  ? `${(3600000 / node.fuel.burnRateMs).toFixed(2)} units/hr`
                  : "N/A"}
              </Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Est. Hours Remaining</Text>
              <Text size="2" as="p" color={hoursRemaining !== null && hoursRemaining < 2 ? "red" : undefined}>
                {hoursRemaining !== null ? hoursRemaining.toFixed(1) + "h" : "N/A"}
              </Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Fuel Type ID</Text>
              <Text size="2" as="p">{node.fuel.fuelTypeId}</Text>
            </Box>
          </Flex>

          {/* Fuel progress bar */}
          <Box>
            <Text size="1" color="gray">Fuel Level</Text>
            <Flex mt="1" align="center" gap="2">
              <Box
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "var(--gray-a4)",
                  overflow: "hidden",
                }}
              >
                <Box
                  style={{
                    width: `${fuelPct}%`,
                    height: "100%",
                    borderRadius: 4,
                    backgroundColor: isLowFuel
                      ? "var(--red-9)"
                      : fuelPct < 30
                        ? "var(--orange-9)"
                        : "var(--green-9)",
                    transition: "width 0.3s ease",
                  }}
                />
              </Box>
              <Text size="1" color={isLowFuel ? "red" : "gray"}>
                {fuelPct}%
              </Text>
            </Flex>
          </Box>
        </Flex>
      </Card>

      {/* Energy Card */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Energy</Heading>
          <Separator size="4" />

          <Flex gap="4" wrap="wrap">
            <Box>
              <Text size="1" color="gray">Max Production</Text>
              <Text size="2" as="p">{node.energy.maxProduction}</Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Current Production</Text>
              <Text size="2" as="p">{node.energy.currentProduction}</Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Total Reserved</Text>
              <Text size="2" as="p">{node.energy.totalReserved}</Text>
            </Box>
            <Box>
              <Text size="1" color="gray">Utilization</Text>
              <Text size="2" as="p" weight="bold">
                {utilPct}%
              </Text>
            </Box>
          </Flex>
        </Flex>
      </Card>

      {/* Connected Assemblies Card */}
      {connectedIds.length > 0 && (
        <Card>
          <Flex direction="column" gap="3">
            <Heading size="3">
              Connected Assemblies ({connectedIds.length})
            </Heading>
            <Separator size="4" />

            <ConnectedAssemblyGroups ids={connectedIds} resolved={resolved} />
          </Flex>
        </Card>
      )}

      {/* Controls Card */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Controls</Heading>
          <Separator size="4" />

          {/* Power */}
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">Power</Text>
            <Flex gap="2" align="center">
              <Badge color={isOnline ? "green" : "red"} size="2">
                {node.status.toUpperCase()}
              </Badge>
              <Button
                size="1"
                variant="soft"
                color={isOnline ? "red" : "green"}
                onClick={handleToggleOnline}
                disabled={isPending || !node.ownerCapId}
              >
                {isPending ? "Processing..." : isOnline ? "Take Offline" : "Bring Online"}
              </Button>
            </Flex>
          </Flex>

          <Separator size="4" />

          {/* Rename */}
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">Rename</Text>
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
                disabled={isPending || !newName.trim() || !node.ownerCapId}
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
    </Flex>
  );
}

function typeColor(shortType: string): "blue" | "green" | "orange" | "purple" | "gray" {
  if (shortType === "Turret") return "orange";
  if (shortType === "SSU") return "blue";
  if (shortType === "Gate") return "purple";
  if (shortType === "Network Node") return "green";
  return "gray";
}

const TYPE_ORDER: Record<string, number> = {
  "SSU": 0, "Assembly": 1, "Turret": 2, "Gate": 3, "Network Node": 4,
};

function groupByType(
  ids: string[],
  resolved: Map<string, { shortType: string; name: string }>,
): Array<{ type: string; items: Array<{ id: string; name: string }> }> {
  const groups = new Map<string, Array<{ id: string; name: string }>>();

  for (const id of ids) {
    const info = resolved.get(id);
    const type = info?.shortType ?? "Unknown";
    const name = info?.name ?? "Loading...";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push({ id, name });
  }

  // Sort groups by TYPE_ORDER, items within each group by name
  return [...groups.entries()]
    .sort(([a], [b]) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99))
    .map(([type, items]) => ({
      type,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function ConnectedAssemblyGroups({
  ids,
  resolved,
}: {
  ids: string[];
  resolved: Map<string, { shortType: string; name: string }>;
}) {
  const groups = groupByType(ids, resolved);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (type: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <Flex direction="column" gap="2">
      {groups.map(({ type, items }) => (
        <Flex key={type} direction="column" gap="1">
          <Flex
            align="center"
            gap="2"
            py="1"
            onClick={() => toggle(type)}
            style={{ cursor: "pointer", userSelect: "none" }}
          >
            <Text size="1" style={{ width: 12, textAlign: "center" }}>
              {collapsed.has(type) ? "▶" : "▼"}
            </Text>
            <Badge size="1" variant="soft" color={typeColor(type)}>
              {type}
            </Badge>
            <Text size="1" color="gray">
              ({items.length})
            </Text>
          </Flex>

          {!collapsed.has(type) &&
            items.map(({ id, name }) => (
              <Flex key={id} align="center" gap="2" pl="4" py="1" style={{ borderBottom: "1px solid var(--gray-a3)" }}>
                <Text size="2" weight="medium">{name}</Text>
                <Text size="1" color="gray" style={{ marginLeft: "auto", fontFamily: "monospace" }}>
                  {id.slice(0, 10)}...{id.slice(-6)}
                </Text>
              </Flex>
            ))}
        </Flex>
      ))}
    </Flex>
  );
}
