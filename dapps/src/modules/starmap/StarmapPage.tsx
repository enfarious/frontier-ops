import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { Box, Flex, Heading, Spinner, Text, TextField } from "@radix-ui/themes";
import { useStarmapData } from "./hooks/useStarmapData";
import { useJumpHistory } from "./hooks/useGateLinks";
import { useKillmails } from "../danger-alerts/hooks/useKillmails";
import { StarmapCanvas, type StarmapCanvasHandle } from "./StarmapCanvas";
import { SystemInfoPanel } from "./SystemInfoPanel";
import { TimeSlider } from "./TimeSlider";

const HOME_SYSTEM_KEY = "frontier-ops:home-system";

function getSavedHomeSystem(): number | null {
  try {
    const val = localStorage.getItem(HOME_SYSTEM_KEY);
    return val ? Number(val) : null;
  } catch { return null; }
}

export default function StarmapPage() {
  const { systems, coords, killHeat, isLoading, error } = useStarmapData();
  const { data: killmails } = useKillmails();
  // Jump history requires auth — pass null until we have token infrastructure
  const { routes: jumpRoutes } = useJumpHistory(null);
  const [selectedSystem, setSelectedSystem] = useState<number | null>(null);
  const [selectedPos, setSelectedPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredSystem, setHoveredSystem] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: number; name: string }>>([]);
  const canvasRef = useRef<StarmapCanvasHandle>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(600);

  // Heatmap state
  const [heatmapCurrentTime, setHeatmapCurrentTime] = useState(Date.now());
  const [heatmapWindowDuration, setHeatmapWindowDuration] = useState(24 * 3600_000);
  const [heatmapPlaying, setHeatmapPlaying] = useState(false);
  const [heatmapSpeed, setHeatmapSpeed] = useState(1);
  const [heatmapEnabled] = useState(true);

  // Time range from killmail data
  const DAY_MS = 86400_000;
  const timeRange = useMemo(() => {
    if (!killmails?.length) return { min: Date.now() - 7 * DAY_MS, max: Date.now() };
    const timestamps = killmails.map((k) => k.killTimestamp);
    return { min: Math.min(...timestamps), max: Date.now() };
  }, [killmails]);

  // Playback animation loop
  const lastFrameRef = useRef(0);
  useEffect(() => {
    if (!heatmapPlaying) return;
    lastFrameRef.current = performance.now();

    let rafId: number;
    function tick(now: number) {
      const dt = (now - lastFrameRef.current) / 1000; // seconds
      lastFrameRef.current = now;

      // 1 real second = 1 game hour at 1x speed
      const advance = dt * heatmapSpeed * 3600_000;

      setHeatmapCurrentTime((prev) => {
        const next = prev + advance;
        if (next >= Date.now()) {
          setHeatmapPlaying(false);
          return Date.now();
        }
        return next;
      });

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [heatmapPlaying, heatmapSpeed]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Search systems by name
  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
    if (text.length < 2) {
      setSearchResults([]);
      return;
    }
    const lower = text.toLowerCase();
    const results: Array<{ id: number; name: string }> = [];
    for (const [id, sys] of systems) {
      if (sys.name.toLowerCase().includes(lower)) {
        results.push({ id, name: sys.name });
        if (results.length >= 8) break;
      }
    }
    setSearchResults(results);
  }, [systems]);

  const navigateToSystem = useCallback((systemId: number) => {
    const coord = coords.get(systemId);
    if (!coord) return;
    setSelectedSystem(systemId);
    setSearchText("");
    setSearchResults([]);
    canvasRef.current?.navigateTo(coord.nx, coord.nz, 25);
  }, [coords]);

  const setHomeSystem = useCallback(() => {
    if (selectedSystem) {
      localStorage.setItem(HOME_SYSTEM_KEY, String(selectedSystem));
      setSavedHome(selectedSystem);
    }
  }, [selectedSystem]);

  // On first load, navigate to home system
  const hasNavigated = useRef(false);
  const [savedHome, setSavedHome] = useState<number | null>(() => getSavedHomeSystem());

  // Callback for when canvas is ready
  const handleCanvasReady = useCallback(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    const homeId = savedHome;
    if (homeId) {
      const coord = coords.get(homeId);
      if (coord) {
        setSelectedSystem(homeId);
        // Slight delay to let canvas measure
        setTimeout(() => canvasRef.current?.navigateTo(coord.nx, coord.nz, 15), 100);
        return;
      }
    }
    // Default: zoom to center a bit
    setTimeout(() => canvasRef.current?.navigateTo(0.5, 0.5, 2), 100);
  }, [savedHome, coords]);

  if (isLoading) {
    return (
      <Flex align="center" justify="center" gap="2" style={{ height: "100%" }}>
        <Spinner size="3" />
        <Text size="2">Loading starmap...</Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Text color="red">{error}</Text>
      </Flex>
    );
  }

  const selectedSys = selectedSystem ? systems.get(selectedSystem) ?? null : null;
  const hoveredSys = hoveredSystem ? systems.get(hoveredSystem) ?? null : null;

  return (
    <Flex direction="column" style={{ height: "100%" }}>
      {/* Header with search */}
      <Flex align="center" justify="between" px="2" py="1" gap="3" style={{ position: "relative" }}>
        <Heading size="4">Starmap</Heading>

        <Flex align="center" gap="2" style={{ flex: 1, maxWidth: 300, position: "relative" }}>
          <TextField.Root
            size="1"
            placeholder="Search system..."
            value={searchText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          {/* Search dropdown */}
          {searchResults.length > 0 && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "var(--color-background)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              zIndex: 100,
              maxHeight: 200,
              overflow: "auto",
            }}>
              {searchResults.map(r => (
                <div
                  key={r.id}
                  onClick={() => navigateToSystem(r.id)}
                  style={{
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontSize: 12,
                    borderBottom: "1px solid var(--color-border)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {r.name}
                </div>
              ))}
            </div>
          )}
        </Flex>

        <Text size="1" color="gray" style={{ width: 180, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedSys ? `Selected: ${selectedSys.name}` : hoveredSys ? hoveredSys.name : `${systems.size} systems`}
        </Text>
      </Flex>

      <Box ref={mapContainerRef} style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <StarmapCanvas
          ref={canvasRef}
          systems={systems}
          coords={coords}
          killHeat={killHeat}
          jumpRoutes={jumpRoutes}
          selectedSystem={selectedSystem}
          onSelectSystem={(id, pos) => {
            setSelectedSystem(id);
            if (pos) setSelectedPos(pos);
          }}
          onHoverSystem={setHoveredSystem}
          onReady={handleCanvasReady}
          killmails={killmails}
          heatmapCurrentTime={heatmapCurrentTime}
          heatmapWindowDuration={heatmapWindowDuration}
          heatmapEnabled={heatmapEnabled}
        />

        {/* Floating info overlay */}
        {selectedSystem != null && selectedSys && (
          <Box
            style={{
              position: "absolute",
              left: Math.min(selectedPos.x + 12, (containerWidth ?? 600) - 240),
              top: Math.min(selectedPos.y + 12, (containerHeight ?? 400) - 300),
              width: 230,
              zIndex: 50,
              pointerEvents: "auto",
            }}
          >
            <SystemInfoPanel
              system={selectedSys}
              lastKillTime={killHeat.get(selectedSystem) ?? 0}
              isHome={selectedSystem === savedHome}
              onClose={() => setSelectedSystem(null)}
              onSetHome={setHomeSystem}
            />
          </Box>
        )}
      </Box>

      {/* Heatmap time controls */}
      <TimeSlider
        minTime={timeRange.min}
        maxTime={timeRange.max}
        currentTime={heatmapCurrentTime}
        onCurrentTimeChange={setHeatmapCurrentTime}
        windowDuration={heatmapWindowDuration}
        onWindowDurationChange={setHeatmapWindowDuration}
        isPlaying={heatmapPlaying}
        onPlayPauseToggle={() => setHeatmapPlaying((p) => !p)}
        playbackSpeed={heatmapSpeed}
        onPlaybackSpeedChange={setHeatmapSpeed}
      />
    </Flex>
  );
}
