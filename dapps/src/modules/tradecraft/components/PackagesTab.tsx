import { useState } from "react";
import { Badge, Button, Card, Dialog, Flex, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import { PlusIcon, TrashIcon, DownloadIcon, CopyIcon, CheckCircledIcon, UploadIcon } from "@radix-ui/react-icons";
import type { IntelPackage, PackageItem, PackageStatus, AssetSighting, WatchTarget, DeadDropPayload } from "../../../core/tradecraft-types";
import type { FieldReport } from "../../../core/intel-types";
import type { ListingVisibility } from "../../../core/intel-market-actions";
import type { DeadDropPayload as DDPayload } from "../../../core/tradecraft-types";
import { importDeadDrop } from "../hooks/useIntelPackages";

function statusColor(status: PackageStatus): "gray" | "blue" | "green" {
  switch (status) {
    case "draft": return "gray";
    case "listed": return "blue";
    case "sold": return "green";
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type Freshness = "fresh" | "recent" | "aging" | "stale";

function getFreshness(ageMs: number): Freshness {
  if (ageMs < 24 * 3600_000) return "fresh";
  if (ageMs < 3 * 24 * 3600_000) return "recent";
  if (ageMs < 7 * 24 * 3600_000) return "aging";
  return "stale";
}

function freshnessColor(f: Freshness): "green" | "blue" | "yellow" | "red" {
  switch (f) {
    case "fresh": return "green";
    case "recent": return "blue";
    case "aging": return "yellow";
    case "stale": return "red";
  }
}

/** Compute package freshness from the oldest item inside it. */
function getPackageFreshness(
  pkg: IntelPackage,
  sightings: AssetSighting[],
  fieldReports: FieldReport[],
): Freshness | null {
  if (pkg.contents.length === 0) return null;

  let oldestTs = Date.now();
  for (const item of pkg.contents) {
    if (item.type === "sighting") {
      const s = sightings.find((x) => x.id === item.id);
      if (s && s.lastConfirmedAt < oldestTs) oldestTs = s.lastConfirmedAt;
    } else {
      const r = fieldReports.find((x) => x.id === item.id);
      if (r && r.reportedAt < oldestTs) oldestTs = r.reportedAt;
    }
  }
  return getFreshness(Date.now() - oldestTs);
}

interface Props {
  packages: IntelPackage[];
  sightings: AssetSighting[];
  fieldReports: FieldReport[];
  watchTargets: WatchTarget[];
  onAdd: (title: string, description: string, askingPrice: string) => void;
  onUpdate: (id: string, updates: Partial<Omit<IntelPackage, "id" | "createdAt" | "contents">>) => void;
  onAddItem: (packageId: string, item: PackageItem) => void;
  onRemoveItem: (packageId: string, itemId: string) => void;
  onRemove: (id: string) => void;
  onExport: (packageId: string) => Promise<DeadDropPayload | null>;
  onCopyDeadDrop: (payload: DeadDropPayload) => Promise<void>;
  onDownloadDeadDrop: (payload: DeadDropPayload) => void;
  onSyncOnChain?: () => Promise<void>;
  onListOnChain?: (pkg: IntelPackage, visibility: ListingVisibility) => Promise<void>;
  onCancelOnChain?: (onChainId: string) => Promise<void>;
  isPending?: boolean;
}

function NewPackageForm({ onSubmit }: { onSubmit: (title: string, desc: string, price: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");

  function handleSubmit() {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim(), price);
    setTitle("");
    setDescription("");
    setPrice("0");
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="soft"><PlusIcon /> New Package</Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 400 }}>
        <Dialog.Title>Create Intel Package</Dialog.Title>

        <Flex direction="column" gap="3" mt="2">
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Package Title</Text>
            <TextField.Root
              placeholder="e.g. Northern Corridor Intel Drop"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Description</Text>
            <TextArea
              placeholder="What's in this package..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Asking Price (SUI)</Text>
            <TextField.Root
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Flex>
        </Flex>

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button onClick={handleSubmit} disabled={!title.trim()}>Create Package</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ItemPicker({
  packageId,
  currentItems,
  sightings,
  fieldReports,
  watchTargets,
  onAddItem,
}: {
  packageId: string;
  currentItems: PackageItem[];
  sightings: AssetSighting[];
  fieldReports: FieldReport[];
  watchTargets: WatchTarget[];
  onAddItem: (packageId: string, item: PackageItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const includedIds = new Set(currentItems.map((c) => c.id));

  const availableSightings = sightings.filter((s) => !includedIds.has(s.id));
  const availableReports = fieldReports.filter((r) => !includedIds.has(r.id));
  const availableTargets = watchTargets.filter((w) => !includedIds.has(w.id));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="ghost"><PlusIcon /> Add Items</Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 480 }}>
        <Dialog.Title>Add to Package</Dialog.Title>

        <Flex direction="column" gap="3" mt="2" style={{ maxHeight: 400, overflow: "auto" }}>
          {availableSightings.length > 0 && (
            <>
              <Text size="2" weight="bold" color="orange">Asset Sightings</Text>
              {availableSightings.map((s) => (
                <Card key={s.id}>
                  <Flex justify="between" align="center">
                    <Flex direction="column" gap="1">
                      <Text size="1" weight="bold">
                        {s.assetType.toUpperCase()} {s.solarSystemName ? `in ${s.solarSystemName}` : ""}
                      </Text>
                      {s.ownerName && <Text size="1" color="gray">{s.ownerName}</Text>}
                    </Flex>
                    <Button
                      size="1"
                      variant="soft"
                      onClick={() => onAddItem(packageId, { type: "sighting", id: s.id })}
                    >
                      Add
                    </Button>
                  </Flex>
                </Card>
              ))}
            </>
          )}

          {availableReports.length > 0 && (
            <>
              <Text size="2" weight="bold" color="blue">Field Reports</Text>
              {availableReports.map((r) => (
                <Card key={r.id}>
                  <Flex justify="between" align="center">
                    <Flex direction="column" gap="1">
                      <Text size="1" weight="bold">{r.title}</Text>
                      {r.solarSystemName && <Text size="1" color="gray">{r.solarSystemName}</Text>}
                    </Flex>
                    <Button
                      size="1"
                      variant="soft"
                      onClick={() => onAddItem(packageId, { type: "field_report", id: r.id })}
                    >
                      Add
                    </Button>
                  </Flex>
                </Card>
              ))}
            </>
          )}

          {availableTargets.length > 0 && (
            <>
              <Text size="2" weight="bold" color="purple">Watch Targets</Text>
              {availableTargets.map((w) => (
                <Card key={w.id}>
                  <Flex justify="between" align="center">
                    <Flex direction="column" gap="1">
                      <Text size="1" weight="bold">
                        {w.targetType === "player" ? "Player" : "Tribe"}: {w.targetName}
                      </Text>
                    </Flex>
                    <Button
                      size="1"
                      variant="soft"
                      onClick={() => onAddItem(packageId, { type: "watch_target", id: w.id })}
                    >
                      Add
                    </Button>
                  </Flex>
                </Card>
              ))}
            </>
          )}

          {availableSightings.length === 0 && availableReports.length === 0 && availableTargets.length === 0 && (
            <Text size="2" color="gray">
              No available items. Log asset sightings, file reports, or add watch targets first.
            </Text>
          )}
        </Flex>

        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">Done</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ListOnChainButton({
  pkg,
  onList,
  isPending,
}: {
  pkg: IntelPackage;
  onList: (pkg: IntelPackage, visibility: ListingVisibility) => Promise<void>;
  isPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<ListingVisibility>(0);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="solid" color="purple" disabled={isPending}>
          {isPending ? "Signing..." : "Sell on Chain"}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 360 }}>
        <Dialog.Title>Sell on Chain</Dialog.Title>
        <Flex direction="column" gap="3" mt="2">
          <Text size="2">
            <strong>{pkg.title}</strong> for {pkg.askingPrice} SUI
          </Text>
          <Flex direction="column" gap="1">
            <Text size="1" color="gray" weight="bold">Visibility</Text>
            <Select.Root value={String(visibility)} onValueChange={(v) => setVisibility(Number(v) as ListingVisibility)}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="0">Global — any kiosk</Select.Item>
                <Select.Item value="1">Tribe — my tribe only</Select.Item>
                <Select.Item value="2">Local — my assembly only</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        </Flex>
        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button
            color="purple"
            disabled={isPending}
            onClick={() => { setOpen(false); onList(pkg, visibility); }}
          >
            {isPending ? "Signing..." : "Publish"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function PackagesTab({
  packages,
  sightings,
  fieldReports,
  watchTargets,
  onAdd,
  onUpdate,
  onAddItem,
  onRemoveItem,
  onRemove,
  onExport,
  onCopyDeadDrop,
  onDownloadDeadDrop,
  onSyncOnChain,
  onListOnChain,
  onCancelOnChain,
  isPending,
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleExportCopy(pkgId: string) {
    const payload = await onExport(pkgId);
    if (!payload) return;
    await onCopyDeadDrop(payload);
    setCopiedId(pkgId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleExportDownload(pkgId: string) {
    const payload = await onExport(pkgId);
    if (!payload) return;
    onDownloadDeadDrop(payload);
  }

  const [importStatus, setImportStatus] = useState<string | null>(null);

  async function handleImportDeadDrop() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload: DDPayload = JSON.parse(text);
        if (payload.version !== 1 || !payload.contents) {
          setImportStatus("Invalid Dead Drop format");
          return;
        }
        const result = await importDeadDrop(payload);
        const parts = [];
        if (result.sightings) parts.push(`${result.sightings} sightings`);
        if (result.reports) parts.push(`${result.reports} reports`);
        if (result.watchTargets) parts.push(`${result.watchTargets} targets`);
        setImportStatus(`Imported ${parts.join(", ")}`);
        setTimeout(() => setImportStatus(null), 3000);
      } catch {
        setImportStatus("Failed to parse Dead Drop file");
        setTimeout(() => setImportStatus(null), 3000);
      }
    };
    input.click();
  }

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center">
        <Flex gap="2" align="center">
          <Text size="1" color="gray">{packages.length} packages</Text>
          {importStatus && <Text size="1" color="green">{importStatus}</Text>}
        </Flex>
        <Flex gap="2">
          {onSyncOnChain && (
            <Button size="1" variant="ghost" onClick={onSyncOnChain}>
              Sync Chain
            </Button>
          )}
          <Button size="1" variant="ghost" onClick={handleImportDeadDrop}>
            <UploadIcon /> Import Dead Drop
          </Button>
          <NewPackageForm onSubmit={onAdd} />
        </Flex>
      </Flex>

      {packages.length === 0 && (
        <Text size="2" color="gray">
          No intel packages. Create a package to bundle sightings and reports for sale.
        </Text>
      )}

      <Flex direction="column" gap="2" style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
        {packages.map((pkg) => {
          const sightingCount = pkg.contents.filter((c) => c.type === "sighting").length;
          const reportCount = pkg.contents.filter((c) => c.type === "field_report").length;
          const freshness = getPackageFreshness(pkg, sightings, fieldReports);

          return (
            <Card key={pkg.id}>
              <Flex direction="column" gap="2">
                <Flex justify="between" align="start">
                  <Flex direction="column" gap="1" style={{ flex: 1 }}>
                    <Flex gap="2" align="center" wrap="wrap">
                      <Badge size="1" variant="soft" color={statusColor(pkg.status)}>
                        {pkg.status}
                      </Badge>
                      {Number(pkg.askingPrice) > 0 && (
                        <Badge size="1" variant="outline" color="yellow">
                          {pkg.askingPrice} SUI
                        </Badge>
                      )}
                      {freshness && (
                        <Badge size="1" variant={freshness === "stale" ? "solid" : "outline"} color={freshnessColor(freshness)}>
                          {freshness}
                        </Badge>
                      )}
                    </Flex>
                    <Text size="2" weight="bold">{pkg.title}</Text>
                    {pkg.description && (
                      <Text size="1" color="gray">{pkg.description}</Text>
                    )}
                    <Text size="1" color="gray">
                      {sightingCount} sighting{sightingCount !== 1 ? "s" : ""},
                      {" "}{reportCount} report{reportCount !== 1 ? "s" : ""}
                      {" "}| Created {timeAgo(pkg.createdAt)}
                    </Text>
                  </Flex>

                  <Flex gap="1">
                    <Text
                      size="1"
                      color="red"
                      style={{ cursor: "pointer", padding: 4 }}
                      onClick={() => onRemove(pkg.id)}
                    >
                      <TrashIcon />
                    </Text>
                  </Flex>
                </Flex>

                {/* Package contents */}
                {pkg.contents.length > 0 && (
                  <Flex direction="column" gap="1" style={{ paddingLeft: 8, borderLeft: "2px solid var(--gray-6)" }}>
                    {pkg.contents.map((item) => {
                      const itemLabel = item.type === "sighting"
                        ? sightings.find((s) => s.id === item.id)?.solarSystemName
                        : item.type === "field_report"
                        ? fieldReports.find((r) => r.id === item.id)?.title
                        : watchTargets.find((w) => w.id === item.id)?.targetName;
                      const itemColor = item.type === "sighting" ? "orange" as const
                        : item.type === "watch_target" ? "purple" as const : "blue" as const;
                      const itemTag = item.type === "sighting" ? "Asset"
                        : item.type === "watch_target" ? "Target" : "Report";

                      return (
                        <Flex key={item.id} justify="between" align="center">
                          <Text size="1">
                            <Badge size="1" variant="outline" color={itemColor} mr="1">
                              {itemTag}
                            </Badge>
                            {itemLabel ?? item.id}
                          </Text>
                          <Text
                            size="1"
                            color="red"
                            style={{ cursor: "pointer", padding: 2 }}
                            onClick={() => onRemoveItem(pkg.id, item.id)}
                          >
                            <TrashIcon width={12} height={12} />
                          </Text>
                        </Flex>
                      );
                    })}
                  </Flex>
                )}

                {/* On-chain status */}
                {pkg.onChainId && (
                  <Flex gap="2" align="center">
                    <Badge size="1" variant="solid" color="purple">On-chain</Badge>
                    <Text size="1" color="gray" style={{ fontFamily: "monospace" }}>
                      {pkg.onChainId.slice(0, 10)}...{pkg.onChainId.slice(-6)}
                    </Text>
                  </Flex>
                )}

                {/* Actions */}
                <Flex gap="2" align="center" wrap="wrap">
                  <ItemPicker
                    packageId={pkg.id}
                    currentItems={pkg.contents}
                    sightings={sightings}
                    fieldReports={fieldReports}
                    watchTargets={watchTargets}
                    onAddItem={onAddItem}
                  />

                  {/* Sell on chain: first time listing */}
                  {!pkg.onChainId && pkg.contents.length > 0 && Number(pkg.askingPrice) > 0 && onListOnChain && (
                    <ListOnChainButton pkg={pkg} onList={onListOnChain} isPending={isPending} />
                  )}

                  {/* Sell again: already sold, relist to another buyer */}
                  {pkg.onChainId && pkg.status === "sold" && pkg.contents.length > 0 && Number(pkg.askingPrice) > 0 && onListOnChain && (
                    <ListOnChainButton pkg={pkg} onList={onListOnChain} isPending={isPending} />
                  )}

                  {/* Cancel on-chain listing */}
                  {pkg.status === "listed" && pkg.onChainId && onCancelOnChain && (
                    <Button
                      size="1"
                      variant="ghost"
                      color="red"
                      disabled={isPending}
                      onClick={() => onCancelOnChain(pkg.onChainId!)}
                    >
                      Cancel Listing
                    </Button>
                  )}

                  {/* Mark sold locally (for off-chain sales) */}
                  {!pkg.onChainId && pkg.status !== "sold" && pkg.status !== "draft" && (
                    <Button
                      size="1"
                      variant="soft"
                      color="green"
                      onClick={() => onUpdate(pkg.id, { status: "sold" })}
                    >
                      <CheckCircledIcon /> Mark Sold
                    </Button>
                  )}

                  {pkg.contents.length > 0 && (
                    <>
                      <Button
                        size="1"
                        variant="ghost"
                        onClick={() => handleExportCopy(pkg.id)}
                      >
                        {copiedId === pkg.id ? <CheckCircledIcon /> : <CopyIcon />}
                        {copiedId === pkg.id ? "Copied!" : "Dead Drop"}
                      </Button>
                      <Button
                        size="1"
                        variant="ghost"
                        onClick={() => handleExportDownload(pkg.id)}
                      >
                        <DownloadIcon /> Download
                      </Button>
                    </>
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
