import { Badge, Box, Card, Code, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { useTurretState } from "./hooks/useTurretState";
import { TurretConfigForm } from "./TurretConfigForm";
import { AccessListManager } from "../../core/components/AccessListManager";
import { PermissionGate } from "../../core/components/PermissionGate";
import { TURRET_TYPE_INFO } from "../../core/assembly-type-ids";

interface TurretDetailProps {
  turretId: string;
}

export function TurretDetail({ turretId }: TurretDetailProps) {
  const { data, isLoading, error } = useTurretState(turretId);

  if (isLoading) return <Text>Loading turret details...</Text>;
  if (error) return <Text color="red">Error loading turret: {String(error)}</Text>;

  const json = data?.json as Record<string, unknown> | undefined;
  const typeId = Number(json?.type_id ?? 0);
  const typeInfo = TURRET_TYPE_INFO[typeId];
  const itemId = (json?.key as any)?.item_id;
  const status = ((json?.status as any)?.status?.["@variant"] as string) ?? "UNKNOWN";
  const metaName = (json?.metadata as any)?.name as string | undefined;
  const energySourceId = json?.energy_source_id as string | undefined;
  const locationHash = (json?.location as any)?.location_hash as string | undefined;

  return (
    <Flex direction="column" gap="4">
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">
            {metaName || (typeInfo ? typeInfo.name : "Turret")}
            {typeInfo && (
              <Badge size="1" variant="soft" color="blue" ml="2">{typeInfo.name}</Badge>
            )}
          </Heading>
          <Separator size="4" />

          <Flex gap="4" wrap="wrap">
            <Box>
              <Text size="1" color="gray">Status</Text>
              <Flex mt="1">
                <Badge color={status === "ONLINE" ? "green" : "red"} size="2">
                  {status}
                </Badge>
              </Flex>
            </Box>
            <Box>
              <Text size="1" color="gray">Type ID</Text>
              <Text size="2" as="p">{typeId}</Text>
            </Box>
            {typeInfo?.effectiveAgainst && (
              <Box>
                <Text size="1" color="gray">Effective Against</Text>
                <Text size="2" as="p">{typeInfo.effectiveAgainst}</Text>
              </Box>
            )}
            {itemId && (
              <Box>
                <Text size="1" color="gray">Item ID</Text>
                <Text size="2" as="p">{itemId}</Text>
              </Box>
            )}
          </Flex>

          <Flex gap="4" wrap="wrap">
            <Box>
              <Text size="1" color="gray">Object ID</Text>
              <Code size="1" variant="ghost">{turretId.slice(0, 16)}...{turretId.slice(-8)}</Code>
            </Box>
            {energySourceId && (
              <Box>
                <Text size="1" color="gray">Energy Source</Text>
                <Code size="1" variant="ghost">{energySourceId.slice(0, 16)}...{energySourceId.slice(-8)}</Code>
              </Box>
            )}
            {locationHash && (
              <Box>
                <Text size="1" color="gray">Location Hash</Text>
                <Code size="1" variant="ghost">{locationHash.slice(0, 20)}...</Code>
              </Box>
            )}
          </Flex>
        </Flex>
      </Card>

      <PermissionGate permission="manage_turrets">
        <TurretConfigForm turretId={turretId} assembly={undefined} />
      </PermissionGate>
      <AccessListManager assemblyId={turretId} assemblyLabel="turret" />
    </Flex>
  );
}
