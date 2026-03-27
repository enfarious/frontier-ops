import { useState } from "react";
import { Box, Flex, Heading, Spinner, Text } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useOperatingContext } from "../../core/OperatingContext";
import { useNetworkNodes } from "./hooks/useNetworkNodes";
import { NodeList } from "./NodeList";
import { NodeDetail } from "./NodeDetail";
import { TribeScanProgress } from "../../components/TribeScanProgress";

export default function NetworkNodesPage() {
  const account = useCurrentAccount();
  const { mode } = useOperatingContext();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { data: nodes, isLoading, error, hasMoreMembers, loadMoreMembers } = useNetworkNodes();

  if (!account) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="gray">Connect your wallet to manage network nodes</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" style={{ height: "100%" }}>
      <Flex align="center" justify="between">
        <Heading size="5">
          Network Nodes
          {mode === "tribe" && (
            <Text size="2" color="gray" ml="2">
              (Tribe Mode)
            </Text>
          )}
        </Heading>
        <Text size="1" color="gray">
          {nodes?.length ?? 0} node{nodes?.length !== 1 ? "s" : ""}
        </Text>
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Scanning for network nodes...</Text>
        </Flex>
      )}

      {error && (
        <Text color="red" size="2">
          Error loading network nodes: {String(error)}
        </Text>
      )}

      {mode === "tribe" && (
        <TribeScanProgress
          hasMore={hasMoreMembers}
          onLoadMore={loadMoreMembers}
          isLoading={isLoading}
        />
      )}

      <Flex gap="4" style={{ flex: 1, overflow: "hidden" }}>
        <Box style={{ width: "40%", minWidth: 280, overflow: "auto" }}>
          <NodeList
            nodes={nodes ?? []}
            selectedId={selectedNodeId}
            onSelect={setSelectedNodeId}
          />
        </Box>

        <Box style={{ flex: 1, overflow: "auto" }}>
          {selectedNodeId ? (
            <NodeDetail nodeId={selectedNodeId} />
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray">Select a node to view details</Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
