import { Button, Flex, Text } from "@radix-ui/themes";

interface TribeScanProgressProps {
  hasMore: boolean;
  onLoadMore: () => void;
  scannedMembers?: number;
  totalMembers?: number;
  isLoading?: boolean;
}

/**
 * Shows tribe scan progress and a "Scan More" button when paginated.
 * Only renders when there are more members to scan.
 */
export function TribeScanProgress({
  hasMore,
  onLoadMore,
  scannedMembers,
  totalMembers,
  isLoading,
}: TribeScanProgressProps) {
  if (!hasMore && !isLoading) return null;

  return (
    <Flex align="center" gap="3" py="2" px="3" style={{ borderRadius: 6, border: "1px solid var(--gray-a4)", background: "var(--gray-a2)" }}>
      {scannedMembers != null && totalMembers != null && (
        <Text size="1" color="gray">
          Scanned {scannedMembers} / {totalMembers} members
        </Text>
      )}
      {isLoading ? (
        <Text size="1" color="gray">Scanning...</Text>
      ) : hasMore ? (
        <Button size="1" variant="soft" onClick={onLoadMore}>
          Scan More Members
        </Button>
      ) : null}
    </Flex>
  );
}
