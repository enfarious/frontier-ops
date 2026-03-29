import { useState, useEffect } from "react";
import { Button, Dialog, Flex, Text, TextArea, TextField } from "@radix-ui/themes";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { searchCharactersByName, type CharacterSearchResult } from "../../core/character-search";
import { appendVisibility, type Visibility } from "../../core/visibility";

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
  const [visibility, setVisibility] = useState<Visibility>("public");

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
    setVisibility("public");
  }

  function handleCreate() {
    if (!title.trim() || !account) return;
    const targetStr = target || charSearch.trim();
    if (!targetStr) return;
    const amount = parseFloat(rewardSui);
    if (isNaN(amount) || amount <= 0) return;

    const fullDesc = appendVisibility(description.trim(), visibility);
    onCreate(title.trim(), fullDesc, targetStr, amount);
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

          {/* Visibility */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">Visibility</Text>
            <Flex gap="2">
              {(["public", "tribe", "friends"] as const).map((v) => (
                <Flex
                  key={v}
                  align="center"
                  gap="1"
                  onClick={() => setVisibility(v)}
                  style={{ cursor: "pointer" }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: `1px solid ${visibility === v ? "var(--accent-9)" : "var(--gray-7)"}`,
                    background: visibility === v ? "var(--accent-9)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {visibility === v && (
                      <Text size="1" style={{ color: "white", lineHeight: 1, fontSize: 9 }}>✓</Text>
                    )}
                  </div>
                  <Text size="1" color={visibility === v ? undefined : "gray"}>
                    {v === "public" ? "Public" : v === "tribe" ? "Tribe Only" : "Friends Only"}
                  </Text>
                </Flex>
              ))}
            </Flex>
            {visibility === "friends" && (
              <Text size="1" color="orange">
                Hidden from casual view. Chain readers can still find it — intel is a weapon.
              </Text>
            )}
            {visibility === "tribe" && (
              <Text size="1" color="blue">
                Only tribe members will see this in the UI.
              </Text>
            )}
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
