import React from "react";
import { registerModule } from "../../core/module-registry";
import { CrosshairIcon } from "./CrosshairIcon";

registerModule({
  id: "turret-control",
  name: "Turret Control",
  description: "Monitor and configure smart turrets",
  icon: CrosshairIcon,
  component: React.lazy(() => import("./TurretControlPage")),
  contexts: ["solo", "tribe"],
});
