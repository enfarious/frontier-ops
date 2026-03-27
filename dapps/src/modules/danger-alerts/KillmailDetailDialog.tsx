import {
  Badge,
  Card,
  Dialog,
  Flex,
  Separator,
  Text,
} from "@radix-ui/themes";
import type { KillmailData } from "./danger-types";

interface KillmailDetailDialogProps {
  killmail: KillmailData | null;
  onClose: () => void;
}

function CharacterCard({
  label,
  name,
  id,
  address,
  tribe,
  color,
}: {
  label: string;
  name?: string;
  id: string;
  address?: string;
  tribe?: string;
  color: "red" | "blue" | "gray";
}) {
  return (
    <Card>
      <Flex direction="column" gap="2">
        <Text size="1" color="gray" weight="bold">
          {label}
        </Text>
        <Flex align="center" gap="2">
          {/* Character avatar placeholder */}
          <Flex
            align="center"
            justify="center"
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: `var(--${color}-3)`,
              border: `2px solid var(--${color}-7)`,
              flexShrink: 0,
            }}
          >
            <Text size="4" weight="bold" style={{ color: `var(--${color}-11)` }}>
              {(name || "?")[0].toUpperCase()}
            </Text>
          </Flex>
          <Flex direction="column" gap="0">
            <Text size="3" weight="bold">
              {name || `Pilot #${id}`}
            </Text>
            {tribe && (
              <Badge size="1" variant="soft" color="orange">
                {tribe}
              </Badge>
            )}
          </Flex>
        </Flex>

        <Flex direction="column" gap="1">
          <Flex gap="2" align="center">
            <Text size="1" color="gray" style={{ width: 80 }}>
              Character ID
            </Text>
            <Text size="1" style={{ fontFamily: "monospace" }}>
              {id}
            </Text>
          </Flex>
          {address && (
            <Flex gap="2" align="center">
              <Text size="1" color="gray" style={{ width: 80 }}>
                Wallet
              </Text>
              <Text size="1" style={{ fontFamily: "monospace" }}>
                {address.slice(0, 10)}...{address.slice(-6)}
              </Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

export function KillmailDetailDialog({
  killmail,
  onClose,
}: KillmailDetailDialogProps) {
  if (!killmail) return null;

  return (
    <Dialog.Root open={!!killmail} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content style={{ maxWidth: 520 }}>
        <Dialog.Title>Killmail Details</Dialog.Title>

        <Flex direction="column" gap="4" mt="3">
          {/* Header info */}
          <Flex gap="3" align="center" wrap="wrap">
            <Badge
              color={killmail.lossType === "STRUCTURE" ? "orange" : "red"}
              size="2"
            >
              {killmail.lossType}
            </Badge>
            <Badge color="gray" size="2" variant="soft">
              {killmail.solarSystemName || killmail.solarSystemId}
            </Badge>
            <Text size="2" color="gray">
              {new Date(killmail.killTimestamp).toLocaleString()}
            </Text>
          </Flex>

          <Separator size="4" />

          {/* Killer */}
          <CharacterCard
            label="ATTACKER"
            name={killmail.killerName}
            id={killmail.killerId}
            address={killmail.killerAddress}
            tribe={killmail.killerTribe}
            color="red"
          />

          <Flex align="center" justify="center">
            <Text size="1" color="gray">destroyed</Text>
          </Flex>

          {/* Victim */}
          <CharacterCard
            label="VICTIM"
            name={killmail.victimName}
            id={killmail.victimId}
            address={killmail.victimAddress}
            tribe={killmail.victimTribe}
            color="blue"
          />

          <Separator size="4" />

          {/* Metadata */}
          <Flex direction="column" gap="1">
            <Flex gap="2">
              <Text size="1" color="gray" style={{ width: 100 }}>
                Killmail ID
              </Text>
              <Text size="1" style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                {killmail.id}
              </Text>
            </Flex>
            <Flex gap="2">
              <Text size="1" color="gray" style={{ width: 100 }}>
                Solar System
              </Text>
              <Text size="1">
                {killmail.solarSystemName || "Unknown"} ({killmail.solarSystemId})
              </Text>
            </Flex>
          </Flex>
        </Flex>

        <Flex mt="4" justify="end">
          <Dialog.Close>
            <button>Close</button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
