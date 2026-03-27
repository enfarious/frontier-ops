import { useState, useEffect } from "react";
import { Button, Dialog, Flex, Text, TextArea, TextField } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { searchCharactersByName, type CharacterSearchResult } from "../../core/character-search";

interface BountyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string, description: string, target: string, amountSui: number) => void;
}

export function BountyCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: BountyCreateDialogProps) {
  const account = useCurrentAccount();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [targetName, setTargetName] = useState("");
  const [charSearch, setCharSearch] = useState("");
  const [charResults, setCharResults] = useState<CharacterSearchResult[]>([]);
  const [rewardSui, setRewardSui] = useState("");

  useEffect(() => {
    if (charSearch.length < 2) { setCharResults([]); return; }
    const timer = setTimeout(() => {
      searchCharactersByName(charSearch).then(setCharResults);
    }, 200);
    return () => clearTimeout(timer);
  }, [charSearch]);

  function reset() {
    setTitle("");
    setDescription("");
    setTarget("");
    setTargetName("");
    setCharSearch("");
    setCharResults([]);
    setRewardSui("");
  }

  function handleCreate() {
    if (!title.trim() || !account) return;
    const targetStr = target || charSearch.trim();
    if (!targetStr) return;
    const amount = parseFloat(rewardSui);
    if (isNaN(amount) || amount <= 0) return;

    onCreate(title.trim(), description.trim(), targetStr, amount);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 480 }}>
        <Dialog.Title>Post Bounty</Dialog.Title>

        <Flex direction="column" gap="3" mt="3">
          <TextField.Root
            placeholder="Bounty title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <TextArea
            placeholder="Description / reason (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          <Flex direction="column" gap="1">
            <Text size="1" color="gray">Target</Text>
            <Flex direction="column" gap="1" style={{ position: "relative" }}>
              <TextField.Root
                size="2"
                placeholder="Search character name or paste address..."
                value={charSearch}
                onChange={(e) => {
                  setCharSearch(e.target.value);
                  if (targetName && e.target.value !== targetName) {
                    setTarget("");
                    setTargetName("");
                  }
                }}
              />
              {charResults.length > 0 && (
                <Flex
                  direction="column"
                  style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                    background: "var(--color-background)", border: "1px solid var(--color-border)",
                    borderRadius: 4, maxHeight: 200, overflowY: "auto",
                  }}
                >
                  {charResults.map((c) => (
                    <Flex
                      key={c.characterId}
                      align="center" justify="between" p="2"
                      onClick={() => {
                        setTarget(c.address);
                        setTargetName(c.name);
                        setCharSearch(c.name);
                        setCharResults([]);
                        if (!title) setTitle(`Bounty: ${c.name}`);
                      }}
                      style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}
                    >
                      <Text size="1" weight="bold">{c.name}</Text>
                      <Text size="1" color="gray" style={{ fontFamily: "monospace" }}>
                        {c.address.slice(0, 6)}...{c.address.slice(-4)}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              )}
            </Flex>
            {targetName && (
              <Text size="1" color="green">
                {targetName} → {target.slice(0, 10)}...{target.slice(-6)}
              </Text>
            )}
          </Flex>

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
              SUI will be escrowed on-chain. Released to the hunter when you approve their claim (2.5% platform fee).
            </Text>
          </Flex>
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button
            onClick={handleCreate}
            disabled={
              !title.trim() ||
              !(target || charSearch.trim()) ||
              !rewardSui.trim() ||
              isNaN(parseFloat(rewardSui)) ||
              parseFloat(rewardSui) <= 0
            }
          >
            Post Bounty (Escrow)
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
