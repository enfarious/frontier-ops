/**
 * EVE Frontier crafting recipe data.
 * Loaded lazily from /public/data/recipes.json (generated from game files).
 */

export interface RecipeInput {
  id: number;
  name: string;
  qty: number;
  isRaw: boolean;
}

export interface Recipe {
  blueprintId: number;
  outputId: number;
  outputName: string;
  outputQty: number;
  allOutputs: { id: number; name: string; qty: number }[];
  runTime: number;
  inputs: RecipeInput[];
}

export interface ProducedByEntry {
  blueprintId: number;
  qty: number;
  inputs: { id: number; name: string; qty: number; isRaw: boolean }[];
}

export interface RawMaterial {
  id: number;
  name: string;
}

export interface RefineryEntry {
  sourceId: number;
  sourceName: string;
  outputs: { id: number; name: string; qty: number }[];
}

export interface RefinerySource {
  sourceId: number;
  sourceName: string;
  qtyPerSource: number;
}

export interface RecipeData {
  recipes: Recipe[];
  rawMaterials: RawMaterial[];
  refinery: RefineryEntry[];
  refineryByOutput: Record<number, RefinerySource[]>;
  producedBy: Record<number, ProducedByEntry[]>;
}

export interface BOMRefineryOption {
  id: number;
  name: string;
  /** How many of this source ore/material are needed */
  qty: number;
  /** How many of the output item each source unit yields */
  qtyPerSource: number;
}

export interface BOMEntry {
  name: string;
  qty: number;
  /** True if this is a refinery intermediate (not directly minable) */
  viaRefinery?: boolean;
  /** All source alternatives when this item comes from refining */
  refineryOptions?: BOMRefineryOption[];
}

let cached: RecipeData | null = null;

export async function loadRecipeData(): Promise<RecipeData> {
  if (cached) return cached;
  const res = await fetch("/data/recipes.json");
  if (!res.ok) throw new Error(`Failed to load recipes: ${res.status}`);
  cached = await res.json() as RecipeData;
  return cached;
}

/** Find all recipes that produce a given item (by name or ID). */
export function findRecipes(data: RecipeData, query: string): Recipe[] {
  const numId = parseInt(query);
  if (!isNaN(numId)) {
    return data.recipes.filter(r => r.outputId === numId);
  }
  const q = query.toLowerCase();
  return data.recipes.filter(r => r.outputName.toLowerCase().includes(q));
}

/**
 * Recursively expand a recipe into a bill of materials.
 * Follows blueprint chains AND refinery chains.
 *
 * Refinery outputs are keyed by their intermediate typeId (e.g. Water Ice's ID),
 * with all source ore alternatives listed in `refineryOptions` — sorted most
 * efficient first. Direct raw materials are keyed by their own typeId as usual.
 */
export function expandToRawMaterials(
  data: RecipeData,
  outputId: number,
  quantity: number,
): Map<number, BOMEntry> {
  const result = new Map<number, BOMEntry>();

  const recipesByOutput = new Map<number, Recipe>();
  for (const r of data.recipes) recipesByOutput.set(r.outputId, r);

  const refineryByOutput = data.refineryByOutput as Record<string, RefinerySource[]>;

  const visited = new Set<number>();

  function expand(typeId: number, qty: number, depth = 0) {
    if (depth > 12) return;

    // Try blueprint first
    const recipe = recipesByOutput.get(typeId);
    if (recipe) {
      const runs = Math.ceil(qty / recipe.outputQty);
      for (const input of recipe.inputs) {
        expand(input.id, input.qty * runs, depth + 1);
      }
      return;
    }

    // Try refinery (item is a refinery output — collect ALL source options)
    const sources = refineryByOutput[typeId];
    if (sources && sources.length > 0 && !visited.has(typeId)) {
      visited.add(typeId);

      // Find the name of this intermediate product from the refinery data
      const intermediateName =
        data.refinery.flatMap(e => e.outputs).find(o => o.id === typeId)?.name
        ?? data.rawMaterials.find(m => m.id === typeId)?.name
        ?? `Type ${typeId}`;

      const existing = result.get(typeId);
      const totalQty = (existing?.qty ?? 0) + qty;

      // Build all alternatives, sorted by efficiency (fewest source units needed)
      const options: BOMRefineryOption[] = sources
        .map(src => ({
          id: src.sourceId,
          name: src.sourceName,
          qty: Math.ceil(totalQty / src.qtyPerSource),
          qtyPerSource: src.qtyPerSource,
        }))
        .sort((a, b) => a.qty - b.qty);

      result.set(typeId, {
        name: intermediateName,
        qty: totalQty,
        viaRefinery: true,
        refineryOptions: options,
      });
      return;
    }

    // Raw material — mine/harvest directly
    const existing = result.get(typeId);
    const name = data.rawMaterials.find(m => m.id === typeId)?.name ?? `Type ${typeId}`;
    result.set(typeId, { name, qty: (existing?.qty ?? 0) + qty });
  }

  expand(outputId, quantity);
  return result;
}
