import React from "react";
import { EyeNoneIcon } from "@radix-ui/react-icons";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "tradecraft",
  name: "Tradecraft",
  description: "Watch targets, scout assets, package and sell intel",
  icon: EyeNoneIcon,
  component: React.lazy(() => import("./TradecraftPage")),
  contexts: ["solo"],
});
