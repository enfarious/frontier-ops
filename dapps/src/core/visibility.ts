/**
 * Visibility filtering for jobs and bounties.
 *
 * Visibility is encoded in the description text as "Visibility: public|tribe|friends"
 * and parsed out at read time. The contract doesn't enforce it — it's a social
 * signal that the UI respects. Chain readers can still see everything.
 *
 * That's not a bug. That's espionage.
 */

export type Visibility = "public" | "tribe" | "friends";

/** Parse visibility tag from a description string. Defaults to "public". */
export function parseVisibility(description: string): Visibility {
  const match = description.match(/^Visibility:\s*(public|tribe|friends)\s*$/m);
  return (match?.[1] as Visibility) ?? "public";
}

/** Append visibility tag to a description string (only if not public). */
export function appendVisibility(description: string, visibility: Visibility): string {
  if (visibility === "public") return description;
  return description + (description ? "\n\n" : "") + `Visibility: ${visibility}`;
}

/** Strip the visibility tag from description for display. */
export function stripVisibility(description: string): string {
  return description.replace(/\n?\n?Visibility:\s*(public|tribe|friends)\s*$/m, "").trim();
}

/**
 * Check if a posting is visible to the current user.
 *
 * @param visibility - The parsed visibility tag
 * @param creatorAddress - Wallet address of the posting creator
 * @param viewerAddress - Current user's wallet address (undefined if not connected)
 * @param viewerTribeId - Current user's tribe ID (undefined if not in a tribe)
 * @param creatorTribeId - Creator's tribe ID (if known)
 * @param friendAddresses - Set of wallet addresses the viewer considers friendly
 */
export function isVisibleTo(
  visibility: Visibility,
  creatorAddress: string,
  viewerAddress?: string,
  viewerTribeId?: number,
  creatorTribeId?: number,
  friendAddresses?: Set<string>,
): boolean {
  // Public: everyone sees it
  if (visibility === "public") return true;

  // Creator always sees their own postings
  if (viewerAddress && viewerAddress === creatorAddress) return true;

  // Tribe: viewer must share a tribe with creator
  if (visibility === "tribe") {
    if (!viewerTribeId || !creatorTribeId) return false;
    return viewerTribeId === creatorTribeId;
  }

  // Friends: viewer must be in creator's friends list
  // (we check if creator is in viewer's friends, since we only have local contacts)
  if (visibility === "friends") {
    if (!viewerAddress || !friendAddresses) return false;
    return friendAddresses.has(creatorAddress);
  }

  return true;
}
