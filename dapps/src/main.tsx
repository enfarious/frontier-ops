import React from "react";
import ReactDOM from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./main.css";

import { QueryClient } from "@tanstack/react-query";
import App from "./App.tsx";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
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

const queryClient = new QueryClient();

// Initialize SQLite and migrate localStorage data on first run
getDatabase().then(() => migrateFromLocalStorage()).catch(console.error);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Theme appearance="dark">
      <EveFrontierProvider queryClient={queryClient}>
        <OperatingContextProvider>
          <App />
        </OperatingContextProvider>
      </EveFrontierProvider>
    </Theme>
  </React.StrictMode>,
);
