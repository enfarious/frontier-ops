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

interface WatchedSystemsConfigProps {
  systems: string[];
  onAdd: (systemId: string) => void;
  onRemove: (systemId: string) => void;
}

export function WatchedSystemsConfig({
  systems,
  onAdd,
  onRemove,
}: WatchedSystemsConfigProps) {
  const [newSystem, setNewSystem] = useState("");

  function handleAdd() {
    const id = newSystem.trim();
    if (!id) return;
    onAdd(id);
    setNewSystem("");
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Heading size="3">Watched Systems</Heading>
        <Separator size="4" />
        <Text size="1" color="gray">
          Kills in watched systems are highlighted in the feed.
        </Text>

        {systems.length === 0 && (
          <Text size="1" color="gray">
            No systems watched. Add a solar system ID to monitor.
          </Text>
        )}

        {systems.map((sys) => (
          <Flex key={sys} align="center" gap="2">
            <Text size="1" style={{ fontFamily: "monospace", flex: 1 }}>
              {sys}
            </Text>
            <IconButton
              size="1"
              variant="ghost"
              color="red"
              onClick={() => onRemove(sys)}
            >
              <Cross1Icon />
            </IconButton>
          </Flex>
        ))}

        <Flex gap="2">
          <TextField.Root
            size="1"
            placeholder="Solar system ID..."
            value={newSystem}
            onChange={(e) => setNewSystem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            style={{ flex: 1 }}
          />
          <IconButton size="1" onClick={handleAdd}>
            <PlusIcon />
          </IconButton>
        </Flex>
      </Flex>
    </Card>
  );
}
