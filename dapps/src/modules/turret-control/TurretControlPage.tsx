import { useState } from "react";
import { Box, Flex, Heading, Spinner, Text } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useOperatingContext } from "../../core/OperatingContext";
import { useTurrets } from "./hooks/useTurrets";
import { TurretList } from "./TurretList";
import { TurretDetail } from "./TurretDetail";
import { TribeScanProgress } from "../../components/TribeScanProgress";

export default function TurretControlPage() {
  const account = useCurrentAccount();
  const { mode } = useOperatingContext();
  const [selectedTurretId, setSelectedTurretId] = useState<string | null>(null);

  const { data: turrets, isLoading, error, hasMoreMembers, loadMoreMembers, scannedMembers, totalMembers } = useTurrets();

  if (!account) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="gray">Connect your wallet to manage turrets</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Heading size="5">
          Turret Control
          {mode === "tribe" && (
            <Text size="2" color="gray" ml="2">
              (Tribe Mode)
            </Text>
          )}
        </Heading>
        <Text size="1" color="gray">
          {turrets?.length ?? 0} turret{turrets?.length !== 1 ? "s" : ""}
        </Text>
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Scanning for turrets...</Text>
        </Flex>
      )}

      {error && (
        <Text color="red" size="2">
          Error loading turrets: {String(error)}
        </Text>
      )}

      {mode === "tribe" && (
        <TribeScanProgress
          hasMore={hasMoreMembers}
          onLoadMore={loadMoreMembers}
          scannedMembers={scannedMembers}
          totalMembers={totalMembers}
          isLoading={isLoading}
        />
      )}

      <Flex gap="4" style={{ flex: 1, overflow: "hidden" }}>
        <Box style={{ width: "40%", minWidth: 280, overflow: "auto" }}>
          <TurretList
            turrets={turrets ?? []}
            selectedId={selectedTurretId}
            onSelect={setSelectedTurretId}
          />
        </Box>

        <Box style={{ flex: 1, overflow: "auto" }}>
          {selectedTurretId ? (
            <TurretDetail turretId={selectedTurretId} />
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray">Select a turret to view details</Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
