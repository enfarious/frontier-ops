import React from "react";
import { registerModule } from "../../core/module-registry";
import { StorageIcon } from "./StorageIcon";

registerModule({
  id: "storage-units",
  name: "Storage Units",
  description: "Monitor and manage smart storage units",
  icon: StorageIcon,
  component: React.lazy(() => import("./StorageUnitsPage")),
  contexts: ["solo", "tribe"],
});
