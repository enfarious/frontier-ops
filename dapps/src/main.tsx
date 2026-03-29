import React from "react";
import ReactDOM from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./main.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createDAppKit, DAppKitProvider } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  VaultProvider,
  SmartObjectProvider,
  NotificationProvider,
} from "@evefrontier/dapp-kit";
import App from "./App.tsx";
import { Theme } from "@radix-ui/themes";
import { OperatingContextProvider } from "./core/OperatingContext";
import { getDatabase, migrateFromLocalStorage } from "./core/database";

// Register modules
import "./modules/mission-control";
import "./modules/intel";
import "./modules/tradecraft";
import "./modules/danger-alerts";
import "./modules/starmap";
import "./modules/turret-control";
import "./modules/gate-control";
import "./modules/storage-units";
import "./modules/network-nodes";
import "./modules/contacts";
import "./modules/jobs-board";
import "./modules/bounty-board";
import "./modules/tribe-roster";

const GRPC_URLS = {
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
} as const;

type SupportedNetwork = keyof typeof GRPC_URLS;
const SUPPORTED_NETWORKS = Object.keys(GRPC_URLS) as SupportedNetwork[];

const dAppKit = createDAppKit({
  autoConnect: false,
  networks: SUPPORTED_NETWORKS,
  createClient(network) {
    return new SuiGrpcClient({
      network,
      baseUrl: GRPC_URLS[network as SupportedNetwork],
    });
  },
});

const queryClient = new QueryClient();

// Initialize SQLite and migrate localStorage data on first run
getDatabase().then(() => migrateFromLocalStorage()).catch(console.error);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Theme appearance="dark">
      <QueryClientProvider client={queryClient}>
        <DAppKitProvider dAppKit={dAppKit}>
          <VaultProvider>
            <SmartObjectProvider>
              <NotificationProvider>
                <OperatingContextProvider>
                  <App />
                </OperatingContextProvider>
              </NotificationProvider>
            </SmartObjectProvider>
          </VaultProvider>
        </DAppKitProvider>
      </QueryClientProvider>
    </Theme>
  </React.StrictMode>,
);
