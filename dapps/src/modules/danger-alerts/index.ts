import React from "react";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "danger-alerts",
  name: "Danger Alerts",
  description: "Monitor killmails and threats in nearby systems",
  icon: ExclamationTriangleIcon,
  component: React.lazy(() => import("./DangerAlertsPage")),
  contexts: ["solo", "tribe"],
});
