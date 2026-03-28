import { useCallback, useEffect, useState } from "react";
import { Flex, Text, TextField, Switch, Separator, Badge, Button, Spinner } from "@radix-ui/themes";
import { useSmartObject } from "@evefrontier/dapp-kit";
import { useDAppKit } from "@mysten/dapp-kit-react";
import { bcs } from "@mysten/sui/bcs";
import { deriveObjectID } from "@mysten/sui/utils";
import { buildAuthorizeExtensionTx } from "../core/authorize-extension";
import { buildRenameTx, buildBringOnlineTx, buildBringOfflineTx } from "../core/assembly-actions";
import { buildSetAccessRulesTx, fetchAccessRules, type AccessRulesData } from "../core/ssu-access-actions";
import { buildAcceptJobTx, buildMarkCompleteTx, buildCreateJobTx, buildCreateCompetitiveJobTx, buildApproveAndPayTx } from "../core/job-escrow-actions";
import { fetchOnChainJobs, invalidateJobCache, type OnChainJob } from "../core/job-escrow-queries";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { fetchOnChainBounties, invalidateBountyCache, type OnChainBounty } from "../core/bounty-escrow-queries";
import { buildSubmitClaimTx, buildCreateBountyTx } from "../core/bounty-escrow-actions";
import { searchCharactersByName, type CharacterSearchResult } from "../core/character-search";
import { getItemTypeMap, type ItemType } from "../core/world-api";
import { fetchSSUInventory } from "../core/inventory-data";


interface DirectAssembly {
  id: string;
  name: string;
  typeId: number;
  state: "online" | "offline" | "unknown";
  itemId: string;
  moveType: string;
  ownerCapId: string;
  energySourceId: string;
}

const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";

/** Query a single assembly directly by Sui object ID — no wallet needed */
async function fetchAssemblyDirect(objectId: string, skipCache = false): Promise<DirectAssembly | null> {
  const cacheKey = `embedded-assembly:${objectId}`;

  // Check cache first (2 min TTL — status can change)
  if (!skipCache) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const entry = JSON.parse(raw);
        if (Date.now() - entry.fetchedAt < 2 * 60 * 1000) {
          console.log("[FrontierOps] Embedded assembly from cache:", objectId);
          return entry.data;
        }
      }
    } catch {}
  }

  const query = `{
    object(address: "${objectId}") {
      asMoveObject {
        contents {
          type { repr }
          json
        }
      }
    }
  }`;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const contents = data?.data?.object?.asMoveObject?.contents;
    if (!contents) return null;

    const json = contents.json;
    const moveType = contents.type?.repr || "";
    const statusVariant = json?.status?.status?.["@variant"] || "";

    const result: DirectAssembly = {
      id: json?.id || objectId,
      name: json?.metadata?.name || "",
      typeId: Number(json?.type_id) || 0,
      state: statusVariant === "ONLINE" ? "online" : statusVariant === "OFFLINE" ? "offline" : "unknown",
      itemId: json?.key?.item_id || "",
      moveType,
      ownerCapId: json?.owner_cap_id || "",
      energySourceId: json?.energy_source_id || "",
    };

    // Cache the result
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: result, fetchedAt: Date.now() }));
    } catch {}

    return result;
  } catch (err) {
    console.error("[FrontierOps] Direct assembly fetch failed:", err);
    return null;
  }
}

const WORLD_PKG = import.meta.env.VITE_EVE_WORLD_PACKAGE_ID || "";
const REGISTRY_TYPE = `${WORLD_PKG}::object_registry::ObjectRegistry`;

/** Find the ObjectRegistry singleton address on-chain */
let cachedRegistryAddr: string | null = null;
async function getRegistryAddress(): Promise<string> {
  if (cachedRegistryAddr) return cachedRegistryAddr;

  const query = `{
    objects(filter: { type: "${REGISTRY_TYPE}" }, first: 1) {
      nodes { address }
    }
  }`;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  const addr = data?.data?.objects?.nodes?.[0]?.address;
  if (!addr) throw new Error("ObjectRegistry not found");
  cachedRegistryAddr = addr;
  return addr;
}

/** Resolve an EVE item_id → Sui object ID using on-chain AssemblyRegistry derivation */
async function resolveItemId(itemId: string, tenant = "stillness"): Promise<string | null> {
  try {
    const registryAddress = await getRegistryAddress();
    const bcsType = bcs.struct("TenantItemId", {
      id: bcs.u64(),
      tenant: bcs.string(),
    });
    const key = bcsType
      .serialize({ id: BigInt(itemId), tenant })
      .toBytes();
    const objectId = deriveObjectID(
      registryAddress,
      `${WORLD_PKG}::in_game_id::TenantItemId`,
      key,
    );
    console.log("[FrontierOps] Resolved itemId", itemId, "→", objectId);
    return objectId;
  } catch (err) {
    console.error("[FrontierOps] Failed to resolve itemId:", itemId, err);
    return null;
  }
}

/**
 * Compact assembly control panel for the in-game behavior window.
 * Works without wallet connection by querying the object directly.
 */
