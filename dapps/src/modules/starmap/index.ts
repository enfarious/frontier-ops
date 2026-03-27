import React from "react";
import { registerModule } from "../../core/module-registry";
import { StarmapIcon } from "./StarmapIcon";

registerModule({
  id: "starmap",
  name: "Starmap",
  description: "Visual solar system map with activity overlay",
  icon: StarmapIcon,
  component: React.lazy(() => import("./StarmapPage")),
  contexts: ["solo", "tribe"],
});
