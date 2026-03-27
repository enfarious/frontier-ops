/**
 * Universal assembly actions hook using direct PTBs.
 * Replaces the sponsored-transaction-based useTurretActions.
 * Works for turrets, SSUs, gates — any assembly type.
 */
import { useCallback, useState } from "react";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import {
  buildRenameTx,
  buildUpdateDescriptionTx,
  buildUpdateUrlTx,
  buildBringOnlineTx,
  buildBringOfflineTx,
} from "./assembly-actions";
import { buildAuthorizeExtensionTx } from "./authorize-extension";

/** Character ID — TODO: derive from wallet connection dynamically */
const CHARACTER_ID = "0x59c82d2c45e7c2c85aaca295b3acb6faebcf71ccb19d2865f3733cf6210dfb45";

interface AssemblyInfo {
  /** Sui object ID of the assembly */
  id: string;
  /** OwnerCap object ID */
  ownerCapId: string;
  /** Move module name: "turret", "storage_unit", "gate", "assembly" */
  assemblyModule: string;
  /** Move type name: "Turret", "StorageUnit", "Gate", "Assembly" */
  assemblyTypeName: string;
  /** NetworkNode / energy source ID (required for online/offline) */
  energySourceId?: string;
}

export function useAssemblyActions() {
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const [isPending, setIsPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const execute = useCallback(async (buildFn: () => Promise<any>) => {
    setIsPending(true);
    setLastError(null);
    try {
      const tx = await buildFn();
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      console.log("[FrontierOps] Transaction success:", result);
      return result;
    } catch (e: any) {
      console.error("[FrontierOps] Transaction failed:", e);
      setLastError(e?.message || "Transaction failed");
      throw e;
    } finally {
      setIsPending(false);
    }
  }, [dAppKit]);

  const bringOnline = useCallback(async (info: AssemblyInfo) => {
    if (!info.energySourceId) throw new Error("Energy source ID required for online");
    return execute(() => buildBringOnlineTx({
      characterId: CHARACTER_ID,
      assemblyId: info.id,
      ownerCapId: info.ownerCapId,
      assemblyModule: info.assemblyModule,
      assemblyTypeName: info.assemblyTypeName,
      energySourceId: info.energySourceId!,
    }));
  }, [execute]);

  const bringOffline = useCallback(async (info: AssemblyInfo) => {
    if (!info.energySourceId) throw new Error("Energy source ID required for offline");
    return execute(() => buildBringOfflineTx({
      characterId: CHARACTER_ID,
      assemblyId: info.id,
      ownerCapId: info.ownerCapId,
      assemblyModule: info.assemblyModule,
      assemblyTypeName: info.assemblyTypeName,
      energySourceId: info.energySourceId!,
    }));
  }, [execute]);

  const rename = useCallback(async (info: AssemblyInfo, newName: string) => {
    return execute(() => buildRenameTx({
      characterId: CHARACTER_ID,
      assemblyId: info.id,
      ownerCapId: info.ownerCapId,
      assemblyModule: info.assemblyModule,
      assemblyTypeName: info.assemblyTypeName,
      newName,
    }));
  }, [execute]);

  const updateDescription = useCallback(async (info: AssemblyInfo, description: string) => {
    return execute(() => buildUpdateDescriptionTx({
      characterId: CHARACTER_ID,
      assemblyId: info.id,
      ownerCapId: info.ownerCapId,
      assemblyModule: info.assemblyModule,
      assemblyTypeName: info.assemblyTypeName,
      description,
    }));
  }, [execute]);

  const updateUrl = useCallback(async (info: AssemblyInfo, url: string) => {
    return execute(() => buildUpdateUrlTx({
      characterId: CHARACTER_ID,
      assemblyId: info.id,
      ownerCapId: info.ownerCapId,
      assemblyModule: info.assemblyModule,
      assemblyTypeName: info.assemblyTypeName,
      url,
    }));
  }, [execute]);

  const authorizeExtension = useCallback(async (
    info: AssemblyInfo,
    extensionPackageId: string,
    extensionModule: string,
    authTypeName: string,
  ) => {
    return execute(() => buildAuthorizeExtensionTx({
      characterId: CHARACTER_ID,
      assemblyId: info.id,
      ownerCapId: info.ownerCapId,
      assemblyModule: info.assemblyModule,
      assemblyTypeName: info.assemblyTypeName,
      extensionPackageId,
      extensionModule,
      authTypeName,
    }));
  }, [execute]);

  return {
    bringOnline,
    bringOffline,
    rename,
    updateDescription,
    updateUrl,
    authorizeExtension,
    isPending,
    lastError,
    walletAddress: account?.address,
  };
}
