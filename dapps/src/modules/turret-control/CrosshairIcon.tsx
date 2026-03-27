/**
 * Simple crosshair/target icon for the turret module.
 * Matches the 15x15 size convention used by @radix-ui/react-icons.
 */
export function CrosshairIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1" />
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1" />
      <line x1="7.5" y1="0" x2="7.5" y2="3" stroke="currentColor" strokeWidth="1" />
      <line x1="7.5" y1="12" x2="7.5" y2="15" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="7.5" x2="3" y2="7.5" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="7.5" x2="15" y2="7.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
