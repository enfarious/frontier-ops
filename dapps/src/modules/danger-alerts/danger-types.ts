export interface KillmailData {
  id: string;
  killerId: string;
  killerName?: string;
  killerTribe?: string;
  killerAddress?: string;
  victimId: string;
  victimName?: string;
  victimTribe?: string;
  victimAddress?: string;
  solarSystemId: string;
  solarSystemName?: string;
  killTimestamp: number;
  lossType: string;
}
