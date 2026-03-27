import { useState, useEffect } from "react";
import {
  Button,
  Dialog,
  Flex,
  IconButton,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { getItemTypeMap, type ItemType } from "../../core/world-api";

interface JobCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string, description: string, amountSui: number, competitive: boolean) => void;
}

export function JobCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: JobCreateDialogProps) {
  const account = useCurrentAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardSui, setRewardSui] = useState("");
  const [competitive, setCompetitive] = useState(false);
  const [deliverables, setDeliverables] = useState<
    { itemName: string; targetQuantity: string; search: string }[]
  >([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [activeDelivSearch, setActiveDelivSearch] = useState<number | null>(null);

  useEffect(() => {
    getItemTypeMap().then((map) => setItemTypes(Array.from(map.values())));
  }, []);

  function reset() {
    setTitle("");
    setDescription("");
    setRewardSui("");
    setCompetitive(false);
    setDeliverables([]);
  }

  function handleCreate() {
    if (!title.trim() || !account) return;
    const amount = parseFloat(rewardSui);
    if (isNaN(amount) || amount <= 0) return;

    // Build description with deliverables appended
    let fullDesc = description.trim();
    if (deliverables.length > 0) {
      const delivLines = deliverables
        .filter((d) => d.itemName.trim())
        .map((d) => `- ${d.itemName.trim()} x${d.targetQuantity || 1}`)
        .join("\n");
      if (delivLines) fullDesc += (fullDesc ? "\n\n" : "") + "Deliverables:\n" + delivLines;
    }

    onCreate(title.trim(), fullDesc, amount, competitive);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 480 }}>
        <Dialog.Title>Create Job</Dialog.Title>

        <Flex direction="column" gap="3" mt="3">
          <TextField.Root
            placeholder="Job title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <TextArea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

          {/* Deliverables */}
          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Text size="2" weight="bold">Deliverables (optional)</Text>
              <IconButton size="1" variant="ghost" onClick={() =>
                setDeliverables((prev) => [...prev, { itemName: "", targetQuantity: "1", search: "" }])
              }>
                <PlusIcon />
              </IconButton>
            </Flex>
            {deliverables.map((d, i) => {
              const searchResults = d.search.length >= 2
                ? itemTypes.filter((t) =>
                    t.name.toLowerCase().includes(d.search.toLowerCase()),
                  ).slice(0, 6)
                : [];
              return (
                <Flex key={i} gap="2" align="center">
                  <Flex direction="column" style={{ flex: 1, position: "relative" }}>
                    <TextField.Root
                      size="1"
                      placeholder="Search items..."
                      value={d.itemName || d.search}
                      onChange={(e) => {
                        setDeliverables((prev) =>
                          prev.map((dd, ii) =>
                            ii === i ? { ...dd, itemName: "", search: e.target.value } : dd,
                          ),
                        );
                        setActiveDelivSearch(i);
                      }}
                      onFocus={() => setActiveDelivSearch(i)}
                      onBlur={() => setTimeout(() => setActiveDelivSearch(null), 150)}
                    />
                    {activeDelivSearch === i && searchResults.length > 0 && (
                      <Flex
                        direction="column"
                        style={{
                          position: "absolute", top: "100%", left: 0, right: 0,
                          background: "var(--color-panel)", border: "1px solid var(--color-border)",
                          borderRadius: 4, zIndex: 10, maxHeight: 160, overflow: "auto",
                        }}
                      >
                        {searchResults.map((item) => (
                          <Flex
                            key={item.id}
                            px="2" py="1"
                            style={{ cursor: "pointer" }}
                            onClick={() => {
                              setDeliverables((prev) =>
                                prev.map((dd, ii) =>
                                  ii === i ? { ...dd, itemName: item.name, search: "" } : dd,
                                ),
                              );
                              setActiveDelivSearch(null);
                            }}
                          >
                            <Text size="1">{item.name}</Text>
                            <Text size="1" color="gray" ml="auto">{item.categoryName}</Text>
                          </Flex>
                        ))}
                      </Flex>
                    )}
                  </Flex>
                  <TextField.Root
                    size="1" type="number" placeholder="Qty"
                    value={d.targetQuantity}
                    onChange={(e) =>
                      setDeliverables((prev) =>
                        prev.map((dd, ii) =>
                          ii === i ? { ...dd, targetQuantity: e.target.value } : dd,
                        ),
                      )
                    }
                    style={{ width: 60 }}
                  />
                  <IconButton size="1" variant="ghost" color="red" onClick={() =>
                    setDeliverables((prev) => prev.filter((_, j) => j !== i))
                  }>
                    <Cross1Icon />
                  </IconButton>
                </Flex>
              );
            })}
            {deliverables.length === 0 && (
              <Text size="1" color="gray">Add items that need to be delivered.</Text>
            )}
          </Flex>

          {/* Reward */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">Reward (SUI)</Text>
            <TextField.Root
              type="number"
              placeholder="Amount in SUI"
              value={rewardSui}
              onChange={(e) => setRewardSui(e.target.value)}
              style={{ width: 160 }}
            />
          </Flex>

          <Flex
            p="2"
            style={{
              background: "var(--accent-2)",
              borderRadius: 6,
              border: "1px solid var(--accent-6)",
            }}
          >
            <Text size="1" color="blue">
              SUI will be escrowed on-chain. Released to the worker on approval (2.5% platform fee).
            </Text>
          </Flex>

          {/* Competitive toggle */}
          <Flex align="center" gap="2">
            <Switch size="1" checked={competitive} onCheckedChange={setCompetitive} />
            <Text size="1" color={competitive ? "orange" : "gray"}>
              {competitive
                ? "Competitive — multiple workers race to deliver, first wins"
                : "Assigned — single worker accepts and completes"}
            </Text>
          </Flex>
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button
            color={competitive ? "orange" : undefined}
            onClick={handleCreate}
            disabled={!title.trim() || !rewardSui.trim() || isNaN(parseFloat(rewardSui)) || parseFloat(rewardSui) <= 0}
          >
            {competitive ? "Post Race (Escrow)" : "Post Job (Escrow)"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
