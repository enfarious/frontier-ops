import React from "react";
import { registerModule } from "../../core/module-registry";
import { NodeIcon } from "./NodeIcon";

registerModule({
  id: "network-nodes",
  name: "Network Nodes",
  description: "Monitor and manage network nodes (fuel, energy, connections)",
  icon: NodeIcon,
  component: React.lazy(() => import("./NetworkNodesPage")),
  contexts: ["solo", "tribe"],
});
