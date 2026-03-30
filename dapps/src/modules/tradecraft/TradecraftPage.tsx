import { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Heading, Spinner, Tabs, Text } from "@radix-ui/themes";
import { useDAppKit } from "@mysten/dapp-kit-react";
import { useKillmails } from "../danger-alerts/hooks/useKillmails";
import { useFieldReports } from "../intel/hooks/useFieldReports";
import { useWatchTargets, useWatchActivity } from "./hooks/useWatchTargets";
import { useAssetSightings } from "./hooks/useAssetSightings";
import { useIntelPackages } from "./hooks/useIntelPackages";
import { WatchListTab } from "./components/WatchListTab";
import { AssetsTab } from "./components/AssetsTab";
import { PackagesTab } from "./components/PackagesTab";
import { BountiesTab } from "./components/BountiesTab";
import { getSolarSystemMap, getTribeMap } from "../../core/world-api";
import { buildCreateListingTx, buildCancelListingTx, type ListingVisibility } from "../../core/intel-market-actions";
import { fetchOnChainListings, invalidateListingCache } from "../../core/intel-market-queries";
import type { IntelPackage } from "../../core/tradecraft-types";
import { useOperatingContext } from "../../core/OperatingContext";

function extractCreatedObjectId(result: any): string | null {
  try {
    const created = result?.effects?.created;
    if (Array.isArray(created) && created.length > 0) {
      return created[0].reference?.objectId ?? created[0].objectId ?? null;
    }
    const changes = result?.objectChanges;
    const c = changes?.find((ch: any) => ch.type === "created");
    return c?.objectId ?? null;
  } catch {
    return null;
  }
}

