import { useState } from "react";
import { Flex } from "@radix-ui/themes";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { ModuleShell } from "./core/ModuleShell";
import { getModule } from "./core/module-registry";
import { EmbeddedTurretView } from "./components/EmbeddedTurretView";
import { LandingPage } from "./components/LandingPage";

/** Detect if running inside EVE Frontier's in-game assembly behavior panel. */
function isEmbeddedMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  // Game passes itemId as query param
  if (params.has("itemId") || params.has("item_id")) {
    return true;
  }
  // Or explicitly opt in via ?embedded=true
  if (params.has("embedded")) {
    return true;
  }
  return false;
}

const LANDING_DISMISSED_KEY = "frontier-ops-landing-dismissed";

function App() {
  const [activeModuleId, setActiveModuleId] = useState<string | null>(
    "mission-control",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showLanding, setShowLanding] = useState(
    () => !sessionStorage.getItem(LANDING_DISMISSED_KEY),
  );

  // In-game embedded mode: skip landing, show compact single-assembly controls
  if (isEmbeddedMode()) {
    return <EmbeddedTurretView />;
  }

  // Landing page — first visit per session
  if (showLanding) {
    return (
      <LandingPage
        onEnter={() => {
          sessionStorage.setItem(LANDING_DISMISSED_KEY, "1");
          setShowLanding(false);
        }}
      />
    );
  }

  const activeModule = activeModuleId ? getModule(activeModuleId) ?? null : null;

  return (
    <Flex direction="column" style={{ height: "100vh" }}>
      <Header onShowLanding={() => setShowLanding(true)} />
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
