import { useState } from "react";
import { Dialog, DropdownMenu, Flex, Heading, SegmentedControl, Text } from "@radix-ui/themes";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import {
  useCurrentAccount,
  useDAppKit,
  useWallets,
} from "@mysten/dapp-kit-react";
import { ExitIcon, GearIcon } from "@radix-ui/react-icons";
import { useOperatingContext } from "../core/OperatingContext";
import type { OperatingMode } from "../core/types";
import { RoleManager } from "../core/components/RoleManager";

export function Header() {
  const account = useCurrentAccount();
  const { connectWallet, disconnectWallet } = useDAppKit();
  const wallets = useWallets();
  const { mode, setMode, isOwner, checkPermission } = useOperatingContext();
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showTribeSettings, setShowTribeSettings] = useState(false);

  const showTribeSettingsBtn =
    mode === "tribe" && account && (isOwner || checkPermission("manage_roles"));

  async function handleSelectWallet(walletIndex: number) {
    const wallet = wallets[walletIndex];
    if (!wallet) return;
    setShowWalletPicker(false);
    try {
      console.log("[FrontierOps] Connecting to wallet:", wallet.name);
      await connectWallet({ wallet });
      console.log("[FrontierOps] Wallet connected successfully");
    } catch (err) {
      console.error("[FrontierOps] Wallet connection failed:", err);
    }
  }

  async function handleDisconnect() {
    await disconnectWallet();
  }

  return (
    <Flex
      px="4"
      py="3"
      align="center"
      justify="between"
      style={{
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <Heading size="4">Frontier Ops</Heading>

      <Flex align="center" gap="4">
        {account && (
          <SegmentedControl.Root
            value={mode}
            onValueChange={(value) => setMode(value as OperatingMode)}
            size="1"
          >
            <SegmentedControl.Item value="solo">Solo</SegmentedControl.Item>
            <SegmentedControl.Item value="tribe">Tribe</SegmentedControl.Item>
          </SegmentedControl.Root>
        )}

        {showTribeSettingsBtn && (
          <Dialog.Root open={showTribeSettings} onOpenChange={setShowTribeSettings}>
            <Dialog.Trigger>
              <button title="Tribe Settings" style={{ display: "flex", alignItems: "center" }}>
                <GearIcon width={18} height={18} />
              </button>
            </Dialog.Trigger>
            <Dialog.Content style={{ maxWidth: 560 }}>
              <Dialog.Title>Tribe Settings</Dialog.Title>
              <Dialog.Description size="2" color="gray" mb="4">
                Manage roles and member permissions for your tribe.
              </Dialog.Description>
              <RoleManager />
            </Dialog.Content>
          </Dialog.Root>
        )}

        {account ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <button>{abbreviateAddress(account.address)}</button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              <DropdownMenu.Item
                color="red"
                onClick={handleDisconnect}
              >
                <ExitIcon />
                Disconnect
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        ) : (
          <Dialog.Root open={showWalletPicker} onOpenChange={setShowWalletPicker}>
            <Dialog.Trigger>
              <button>Connect Wallet</button>
            </Dialog.Trigger>
            <Dialog.Content style={{ maxWidth: 360 }}>
              <Dialog.Title>Connect Wallet</Dialog.Title>
              <Dialog.Description size="2" color="gray" mb="4">
                Select a wallet to connect
              </Dialog.Description>
              <Flex direction="column" gap="2">
                {wallets.length === 0 && (
                  <Text size="2" color="gray">
                    No wallets detected. Install a Sui wallet extension.
                  </Text>
                )}
                {wallets.map((wallet, i) => (
                  <button
                    key={wallet.name}
                    onClick={() => handleSelectWallet(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 16px",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    {wallet.icon && (
                      <img
                        src={wallet.icon}
                        alt=""
                        width={24}
                        height={24}
                        style={{ borderRadius: 4 }}
                      />
                    )}
                    {wallet.name}
                  </button>
                ))}
              </Flex>
            </Dialog.Content>
          </Dialog.Root>
        )}
      </Flex>
    </Flex>
  );
}
