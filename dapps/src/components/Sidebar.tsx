import { useCallback, useRef, useState } from "react";
import { Badge, Box, Flex, Text, Switch } from "@radix-ui/themes";
import {
  getModules,
  getEnabledModuleIds,
  setEnabledModuleIds,
  getModuleOrder,
  setModuleOrder,
  type ModuleDefinition,
} from "../core/module-registry";
import { useOperatingContext } from "../core/OperatingContext";
import { ChevronLeftIcon, ChevronRightIcon, DragHandleDots2Icon, GearIcon, Link2Icon, HeartIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import type { TribeInfo } from "../core/types";

interface SidebarProps {
  activeModuleId: string | null;
  onSelectModule: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function sortByOrder(modules: ModuleDefinition[], order: string[]) {
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...modules].sort((a, b) => {
    const ai = idx.get(a.id) ?? Infinity;
    const bi = idx.get(b.id) ?? Infinity;
    return ai - bi;
  });
}

export function Sidebar({ activeModuleId, onSelectModule, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { mode, tribe } = useOperatingContext();
  const [enabledIds, setEnabledIds] = useState<Set<string>>(
    getEnabledModuleIds,
  );
  const [order, setOrder] = useState<string[]>(getModuleOrder);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const dragItem = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const allModules = getModules();
  const availableModules = allModules.filter((m) => m.contexts.includes(mode));
  const visibleModules = sortByOrder(
    availableModules.filter((m) => enabledIds.has(m.id)),
    order,
  );

  function toggleModule(id: string) {
    const next = new Set(enabledIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setEnabledIds(next);
    setEnabledModuleIds(next);
  }

  const handleDragStart = useCallback((id: string) => {
    dragItem.current = id;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, overId: string) => {
      e.preventDefault();
      if (dragItem.current && dragItem.current !== overId) {
        setDragOverId(overId);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = dragItem.current;
      if (!sourceId || sourceId === targetId) {
        dragItem.current = null;
        setDragOverId(null);
        return;
      }

      const ids = visibleModules.map((m) => m.id);
      const fromIdx = ids.indexOf(sourceId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, sourceId);

      setOrder(ids);
      setModuleOrder(ids);
      dragItem.current = null;
      setDragOverId(null);
    },
    [visibleModules],
  );

  const handleDragEnd = useCallback(() => {
    dragItem.current = null;
    setDragOverId(null);
  }, []);

  if (collapsed) {
    return (
      <Flex
        direction="column"
        align="center"
        style={{
          width: 40,
          minWidth: 40,
          borderRight: "1px solid var(--color-border)",
          height: "100%",
        }}
      >
        <Box
          p="2"
          style={{ cursor: "pointer" }}
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          <ChevronRightIcon />
        </Box>
        <Flex direction="column" gap="1" align="center" p="1" style={{ flex: 1 }}>
          {visibleModules.map((m) => {
            const Icon = m.icon;
            return (
              <Box
                key={m.id}
                p="1"
                onClick={() => onSelectModule(m.id)}
                title={m.name}
                style={{
                  cursor: "pointer",
                  borderRadius: 4,
                  backgroundColor: m.id === activeModuleId
                    ? "var(--color-button-background)"
                    : "transparent",
                }}
              >
                <Icon />
              </Box>
            );
          })}
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex
      direction="column"
      style={{
        width: 220,
        minWidth: 220,
        borderRight: "1px solid var(--color-border)",
        height: "100%",
      }}
    >
      <Flex direction="column" gap="1" p="3" style={{ flex: 1, overflow: "auto" }}>
        <Flex justify="between" align="center" mb="2">
          <Text size="1" color="gray" weight="bold">
            MODULES
          </Text>
          {onToggleCollapse && (
            <Box style={{ cursor: "pointer" }} onClick={onToggleCollapse} title="Collapse sidebar">
              <ChevronLeftIcon />
            </Box>
          )}
        </Flex>

        {mode === "tribe" && tribe && <TribeIdentityCard tribe={tribe} />}

        {visibleModules.map((m) => (
          <ModuleNavItem
            key={m.id}
            module={m}
            active={m.id === activeModuleId}
            isDragOver={m.id === dragOverId}
            onClick={() => onSelectModule(m.id)}
            onDragStart={() => handleDragStart(m.id)}
            onDragOver={(e) => handleDragOver(e, m.id)}
            onDrop={() => handleDrop(m.id)}
            onDragEnd={handleDragEnd}
          />
        ))}
        {visibleModules.length === 0 && (
          <Text size="1" color="gray">
            No modules enabled
          </Text>
        )}
      </Flex>

      <Box
        p="3"
        style={{ borderTop: "1px solid var(--color-border)", overflow: "auto", maxHeight: showSettings ? "50%" : undefined }}
      >
        <Flex
          align="center"
          gap="2"
          style={{ cursor: "pointer" }}
          onClick={() => setShowSettings(!showSettings)}
        >
          <GearIcon />
          <Text size="1">Module Settings</Text>
        </Flex>

        {showSettings && (
          <Flex direction="column" gap="2" mt="3">
            {availableModules.map((m) => (
              <Flex key={m.id} align="center" justify="between">
                <Text size="1">{m.name}</Text>
                <Switch
                  size="1"
                  checked={enabledIds.has(m.id)}
                  onCheckedChange={() => toggleModule(m.id)}
                />
              </Flex>
            ))}
          </Flex>
        )}
      </Box>

      {/* About & Contribute */}
      <Box
        p="3"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <Flex
          align="center"
          gap="2"
          style={{ cursor: "pointer" }}
          onClick={() => setShowAbout(!showAbout)}
        >
          <HeartIcon style={{ opacity: 0.6 }} />
          <Text size="1">About Frontier Ops</Text>
        </Flex>

        {showAbout && (
          <Flex direction="column" gap="2" mt="3">
            <Text size="1" color="gray" style={{ lineHeight: 1.5 }}>
              Built by a solo player, for solo players. EVE Frontier is brutal
              without good tools — so I built them.
            </Text>
            <Text size="1" color="gray" style={{ lineHeight: 1.5 }}>
              I'm Mike — Navy vet, former social worker, snowboard instructor,
              and self-taught dev. This project is how I learned to build
              full-stack apps while playing a spaceship game at 2am.
            </Text>
            <Text size="1" color="gray" style={{ lineHeight: 1.5 }}>
              Frontier Ops is free and open source. Fork it, self-host it, set your own
              treasury wallet. It's yours.
            </Text>

            <Flex direction="column" gap="1" mt="1">
              <a
                href="https://ko-fi.com/enfarious"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Flex
                  align="center"
                  gap="2"
                  p="2"
                  style={{
                    borderRadius: 6,
                    background: "rgba(255,94,94,0.12)",
                    border: "1px solid rgba(255,94,94,0.25)",
                    cursor: "pointer",
                  }}
                >
                  <HeartIcon style={{ color: "#ff5e5e" }} />
                  <Text size="1" style={{ color: "#ff8080" }}>Support the project</Text>
                </Flex>
              </a>

              <a
                href="https://github.com/enfarious/frontier-ops"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Flex
                  align="center"
                  gap="2"
                  p="2"
                  style={{
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer",
                  }}
                >
                  <GitHubLogoIcon style={{ opacity: 0.7 }} />
                  <Text size="1" color="gray">View on GitHub</Text>
                </Flex>
              </a>
            </Flex>
          </Flex>
        )}
      </Box>
    </Flex>
  );
}

function ModuleNavItem({
  module,
  active,
  isDragOver,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  module: ModuleDefinition;
  active: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const Icon = module.icon;

  return (
    <Flex
      align="center"
      gap="2"
      px="2"
      py="1"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderRadius: 4,
        backgroundColor: active
          ? "var(--color-button-background)"
          : "transparent",
        borderTop: isDragOver ? "2px solid var(--accent-9)" : "2px solid transparent",
        transition: "border-top 0.1s",
      }}
    >
      <DragHandleDots2Icon
        style={{ opacity: 0.4, flexShrink: 0, cursor: "grab" }}
      />
      <Icon />
      <Text size="2">{module.name}</Text>
    </Flex>
  );
}

function TribeIdentityCard({ tribe }: { tribe: TribeInfo }) {
  const taxPct = ((tribe.taxRate ?? 0) / 100).toFixed(1);

  return (
    <Flex
      direction="column"
      gap="1"
      mb="3"
      p="2"
      style={{
        borderRadius: 6,
        border: "1px solid var(--accent-6)",
        background: "var(--accent-a2)",
      }}
    >
      <Flex align="center" gap="2">
        <Text size="3" weight="bold" style={{ lineHeight: 1.2 }}>
          {tribe.name}
        </Text>
        {tribe.nameShort && (
          <Badge size="1" variant="soft" color="blue">
            {tribe.nameShort}
          </Badge>
        )}
      </Flex>

      {tribe.description && (
        <Text size="1" color="gray" style={{ lineHeight: 1.3 }}>
          {tribe.description.length > 120
            ? tribe.description.slice(0, 120) + "…"
            : tribe.description}
        </Text>
      )}

      <Flex gap="3" mt="1" wrap="wrap">
        {tribe.memberCount != null && (
          <Text size="1" color="gray">
            {tribe.memberCount.toLocaleString()} members
          </Text>
        )}
        <Text size="1" color="gray">
          Tax {taxPct}%
        </Text>
      </Flex>

      {tribe.tribeUrl && (
        <Flex align="center" gap="1" mt="1">
          <Link2Icon width={12} height={12} style={{ opacity: 0.6 }} />
          <a
            href={tribe.tribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--accent-11)", textDecoration: "none" }}
          >
            {tribe.tribeUrl.replace(/^https?:\/\//, "").slice(0, 30)}
          </a>
        </Flex>
      )}
    </Flex>
  );
}
