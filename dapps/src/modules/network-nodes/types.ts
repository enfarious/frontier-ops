export interface NodeListItem {
  id: string;
  name: string;
  state: string;
  ownerId: string;
  ownerName?: string;
  ownerCapId: string;
  energySourceId: string;
  /** Fuel quantity (from enriched data) */
  fuelQuantity?: number;
  /** Fuel max capacity (from enriched data) */
  fuelMaxCapacity?: number;
  /** Energy utilization percentage (from enriched data) */
  energyUtilPct?: number;
}
