import React from "react";
import { TargetIcon } from "@radix-ui/react-icons";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "bounty-board",
  name: "Bounty Board",
  description: "Post and claim bounties on player targets",
  icon: TargetIcon,
  component: React.lazy(() => import("./BountyBoardPage")),
  contexts: ["solo", "tribe"],
});
