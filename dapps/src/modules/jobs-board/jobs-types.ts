/** Status constants matching the on-chain job_escrow contract. */
export const JOB_STATUS = {
  OPEN: 0,
  ACCEPTED: 1,
  COMPLETED: 2,
  PAID: 3,
  CANCELLED: 4,
  DISPUTED: 5,
} as const;

export const JOB_STATUS_OPTIONS: {
  value: number;
  label: string;
  color: "green" | "blue" | "orange" | "gray" | "red";
}[] = [
  { value: 0, label: "Open", color: "green" },
  { value: 1, label: "Accepted", color: "blue" },
  { value: 2, label: "Completed", color: "orange" },
  { value: 3, label: "Paid", color: "gray" },
  { value: 4, label: "Cancelled", color: "red" },
  { value: 5, label: "Disputed", color: "red" },
];