export default function TradecraftPage() {
  const { data: killmails, isLoading } = useKillmails();
  const { reports: fieldReports } = useFieldReports();
  const dAppKit = useDAppKit();
  const { tribe } = useOperatingContext();
  const [txPending, setTxPending] = useState(false);

  // Load reference data for autocomplete
  const [systemNames, setSystemNames] = useState<string[]>([]);
  const [tribeNames, setTribeNames] = useState<string[]>([]);

  useEffect(() => {
    getSolarSystemMap().then((map) => {
      setSystemNames(Array.from(map.values()).map((s) => s.name).sort());
    });
    getTribeMap().then((map) => {
      setTribeNames(Array.from(map.values()).map((t) => t.name).sort());
    });
  }, []);

  // Extract unique player names from killmails
  const playerNames = useMemo(() => {
    if (!killmails?.length) return [];
    const names = new Set<string>();
    for (const km of killmails) {
      if (km.killerName) names.add(km.killerName);
      if (km.victimName) names.add(km.victimName);
    }
    return Array.from(names).sort();
  }, [killmails]);
  const { targets, addTarget, removeTarget } = useWatchTargets();
  const activity = useWatchActivity(targets, killmails);
  const { sightings, addSighting, confirmSighting, removeSighting } = useAssetSightings();
  const {
    packages,
    addPackage,
    updatePackage,
    setOnChainId,
    addItemToPackage,
    removeItemFromPackage,
    removePackage,
    exportPackage,
    encryptForChain,
    copyDeadDrop,
    downloadDeadDrop,
  } = useIntelPackages();

  // Sync on-chain status back to local DB
  const syncOnChain = useCallback(async () => {
    const listedPackages = packages.filter((p) => p.status === "listed");
    if (listedPackages.length === 0) return;

    invalidateListingCache();
    const listings = await fetchOnChainListings();

    for (const pkg of listedPackages) {
      // Match by onChainId or by title fallback
      const listing = pkg.onChainId
        ? listings.find((l) => l.objectId === pkg.onChainId)
        : listings.find((l) => l.title === pkg.title);

      if (!listing) continue;

      // Store onChainId if we matched by title
      if (!pkg.onChainId && listing) {
        await setOnChainId(pkg.id, listing.objectId);
      }

      if (listing.status === 1) {
        await updatePackage(pkg.id, { status: "sold" });
      } else if (listing.status === 2) {
        await updatePackage(pkg.id, { status: "draft" });
      }
    }
  }, [packages, updatePackage, setOnChainId]);

  // Auto-sync on mount and when packages change
  useEffect(() => { syncOnChain(); }, [syncOnChain]);

  // On-chain actions — now with encryption
  const handleListOnChain = useCallback(async (pkg: IntelPackage, visibility: ListingVisibility) => {
    setTxPending(true);
    try {
      // Auto-set local status to "listed" if still draft
      if (pkg.status === "draft") {
        await updatePackage(pkg.id, { status: "listed" });
      }

      // Encrypt the payload and generate sealed key material
      const encrypted = await encryptForChain(pkg.id);
      if (!encrypted) {
        console.error("[Tradecraft] Failed to encrypt package for chain");
        return;
      }

      const priceMist = BigInt(Math.round(Number(pkg.askingPrice) * 1_000_000_000));
      const sellerTribe = tribe?.name ?? "";
      const tx = buildCreateListingTx(
        pkg.title,
        pkg.description,
        priceMist,
        visibility,
        sellerTribe,
        encrypted.encryptedPayload,
        encrypted.encryptionKey,
        encrypted.keyHash,
      );
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      let onChainId = extractCreatedObjectId(result);

      // Fallback: query chain for matching listing if extraction failed
      if (!onChainId) {
        invalidateListingCache();
        await new Promise((r) => setTimeout(r, 3000)); // wait for indexer
        const listings = await fetchOnChainListings();
        const match = listings.find(
          (l) => l.title === pkg.title && l.status === 0,
        );
        if (match) onChainId = match.objectId;
      }

      if (onChainId) {
        await setOnChainId(pkg.id, onChainId);
      } else {
        console.error("[Tradecraft] Failed to determine on-chain ID");
      }
      invalidateListingCache();
    } catch (e) {
      console.error("[Tradecraft] List on chain failed:", e);
    } finally {
      setTxPending(false);
    }
  }, [dAppKit, setOnChainId, updatePackage, encryptForChain, tribe]);

  const handleCancelOnChain = useCallback(async (onChainId: string) => {
    setTxPending(true);
    try {
      const tx = buildCancelListingTx(onChainId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateListingCache();
    } catch (e) {
      console.error("[Tradecraft] Cancel on chain failed:", e);
    } finally {
      setTxPending(false);
    }
  }, [dAppKit]);

  if (isLoading) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Spinner size="3" />
        <Text size="2" color="gray" ml="2">Loading tradecraft data...</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3" style={{ height: "100%", overflow: "hidden" }}>
      <Heading size="4">Tradecraft</Heading>

      <Tabs.Root defaultValue="watch" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Tabs.List size="2">
          <Tabs.Trigger value="watch">Watch List</Tabs.Trigger>
          <Tabs.Trigger value="assets">Assets</Tabs.Trigger>
          <Tabs.Trigger value="packages">Packages</Tabs.Trigger>
          <Tabs.Trigger value="bounties">Bounties</Tabs.Trigger>
        </Tabs.List>

        <div style={{ flex: 1, overflow: "auto", paddingTop: 16 }}>
          <Tabs.Content value="watch">
            <WatchListTab
              targets={targets}
              activity={activity}
              playerNames={playerNames}
              tribeNames={tribeNames}
              onAdd={addTarget}
              onRemove={removeTarget}
            />
          </Tabs.Content>

          <Tabs.Content value="assets">
            <AssetsTab
              sightings={sightings}
              systemNames={systemNames}
              playerNames={playerNames}
              tribeNames={tribeNames}
              onAdd={addSighting}
              onConfirm={confirmSighting}
              onRemove={removeSighting}
            />
          </Tabs.Content>

          <Tabs.Content value="packages">
            <PackagesTab
              packages={packages}
              sightings={sightings}
              fieldReports={fieldReports}
              watchTargets={targets}
              onAdd={addPackage}
              onUpdate={updatePackage}
              onAddItem={addItemToPackage}
              onRemoveItem={removeItemFromPackage}
              onRemove={removePackage}
              onExport={exportPackage}
              onCopyDeadDrop={copyDeadDrop}
              onDownloadDeadDrop={downloadDeadDrop}
              onSyncOnChain={syncOnChain}
              onListOnChain={handleListOnChain}
              onCancelOnChain={handleCancelOnChain}
              isPending={txPending}
            />
          </Tabs.Content>

          <Tabs.Content value="bounties">
            <BountiesTab />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </Flex>
  );
}
