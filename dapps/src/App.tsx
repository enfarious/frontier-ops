import { useState } from "react";
import { Flex } from "@radix-ui/themes";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ModuleShell } from "./core/ModuleShell";
import { getModule } from "./core/module-registry";
import { EmbeddedTurretView } from "./components/EmbeddedTurretView";

/** Detect if running inside EVE Frontier's in-game assembly behavior panel. */
function isEmbeddedMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  // Game passes itemId as query param
  if (params.has("itemId") || params.has("item_id")) {
    console.log("[FrontierOps] Embedded mode: query param detected");
    return true;
  }
  // Or explicitly opt in via ?embedded=true
  if (params.has("embedded")) {
    console.log("[FrontierOps] Embedded mode: explicit param");
    return true;
  }
  return false;
}

function App() {
  const [activeModuleId, setActiveModuleId] = useState<string | null>(
    "turret-control",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // In-game embedded mode: show compact single-assembly controls
  if (isEmbeddedMode()) {
    return <EmbeddedTurretView />;
  }

  const activeModule = activeModuleId ? getModule(activeModuleId) ?? null : null;

  return (
    <Flex direction="column" style={{ height: "100vh" }}>
      <Header />
      <Flex style={{ flex: 1, overflow: "hidden" }}>
        <Sidebar
          activeModuleId={activeModuleId}
          onSelectModule={setActiveModuleId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <Flex direction="column" style={{ flex: 1, overflow: "hidden" }}>
          <ModuleShell module={activeModule} />
        </Flex>
      </Flex>
    </Flex>
  );
}

export default App;
