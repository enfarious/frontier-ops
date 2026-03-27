export type ContactStanding = "friendly" | "neutral" | "hostile";

export interface Contact {
  id: string;
  name: string;
  standing: ContactStanding;
  notes: string;
  addedAt: number;
}

export const STANDING_OPTIONS: {
  value: ContactStanding;
  label: string;
  color: "blue" | "gray" | "red";
}[] = [
  { value: "friendly", label: "Friendly", color: "blue" },
  { value: "neutral", label: "Neutral", color: "gray" },
  { value: "hostile", label: "Hostile", color: "red" },
];