export function EmbeddedTurretView() {
  // Try SDK's SmartObjectProvider first (works if wallet is connected)
  const smartObject = useSmartObject();
  const dAppKit = useDAppKit();
  const [isPending, setIsPending] = useState(false);

  // Direct query state (fallback when SDK can't connect)
  const [directAssembly, setDirectAssembly] = useState<DirectAssembly | null>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  // Get object ID from URL params
  const params = new URLSearchParams(window.location.search);
  const urlItemId = params.get("itemId") || params.get("item_id");
  const urlObjectId = params.get("objectId") || params.get("object_id");

  // If SDK has data, use it; otherwise try direct query
  const sdkHasData = !smartObject.loading && smartObject.assembly;
  const needsDirect = !sdkHasData && !smartObject.loading && (urlItemId || urlObjectId);

  useEffect(() => {
    if (!needsDirect) return;

    let cancelled = false;
    setDirectLoading(true);
    setDirectError(null);

    (async () => {
      let objectId = urlObjectId;

      // If we only have item_id, try to resolve it
      if (!objectId && urlItemId) {
        objectId = await resolveItemId(urlItemId);
        if (!objectId) {
          if (!cancelled) {
            setDirectError(`Could not resolve item ${urlItemId}`);
            setDirectLoading(false);
          }
          return;
        }
      }

      if (!objectId) {
        if (!cancelled) {
          setDirectError("No object ID available");
          setDirectLoading(false);
        }
        return;
      }

      const assembly = await fetchAssemblyDirect(objectId);
      if (!cancelled) {
        if (assembly) {
          setDirectAssembly(assembly);
        } else {
          setDirectError("Object not found");
        }
        setDirectLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [needsDirect, urlItemId, urlObjectId]);

  // Determine what data to show
  const loading = smartObject.loading || directLoading;
  const error = directError || smartObject.error;

  // Build a unified view from either source
  const assembly = sdkHasData ? smartObject.assembly : null;
  const dAssembly = directAssembly;

  const id = assembly?.id || dAssembly?.id;
  const state = assembly?.state || dAssembly?.state || "unknown";
  const isOnline = state === "online";
  const name = assembly?.name || dAssembly?.name || `Assembly ${id?.slice(0, 8) || "?"}`;
  const ownerName = smartObject.assemblyOwner?.name || "";
  const typeId = assembly?.typeId || dAssembly?.typeId;
  const itemId = assembly?.item_id || dAssembly?.itemId;
  const moveType = dAssembly?.moveType || "";

  // Determine assembly category
  const isTurret = moveType.includes("turret::Turret") || (assembly as any)?.moveType?.includes("turret::Turret");
  const isSSU = moveType.includes("storage_unit::StorageUnit");
  const isGate = moveType.includes("gate::Gate");
  const categoryName = isTurret ? "Turret" : isSSU ? "Storage Unit" : isGate ? "Gate" : "Assembly";

  const assemblyModule = isTurret ? "turret" : isSSU ? "storage_unit" : isGate ? "gate" : "assembly";
  const assemblyTypeNameStr = isTurret ? "Turret" : isSSU ? "StorageUnit" : isGate ? "Gate" : "Assembly";
  const characterId = "0x59c82d2c45e7c2c85aaca295b3acb6faebcf71ccb19d2865f3733cf6210dfb45";

  const handleRefresh = useCallback(async () => {
    if (sdkHasData && smartObject.refetch) {
      smartObject.refetch();
    } else if (id) {
      // Re-fetch directly, skipping cache
      console.log("[FrontierOps] Refreshing assembly (cache bust):", id);
      const fresh = await fetchAssemblyDirect(id, true);
      if (fresh) setDirectAssembly(fresh);
    } else {
      window.location.reload();
    }
  }, [sdkHasData, smartObject, id]);

  console.log("[FrontierOps] EmbeddedView:", {
    url: window.location.href,
    sdkHasData, needsDirect,
    id, state, name, categoryName, itemId,
  });

  if (loading) {
    return (
      <Flex align="center" justify="center" p="4" style={{ height: "100%" }}>
        <Spinner size="3" />
        <Text size="2" ml="2" color="gray">Loading...</Text>
      </Flex>
    );
  }

  if (error && !id) {
    return (
      <Flex direction="column" align="center" justify="center" p="4" gap="2">
        <Text size="2" color="red">{error}</Text>
        <Button size="1" variant="soft" onClick={() => window.location.reload()}>Retry</Button>
      </Flex>
    );
  }

  if (!id) {
    return (
      <Flex align="center" justify="center" p="4">
        <Text size="2" color="gray">No assembly data</Text>
        <Text size="1" color="gray" mt="2">
          Add ?objectId=0x... or ?itemId=... to the URL
        </Text>
      </Flex>
    );
  }

  const handleToggleState = async () => {
    if (!id || !dAssembly?.ownerCapId || !dAssembly?.energySourceId) return;
    setIsPending(true);
    try {
      const actionArgs = {
        characterId,
        assemblyId: id,
        ownerCapId: dAssembly.ownerCapId,
        assemblyModule,
        assemblyTypeName: assemblyTypeNameStr,
        energySourceId: dAssembly.energySourceId,
      };
      const tx = isOnline
        ? await buildBringOfflineTx(actionArgs)
        : await buildBringOnlineTx(actionArgs);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      console.log("[FrontierOps] Power toggle success:", result);
      // Wait for indexer then refresh (skip cache)
      setTimeout(handleRefresh, 3000);
    } catch (e) {
      console.error("[FrontierOps] Toggle state failed:", e);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Flex direction="column" p="3" gap="3" style={{
      height: "100%",
      background: "var(--color-background)",
      color: "var(--gray-12)",
      overflowY: "auto",
    }}>
      {/* Header */}
      <Flex direction="column" gap="1">
        <Text size="3" weight="bold" truncate>{name || categoryName}</Text>
        <Text size="1" color="gray">{categoryName} · {itemId || id?.slice(0, 12)}</Text>
        {ownerName && <Text size="1" color="gray">Owner: {ownerName}</Text>}
      </Flex>

      <Separator size="4" />

      {/* Status & Toggle */}
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Text size="2" weight="medium">Status</Text>
          <Badge color={isOnline ? "green" : "gray"} size="1">
            {isOnline ? "ONLINE" : "OFFLINE"}
          </Badge>
        </Flex>

        <Flex justify="between" align="center">
          <Text size="2">Power</Text>
          <Switch
            checked={isOnline}
            onCheckedChange={handleToggleState}
            disabled={isPending || !itemId}
            size="2"
          />
        </Flex>
      </Flex>

      <Separator size="4" />

      {/* Rename */}
      <RenameSection
        currentName={name}
        assemblyId={id!}
        ownerCapId={dAssembly?.ownerCapId || ""}
        characterId={characterId}
        assemblyModule={assemblyModule}
        assemblyTypeName={assemblyTypeNameStr}
        onRenamed={handleRefresh}
      />

      <Separator size="4" />

      {/* Turret-specific: Targeting Config */}
      {isTurret && <TurretConfig typeId={typeId} />}

      {/* SSU-specific: Access Control */}
      {isSSU && dAssembly && (
        <SSUAccessControl ssuId={dAssembly.id} />
      )}

      {/* SSU-specific: Jobs Board */}
      {isSSU && dAssembly && <EmbeddedJobsBoard ssuId={dAssembly.id} />}

      {/* Bounty Board — global, shows on all assembly types */}
      <EmbeddedBountyBoard />

      {/* Gate-specific */}
      {isGate && (
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">Gate Access</Text>
          <Text size="1" color="gray">Access list management available in the full app</Text>
        </Flex>
      )}

      <Separator size="4" />

      {/* Info */}
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">Type ID: {typeId ?? "—"}</Text>
        <Text size="1" color="gray" style={{ wordBreak: "break-all" }}>
          ID: {id}
        </Text>
      </Flex>

      {/* Refresh */}
      <Flex mt="auto" pt="2">
        <Button size="1" variant="soft" style={{ width: "100%" }} onClick={handleRefresh}>
          Refresh
        </Button>
      </Flex>
    </Flex>
  );
}

function RenameSection({
  currentName,
  assemblyId,
  ownerCapId,
  characterId,
  assemblyModule,
  assemblyTypeName,
  onRenamed,
}: {
  currentName: string;
  assemblyId: string;
  ownerCapId: string;
  characterId: string;
  assemblyModule: string;
  assemblyTypeName: string;
  onRenamed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const dAppKit = useDAppKit();

  const handleRename = async () => {
    if (!newName.trim() || !assemblyId || !ownerCapId) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const tx = await buildRenameTx({
        characterId,
        assemblyId,
        ownerCapId,
        assemblyModule,
        assemblyTypeName,
        newName: newName.trim(),
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      console.log("[FrontierOps] Rename success:", result);
      setNewName("");
      setTimeout(onRenamed, 2000);
    } catch (e: any) {
      console.error("[FrontierOps] Rename failed:", e);
      setRenameError(e?.message || "Rename failed");
    } finally {
      setRenaming(false);
    }
  };

  return (
    <Flex direction="column" gap="2">
      <Flex
        justify="between"
        align="center"
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
      >
        <Text size="2" weight="medium">Name</Text>
        <Flex align="center" gap="2">
          <Text size="1" color="gray" truncate style={{ maxWidth: 120 }}>
            {currentName || "(unnamed)"}
          </Text>
          <Text size="1" color="gray">{open ? "▲" : "▼"}</Text>
        </Flex>
      </Flex>

      {open && (
        <Flex direction="column" gap="2" pl="2">
          <Flex gap="2">
            <TextField.Root
              size="1"
              placeholder="New name..."
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleRename()}
              style={{ flex: 1 }}
            />
            <Button
              size="1"
              variant="soft"
              onClick={handleRename}
              disabled={renaming || !newName.trim()}
            >
              {renaming ? "..." : "Set"}
            </Button>
          </Flex>
          {renameError && <Text size="1" color="red">{renameError}</Text>}
        </Flex>
      )}
    </Flex>
  );
}

function SSUAccessControl({ ssuId }: { ssuId: string }) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<AccessRulesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTribe, setNewTribe] = useState("");
  const [newCharId, setNewCharId] = useState("");
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  // Load rules when expanded
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAccessRules(ssuId).then(r => {
      setRules(r || {
        depositAllowlist: [],
        withdrawAllowlist: [],
        depositTribes: [],
        withdrawTribes: [],
        openDeposit: true,
        openWithdraw: false,
      });
      setLoading(false);
    });
  }, [open, ssuId]);

  const saveRules = async (updated: AccessRulesData) => {
    if (!account?.address) return;
    setSaving(true);
    setError(null);
    try {
      const tx = await buildSetAccessRulesTx(account.address, ssuId, updated);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setRules(updated);
      console.log("[FrontierOps] Access rules saved");
    } catch (e: any) {
      console.error("[FrontierOps] Save access rules failed:", e);
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleOpenDeposit = () => {
    if (!rules) return;
    const updated = { ...rules, openDeposit: !rules.openDeposit };
    setRules(updated);
    saveRules(updated);
  };

  const toggleOpenWithdraw = () => {
    if (!rules) return;
    const updated = { ...rules, openWithdraw: !rules.openWithdraw };
    setRules(updated);
    saveRules(updated);
  };

  const addWithdrawTribe = () => {
    if (!rules || !newTribe.trim()) return;
    const tribeId = parseInt(newTribe.trim());
    if (isNaN(tribeId)) return;
    if (rules.withdrawTribes.includes(tribeId)) return;
    const updated = { ...rules, withdrawTribes: [...rules.withdrawTribes, tribeId] };
    setRules(updated);
    setNewTribe("");
    saveRules(updated);
  };

  const removeWithdrawTribe = (tribeId: number) => {
    if (!rules) return;
    const updated = { ...rules, withdrawTribes: rules.withdrawTribes.filter(t => t !== tribeId) };
    setRules(updated);
    saveRules(updated);
  };

  const addWithdrawChar = () => {
    if (!rules || !newCharId.trim()) return;
    if (rules.withdrawAllowlist.includes(newCharId.trim())) return;
    const updated = { ...rules, withdrawAllowlist: [...rules.withdrawAllowlist, newCharId.trim()] };
    setRules(updated);
    setNewCharId("");
    saveRules(updated);
  };

  const removeWithdrawChar = (charId: string) => {
    if (!rules) return;
    const updated = { ...rules, withdrawAllowlist: rules.withdrawAllowlist.filter(c => c !== charId) };
    setRules(updated);
    saveRules(updated);
  };

  return (
    <Flex direction="column" gap="2">
      <Flex
        justify="between"
        align="center"
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
      >
        <Text size="2" weight="medium">Access Control</Text>
        <Text size="1" color="gray">{open ? "▲" : "▼"}</Text>
      </Flex>

      {open && loading && <Text size="1" color="gray">Loading rules...</Text>}

      {open && rules && (
        <Flex direction="column" gap="3" pl="2">
          {/* Deposit */}
          <Flex direction="column" gap="1">
            <Flex justify="between" align="center">
              <Text size="1" weight="medium">Deposit</Text>
              <Flex align="center" gap="2">
                <Text size="1" color="gray">{rules.openDeposit ? "Open" : "Restricted"}</Text>
                <Switch
                  size="1"
                  checked={rules.openDeposit}
                  onCheckedChange={toggleOpenDeposit}
                  disabled={saving}
                />
              </Flex>
            </Flex>
          </Flex>

          {/* Withdraw */}
          <Flex direction="column" gap="1">
            <Flex justify="between" align="center">
              <Text size="1" weight="medium">Withdraw</Text>
              <Flex align="center" gap="2">
                <Text size="1" color="gray">{rules.openWithdraw ? "Open" : "Restricted"}</Text>
                <Switch
                  size="1"
                  checked={rules.openWithdraw}
                  onCheckedChange={toggleOpenWithdraw}
                  disabled={saving}
                />
              </Flex>
            </Flex>
          </Flex>

          {/* Withdraw Tribes */}
          {!rules.openWithdraw && (
            <Flex direction="column" gap="1">
              <Text size="1" weight="medium">Withdraw Tribes</Text>
              {rules.withdrawTribes.map(t => (
                <Flex key={t} justify="between" align="center">
                  <Badge size="1" color="blue">{t}</Badge>
                  <Text
                    size="1"
                    color="red"
                    style={{ cursor: "pointer" }}
                    onClick={() => removeWithdrawTribe(t)}
                  >
                    remove
                  </Text>
                </Flex>
              ))}
              {rules.withdrawTribes.length === 0 && (
                <Text size="1" color="gray">No tribes added</Text>
              )}
              <Flex gap="2">
                <TextField.Root
                  size="1"
                  placeholder="Tribe ID"
                  value={newTribe}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTribe(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addWithdrawTribe()}
                  style={{ flex: 1 }}
                />
                <Button size="1" variant="soft" onClick={addWithdrawTribe} disabled={saving}>
                  Add
                </Button>
              </Flex>
            </Flex>
          )}

          {/* Withdraw Characters */}
          {!rules.openWithdraw && (
            <Flex direction="column" gap="1">
              <Text size="1" weight="medium">Withdraw Characters</Text>
              {rules.withdrawAllowlist.map(c => (
                <Flex key={c} justify="between" align="center">
                  <Text size="1" style={{ fontFamily: "monospace" }}>{c}</Text>
                  <Text
                    size="1"
                    color="red"
                    style={{ cursor: "pointer" }}
                    onClick={() => removeWithdrawChar(c)}
                  >
                    remove
                  </Text>
                </Flex>
              ))}
              {rules.withdrawAllowlist.length === 0 && (
                <Text size="1" color="gray">No characters added</Text>
              )}
              <Flex gap="2">
                <TextField.Root
                  size="1"
                  placeholder="Character item ID"
                  value={newCharId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCharId(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addWithdrawChar()}
                  style={{ flex: 1 }}
                />
                <Button size="1" variant="soft" onClick={addWithdrawChar} disabled={saving}>
                  Add
                </Button>
              </Flex>
            </Flex>
          )}

          {error && <Text size="1" color="red">{error}</Text>}
          {saving && <Text size="1" color="gray">Saving...</Text>}
        </Flex>
      )}
    </Flex>
  );
}

function TurretConfig({ typeId }: { typeId?: number }) {
  const [open, setOpen] = useState(false);

  // Determine specialization from turret type
  const specialization = typeId === 92402 ? "Frigates & Corvettes"
    : typeId === 92403 ? "Destroyers & Frigates"
    : typeId === 92484 ? "Cruisers & Battlecruisers"
    : typeId === 92279 ? "Small Targets"
    : "General";

  return (
    <Flex direction="column" gap="2">
      <Flex
        justify="between"
        align="center"
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
      >
        <Text size="2" weight="medium">Targeting Rules</Text>
        <Text size="1" color="gray">{open ? "▲" : "▼"}</Text>
      </Flex>

      {open && (
        <Flex direction="column" gap="2" pl="2">
          <Flex justify="between" align="center">
            <Text size="1">Skip self</Text>
            <Badge size="1" color="green">ON</Badge>
          </Flex>
          <Flex justify="between" align="center">
            <Text size="1">Skip friendly tribes</Text>
            <Badge size="1" color="green">ON</Badge>
          </Flex>
          <Flex justify="between" align="center">
            <Text size="1">Aggressor priority</Text>
            <Badge size="1" color="green">+50k</Badge>
          </Flex>
          <Flex justify="between" align="center">
            <Text size="1">Proximity weight</Text>
            <Badge size="1" color="green">+1k</Badge>
          </Flex>
          <Flex justify="between" align="center">
            <Text size="1">Specialization</Text>
            <Badge size="1" color="blue">{specialization}</Badge>
          </Flex>
          <Text size="1" color="gray" mt="1">
            Rules are set on-chain in the extension contract. Dynamic config requires a turret extension data slot from CCP.
          </Text>
        </Flex>
      )}
    </Flex>
  );
}

function EmbeddedJobsBoard({ ssuId }: { ssuId: string }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<OnChainJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null); // null = loading
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  // Check SSU access rules — only show jobs board if deposit is open and withdraw is restricted
  useEffect(() => {
    fetchAccessRules(ssuId).then((rules) => {
      if (rules === null) {
        // No access rules set — default SSU config, allow jobs board
        console.log("[FrontierOps] No access rules found for SSU, showing jobs board by default");
        setEligible(true);
      } else {
        const ok = rules.openDeposit && !rules.openWithdraw;
        console.log("[FrontierOps] SSU access rules:", { openDeposit: rules.openDeposit, openWithdraw: rules.openWithdraw, eligible: ok });
        setEligible(ok);
      }
    }).catch((err) => {
      console.error("[FrontierOps] Failed to check SSU access rules:", err);
      setEligible(true); // fail open — show jobs board
    });
  }, [ssuId]);

  // Fetch on-chain jobs when section is expanded
  useEffect(() => {
    if (!open || eligible === false) return;
    setLoading(true);
    fetchOnChainJobs().then((all) => {
      // Show open (0), accepted (1), and completed (2) jobs
      setJobs(all.filter((j) => j.status === 0 || j.status === 1 || j.status === 2));
      setLoading(false);
    });
  }, [open, eligible]);

  // Don't render if SSU isn't configured for jobs (needs open deposit, closed withdraw)
  if (eligible === false) return null;
  if (eligible === null) return null; // still checking

  const selected = jobs.find((j) => j.objectId === selectedId);
  const isWorker = selected && account?.address === selected.worker;
  const isCreator = selected && account?.address === selected.creator;
  const isUnassigned = selected && selected.worker === "0x0000000000000000000000000000000000000000000000000000000000000000";
  const isContestant = selected?.competitive && account?.address && selected.contestants.includes(account.address);

  const handleAccept = async (job: OnChainJob) => {
    if (!account?.address) return;
    setAccepting(true);
    setError(null);
    try {
      const tx = buildAcceptJobTx(job.objectId);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      console.log("[FrontierOps] Accept job tx:", result);
      setError(null);
      // Wait for indexer to catch up, then refresh
      invalidateJobCache();
      await new Promise((r) => setTimeout(r, 3000));
      invalidateJobCache();
      const all = await fetchOnChainJobs();
      setJobs(all.filter((j) => j.status === 0 || j.status === 1 || j.status === 2));
      // Keep the selected job visible after accept
      const updated = all.find((j) => j.objectId === job.objectId);
      if (updated) {
        setSelectedId(updated.objectId);
      }
    } catch (e: any) {
      console.error("[FrontierOps] Accept job failed:", e);
      setError(e?.message || "Failed to accept");
    } finally {
      setAccepting(false);
    }
  };

  /** Parse "Deliverables:\n- ItemName x5\n- Other x10" from description */
  function parseDeliverables(desc: string): { name: string; qty: number }[] {
    const match = desc.match(/Deliverables:\n([\s\S]*?)(?:\n\n|$)/);
    if (!match) return [];
    return match[1]
      .split("\n")
      .map((line) => {
        const m = line.match(/^-\s*(.+?)\s+x(\d+)\s*$/);
        return m ? { name: m[1], qty: Number(m[2]) } : null;
      })
      .filter((d): d is { name: string; qty: number } => d !== null);
  }

  const handleMarkComplete = async (job: OnChainJob) => {
    if (!account?.address) return;
    setCompleting(true);
    setError(null);

    // Check deliverables against SSU inventory
    const required = parseDeliverables(job.description);
    if (required.length > 0) {
      const inv = await fetchSSUInventory(ssuId);
      const items = inv?.items ?? [];
      const missing: string[] = [];

      for (const req of required) {
        const found = items.find(
          (item) => item.typeName.toLowerCase() === req.name.toLowerCase(),
        );
        if (!found || found.quantity < req.qty) {
          const have = found?.quantity ?? 0;
          missing.push(`${req.name}: need ${req.qty}, have ${have}`);
        }
      }

      if (missing.length > 0) {
        setError(`Missing deliverables:\n${missing.join("\n")}`);
        setCompleting(false);
        return;
      }
    }

    try {
      const tx = buildMarkCompleteTx(job.objectId);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      console.log(`[FrontierOps] Mark complete tx${job.competitive ? " (competitive win!)" : ""}:`, result);
      invalidateJobCache();
      await new Promise((r) => setTimeout(r, 3000));
      invalidateJobCache();
      const all = await fetchOnChainJobs();
      setJobs(all.filter((j) => j.status === 0 || j.status === 1 || j.status === 2));
      // Update selected to show the completed state
      const updated = all.find((j) => j.objectId === job.objectId);
      if (updated) setSelectedId(updated.objectId);
    } catch (e: any) {
      console.error("[FrontierOps] Mark complete failed:", e);
      // Friendly error for race condition (someone else won)
      const msg = e?.message || "Failed to complete";
      if (job.competitive && msg.includes("EWrongStatus")) {
        setError("Someone else completed this job first — better luck next time!");
      } else {
        setError(msg);
      }
    } finally {
      setCompleting(false);
    }
  };

  const handleApproveAndPay = async (job: OnChainJob) => {
    if (!account?.address) return;
    setApproving(true);
    setError(null);

    // Verify deliverables before paying
    const required = parseDeliverables(job.description);
    if (required.length > 0) {
      const inv = await fetchSSUInventory(ssuId);
      const items = inv?.items ?? [];
      const missing: string[] = [];
      for (const req of required) {
        const found = items.find(
          (item) => item.typeName.toLowerCase() === req.name.toLowerCase(),
        );
        if (!found || found.quantity < req.qty) {
          missing.push(`${req.name}: need ${req.qty}, have ${found?.quantity ?? 0}`);
        }
      }
      if (missing.length > 0) {
        setError(`Items not in SSU — cannot pay:\n${missing.join("\n")}`);
        setApproving(false);
        return;
      }
    }

    try {
      const tx = buildApproveAndPayTx(job.objectId);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      console.log("[FrontierOps] Approve & pay tx:", result);
      invalidateJobCache();
      await new Promise((r) => setTimeout(r, 3000));
      invalidateJobCache();
      const all = await fetchOnChainJobs();
      setJobs(all.filter((j) => j.status === 0 || j.status === 1));
    } catch (e: any) {
      console.error("[FrontierOps] Approve & pay failed:", e);
      setError(e?.message || "Failed to pay");
    } finally {
      setApproving(false);
    }
  };

  const refresh = async () => {
    invalidateJobCache();
    setLoading(true);
    const all = await fetchOnChainJobs();
    setJobs(all.filter((j) => j.status === 0 || j.status === 1 || j.status === 2));
    setLoading(false);
  };

  return (
    <Flex direction="column" gap="2">
      <Flex
        justify="between"
        align="center"
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
      >
        <Flex align="center" gap="2">
          <Text size="2" weight="medium">Jobs Board</Text>
          {jobs.length > 0 && <Badge size="1" color="green">{jobs.length}</Badge>}
        </Flex>
        <Text size="1" color="gray">{open ? "▲" : "▼"}</Text>
      </Flex>

      {open && (
        <Flex direction="column" gap="2" pl="2">
          {loading ? (
            <Text size="1" color="gray">Loading from chain...</Text>
          ) : jobs.length === 0 ? (
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">No open jobs on-chain.</Text>
              <Flex gap="2">
                <Button size="1" variant="ghost" onClick={refresh}>Refresh</Button>
                {account && (
                  <Button size="1" variant="soft" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? "Cancel" : "+ Post Job"}
                  </Button>
                )}
              </Flex>
              {showCreate && <EmbeddedJobCreateForm onCreated={refresh} />}
            </Flex>
          ) : !selected ? (
            /* Job list */
            <Flex direction="column" gap="1">
              {jobs.map((job) => (
                <Flex
                  key={job.objectId}
                  direction="column"
                  gap="1"
                  p="2"
                  onClick={() => setSelectedId(job.objectId)}
                  style={{
                    cursor: "pointer",
                    borderRadius: 4,
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <Flex justify="between" align="center">
                    <Text size="1" weight="bold" truncate style={{ maxWidth: 140 }}>
                      {job.title || "(untitled)"}
                    </Text>
                    <Flex gap="1">
                      {job.competitive && (
                        <Badge size="1" color="orange" title="Competitive — race to deliver">
                          {job.contestants.length > 0 ? `${job.contestants.length} racing` : "Race"}
                        </Badge>
                      )}
                      <Badge
                        size="1"
                        color={job.status === 0 ? "green" : job.status === 2 ? "blue" : "gray"}
                      >
                        {job.statusLabel}
                      </Badge>
                    </Flex>
                  </Flex>
                  <Text size="1" color="gray">
                    {job.rewardSui.toFixed(job.rewardSui < 1 ? 4 : 2)} SUI
                  </Text>
                </Flex>
              ))}
              <Flex gap="2">
                <Button size="1" variant="ghost" onClick={refresh}>Refresh</Button>
                {account && (
                  <Button size="1" variant="soft" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? "Cancel" : "+ Post Job"}
                  </Button>
                )}
              </Flex>
              {showCreate && <EmbeddedJobCreateForm onCreated={refresh} />}
            </Flex>
          ) : (
            /* Job detail */
            <Flex direction="column" gap="2">
              <Flex
                align="center"
                gap="1"
                onClick={() => setSelectedId(null)}
                style={{ cursor: "pointer" }}
              >
                <Text size="1" color="blue">← Back</Text>
              </Flex>

              <Flex align="center" gap="2">
                <Text size="2" weight="bold">{selected.title || "(untitled)"}</Text>
                {selected.competitive && (
                  <Badge size="1" color="orange">Competitive</Badge>
                )}
              </Flex>
              {selected.description && (
                <Text size="1" color="gray" style={{ whiteSpace: "pre-wrap" }}>{selected.description}</Text>
              )}

              <Flex gap="2" wrap="wrap">
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">Reward</Text>
                  <Text size="1" weight="bold" color="blue">
                    {selected.rewardSui.toFixed(selected.rewardSui < 1 ? 4 : 2)} SUI
                  </Text>
                </Flex>
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">Status</Text>
                  <Badge size="1" color={selected.status === 0 ? "green" : "blue"}>
                    {selected.statusLabel}
                  </Badge>
                </Flex>
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">{selected.competitive ? "Mode" : "Escrow"}</Text>
                  <Badge size="1" color={selected.competitive ? "orange" : "blue"}>
                    {selected.competitive ? "Race" : "On-Chain"}
                  </Badge>
                </Flex>
              </Flex>

              <Flex direction="column" gap="0">
                <Text size="1" color="gray">Creator</Text>
                <Text size="1" style={{ fontFamily: "monospace" }}>
                  {selected.creator.slice(0, 10)}...{selected.creator.slice(-6)}
                </Text>
              </Flex>

              {/* Competitive: show contestant count & list */}
              {selected.competitive && selected.contestants.length > 0 && (
                <Flex direction="column" gap="1">
                  <Text size="1" color="gray">
                    Contestants ({selected.contestants.length})
                  </Text>
                  {selected.contestants.map((addr) => (
                    <Flex key={addr} align="center" gap="1">
                      <Text size="1" style={{ fontFamily: "monospace" }}>
                        {addr.slice(0, 10)}...{addr.slice(-6)}
                      </Text>
                      {addr === account?.address && (
                        <Badge size="1" color="green">You</Badge>
                      )}
                      {addr === selected.worker && selected.status >= 2 && (
                        <Badge size="1" color="blue">Winner</Badge>
                      )}
                    </Flex>
                  ))}
                </Flex>
              )}

              {/* Assigned: show worker */}
              {!selected.competitive && !isUnassigned && (
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">Worker</Text>
                  <Text size="1" style={{ fontFamily: "monospace" }}>
                    {selected.worker.slice(0, 10)}...{selected.worker.slice(-6)}
                  </Text>
                </Flex>
              )}

              {/* Winner (competitive, completed/paid) */}
              {selected.competitive && !isUnassigned && selected.status >= 2 && (
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">Winner</Text>
                  <Text size="1" weight="bold" style={{ fontFamily: "monospace" }}>
                    {selected.worker.slice(0, 10)}...{selected.worker.slice(-6)}
                    {isWorker ? " (You)" : ""}
                  </Text>
                </Flex>
              )}

              {/* Actions */}
              <Flex gap="2" mt="1" wrap="wrap">
                {/* Assigned: Accept Job (status Open, not competitive) */}
                {selected.status === 0 && account && !selected.competitive && (
                  <Button
                    size="1"
                    variant="solid"
                    onClick={() => handleAccept(selected)}
                    disabled={accepting}
                  >
                    {accepting ? "Accepting..." : "Accept Job"}
                  </Button>
                )}

                {/* Competitive: Join Race (status Open, not already a contestant) */}
                {selected.status === 0 && account && selected.competitive && !isContestant && (
                  <Button
                    size="1"
                    variant="solid"
                    color="orange"
                    onClick={() => handleAccept(selected)}
                    disabled={accepting}
                  >
                    {accepting ? "Joining..." : "Join Race"}
                  </Button>
                )}

                {/* Competitive: Already joined indicator */}
                {selected.status === 0 && selected.competitive && isContestant && (
                  <Badge size="1" color="green">Joined</Badge>
                )}

                {/* Assigned: Mark Complete (status Accepted, you're the worker) */}
                {selected.status === 1 && !selected.competitive && isWorker && (
                  <Button
                    size="1"
                    variant="solid"
                    color="green"
                    onClick={() => handleMarkComplete(selected)}
                    disabled={completing}
                  >
                    {completing ? "Verifying..." : "Mark Complete"}
                  </Button>
                )}

                {/* Competitive: Deliver & Win (status Open, you're a contestant) */}
                {selected.status === 0 && selected.competitive && isContestant && (
                  <Button
                    size="1"
                    variant="solid"
                    color="green"
                    onClick={() => handleMarkComplete(selected)}
                    disabled={completing}
                  >
                    {completing ? "Verifying..." : "Deliver & Win"}
                  </Button>
                )}

                {/* Creator: Approve & Pay (status Completed) */}
                {selected.status === 2 && isCreator && (
                  <Button
                    size="1"
                    variant="solid"
                    color="blue"
                    onClick={() => handleApproveAndPay(selected)}
                    disabled={approving}
                  >
                    {approving ? "Verifying & Paying..." : `Approve & Pay (${selected.rewardSui.toFixed(2)} SUI)`}
                  </Button>
                )}

                {selected.status === 0 && !account && (
                  <Text size="1" color="orange">Connect wallet to accept</Text>
                )}
              </Flex>


              {error && <Text size="1" color="red" style={{ whiteSpace: "pre-wrap" }}>{error}</Text>}
            </Flex>
          )}
        </Flex>
      )}
    </Flex>
  );
}

function EmbeddedBountyBoard() {
  const [open, setOpen] = useState(false);
  const [bounties, setBounties] = useState<OnChainBounty[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [proofInput, setProofInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchOnChainBounties().then((all) => {
      // Show active (0) and pending (1) bounties
      setBounties(all.filter((b) => b.status === 0 || b.status === 1));
      setLoading(false);
    });
  }, [open]);

  const selected = bounties.find((b) => b.objectId === selectedId);


  const handleSubmitClaim = async (bounty: OnChainBounty) => {
    if (!account?.address || !proofInput.trim()) return;
    setClaiming(true);
    setError(null);
    try {
      const tx = buildSubmitClaimTx(bounty.objectId, proofInput.trim());
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateBountyCache();
      setProofInput("");
      const all = await fetchOnChainBounties();
      setBounties(all.filter((b) => b.status === 0 || b.status === 1));
    } catch (e: any) {
      setError(e?.message || "Failed to submit claim");
    } finally {
      setClaiming(false);
    }
  };

  const refresh = async () => {
    invalidateBountyCache();
    setLoading(true);
    const all = await fetchOnChainBounties();
    setBounties(all.filter((b) => b.status === 0 || b.status === 1));
    setLoading(false);
  };

  const statusColor = (s: number) =>
    s === 0 ? "green" as const : s === 1 ? "orange" as const : "gray" as const;

  return (
    <Flex direction="column" gap="2">
      <Flex
        justify="between"
        align="center"
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
      >
        <Flex align="center" gap="2">
          <Text size="2" weight="medium">Bounty Board</Text>
          {bounties.length > 0 && <Badge size="1" color="red">{bounties.length}</Badge>}
        </Flex>
        <Text size="1" color="gray">{open ? "▲" : "▼"}</Text>
      </Flex>

      {open && (
        <Flex direction="column" gap="2" pl="2">
          {loading ? (
            <Text size="1" color="gray">Loading from chain...</Text>
          ) : bounties.length === 0 ? (
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">No active bounties on-chain.</Text>
              <Flex gap="2">
                <Button size="1" variant="ghost" onClick={refresh}>Refresh</Button>
                {account && (
                  <Button size="1" variant="soft" color="red" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? "Cancel" : "+ Post Bounty"}
                  </Button>
                )}
              </Flex>
              {showCreate && <EmbeddedBountyCreateForm onCreated={refresh} />}
            </Flex>
          ) : !selected ? (
            <Flex direction="column" gap="1">
              {bounties.map((b) => (
                <Flex
                  key={b.objectId}
                  direction="column"
                  gap="1"
                  p="2"
                  onClick={() => setSelectedId(b.objectId)}
                  style={{
                    cursor: "pointer",
                    borderRadius: 4,
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <Flex justify="between" align="center">
                    <Text size="1" weight="bold" truncate style={{ maxWidth: 160 }}>
                      {b.title || "(untitled)"}
                    </Text>
                    <Badge size="1" color={statusColor(b.status)}>
                      {b.statusLabel}
                    </Badge>
                  </Flex>
                  <Flex justify="between">
                    <Text size="1" color="red" truncate style={{ maxWidth: 120 }}>
                      Target: {b.target || "Unknown"}
                    </Text>
                    <Text size="1" color="gray">
                      {b.rewardSui.toFixed(b.rewardSui < 1 ? 4 : 2)} SUI
                    </Text>
                  </Flex>
                </Flex>
              ))}
              <Flex gap="2">
                <Button size="1" variant="ghost" onClick={refresh}>Refresh</Button>
                {account && (
                  <Button size="1" variant="soft" color="red" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? "Cancel" : "+ Post Bounty"}
                  </Button>
                )}
              </Flex>
              {showCreate && <EmbeddedBountyCreateForm onCreated={refresh} />}
            </Flex>
          ) : (
            <Flex direction="column" gap="2">
              <Flex
                align="center"
                gap="1"
                onClick={() => setSelectedId(null)}
                style={{ cursor: "pointer" }}
              >
                <Text size="1" color="blue">← Back</Text>
              </Flex>

              <Text size="2" weight="bold">{selected.title || "(untitled)"}</Text>
              {selected.description && (
                <Text size="1" color="gray" style={{ whiteSpace: "pre-wrap" }}>{selected.description}</Text>
              )}

              <Flex gap="2" wrap="wrap">
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">Target</Text>
                  <Text size="1" weight="bold" color="red">
                    {selected.target || "Unknown"}
                  </Text>
                </Flex>
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">Reward</Text>
                  <Text size="1" weight="bold" color="blue">
                    {selected.rewardSui.toFixed(selected.rewardSui < 1 ? 4 : 2)} SUI
                  </Text>
                </Flex>
                <Flex direction="column" gap="0">
                  <Text size="1" color="gray">Status</Text>
                  <Badge size="1" color={statusColor(selected.status)}>
                    {selected.statusLabel}
                  </Badge>
                </Flex>
              </Flex>

              <Flex direction="column" gap="0">
                <Text size="1" color="gray">Posted by</Text>
                <Text size="1" style={{ fontFamily: "monospace" }}>
                  {selected.creator.slice(0, 10)}...{selected.creator.slice(-6)}
                </Text>
              </Flex>

              {/* Submit claim for active bounties */}
              {selected.status === 0 && account && (
                <Flex direction="column" gap="1">
                  <Text size="1" weight="medium">Submit Claim</Text>
                  <Flex gap="2">
                    <TextField.Root
                      size="1"
                      placeholder="Killmail ID or proof..."
                      value={proofInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProofInput(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      size="1"
                      variant="solid"
                      onClick={() => handleSubmitClaim(selected)}
                      disabled={claiming || !proofInput.trim()}
                    >
                      {claiming ? "..." : "Claim"}
                    </Button>
                  </Flex>
                </Flex>
              )}

              {selected.status === 0 && !account && (
                <Text size="1" color="orange">Connect wallet to claim</Text>
              )}

              {/* Pending claim info */}
              {selected.status === 1 && (
                <Flex direction="column" gap="1" p="2" style={{
                  border: "1px solid var(--orange-6)",
                  borderRadius: 4,
                }}>
                  <Text size="1" weight="medium" color="orange">Claim Pending</Text>
                  <Flex direction="column" gap="0">
                    <Text size="1" color="gray">Hunter</Text>
                    <Text size="1" style={{ fontFamily: "monospace" }}>
                      {selected.hunter.slice(0, 10)}...{selected.hunter.slice(-6)}
                    </Text>
                  </Flex>
                  {selected.proof && (
                    <Flex direction="column" gap="0">
                      <Text size="1" color="gray">Proof</Text>
                      <Text size="1" style={{ fontFamily: "monospace" }}>
                        {selected.proof}
                      </Text>
                    </Flex>
                  )}
                </Flex>
              )}

              {error && <Text size="1" color="red">{error}</Text>}
            </Flex>
          )}
        </Flex>
      )}
    </Flex>
  );
}

// ── Compact create forms for embedded view ──────────────────────

function EmbeddedJobCreateForm({ onCreated }: { onCreated: () => void }) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [reward, setReward] = useState("");
  const [rewardType, setRewardType] = useState<"SUI" | "item">("SUI");
  const [rewardItemName, setRewardItemName] = useState("");
  const [deliverables, setDeliverables] = useState<{ name: string; qty: string; search: string }[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [activeSearch, setActiveSearch] = useState<number | null>(null); // index of deliverable being searched
  const [rewardItemSearch, setRewardItemSearch] = useState("");
  const [competitive, setCompetitive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getItemTypeMap().then((map) => setItemTypes(Array.from(map.values())));
  }, []);

  const filterItems = (q: string) =>
    q.length >= 2
      ? itemTypes.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
      : [];

  const handleCreate = async () => {
    if (!account?.address || !title.trim() || !reward.trim()) return;
    const amount = parseFloat(reward);
    if (rewardType === "SUI") {
      if (isNaN(amount) || amount <= 0) { setError("Invalid SUI amount"); return; }
    }
    setCreating(true);
    setError(null);
    try {
      // Build description with deliverables appended
      let fullDesc = desc.trim();
      if (deliverables.length > 0) {
        const delivLines = deliverables
          .filter((d) => d.name.trim())
          .map((d) => `- ${d.name.trim()} x${d.qty || 1}`)
          .join("\n");
        if (delivLines) fullDesc += (fullDesc ? "\n\n" : "") + "Deliverables:\n" + delivLines;
      }
      if (rewardType === "item" && rewardItemName.trim()) {
        fullDesc += (fullDesc ? "\n\n" : "") + `Reward: ${amount || 1}x ${rewardItemName.trim()}`;
      }

      if (rewardType === "SUI") {
        const mist = BigInt(Math.round(amount * 1_000_000_000));
        const tx = competitive
          ? buildCreateCompetitiveJobTx(title.trim(), fullDesc, mist)
          : buildCreateJobTx(title.trim(), fullDesc, mist);
        await dAppKit.signAndExecuteTransaction({ transaction: tx });
        invalidateJobCache();
      }
      // For non-SUI rewards, we'd just save locally — but in embedded we only support on-chain
      // so SUI is the primary path. Non-SUI is informational only (no escrow).

      setTitle(""); setDesc(""); setReward(""); setRewardItemName("");
      setDeliverables([]); setRewardItemSearch("");
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Failed to post job");
    } finally {
      setCreating(false);
    }
  };

  const isSUI = rewardType === "SUI";

  return (
    <Flex direction="column" gap="2" p="2" style={{ border: "1px solid var(--green-6)", borderRadius: 4 }}>
      <Text size="1" weight="medium" color="green">Post a Job</Text>

      <TextField.Root size="1" placeholder="Job title"
        value={title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} />

      <TextField.Root size="1" placeholder="Description (optional)"
        value={desc} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDesc(e.target.value)} />

      {/* Deliverables */}
      <Flex direction="column" gap="1">
        <Flex justify="between" align="center">
          <Text size="1" color="gray">Deliverables (optional)</Text>
          <Text size="1" color="blue" style={{ cursor: "pointer" }}
            onClick={() => setDeliverables((p) => [...p, { name: "", qty: "1", search: "" }])}>
            + Add
          </Text>
        </Flex>
        {deliverables.map((d, i) => (
          <Flex key={i} gap="1" align="start" style={{ position: "relative" }}>
            <Flex direction="column" style={{ flex: 1, position: "relative" }}>
              <TextField.Root size="1" placeholder="Item name..."
                value={d.name || d.search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setDeliverables((p) => p.map((x, j) => j === i ? { ...x, name: "", search: v } : x));
                  setActiveSearch(i);
                }}
              />
              {activeSearch === i && filterItems(d.search).length > 0 && (
                <Flex direction="column" style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                  background: "var(--color-background)", border: "1px solid var(--color-border)",
                  borderRadius: 4, maxHeight: 120, overflowY: "auto",
                }}>
                  {filterItems(d.search).map((item) => (
                    <Text key={item.id} size="1" style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border)", padding: 4 }}
                      onClick={() => {
                        setDeliverables((p) => p.map((x, j) => j === i ? { ...x, name: item.name, search: "" } : x));
                        setActiveSearch(null);
                      }}>
                      {item.name}
                    </Text>
                  ))}
                </Flex>
              )}
            </Flex>
            <TextField.Root size="1" placeholder="Qty" value={d.qty} style={{ width: 50 }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDeliverables((p) => p.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
            <Text size="1" color="red" style={{ cursor: "pointer", padding: "4px" }}
              onClick={() => setDeliverables((p) => p.filter((_, j) => j !== i))}>✕</Text>
          </Flex>
        ))}
      </Flex>

      {/* Reward */}
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">Reward</Text>
        <Flex gap="1" align="center">
          <Badge size="1" color={isSUI ? "blue" : "gray"} style={{ cursor: "pointer" }}
            onClick={() => setRewardType("SUI")}>SUI</Badge>
          <Badge size="1" color={!isSUI ? "blue" : "gray"} style={{ cursor: "pointer" }}
            onClick={() => setRewardType("item")}>Item</Badge>
        </Flex>
        <Flex gap="2" align="start">
          {!isSUI && (
            <Flex direction="column" style={{ flex: 1, position: "relative" }}>
              <TextField.Root size="1" placeholder="Search item..."
                value={rewardItemName || rewardItemSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setRewardItemName(""); setRewardItemSearch(e.target.value);
                }}
              />
              {filterItems(rewardItemSearch).length > 0 && (
                <Flex direction="column" style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                  background: "var(--color-background)", border: "1px solid var(--color-border)",
                  borderRadius: 4, maxHeight: 120, overflowY: "auto",
                }}>
                  {filterItems(rewardItemSearch).map((item) => (
                    <Text key={item.id} size="1" style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border)", padding: 4 }}
                      onClick={() => { setRewardItemName(item.name); setRewardItemSearch(""); }}>
                      {item.name}
                    </Text>
                  ))}
                </Flex>
              )}
            </Flex>
          )}
          <TextField.Root size="1" placeholder={isSUI ? "Amount (SUI)" : "Qty"}
            value={reward} style={{ width: isSUI ? 100 : 50 }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReward(e.target.value)} />
        </Flex>
      </Flex>

      {/* Competitive toggle */}
      {isSUI && (
        <Flex align="center" gap="2">
          <Switch size="1" checked={competitive} onCheckedChange={setCompetitive} />
          <Text size="1" color={competitive ? "orange" : "gray"}>
            {competitive ? "Competitive — multiple workers race to deliver" : "Assigned — single worker"}
          </Text>
        </Flex>
      )}

      <Button size="1" variant="solid" color={competitive ? "orange" : "green"} onClick={handleCreate}
        disabled={creating || !title.trim() || !reward.trim() || (!isSUI && !rewardItemName.trim())}>
        {creating ? "Posting..." : competitive ? "Post Race (Escrow)" : isSUI ? "Post (Escrow)" : "Post"}
      </Button>

      {isSUI && !competitive && <Text size="1" color="gray">SUI will be escrowed on-chain (2.5% fee on payout)</Text>}
      {isSUI && competitive && <Text size="1" color="orange">Race mode: first to deliver wins the escrowed SUI</Text>}
      {!isSUI && <Text size="1" color="orange">Item rewards are trust-based (no escrow)</Text>}
      {error && <Text size="1" color="red">{error}</Text>}
    </Flex>
  );
}

