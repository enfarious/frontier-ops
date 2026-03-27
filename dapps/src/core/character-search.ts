/**
 * Character name search — find EVE Frontier characters by name and resolve
 * their wallet address. Built on top of the cached character map.
 */

import { getCharacterMap } from "../modules/danger-alerts/hooks/useKillmails";

export interface CharacterSearchResult {
  /** On-chain character item_id */
  characterId: string;
  /** In-game character name */
  name: string;
  /** Sui wallet address */
  address: string;
  /** Tribe ID (0 = no tribe) */
  tribeId: number;
}

/**
 * Search characters by name substring (case-insensitive).
 * Returns up to `limit` results sorted by match quality:
 *   1. Exact match first
 *   2. Starts-with matches
 *   3. Contains matches
 */
export async function searchCharactersByName(
  query: string,
  limit = 8,
): Promise<CharacterSearchResult[]> {
  if (query.length < 2) return [];

  const charMap = await getCharacterMap();
  const q = query.toLowerCase();
  const results: Array<CharacterSearchResult & { rank: number }> = [];

  for (const [characterId, info] of charMap) {
    const nameLower = info.name.toLowerCase();
    let rank = -1;

    if (nameLower === q) {
      rank = 0; // exact
    } else if (nameLower.startsWith(q)) {
      rank = 1; // prefix
    } else if (nameLower.includes(q)) {
      rank = 2; // contains
    }

    if (rank >= 0) {
      results.push({
        characterId,
        name: info.name,
        address: info.address,
        tribeId: info.tribeId,
        rank,
      });
    }
  }

  results.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return results.slice(0, limit).map(({ rank: _, ...rest }) => rest);
}

/**
 * Resolve a character name to a wallet address.
 * Returns the address if found, or null.
 */
export async function resolveCharacterAddress(name: string): Promise<string | null> {
  const results = await searchCharactersByName(name, 1);
  if (results.length > 0 && results[0].name.toLowerCase() === name.toLowerCase()) {
    return results[0].address;
  }
  return null;
}
