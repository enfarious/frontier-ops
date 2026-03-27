import { useState } from "react";
import {
  Card,
  Flex,
  Heading,
  IconButton,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import { useOperatingContext } from "../../core/OperatingContext";

interface TurretAccessManagerProps {
  turretId: string;
}

export function TurretAccessManager({ turretId: _turretId }: TurretAccessManagerProps) {
  const { mode } = useOperatingContext();
  const [allowedAddresses, setAllowedAddresses] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState("");

  function addAddress() {
    const addr = newAddress.trim();
    if (addr && !allowedAddresses.includes(addr)) {
      setAllowedAddresses([...allowedAddresses, addr]);
      setNewAddress("");
    }
  }

  function removeAddress(addr: string) {
    setAllowedAddresses(allowedAddresses.filter((a) => a !== addr));
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Heading size="3">Access Control</Heading>
        <Separator size="4" />

        {mode === "tribe" && (
          <Text size="1" color="gray">
            Managing access for tribe members. Tribe members with permissions
            can operate this turret.
          </Text>
        )}

        <Flex direction="column" gap="2">
          <Text size="2" weight="bold">
            Allowed Addresses
          </Text>

          {allowedAddresses.length === 0 && (
            <Text size="1" color="gray">
              No addresses added — only owner can operate
            </Text>
          )}

          {allowedAddresses.map((addr) => (
            <Flex key={addr} align="center" gap="2">
              <Text
                size="1"
                style={{
                  fontFamily: "monospace",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {addr}
              </Text>
              <IconButton
                size="1"
                variant="ghost"
                color="red"
                onClick={() => removeAddress(addr)}
              >
                <Cross1Icon />
              </IconButton>
            </Flex>
          ))}

          <Flex gap="2">
            <TextField.Root
              size="1"
              placeholder="0x..."
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAddress()}
              style={{ flex: 1 }}
            />
            <IconButton size="1" onClick={addAddress}>
              <PlusIcon />
            </IconButton>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
}