function EmbeddedBountyCreateForm({ onCreated }: { onCreated: () => void }) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("");
  const [charSearch, setCharSearch] = useState("");
  const [charResults, setCharResults] = useState<CharacterSearchResult[]>([]);
  const [reward, setReward] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (charSearch.length < 2) { setCharResults([]); return; }
    const timer = setTimeout(() => {
      searchCharactersByName(charSearch).then(setCharResults);
    }, 200);
    return () => clearTimeout(timer);
  }, [charSearch]);

  const handleCreate = async () => {
    if (!account?.address || !title.trim() || !reward.trim()) return;
    const targetStr = target || charSearch.trim();
    if (!targetStr) { setError("Target required"); return; }
    const sui = parseFloat(reward);
    if (isNaN(sui) || sui <= 0) { setError("Invalid reward"); return; }
    setCreating(true);
    setError(null);
    try {
      const mist = BigInt(Math.round(sui * 1_000_000_000));
      const tx = buildCreateBountyTx(title.trim(), desc.trim(), targetStr, mist);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      invalidateBountyCache();
      setTitle(""); setDesc(""); setTarget(""); setCharSearch(""); setReward("");
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Failed to post bounty");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Flex direction="column" gap="2" p="2" style={{ border: "1px solid var(--red-6)", borderRadius: 4 }}>
      <Text size="1" weight="medium" color="red">Post a Bounty</Text>
      <TextField.Root
        size="1"
        placeholder="Bounty title"
        value={title}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
      />
      <TextField.Root
        size="1"
        placeholder="Description (optional)"
        value={desc}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDesc(e.target.value)}
      />
      <Flex direction="column" gap="1" style={{ position: "relative" }}>
        <TextField.Root
          size="1"
          placeholder="Target (search character name...)"
          value={charSearch}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setCharSearch(e.target.value);
            if (target) setTarget("");
          }}
        />
        {charResults.length > 0 && (
          <Flex
            direction="column"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 50,
              background: "var(--color-background)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              maxHeight: 160,
              overflowY: "auto",
            }}
          >
            {charResults.map((c) => (
              <Flex
                key={c.characterId}
                align="center"
                justify="between"
                p="1"
                onClick={() => {
                  setTarget(c.address);
                  setCharSearch(c.name);
                  setCharResults([]);
                  if (!title) setTitle(`Bounty: ${c.name}`);
                }}
                style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border)" }}
              >
                <Text size="1" weight="bold">{c.name}</Text>
                <Text size="1" color="gray" style={{ fontFamily: "monospace", fontSize: 9 }}>
                  {c.address.slice(0, 6)}...{c.address.slice(-4)}
                </Text>
              </Flex>
            ))}
          </Flex>
        )}
        {target && (
          <Text size="1" color="green">
            → {target.slice(0, 10)}...{target.slice(-6)}
          </Text>
        )}
      </Flex>
      <Flex gap="2" align="end">
        <TextField.Root
          size="1"
          placeholder="Reward (SUI)"
          value={reward}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReward(e.target.value)}
          style={{ width: 100 }}
        />
        <Button
          size="1"
          variant="solid"
          color="red"
          onClick={handleCreate}
          disabled={creating || !title.trim() || !reward.trim() || (!target && !charSearch.trim())}
        >
          {creating ? "Posting..." : "Post"}
        </Button>
      </Flex>
      <Text size="1" color="gray">SUI will be escrowed on-chain (2.5% fee on payout)</Text>
      {error && <Text size="1" color="red">{error}</Text>}
    </Flex>
  );
}

