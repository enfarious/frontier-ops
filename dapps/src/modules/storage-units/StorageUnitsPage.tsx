import { useState } from "react";
import { Box, Flex, Heading, Spinner, Text } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useOperatingContext } from "../../core/OperatingContext";
import { useStorageUnits } from "./hooks/useStorageUnits";
import { StorageList } from "./StorageList";
import { StorageDetail } from "./StorageDetail";
import { TribeScanProgress } from "../../components/TribeScanProgress";

export default function StorageUnitsPage() {
  const account = useCurrentAccount();
  const { mode } = useOperatingContext();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const { data: units, isLoading, error, hasMoreMembers, loadMoreMembers, scannedMembers, totalMembers } = useStorageUnits();

  if (!account) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="gray">Connect your wallet to manage storage units</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Heading size="5">
          Storage Units
          {mode === "tribe" && (
            <Text size="2" color="gray" ml="2">
              (Tribe Mode)
            </Text>
          )}
        </Heading>
        <Text size="1" color="gray">
          {units?.length ?? 0} unit{units?.length !== 1 ? "s" : ""}
        </Text>
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Scanning for storage units...</Text>
        </Flex>
      )}

      {error && (
        <Text color="red" size="2">
          Error loading storage units: {String(error)}
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
          <StorageList
            units={units ?? []}
            selectedId={selectedUnitId}
            onSelect={setSelectedUnitId}
          />
        </Box>

        <Box style={{ flex: 1, overflow: "auto" }}>
          {selectedUnitId ? (
            <StorageDetail unitId={selectedUnitId} />
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray">Select a storage unit to view details</Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
