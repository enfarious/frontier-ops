export interface TurretData {
  id: string;
  name: string;
  state: "online" | "offline" | "anchored" | "unanchored" | string;
  ownerId: string;
  ownerName?: string;
  typeId?: string;
  location?: {
    solarSystemId?: string;
    x?: number;
    y?: number;
    z?: number;
  };
}

export interface TurretConfig {
  turretId: string;
  targetingMode: TargetingMode;
  friendlyFire: boolean;
  allowedTribes: string[];
}

export type TargetingMode = "closest" | "weakest" | "strongest" | "manual";

export const TARGETING_MODES: { value: TargetingMode; label: string }[] = [
  { value: "closest", label: "Closest Target" },
  { value: "weakest", label: "Weakest Target" },
  { value: "strongest", label: "Strongest Target" },
  { value: "manual", label: "Manual Target" },
];
