export interface StorageUnitData {
  id: string;
  name: string;
  state: "online" | "offline" | "anchored" | "unanchored" | string;
  ownerId: string;
  ownerName?: string;
  typeId?: string;
}
