import { useCallback } from "react";
import {
  useSponsoredTransaction,
  SponsoredTransactionActions,
  Assemblies,
} from "@evefrontier/dapp-kit";

/**
 * Provides sponsored transaction functions for turret operations.
 *
 * Uses EVE Frontier's sponsored transaction system (via Eve Vault) which
 * handles the ownership chain (Wallet → Character → OwnerCap → Turret)
 * and pays gas fees.
 */
export function useTurretActions() {
  const { mutateAsync: sendSponsoredTx, isPending } = useSponsoredTransaction();

  /** Build the assembly arg needed by sponsored transactions */
  function makeAssemblyArg(itemId: number) {
    // The sponsored tx system needs { type, item_id } at minimum
    return {
      type: Assemblies.SmartTurret,
      item_id: itemId,
    } as any;
  }

  const bringOnline = useCallback(
    async (itemId: number) => {
      return sendSponsoredTx({
        txAction: SponsoredTransactionActions.BRING_ONLINE,
        assembly: makeAssemblyArg(itemId),
        tenant: "stillness",
      });
    },
    [sendSponsoredTx],
  );

  const bringOffline = useCallback(
    async (itemId: number) => {
      return sendSponsoredTx({
        txAction: SponsoredTransactionActions.BRING_OFFLINE,
        assembly: makeAssemblyArg(itemId),
        tenant: "stillness",
      });
    },
    [sendSponsoredTx],
  );

  const updateMetadata = useCallback(
    async (itemId: number, name?: string, description?: string) => {
      return sendSponsoredTx({
        txAction: SponsoredTransactionActions.UPDATE_METADATA,
        assembly: makeAssemblyArg(itemId),
        tenant: "stillness",
        metadata: { name, description },
      });
    },
    [sendSponsoredTx],
  );

  return {
    bringOnline,
    bringOffline,
    updateMetadata,
    isPending,
  };
}
