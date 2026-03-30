import { useState } from "react";
import { Badge, Button, Card, Dialog, Flex, Select, SegmentedControl, Text, TextArea, TextField } from "@radix-ui/themes";
import { PlusIcon, LockClosedIcon, CheckCircledIcon, Cross2Icon, ReloadIcon } from "@radix-ui/react-icons";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import type { OnChainBounty } from "../../../core/intel-bounty-queries";
import { fetchOnChainBounties, invalidateBountyCache, fetchBountyKeyRevealedEvent } from "../../../core/intel-bounty-queries";
import {
  buildCreateBountyTx,
  buildSubmitFulfillmentTx,
  buildAcceptFulfillmentTx,
  buildRejectFulfillmentTx,
  buildCancelBountyTx,
  BOUNTY_CATEGORY_LABELS,
  type BountyCategory,
} from "../../../core/intel-bounty-actions";
import { generateKey, encrypt, hashKey } from "../../../core/crypto";
import { decrypt as aesDecrypt } from "../../../core/crypto";
import type { DeadDropPayload } from "../../../core/tradecraft-types";
import { importDeadDrop } from "../hooks/useIntelPackages";

function statusColor(status: number): "green" | "yellow" | "blue" | "gray" {
  switch (status) {
    case 0: return "green";   // open
    case 1: return "yellow";  // pending
    case 2: return "blue";    // completed
    default: return "gray";   // cancelled
  }
}

