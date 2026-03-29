/**
 * Shared types for the EF-Tradecraft espionage module.
 * Watch targets, asset sightings, intel packages, and dead drop exports.
 */

import type { ThreatLevel, FieldReport } from "./intel-types";

// ─── Watch List ──────────────────────────────────────────────────────

export type WatchTargetType = "player" | "tribe";

export interface WatchTarget {
  id: string;
  targetType: WatchTargetType;
  targetId: string;
  targetName: string;
  priority: ThreatLevel;
  notes: string;
  addedAt: number;
}

// ─── Asset Registry ──────────────────────────────────────────────────

export type AssetType = "ssu" | "gate" | "turret" | "network_node" | "unknown";
export type AssetStatus = "active" | "destroyed" | "unconfirmed";

export interface AssetSighting {
  id: string;
  solarSystemId?: string;
  solarSystemName?: string;
  planet?: number;
  lpoint?: number;
  assetType: AssetType;
  ownerId?: string;
  ownerName?: string;
  ownerTribe?: string;
  notes: string;
  threatLevel: ThreatLevel;
  status: AssetStatus;
  firstSpottedAt: number;
  lastConfirmedAt: number;
}

export const ASSET_TYPE_OPTIONS: Array<{ value: AssetType; label: string }> = [
  { value: "ssu", label: "SSU" },
  { value: "gate", label: "Gate" },
  { value: "turret", label: "Turret" },
  { value: "network_node", label: "Network Node" },
  { value: "unknown", label: "Unknown" },
];

export const ASSET_STATUS_OPTIONS: Array<{
  value: AssetStatus;
  label: string;
  color: "green" | "red" | "gray";
}> = [
  { value: "active", label: "Active", color: "green" },
  { value: "destroyed", label: "Destroyed", color: "red" },
  { value: "unconfirmed", label: "Unconfirmed", color: "gray" },
];

// ─── Intel Packages ──────────────────────────────────────────────────

export type PackageStatus = "draft" | "listed" | "sold";

export interface PackageItem {
  type: "sighting" | "field_report" | "watch_target";
  id: string;
}

export interface IntelPackage {
  id: string;
  title: string;
  description: string;
  contents: PackageItem[];
  askingPrice: string; // SUI amount as string
  status: PackageStatus;
  createdAt: number;
  listedAt?: number;
  onChainId?: string;
}

// ─── Dead Drop Export ────────────────────────────────────────────────

export interface DeadDropPayload {
  version: 1;
  packageId: string;
  title: string;
  description: string;
  askingPrice: string;
  exportedAt: string; // ISO 8601
  contents: {
    sightings: AssetSighting[];
    fieldReports: FieldReport[];
    watchTargets: WatchTarget[];
  };
}
