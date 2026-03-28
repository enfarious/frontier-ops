/**
 * Time scrubber for heatmap playback.
 * Styled to match the dark starmap aesthetic.
 */

import { Flex, Text } from "@radix-ui/themes";
import { PlayIcon, PauseIcon } from "@radix-ui/react-icons";

const WINDOW_OPTIONS = [
  { label: "1h", value: 1 * 3600_000 },
  { label: "6h", value: 6 * 3600_000 },
  { label: "24h", value: 24 * 3600_000 },
  { label: "3d", value: 72 * 3600_000 },
  { label: "7d", value: 7 * 24 * 3600_000 },
];

const SPEED_OPTIONS = [
  { label: "1x", value: 1 },
  { label: "2x", value: 2 },
  { label: "5x", value: 5 },
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

interface Props {
  minTime: number;
  maxTime: number;
  currentTime: number;
  onCurrentTimeChange: (t: number) => void;
  windowDuration: number;
  onWindowDurationChange: (d: number) => void;
  isPlaying: boolean;
  onPlayPauseToggle: () => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (s: number) => void;
}

export function TimeSlider({
  minTime,
  maxTime,
  currentTime,
  onCurrentTimeChange,
  windowDuration,
  onWindowDurationChange,
  isPlaying,
  onPlayPauseToggle,
  playbackSpeed,
  onPlaybackSpeedChange,
}: Props) {
  return (
    <Flex
      align="center"
      gap="2"
      px="3"
      py="2"
      style={{
        background: "#080818",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
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
        }}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Slider */}
      <input
        type="range"
        min={minTime}
        max={maxTime}
        value={currentTime}
        onChange={(e) => onCurrentTimeChange(Number(e.target.value))}
        style={{
          flex: 1,
          height: 4,
          accentColor: "#e05030",
          cursor: "pointer",
        }}
      />

      {/* Time label */}
      <Text
        size="1"
        style={{
          fontFamily: "monospace",
          color: "#aaa",
          minWidth: 110,
          textAlign: "center",
        }}
      >
        {formatTime(currentTime)}
      </Text>

      {/* Speed selector */}
      <select
        value={playbackSpeed}
        onChange={(e) => onPlaybackSpeedChange(Number(e.target.value))}
        style={{
          ...btnStyle,
          appearance: "none",
          paddingRight: 4,
        }}
      >
        {SPEED_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Window duration selector */}
      <select
        value={windowDuration}
        onChange={(e) => onWindowDurationChange(Number(e.target.value))}
        style={{
          ...btnStyle,
          appearance: "none",
          paddingRight: 4,
        }}
      >
        {WINDOW_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Flex>
  );
}
