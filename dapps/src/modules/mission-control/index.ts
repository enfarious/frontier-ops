import React from "react";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "mission-control",
  name: "Mission Control",
  description: "AI operations assistant for managing your fleet",
  icon: () => React.createElement("span", null, "🛰️"),
  component: React.lazy(() => import("./MissionControlPage")),
  contexts: ["solo", "tribe"],
});
