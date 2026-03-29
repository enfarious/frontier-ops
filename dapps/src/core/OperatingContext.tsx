import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { OperatingMode, TribeInfo } from "./types";
import type { Permission } from "./access-types";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useTribeRoles } from "./hooks/useTribeRoles";
import { fetchMyTribeId, fetchTribeData, type TribeMember, type TribeRoster } from "./tribe-data";

interface OperatingContextValue {
  mode: OperatingMode;
  setMode: (mode: OperatingMode) => void;
  tribe: TribeInfo | null;
  setTribe: (tribe: TribeInfo | null) => void;
  /** The address to scope queries to — wallet address in solo, tribe address in tribe mode */
  scopeAddress: string | undefined;
  /** Whether the connected wallet is the tribe owner (or solo mode) */
  isOwner: boolean;
  /** Check if the connected wallet has a specific permission */
  checkPermission: (permission: Permission) => boolean;
  /** The tribe roles hook for direct access to role management */
  tribeRoles: ReturnType<typeof useTribeRoles>;
  /** Tribe roster (only in tribe mode) */
  tribeRoster: TribeMember[];
  /** Whether tribe data is loading */
  tribeLoading: boolean;
}

const OperatingCtx = createContext<OperatingContextValue | null>(null);

export function OperatingContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<OperatingMode>("solo");
  const [tribe, setTribe] = useState<TribeInfo | null>(null);
  const [tribeRoster, setTribeRoster] = useState<TribeMember[]>([]);
  const [tribeLoading, setTribeLoading] = useState(false);
  const account = useCurrentAccount();

  // Auto-load tribe data when switching to tribe mode
  useEffect(() => {
    if (mode !== "tribe" || !account?.address) return;

    let cancelled = false;
    setTribeLoading(true);

    (async () => {
      const tribeId = await fetchMyTribeId(account.address);
      if (cancelled || !tribeId) {
        setTribeLoading(false);
        return;
      }

      const data: TribeRoster | null = await fetchTribeData(tribeId);
      if (cancelled) return;

      if (data) {
        setTribe({
          id: String(data.tribe.id),
          name: data.tribe.name,
          nameShort: data.tribe.nameShort,
          tribeId: data.tribe.id,
          memberCount: data.members.length,
          taxRate: data.tribe.taxRate,
          description: data.tribe.description,
          tribeUrl: data.tribe.tribeUrl,
        });
        setTribeRoster(data.members);
      }

      setTribeLoading(false);
    })();

    return () => { cancelled = true; };
  }, [mode, account?.address]);

  const handleSetMode = useCallback((newMode: OperatingMode) => {
    setMode(newMode);
    if (newMode === "solo") {
      setTribe(null);
      setTribeRoster([]);
    }
  }, []);

  // scopeAddress is always the user's wallet — modules use it for queries.
  // In tribe mode, the tribeRoster provides additional member data.
  const scopeAddress = account?.address;

  const ownerAddress = mode === "tribe" && tribe
    ? tribe.ownerId ?? account?.address
    : account?.address;

  const tribeRoles = useTribeRoles(
    mode === "tribe" && tribe ? tribe.id : undefined,
    ownerAddress,
  );

  const isOwner =
    mode === "solo" ||
    (!!account?.address && ownerAddress === account.address);

  const checkPermission = useCallback(
    (permission: Permission): boolean => {
      if (mode === "solo") return true;
      if (!account?.address) return false;
      if (isOwner) return true;
      return tribeRoles.hasPermission(account.address, permission);
    },
    [mode, account?.address, isOwner, tribeRoles],
  );

  return (
    <OperatingCtx.Provider
      value={{
        mode,
        setMode: handleSetMode,
        tribe,
        setTribe,
        scopeAddress,
        isOwner,
        checkPermission,
        tribeRoles,
        tribeRoster,
        tribeLoading,
      }}
    >
      {children}
    </OperatingCtx.Provider>
  );
}

export function useOperatingContext(): OperatingContextValue {
  const ctx = useContext(OperatingCtx);
  if (!ctx) {
    throw new Error(
      "useOperatingContext must be used within OperatingContextProvider",
    );
  }
  return ctx;
}
