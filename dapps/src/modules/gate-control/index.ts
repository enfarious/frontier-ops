import React from "react";
import { registerModule } from "../../core/module-registry";
import { GateIcon } from "./GateIcon";

registerModule({
  id: "gate-control",
  name: "Gate Control",
  description: "Monitor and configure smart gates",
  icon: GateIcon,
  component: React.lazy(() => import("./GateControlPage")),
  contexts: ["solo", "tribe"],
});
