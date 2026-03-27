import React from "react";
import { GroupIcon } from "@radix-ui/react-icons";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "tribe-roster",
  name: "Tribe Roster",
  description: "View tribe members and their status",
  icon: GroupIcon,
  component: React.lazy(() => import("./TribeRosterPage")),
  contexts: ["solo", "tribe"],
});