export function AuthorizeExtensionButton({
  characterId,
  assemblyId,
  ownerCapId,
  assemblyModule,
  assemblyTypeName,
  extensionPackageId,
  extensionModule,
  authTypeName,
}: {
  characterId: string;
  assemblyId: string;
  ownerCapId: string;
  assemblyModule: string;
  assemblyTypeName: string;
  extensionPackageId: string;
  extensionModule: string;
  authTypeName: string;
}) {
  const [status, setStatus] = useState<"idle" | "building" | "signing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dAppKit = useDAppKit();

  const handleAuthorize = async () => {
    setStatus("building");
    setErrorMsg(null);
    try {
      const tx = await buildAuthorizeExtensionTx({
        characterId,
        assemblyId,
        ownerCapId,
        assemblyModule,
        assemblyTypeName,
        extensionPackageId,
        extensionModule,
        authTypeName,
      });

      setStatus("signing");
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      console.log("[FrontierOps] Extension authorized:", result);
      setStatus("done");
    } catch (e: any) {
      console.error("[FrontierOps] Authorize extension failed:", e);
      setErrorMsg(e?.message || "Failed");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <Badge size="1" color="green">Extension Authorized</Badge>
    );
  }

  return (
    <Flex direction="column" gap="1">
      <Button
        size="1"
        variant="soft"
        onClick={handleAuthorize}
        disabled={status === "building" || status === "signing"}
      >
        {status === "building" ? "Building tx..." :
         status === "signing" ? "Sign in wallet..." :
         "Authorize Access Control Extension"}
      </Button>
      {errorMsg && <Text size="1" color="red">{errorMsg}</Text>}
    </Flex>
  );
}