function categoryColor(cat: number): "gray" | "purple" | "orange" | "blue" | "red" {
  switch (cat) {
    case 1: return "purple";  // gate
    case 2: return "orange";  // asset
    case 3: return "blue";    // fleet
    case 4: return "red";     // player
    default: return "gray";   // general
  }
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function PostBountyDialog({ onPosted }: { onPosted: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<BountyCategory>(0);
  const [targetSystem, setTargetSystem] = useState("");
  const [targetTribe, setTargetTribe] = useState("");
  const [rewardSui, setRewardSui] = useState("1");
  const [expiryDays, setExpiryDays] = useState("7");
  const [pending, setPending] = useState(false);
  const dAppKit = useDAppKit();

  async function handleSubmit() {
    if (!title.trim() || !rewardSui) return;
    setPending(true);
    try {
      const rewardMist = BigInt(Math.round(Number(rewardSui) * 1_000_000_000));
      const days = Number(expiryDays) || 0;
      const expiresAt = days > 0 ? Date.now() + days * 86400_000 : 0;

      const tx = buildCreateBountyTx(
        title.trim(),
        description.trim(),
        category,
        targetSystem.trim(),
        targetTribe.trim(),
        rewardMist,
        expiresAt,
      );
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateBountyCache();
      setTimeout(onPosted, 3000);
      setOpen(false);
      setTitle("");
      setDescription("");
      setCategory(0);
      setTargetSystem("");
      setTargetTribe("");
      setRewardSui("1");
    } catch (e) {
      console.error("[Bounty] Create failed:", e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="soft" color="green"><PlusIcon /> Post Bounty</Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 440 }}>
        <Dialog.Title>Post Intel Bounty</Dialog.Title>
        <Text size="1" color="gray">Describe the intel you need. SUI is escrowed until you accept a fulfillment.</Text>

        <Flex direction="column" gap="3" mt="3">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Title</Text>
            <TextField.Root placeholder="e.g. Gate locations near Archavolos" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Description</Text>
            <TextArea placeholder="What intel do you need? Be specific..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Flex>

          <Flex gap="3">
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">Category</Text>
              <Select.Root value={String(category)} onValueChange={(v) => setCategory(Number(v) as BountyCategory)}>
                <Select.Trigger />
                <Select.Content>
                  {Object.entries(BOUNTY_CATEGORY_LABELS).map(([k, v]) => (
                    <Select.Item key={k} value={k}>{v}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">Reward (SUI)</Text>
              <TextField.Root placeholder="1" value={rewardSui} onChange={(e) => setRewardSui(e.target.value)} />
            </Flex>
          </Flex>

          <Flex gap="3">
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">Target System (optional)</Text>
              <TextField.Root placeholder="System name" value={targetSystem} onChange={(e) => setTargetSystem(e.target.value)} />
            </Flex>
            <Flex direction="column" gap="1" style={{ flex: 1 }}>
              <Text size="1" color="gray" weight="bold">Target Tribe (optional)</Text>
              <TextField.Root placeholder="Tribe name" value={targetTribe} onChange={(e) => setTargetTribe(e.target.value)} />
            </Flex>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Expires in (days, 0 = no expiry)</Text>
            <TextField.Root placeholder="7" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
          </Flex>
        </Flex>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close>
          <Button color="green" disabled={!title.trim() || !rewardSui || pending} onClick={handleSubmit}>
            {pending ? "Depositing..." : `Post Bounty (${rewardSui} SUI)`}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function FulfillBountyDialog({
  bounty,
  onFulfilled,
}: {
  bounty: OnChainBounty;
  onFulfilled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState("");
  const [pending, setPending] = useState(false);
  const [useFile, setUseFile] = useState(false);
  const [filePayload, setFilePayload] = useState<DeadDropPayload | null>(null);
  const [manualIntel, setManualIntel] = useState("");
  const dAppKit = useDAppKit();

  function handleFileSelect() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload: DeadDropPayload = JSON.parse(text);
        setFilePayload(payload);
        setUseFile(true);
      } catch {
        console.error("Invalid Dead Drop file");
      }
    };
    input.click();
  }

  async function handleSubmit() {
    if (!teaser.trim()) return;
    setPending(true);
    try {
      // Build the plaintext payload
      let plaintext: string;
      if (useFile && filePayload) {
        plaintext = JSON.stringify(filePayload);
      } else {
        // Create a minimal Dead Drop from the manual text
        const payload: DeadDropPayload = {
          version: 1,
          packageId: `bounty-${bounty.objectId}`,
          title: bounty.title,
          description: manualIntel,
          askingPrice: "0",
          exportedAt: new Date().toISOString(),
          contents: { sightings: [], fieldReports: [], watchTargets: [] },
        };
        plaintext = JSON.stringify(payload);
      }

      // Encrypt
      const keyBytes = await generateKey();
      const encryptedPayload = await encrypt(plaintext, keyBytes);
      const keyHashBytes = await hashKey(keyBytes);

      const tx = buildSubmitFulfillmentTx(
        bounty.objectId,
        teaser.trim(),
        encryptedPayload,
        keyBytes,
        keyHashBytes,
      );
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateBountyCache();
      setTimeout(onFulfilled, 3000);
      setOpen(false);
    } catch (e) {
      console.error("[Bounty] Fulfillment failed:", e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="solid" color="purple">
          <LockClosedIcon /> Fulfill
        </Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 440 }}>
        <Dialog.Title>Fulfill Bounty</Dialog.Title>
        <Text size="1" color="gray">
          Submit a teaser (visible to poster) and your encrypted intel.
          The poster reads your teaser to decide — full intel decrypts only on acceptance.
        </Text>

        <Flex direction="column" gap="3" mt="3">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Teaser (public preview)</Text>
            <TextArea
              placeholder="e.g. Found 3 gates and 2 SSUs in the northern corridor, all active..."
              value={teaser}
              onChange={(e) => setTeaser(e.target.value)}
              rows={3}
            />
          </Flex>

          <Flex direction="column" gap="2">
            <Text size="1" color="gray" weight="bold">Intel Payload</Text>
            <Flex gap="2">
              <Button size="1" variant={!useFile ? "solid" : "outline"} onClick={() => setUseFile(false)}>
                Write Intel
              </Button>
              <Button size="1" variant={useFile ? "solid" : "outline"} onClick={handleFileSelect}>
                Upload Dead Drop
              </Button>
            </Flex>

            {!useFile && (
              <TextArea
                placeholder="Full intel details (will be encrypted)..."
                value={manualIntel}
                onChange={(e) => setManualIntel(e.target.value)}
                rows={4}
              />
            )}
            {useFile && filePayload && (
              <Text size="1" color="green">
                Dead Drop loaded: {filePayload.title} ({filePayload.contents.sightings.length} sightings, {filePayload.contents.fieldReports.length} reports)
              </Text>
            )}
          </Flex>
        </Flex>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close><Button variant="soft" color="gray">Cancel</Button></Dialog.Close>
          <Button color="purple" disabled={!teaser.trim() || pending} onClick={handleSubmit}>
            <LockClosedIcon />
            {pending ? "Encrypting & Signing..." : "Submit Fulfillment"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function BountiesTab() {
  const [bounties, setBounties] = useState<OnChainBounty[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [actionPending, setActionPending] = useState(false);
  const [decryptedPayloads, setDecryptedPayloads] = useState<Map<string, any>>(new Map());
  const [importStatus, setImportStatus] = useState<Map<string, string>>(new Map());
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  async function loadBounties() {
    setLoading(true);
    invalidateBountyCache();
    const all = await fetchOnChainBounties();
    setBounties(all);
    setLoading(false);
  }

  async function handleAccept(bounty: OnChainBounty) {
    setActionPending(true);
    try {
      const tx = buildAcceptFulfillmentTx(bounty.objectId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateBountyCache();
      setTimeout(loadBounties, 3000);
    } catch (e) {
      console.error("[Bounty] Accept failed:", e);
    } finally {
      setActionPending(false);
    }
  }

  async function handleReject(bounty: OnChainBounty) {
    setActionPending(true);
    try {
      const tx = buildRejectFulfillmentTx(bounty.objectId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateBountyCache();
      setTimeout(loadBounties, 3000);
    } catch (e) {
      console.error("[Bounty] Reject failed:", e);
    } finally {
      setActionPending(false);
    }
  }

  async function handleCancel(bounty: OnChainBounty) {
    setActionPending(true);
    try {
      const tx = buildCancelBountyTx(bounty.objectId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateBountyCache();
      setTimeout(loadBounties, 3000);
    } catch (e) {
      console.error("[Bounty] Cancel failed:", e);
    } finally {
      setActionPending(false);
    }
  }

  async function handleDecrypt(bounty: OnChainBounty) {
    if (!account?.address) return;
    try {
      const keyBytes = await fetchBountyKeyRevealedEvent(bounty.objectId, account.address);
      if (keyBytes && bounty.encryptedPayload.length > 0) {
        const plaintext = await aesDecrypt(bounty.encryptedPayload, keyBytes);
        const parsed = JSON.parse(plaintext);
        setDecryptedPayloads((prev) => new Map(prev).set(bounty.objectId, parsed));
      }
    } catch (e) {
      console.error("[Bounty] Decryption failed:", e);
    }
  }

  async function handleImportDecrypted(bountyId: string) {
    const payload = decryptedPayloads.get(bountyId);
    if (!payload?.contents) return;
    try {
      const result = await importDeadDrop(payload);
      const parts: string[] = [];
      if (result.sightings) parts.push(`${result.sightings} sightings`);
      if (result.reports) parts.push(`${result.reports} reports`);
      if (result.watchTargets) parts.push(`${result.watchTargets} targets`);
      setImportStatus((prev) => new Map(prev).set(bountyId, `Imported ${parts.join(", ")}`));
      setTimeout(() => setImportStatus((prev) => { const m = new Map(prev); m.delete(bountyId); return m; }), 3000);
    } catch (e) {
      console.error("[Bounty] Import failed:", e);
    }
  }

  const filtered = filter === "all"
    ? bounties
    : filter === "mine"
    ? bounties.filter((b) => b.poster === account?.address)
    : bounties.filter((b) => b.status === Number(filter));

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center">
        <Flex gap="2" align="center">
          <SegmentedControl.Root value={filter} onValueChange={setFilter} size="1">
            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
            <SegmentedControl.Item value="0">Open</SegmentedControl.Item>
            <SegmentedControl.Item value="mine">Mine</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text size="1" color="gray">{filtered.length} bounties</Text>
        </Flex>
        <Flex gap="2">
          <Button size="1" variant="ghost" onClick={loadBounties} disabled={loading}>
            <ReloadIcon /> {loading ? "Loading..." : "Refresh"}
          </Button>
          <PostBountyDialog onPosted={loadBounties} />
        </Flex>
      </Flex>

      {bounties.length === 0 && !loading && (
        <Text size="2" color="gray">
          No bounties on-chain. Post a bounty to request intel, or refresh to check for new ones.
        </Text>
      )}

      <Flex direction="column" gap="2" style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
        {filtered.map((bounty) => {
          const isPoster = bounty.poster === account?.address;
          const isHunter = bounty.hunter === account?.address;
          const decrypted = decryptedPayloads.get(bounty.objectId);
          const imported = importStatus.get(bounty.objectId);

          return (
            <Card key={bounty.objectId} style={{
              borderLeft: `3px solid var(--${statusColor(bounty.status)}-9)`,
            }}>
              <Flex direction="column" gap="2">
                <Flex gap="2" align="center" wrap="wrap">
                  <Badge size="1" variant="soft" color={statusColor(bounty.status)}>
                    {bounty.statusLabel}
                  </Badge>
                  <Badge size="1" variant="outline" color={categoryColor(bounty.category)}>
                    {BOUNTY_CATEGORY_LABELS[bounty.category as BountyCategory] ?? "General"}
                  </Badge>
                  <Badge size="1" variant="outline" color="yellow">
                    {bounty.rewardSui} SUI
                  </Badge>
                  {isPoster && <Badge size="1" variant="solid" color="blue">You posted</Badge>}
                  {isHunter && <Badge size="1" variant="solid" color="purple">You fulfilled</Badge>}
                </Flex>

                <Text size="2" weight="bold">{bounty.title}</Text>
                {bounty.description && (
                  <Text size="1" color="gray">{bounty.description}</Text>
                )}

                <Flex gap="3" wrap="wrap">
                  {bounty.targetSystem && (
                    <Text size="1" color="blue">System: {bounty.targetSystem}</Text>
                  )}
                  {bounty.targetTribe && (
                    <Text size="1" color="purple">Tribe: {bounty.targetTribe}</Text>
                  )}
                  {bounty.createdAt > 0 && (
                    <Text size="1" color="gray">Posted {timeAgo(bounty.createdAt)}</Text>
                  )}
                  {bounty.expiresAt > 0 && (
                    <Text size="1" color={bounty.expiresAt < Date.now() ? "red" : "gray"}>
                      {bounty.expiresAt < Date.now() ? "Expired" : `Expires ${timeAgo(bounty.expiresAt - (Date.now() - bounty.expiresAt))}`}
                    </Text>
                  )}
                </Flex>

                {/* Teaser from hunter (visible when pending) */}
                {bounty.status === 1 && bounty.teaser && (
                  <Flex direction="column" gap="1" p="2" style={{
                    background: "var(--yellow-2)",
                    borderRadius: 4,
                    border: "1px solid var(--yellow-6)",
                  }}>
                    <Text size="1" weight="bold" color="yellow">Hunter's Teaser</Text>
                    <Text size="1">{bounty.teaser}</Text>
                  </Flex>
                )}

                {/* Decrypted intel (after acceptance) */}
                {decrypted && (
                  <Flex direction="column" gap="1" p="2" style={{
                    background: "var(--green-2)",
                    borderRadius: 4,
                    border: "1px solid var(--green-6)",
                  }}>
                    <Flex justify="between" align="center">
                      <Text size="1" weight="bold" color="green">DECRYPTED INTEL</Text>
                      {!imported && (
                        <Button size="1" variant="soft" color="green" onClick={() => handleImportDecrypted(bounty.objectId)}>
                          Import to DB
                        </Button>
                      )}
                      {imported && <Text size="1" color="green">{imported}</Text>}
                    </Flex>
                    {decrypted.contents?.sightings?.map((s: any, i: number) => (
                      <Text key={i} size="1">
                        <Badge size="1" variant="outline" color="orange" mr="1">
                          {(s.assetType ?? "unknown").toUpperCase()}
                        </Badge>
                        {s.solarSystemName ?? "Unknown"}
                        {s.ownerName ? ` — ${s.ownerName}` : ""}
                      </Text>
                    ))}
                    {decrypted.contents?.fieldReports?.map((r: any, i: number) => (
                      <Text key={`r${i}`} size="1">
                        <Badge size="1" variant="outline" color="blue" mr="1">Report</Badge>
                        {r.title}
                      </Text>
                    ))}
                    {decrypted.description && !decrypted.contents?.sightings?.length && !decrypted.contents?.fieldReports?.length && (
                      <Text size="1">{decrypted.description}</Text>
                    )}
                  </Flex>
                )}

                {/* Actions */}
                <Flex gap="2" align="center" wrap="wrap">
                  {/* Open bounty — anyone can fulfill */}
                  {bounty.status === 0 && account?.address && !isPoster && (
                    <FulfillBountyDialog bounty={bounty} onFulfilled={loadBounties} />
                  )}

                  {/* Pending — poster can accept or reject */}
                  {bounty.status === 1 && isPoster && (
                    <>
                      <Button size="1" variant="solid" color="green" disabled={actionPending} onClick={() => handleAccept(bounty)}>
                        <CheckCircledIcon /> {actionPending ? "Signing..." : "Accept & Pay"}
                      </Button>
                      <Button size="1" variant="ghost" color="red" disabled={actionPending} onClick={() => handleReject(bounty)}>
                        <Cross2Icon /> Reject
                      </Button>
                    </>
                  )}

                  {/* Completed — poster can decrypt */}
                  {bounty.status === 2 && isPoster && !decrypted && (
                    <Button size="1" variant="solid" color="green" onClick={() => handleDecrypt(bounty)}>
                      <LockClosedIcon /> Decrypt Intel
                    </Button>
                  )}

                  {/* Open — poster can cancel */}
                  {bounty.status === 0 && isPoster && (
                    <Button size="1" variant="ghost" color="red" disabled={actionPending} onClick={() => handleCancel(bounty)}>
                      Cancel & Reclaim
                    </Button>
                  )}
                </Flex>
              </Flex>
            </Card>
          );
        })}
      </Flex>
    </Flex>
  );
}
