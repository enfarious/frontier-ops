/**
 * Route Planner Panel — slides in over the starmap.
 * Inputs: origin, destination, jump range, danger slider, gate toggles.
 * Output: route summary + leg list, fires onRouteChange to parent for canvas overlay.
 */
import { useState, useCallback, useEffect } from "react";
import { Badge, Button, Card, Flex, Slider, Spinner, Text, TextField } from "@radix-ui/themes";
import type { SolarSystem } from "../../core/world-api";
import type { KillmailData } from "../danger-alerts/danger-types";
import { planRoute, type RouteResult, type RouteLeg } from "./route-planner";

interface Props {
  systems: Map<number, SolarSystem>;
  killmails: KillmailData[];
  selectedSystem: number | null;
  onRouteChange: (result: RouteResult | null) => void;
  onClose: () => void;
}

function legTypeLabel(type: RouteLeg["type"]): { label: string; color: string } {
  switch (type) {
    case "gate_npc": return { label: "NPC Gate", color: "#4a9eff" };
    case "gate_player": return { label: "Player Gate", color: "#ff9f4a" };
    case "jump": return { label: "Jump", color: "#ff6b4a" };
  }
}

function dangerColor(score: number): string {
  if (score <= 0) return "var(--gray-9)";
  if (score < 20) return "var(--yellow-9)";
  if (score < 50) return "var(--orange-9)";
  return "var(--red-9)";
}

function sliderLabel(value: number): string {
  if (value <= 0.15) return "Shortest";
  if (value <= 0.4) return "Fast";
  if (value <= 0.6) return "Cautious";
  if (value <= 0.85) return "Careful";
  return "Safest";
}

