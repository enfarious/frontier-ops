/**
 * Shared types for the hybrid ratings system.
 * Personal ratings (local SQLite) + chain reputation (on-chain event cache).
 */

// ─── Personal Ratings ───────────────────────────────────────────────

export type RatingContext =
  | "package_purchase"    // you bought a package from this seller
  | "package_sale"        // you sold a package to this buyer
  | "bounty_fulfillment"  // this hunter fulfilled your bounty
  | "bounty_post";        // this poster's bounty you fulfilled

export const RATING_CONTEXT_LABELS: Record<RatingContext, string> = {
  package_purchase: "Bought Package",
  package_sale: "Sold Package",
  bounty_fulfillment: "Bounty Hunter",
  bounty_post: "Bounty Poster",
};

export interface PersonalRating {
  id: string;
  subjectAddress: string;
  subjectName?: string;
  contextType: RatingContext;
  contextId?: string;       // on-chain listing/bounty ID
  score: number;            // 1-5
  comment: string;
  createdAt: number;
}

// ─── Chain Reputation ───────────────────────────────────────────────

export interface ChainReputation {
  address: string;
  totalSales: number;
  totalPurchases: number;
  totalBountiesPosted: number;
  totalBountiesFulfilled: number;
  fulfillmentsAccepted: number;
  fulfillmentsRejected: number;
  lastSyncedAt: number;
}

/** Compute a simple trust score from chain reputation (0-100). */
export function computeChainTrustScore(rep: ChainReputation): number {
  const totalActivity = rep.totalSales + rep.totalPurchases +
    rep.fulfillmentsAccepted + rep.totalBountiesPosted;
  if (totalActivity === 0) return 0;

  // Positive signals
  const positives = rep.totalSales + rep.fulfillmentsAccepted;
  // Negative signals
  const negatives = rep.fulfillmentsRejected;
  // Activity breadth bonus (capped at 20)
  const breadth = Math.min(totalActivity, 20);

  const ratio = totalActivity > 0 ? positives / (positives + negatives || 1) : 0;
  // Score = ratio * 80 (max from ratio) + breadth bonus (max 20)
  return Math.round(ratio * 80 + breadth);
}

/** Format chain trust score as a label. */
export function trustScoreLabel(score: number): string {
  if (score === 0) return "Unknown";
  if (score < 30) return "Suspect";
  if (score < 50) return "Unproven";
  if (score < 70) return "Established";
  if (score < 90) return "Trusted";
  return "Veteran";
}

export function trustScoreColor(score: number): "gray" | "red" | "orange" | "yellow" | "blue" | "green" {
  if (score === 0) return "gray";
  if (score < 30) return "red";
  if (score < 50) return "orange";
  if (score < 70) return "yellow";
  if (score < 90) return "blue";
  return "green";
}
