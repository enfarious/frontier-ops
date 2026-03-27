import React from "react";
import { PersonIcon } from "@radix-ui/react-icons";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "contacts",
  name: "Contacts",
  description: "Track players with standings and notes",
  icon: PersonIcon,
  component: React.lazy(() => import("./ContactsPage")),
  contexts: ["solo", "tribe"],
});
