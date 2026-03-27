/** Status constants matching the on-chain bounty_escrow contract. */
export const BOUNTY_STATUS = {
  ACTIVE: 0,
  PENDING: 1,
  CLAIMED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
} as const;

export const BOUNTY_STATUS_OPTIONS: {
  value: number;
  label: string;
  color: "green" | "blue" | "orange" | "gray" | "red";
}[] = [
  { value: 0, label: "Active", color: "green" },
  { value: 1, label: "Pending", color: "orange" },
  { value: 2, label: "Claimed", color: "blue" },
  { value: 3, label: "Cancelled", color: "red" },
  { value: 4, label: "Expired", color: "gray" },
];
