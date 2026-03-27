export type OperatingMode = "solo" | "tribe";

export interface TribeInfo {
  id: string;
  name: string;
  nameShort?: string;
  ownerId?: string;
  tribeId?: number;         // numeric on-chain tribe ID
  memberCount?: number;
  taxRate?: number;
  description?: string;
  tribeUrl?: string;
}
