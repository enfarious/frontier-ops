/**
 * Time controls for heatmap playback and static snapshot modes.
 *
 * Two modes:
 *   Playback — scrub through a date range, kills glow for `duration`
 *   Show All — static snapshot of all kills in a selected period
 */

import { Flex, Text } from "@radix-ui/themes";
import { PlayIcon, PauseIcon } from "@radix-ui/react-icons";

export const DURATION_OPTIONS = [
  { label: "1h",  value: 1 * 3600_000 },
  { label: "6h",  value: 6 * 3600_000 },
  { label: "24h", value: 24 * 3600_000 },
  { label: "3d",  value: 72 * 3600_000 },
  { label: "7d",  value: 7 * 24 * 3600_000 },
];

export const SPEED_OPTIONS = [
  { label: "1x",  value: 1 },
  { label: "2x",  value: 2 },
  { label: "5x",  value: 5 },
  { label: "10x", value: 10 },
];



function formatTime(ts: number): string {
  const d = new Date(ts);
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${h}:${m}`;
}

function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(val: string): number {
  return new Date(val).getTime();
}

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 4,
  color: "#ccc",
  padding: "2px 8px",
  fontSize: 11,
  fontFamily: "monospace",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "monospace",
  color: "#555",
  fontSize: 10,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const dateInputStyle: React.CSSProperties = {
  ...btnStyle,
  padding: "2px 6px",
  colorScheme: "dark",
};

interface Props {
  // Playback range
  rangeStart: number;
  rangeEnd: number;
  onRangeStartChange: (t: number) => void;
  onRangeEndChange: (t: number) => void;
  // Playback head
  currentTime: number;
  onCurrentTimeChange: (t: number) => void;
  // Glow duration
  killDuration: number;
  onKillDurationChange: (d: number) => void;
  // Playback controls
  isPlaying: boolean;
  onPlayPauseToggle: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (s: number) => void;
  // Show All mode
  showAllPeriod: string | null;
  onShowAllPeriodChange: (period: string | null) => void;
  // Data bounds (for clamping)
  dataMin: number;
  dataMax: number;
}

export function TimeSlider({
  rangeStart,
  rangeEnd,
  onRangeStartChange,
  onRangeEndChange,
  currentTime,
  onCurrentTimeChange,
  killDuration,
  onKillDurationChange,
  isPlaying,
  onPlayPauseToggle,
  playbackSpeed,
  onPlaybackSpeedChange,
  showAllPeriod,
  onShowAllPeriodChange,
}: Props) {
  const isShowAll = showAllPeriod !== null;

  return (
    <Flex
      direction="column"
      style={{
        background: "#080818",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Top row: Show All controls + date range */}
      <Flex align="center" gap="2" px="3" pt="2" pb="1" wrap="wrap">

        {/* Show All toggle */}
        <button
          onClick={() => onShowAllPeriodChange(showAllPeriod ? null : "on")}
          style={{
            ...btnStyle,
            background: showAllPeriod ? "rgba(224, 80, 48, 0.3)" : "rgba(255,255,255,0.05)",
            borderColor: showAllPeriod ? "rgba(224, 80, 48, 0.6)" : "rgba(255,255,255,0.12)",
            color: showAllPeriod ? "#ff8060" : "#888",
          }}
        >
          show all
        </button>

        <div style={{ flex: 1 }} />

        {/* Date range pickers */}
        <Flex align="center" gap="2">
          <span style={labelStyle}>from</span>
          <input
            type="date"
            value={toDateInputValue(rangeStart)}
            onChange={(e) => {
              const t = fromDateInputValue(e.target.value);
              if (!isNaN(t)) onRangeStartChange(t);
            }}
            style={dateInputStyle}
          />
          <span style={labelStyle}>to</span>
          <input
            type="date"
            value={toDateInputValue(rangeEnd)}
            onChange={(e) => {
              const t = fromDateInputValue(e.target.value);
              if (!isNaN(t)) onRangeEndChange(t);
            }}
            style={dateInputStyle}
          />
        </Flex>
      </Flex>

      {/* Bottom row: playback controls — hidden in Show All mode */}
      {!isShowAll && (
        <Flex align="center" gap="2" px="3" pb="2">

          {/* Play/Pause */}
          <button
            onClick={onPlayPauseToggle}
            style={{
              ...btnStyle,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              flexShrink: 0,
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Scrub slider */}
          <input
            type="range"
            min={rangeStart}
            max={rangeEnd}
            value={Math.min(Math.max(currentTime, rangeStart), rangeEnd)}
            onChange={(e) => onCurrentTimeChange(Number(e.target.value))}
            style={{
              flex: 1,
              height: 4,
              accentColor: "#e05030",
              cursor: "pointer",
            }}
          />

          {/* Current time label */}
          <Text
            size="1"
            style={{
              fontFamily: "monospace",
              color: "#aaa",
              minWidth: 110,
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {formatTime(currentTime)}
          </Text>

          {/* Speed */}
          <Flex align="center" gap="1">
            <span style={labelStyle}>speed</span>
            <select
              value={playbackSpeed}
              onChange={(e) => onPlaybackSpeedChange(Number(e.target.value))}
              style={{ ...btnStyle, appearance: "none" }}
            >
              {SPEED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Flex>

          {/* Kill glow duration */}
          <Flex align="center" gap="1">
            <span style={labelStyle}>duration</span>
            <select
              value={killDuration}
              onChange={(e) => onKillDurationChange(Number(e.target.value))}
              style={{ ...btnStyle, appearance: "none" }}
            >
              {DURATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Flex>

        </Flex>
      )}
    </Flex>
  );
}
