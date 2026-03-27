import { useState } from "react";
import { Box, Flex, Heading, Spinner, Text } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useOperatingContext } from "../../core/OperatingContext";
import { useGates } from "./hooks/useGates";
import { GateList } from "./GateList";
import { GateDetail } from "./GateDetail";
import { TribeScanProgress } from "../../components/TribeScanProgress";

export default function GateControlPage() {
  const account = useCurrentAccount();
  const { mode } = useOperatingContext();
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);

  const { data: gates, isLoading, error, hasMoreMembers, loadMoreMembers, scannedMembers, totalMembers } = useGates();

  if (!account) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="gray">Connect your wallet to manage gates</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Heading size="5">
          Gate Control
          {mode === "tribe" && (
            <Text size="2" color="gray" ml="2">
              (Tribe Mode)
            </Text>
          )}
        </Heading>
        <Text size="1" color="gray">
          {gates?.length ?? 0} gate{gates?.length !== 1 ? "s" : ""}
        </Text>
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Scanning for gates...</Text>
        </Flex>
      )}

      {error && (
        <Text color="red" size="2">
          Error loading gates: {String(error)}
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
          <GateList
            gates={gates ?? []}
            selectedId={selectedGateId}
            onSelect={setSelectedGateId}
          />
        </Box>

        <Box style={{ flex: 1, overflow: "auto" }}>
          {selectedGateId ? (
            <GateDetail gateId={selectedGateId} />
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray">Select a gate to view details</Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
