export interface GateData {
  id: string;
  name: string;
  state: "online" | "offline" | "anchored" | "unanchored" | string;
  ownerId: string;
  ownerName?: string;
  typeId?: string;
  linkedGateId?: string;
}

export interface GateConfig {
  gateId: string;
  isOpen: boolean;
  allowedTribes: string[];
}