export function RoutePlannerPanel({
  systems,
  killmails,
  selectedSystem,
  onRouteChange,
  onClose,
}: Props) {
  const [originId, setOriginId] = useState<number | null>(null);
  const [destId, setDestId] = useState<number | null>(null);
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [originResults, setOriginResults] = useState<Array<{ id: number; name: string }>>([]);
  const [destResults, setDestResults] = useState<Array<{ id: number; name: string }>>([]);
  const [jumpRange, setJumpRange] = useState("80");
  const [dangerSlider, setDangerSlider] = useState(0.5);
  const [useNpcGates, setUseNpcGates] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);

  // When user clicks a system on the map, offer to use it
  useEffect(() => {
    if (selectedSystem && systems.has(selectedSystem)) {
      const name = systems.get(selectedSystem)!.name;
      if (!originId) {
        setOriginId(selectedSystem);
        setOriginText(name);
      } else if (!destId && selectedSystem !== originId) {
        setDestId(selectedSystem);
        setDestText(name);
      }
    }
  }, [selectedSystem]); // eslint-disable-line

  const searchSystems = useCallback((query: string): Array<{ id: number; name: string }> => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const results: Array<{ id: number; name: string }> = [];
    for (const [id, sys] of systems) {
      if (sys.name.toLowerCase().includes(q)) {
        results.push({ id, name: sys.name });
        if (results.length >= 8) break;
      }
    }
    return results;
  }, [systems]);

  const handlePlan = useCallback(async () => {
    if (!originId || !destId) return;
    const range = parseFloat(jumpRange);
    if (isNaN(range) || range <= 0) return;

    setPlanning(true);
    setResult(null);
    onRouteChange(null);

    try {
      const [route] = await Promise.all([
        planRoute(originId, destId, systems, killmails, range, dangerSlider, useNpcGates, false),
        new Promise(res => setTimeout(res, 400)), // minimum visible search time
      ]);
      setResult(route as RouteResult);
      onRouteChange(route as RouteResult);
    } catch (e) {
      console.error("[RoutePlanner] Error:", e);
    } finally {
      setPlanning(false);
    }
  }, [originId, destId, systems, killmails, jumpRange, dangerSlider, useNpcGates, onRouteChange]);

  const dropdownStyle = {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    background: "var(--color-background)",
    border: "1px solid var(--gray-a6)",
    borderRadius: 4,
    zIndex: 200,
    maxHeight: 180,
    overflow: "auto",
  };

  return (
    <Card
      style={{
        width: 280,
        maxHeight: "calc(100vh - 180px)",
        overflowY: "auto",
        background: "var(--color-background)",
        border: "1px solid var(--gray-a6)",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header */}
      <Flex align="center" justify="between">
        <Text size="2" weight="bold" style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}>
          ROUTE PLANNER
        </Text>
        <Text
          size="1"
          color="gray"
          style={{ cursor: "pointer" }}
          onClick={onClose}
        >
          ✕
        </Text>
      </Flex>

      {/* Origin */}
      <Flex direction="column" gap="1" style={{ position: "relative" }}>
        <Text size="1" color="gray">Origin</Text>
        <TextField.Root
          size="1"
          placeholder="System name..."
          value={originText}
          onChange={(e) => {
            setOriginText(e.target.value);
            setOriginId(null);
            setOriginResults(searchSystems(e.target.value));
          }}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
        {originResults.length > 0 && !originId && (
          <div style={dropdownStyle}>
            {originResults.map((r) => (
              <DropdownItem
                key={r.id}
                label={r.name}
                onSelect={() => {
                  setOriginId(r.id);
                  setOriginText(r.name);
                  setOriginResults([]);
                }}
              />
            ))}
          </div>
        )}
        {originId && (
          <Text size="1" color="green" style={{ fontFamily: "monospace" }}>
            ✓ {originText}
          </Text>
        )}
      </Flex>

      {/* Destination */}
      <Flex direction="column" gap="1" style={{ position: "relative" }}>
        <Text size="1" color="gray">Destination</Text>
        <TextField.Root
          size="1"
          placeholder="System name..."
          value={destText}
          onChange={(e) => {
            setDestText(e.target.value);
            setDestId(null);
            setDestResults(searchSystems(e.target.value));
          }}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
        {destResults.length > 0 && !destId && (
          <div style={dropdownStyle}>
            {destResults.map((r) => (
              <DropdownItem
                key={r.id}
                label={r.name}
                onSelect={() => {
                  setDestId(r.id);
                  setDestText(r.name);
                  setDestResults([]);
                }}
              />
            ))}
          </div>
        )}
        {destId && (
          <Text size="1" color="green" style={{ fontFamily: "monospace" }}>
            ✓ {destText}
          </Text>
        )}
      </Flex>

      {/* Jump range */}
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">Jump Range</Text>
        <TextField.Root
          size="1"
          type="number"
          value={jumpRange}
          onChange={(e) => setJumpRange(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <Text size="1" color="gray" style={{ fontStyle: "italic" }}>
          In light-years (e.g. 80)
        </Text>
      </Flex>

      {/* Danger slider */}
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Text size="1" color="gray">Route Priority</Text>
          <Badge
            size="1"
            variant="soft"
            color={
              dangerSlider <= 0.2 ? "red" :
              dangerSlider <= 0.5 ? "orange" :
              "green"
            }
          >
            {sliderLabel(dangerSlider)}
          </Badge>
        </Flex>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[dangerSlider]}
          onValueChange={([v]) => setDangerSlider(v)}
          size="1"
        />
        <Flex justify="between">
          <Text size="1" color="red" style={{ fontFamily: "monospace" }}>Shortest</Text>
          <Text size="1" color="green" style={{ fontFamily: "monospace" }}>Safest</Text>
        </Flex>
      </Flex>

      {/* Gate toggles */}
      <Flex gap="2" align="center">
        <Text size="1" color="gray">Use NPC gates</Text>
        <Badge
          size="1"
          variant={useNpcGates ? "solid" : "outline"}
          color="blue"
          style={{ cursor: "pointer" }}
          onClick={() => setUseNpcGates(v => !v)}
        >
          {useNpcGates ? "ON" : "OFF"}
        </Badge>
      </Flex>

      {/* Plan button */}
      <Button
        size="2"
        disabled={!originId || !destId || planning}
        onClick={handlePlan}
        style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}
      >
  {planning ? <><Spinner size="1" /> Searching...</> : "PLOT ROUTE"}
      </Button>

      {/* Search progress */}
      {planning && (
        <Flex direction="column" gap="1" align="center" style={{ padding: "8px 0" }}>
          <Text size="1" color="gray" style={{ fontFamily: "monospace", letterSpacing: "0.08em" }}>
            SCANNING STAR CHART
          </Text>
          <Flex gap="2" align="center">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent-9)",
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  opacity: 0.3,
                }}
              />
            ))}
          </Flex>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 0.2; transform: scale(0.8); }
              50% { opacity: 1; transform: scale(1.2); }
            }
          `}</style>
          <Text size="1" color="gray" style={{ fontStyle: "italic", textAlign: "center" }}>
            {sliderLabel(dangerSlider) === "Shortest" ? "Plotting fastest path..." :
             sliderLabel(dangerSlider) === "Safest" ? "Avoiding hostile systems..." :
             "Weighing risk vs route..."}
          </Text>
        </Flex>
      )}

      {/* Results */}
      {result && (
        <Flex direction="column" gap="2">
          {!result.found ? (
            <Text size="2" color="red">No route found — try increasing jump range.</Text>
          ) : (
            <>
              {/* Summary */}
              <Flex gap="2" wrap="wrap">
                <Card size="1" style={{ flex: 1, minWidth: 55 }}>
                  <Flex direction="column" align="center" gap="0">
                    <Text size="1" color="gray">Total</Text>
                    <Text size="3" weight="bold">{result.totalJumps}</Text>
                  </Flex>
                </Card>
                <Card size="1" style={{ flex: 1, minWidth: 55 }}>
                  <Flex direction="column" align="center" gap="0">
                    <Text size="1" color="gray">Gates</Text>
                    <Text size="3" weight="bold" color="blue">{result.gateJumps}</Text>
                  </Flex>
                </Card>
                <Card size="1" style={{ flex: 1, minWidth: 55 }}>
                  <Flex direction="column" align="center" gap="0">
                    <Text size="1" color="gray">Jumps</Text>
                    <Text size="3" weight="bold" color="orange">{result.freeJumps}</Text>
                  </Flex>
                </Card>
                <Card size="1" style={{ flex: 1, minWidth: 55 }}>
                  <Flex direction="column" align="center" gap="0">
                    <Text size="1" color="gray">Fuel LY</Text>
                    <Text size="3" weight="bold">{result.totalFuelLy}</Text>
                  </Flex>
                </Card>
              </Flex>

              {result.totalDanger > 0 && result.totalJumps > 0 && (
                <Text size="1" style={{ color: dangerColor(result.totalDanger / result.totalJumps) }}>
                  ⚠ Avg danger: {Math.round(result.totalDanger / result.totalJumps)}/100
                </Text>
              )}

              {/* Leg list */}
              <Flex direction="column" gap="1" style={{ maxHeight: 220, overflowY: "auto" }}>
                {result.legs.map((leg, i) => {
                  const { label, color } = legTypeLabel(leg.type);
                  return (
                    <Flex key={i} align="center" gap="2" style={{ padding: "3px 0", borderBottom: "1px solid var(--gray-a3)" }}>
                      <Text size="1" color="gray" style={{ width: 18, textAlign: "right", flexShrink: 0 }}>
                        {i + 1}
                      </Text>
                      <Flex direction="column" style={{ flex: 1, minWidth: 0 }}>
                        <Text size="1" weight="bold" style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {leg.toName}
                        </Text>
                        <Flex gap="1" align="center">
                          <span style={{ fontSize: 10, color, fontFamily: "monospace" }}>{label}</span>
                          <span style={{ fontSize: 10, color: "var(--gray-9)", fontFamily: "monospace" }}>{leg.distanceLy}ly</span>
                          {leg.dangerScore > 0 && (
                            <span style={{ fontSize: 10, color: dangerColor(leg.dangerScore) }}>
                              ⚠{Math.round(leg.dangerScore)}
                            </span>
                          )}
                        </Flex>
                      </Flex>
                    </Flex>
                  );
                })}
              </Flex>

              <Button
                size="1"
                variant="soft"
                color="gray"
                onClick={() => { setResult(null); onRouteChange(null); }}
              >
                Clear Route
              </Button>
            </>
          )}
        </Flex>
      )}
    </Card>
  );
}

/** Simple stateful hover dropdown item */
function DropdownItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "monospace",
        background: hover ? "var(--accent-3)" : "transparent",
        borderBottom: "1px solid var(--gray-a3)",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
    >
      {label}
    </div>
  );
}
