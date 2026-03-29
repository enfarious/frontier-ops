/**
 * Text input with filtered dropdown suggestions.
 * Lightweight — no external deps, just a filtered list below a TextField.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { TextField } from "@radix-ui/themes";

interface Props {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  maxResults?: number;
  minChars?: number;
}

export function AutocompleteField({
  placeholder,
  value,
  onChange,
  suggestions,
  maxResults = 8,
  minChars = 2,
}: Props) {
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (value.length < minChars) return [];
    const lower = value.toLowerCase();
    const results: string[] = [];
    for (const s of suggestions) {
      if (s.toLowerCase().includes(lower)) {
        results.push(s);
        if (results.length >= maxResults) break;
      }
    }
    return results;
  }, [value, suggestions, maxResults, minChars]);

  const handleSelect = useCallback(
    (item: string) => {
      onChange(item);
      setFocused(false);
    },
    [onChange],
  );

  const showDropdown = focused && filtered.length > 0 && value !== filtered[0];

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <TextField.Root
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay to allow click on dropdown item
          setTimeout(() => setFocused(false), 150);
        }}
      />
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--color-background)",
            border: "1px solid var(--gray-6)",
            borderRadius: 4,
            zIndex: 100,
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {filtered.map((item) => (
            <div
              key={item}
              onMouseDown={() => handleSelect(item)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 12,
                borderBottom: "1px solid var(--gray-4)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
