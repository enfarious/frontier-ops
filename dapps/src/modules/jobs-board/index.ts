import React from "react";
import { ClipboardIcon } from "@radix-ui/react-icons";
import { registerModule } from "../../core/module-registry";

registerModule({
  id: "jobs-board",
  name: "Jobs Board",
  description: "Post and manage jobs with rewards and deliverables",
  icon: ClipboardIcon,
  component: React.lazy(() => import("./JobsBoardPage")),
  contexts: ["solo", "tribe"],
});
