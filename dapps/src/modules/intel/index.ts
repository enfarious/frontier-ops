import React from "react";
import { EyeOpenIcon } from "@radix-ui/react-icons";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "intel",
  name: "Intel",
  description: "Killmail analysis, threat profiles, and field reports",
  icon: EyeOpenIcon,
  component: React.lazy(() => import("./IntelPage")),
  contexts: ["solo", "tribe"],
});
