/**
 * Generates /public/data/recipes.json from EVE Frontier game data files.
 *
 * Source data: eve-frontier-tools-master/data/
 * Run: node dapps/scripts/generate-recipes.mjs
 */

import { readFileSync, writeFileSync } from "fs";

const DATA = "F:/Projects/EF-Hackathon/eve-frontier-tools-master/data/json";
const EXTRACTED =
  "F:/Projects/EF-Hackathon/eve-frontier-tools-master/data/extracted";
const OUT =
  "F:/Projects/EF-Hackathon/frontier-ops-clean/dapps/public/data/recipes.json";

const blueprints = JSON.parse(readFileSync(`${DATA}/industry_blueprints.json`, "utf8"));
const typeNames = JSON.parse(readFileSync(`${EXTRACTED}/type_names_all.json`, "utf8"));
const typematerials = JSON.parse(readFileSync(`${DATA}/typematerials.json`, "utf8"));

const name = (id) => typeNames[String(id)] || `Type#${id}`;

// ---------------------------------------------------------------------------
// 1. Identify "processing" blueprints:
//    Single-input BPs where the input is a known raw/intermediate material.
//    These get their outputs added to the refinery index.
// ---------------------------------------------------------------------------
const PROCESSING_INPUT_IDS = new Set([
  // Tier-1 raw ores / minerals (directly minable, feed into processing chains)
  77800, // Feldspar Crystals
  77810, // Platinum-Palladium Matrix
  77811, // Hydrated Sulfide Matrix
  78426, // Iridosmine Nodules
  78434, // Rough Young Crude Matter
  78435, // Eupraxite (comes from Rough Young Crude Matter)
  78446, // Methane Ice Shards
  78447, // Primitive Kerogen Matrix
  78448, // Aromatic Carbon Veins
  78449, // Tholin Nodules
  // Loot / organic drops that get processed
  77728, // Sophrogon (comes from Rough Old Crude Matter)
  77729, // Rough Old Crude Matter
  88319, // D2 Fuel (can be down-converted to Salt)
  88764, // Salvaged Materials (alternative source for Reinforced Alloys / Carbon Weave)
  88765, // Mummified Clone
  // Intermediate processing outputs that feed deeper chains
  89258, // Hydrocarbon Residue
  89259, // Silica Grains
  89260, // Iron-Rich Nodules
  // NOTE: Water Ice (78423) is intentionally excluded — D1 Fuel is a crafted product,
  // not a refinery output, so Water Ice → D1 Fuel stays as a regular recipe.
]);

// ---------------------------------------------------------------------------
// 2. Build refinery data from typematerials.json
// ---------------------------------------------------------------------------

/** refinery[]: each source → list of outputs */
const refineryMap = new Map(); // sourceId → { sourceName, outputs: [{id,name,qty}] }

for (const [sourceIdStr, entry] of Object.entries(typematerials)) {
  const sourceId = parseInt(sourceIdStr);
  const sourceName = name(sourceId);
  const outputs = entry.materials.map((m) => ({
    id: m.materialTypeID,
    name: name(m.materialTypeID),
    qty: m.quantity,
  }));
  refineryMap.set(sourceId, { sourceName, outputs });
}

// ---------------------------------------------------------------------------
// 3. Build refineryByOutput — inverse index: outputId → [{sourceId, sourceName, qtyPerSource}]
//    Populated from:
//      a) typematerials.json (raw ore refinery)
//      b) processing blueprints (single-input processing chains)
//    When multiple BPs use the same source for the same output, keep the best
//    (highest qtyPerSource).
// ---------------------------------------------------------------------------

/** refineryByOutput: outputId → Map<sourceId, {sourceName, qtyPerSource}> */
const refineryByOutputMap = new Map();

function addRefineryOutput(outputId, sourceId, sourceName, qtyPerSource) {
  if (!refineryByOutputMap.has(outputId)) {
    refineryByOutputMap.set(outputId, new Map());
  }
  const sources = refineryByOutputMap.get(outputId);
  const existing = sources.get(sourceId);
  if (!existing || qtyPerSource > existing.qtyPerSource) {
    sources.set(sourceId, { sourceName, qtyPerSource });
  }
}

// a) typematerials.json
for (const [sourceId, entry] of refineryMap) {
  for (const out of entry.outputs) {
    addRefineryOutput(out.id, sourceId, entry.sourceName, out.qty);
  }
}

// b) Processing blueprints
for (const [bpIdStr, bp] of Object.entries(blueprints)) {
  const inputs = bp.inputs || [];
  const outputs = bp.outputs || [];
  if (inputs.length !== 1) continue;

  const inp = inputs[0];
  if (!PROCESSING_INPUT_IDS.has(inp.typeID)) continue;

  for (const out of outputs) {
    const qtyPerSource = out.quantity / inp.quantity;
    addRefineryOutput(out.typeID, inp.typeID, name(inp.typeID), qtyPerSource);
  }
}

// ---------------------------------------------------------------------------
// 4. Build recipes[] from blueprints
//    Processing BPs (single-input where input is in PROCESSING_INPUT_IDS) are
//    EXCLUDED from recipes[] — they only live in refineryByOutput.
//    This prevents their outputs (e.g. Water Ice from Mummified Clone) from
//    appearing as "recipe outputs" and monopolising the BOM traversal.
//
//    Fix primaryTypeID bug: if primaryTypeID not present in outputs, use first output.
// ---------------------------------------------------------------------------

const recipes = [];

for (const [bpIdStr, bp] of Object.entries(blueprints)) {
  const blueprintId = parseInt(bpIdStr);
  const inputs = bp.inputs || [];
  const outputs = bp.outputs || [];
  if (outputs.length === 0) continue;

  // Skip processing BPs — they belong to the refinery index, not the recipe list
  if (inputs.length === 1 && PROCESSING_INPUT_IDS.has(inputs[0].typeID)) continue;

  // Fix primaryTypeID: use first actual output if primary isn't in outputs
  const outputIds = new Set(outputs.map((o) => o.typeID));
  let primaryTypeId = bp.primaryTypeID;
  if (!primaryTypeId || !outputIds.has(primaryTypeId)) {
    primaryTypeId = outputs[0].typeID;
  }

  const primaryOutput = outputs.find((o) => o.typeID === primaryTypeId) || outputs[0];

  const recipeInputs = inputs.map((i) => ({
    id: i.typeID,
    name: name(i.typeID),
    qty: i.quantity,
    isRaw: false, // filled in later
  }));

  recipes.push({
    blueprintId,
    outputId: primaryOutput.typeID,
    outputName: name(primaryOutput.typeID),
    outputQty: primaryOutput.quantity,
    allOutputs: outputs.map((o) => ({
      id: o.typeID,
      name: name(o.typeID),
      qty: o.quantity,
    })),
    runTime: bp.runTime ?? 0,
    inputs: recipeInputs,
  });
}

// ---------------------------------------------------------------------------
// 5. Mark isRaw on recipe inputs
//    An input is "raw" if it doesn't appear as the primary output of any recipe
//    AND it doesn't appear in the refinery as an output (i.e., you mine it directly).
// ---------------------------------------------------------------------------

const allPrimaryOutputIds = new Set(recipes.map((r) => r.outputId));
const allRefineryOutputIds = new Set(refineryByOutputMap.keys());

// ALL blueprint outputs (including processing BPs) — nothing that is ever
// produced by any blueprint should be considered a raw material.
const allBlueprintOutputIds = new Set(
  Object.values(blueprints).flatMap((bp) => (bp.outputs || []).map((o) => o.typeID))
);

for (const r of recipes) {
  for (const inp of r.inputs) {
    inp.isRaw =
      !allPrimaryOutputIds.has(inp.id) &&
      !allRefineryOutputIds.has(inp.id) &&
      !allBlueprintOutputIds.has(inp.id);
  }
}

// ---------------------------------------------------------------------------
// 6. Build rawMaterials[]
//    A type is "raw" if it appears as an input in ANY blueprint (including
//    processing BPs) but is NEVER produced as an output by any blueprint.
//    This correctly captures minable/harvestable resources like Methane Ice
//    Shards, Iridosmine Nodules, Mummified Clone, etc. that are only consumed.
// ---------------------------------------------------------------------------

const allBlueprintInputIds = new Set(
  Object.values(blueprints).flatMap((bp) => (bp.inputs || []).map((i) => i.typeID))
);

const rawMaterialIds = [...allBlueprintInputIds].filter(
  (id) => !allBlueprintOutputIds.has(id)
);

const rawMaterials = rawMaterialIds
  .map((id) => ({ id, name: name(id) }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// 7. Build producedBy{}: outputId → [{blueprintId, qty, inputs}]
//    Covers ALL outputs (not just primary) using allOutputs.
// ---------------------------------------------------------------------------

const producedByMap = new Map();

for (const r of recipes) {
  for (const out of r.allOutputs) {
    if (!producedByMap.has(out.id)) producedByMap.set(out.id, []);
    producedByMap.get(out.id).push({
      blueprintId: r.blueprintId,
      qty: out.qty,
      inputs: r.inputs,
    });
  }
}

// ---------------------------------------------------------------------------
// 8. Serialize
// ---------------------------------------------------------------------------

// refinery[] — source-centric view (for lookup_refinery "REFINERY" section)
const refinery = [...refineryMap.entries()].map(([sourceId, entry]) => ({
  sourceId,
  sourceName: entry.sourceName,
  outputs: entry.outputs,
}));

// Also add processing BPs to refinery[] for the "OBTAINED BY REFINING" display
// (deduped by source+outputs fingerprint)
const refineryEntryKeys = new Set(refinery.map((e) => e.sourceId));
for (const [bpIdStr, bp] of Object.entries(blueprints)) {
  const inputs = bp.inputs || [];
  const outputs = bp.outputs || [];
  if (inputs.length !== 1) continue;
  const inp = inputs[0];
  if (!PROCESSING_INPUT_IDS.has(inp.typeID)) continue;
  if (refineryEntryKeys.has(inp.typeID)) continue; // already added
  refineryEntryKeys.add(inp.typeID);
  // Find the best (highest total yield) BP for this source
  // Just use this BP for now — entries are deduplicated by sourceId so first wins
  refinery.push({
    sourceId: inp.typeID,
    sourceName: name(inp.typeID),
    outputs: outputs.map((o) => ({
      id: o.typeID,
      name: name(o.typeID),
      qty: o.quantity,
    })),
  });
}

// refineryByOutput{} — keyed by output type ID
const refineryByOutput = {};
for (const [outputId, sources] of refineryByOutputMap) {
  refineryByOutput[outputId] = [...sources.entries()].map(
    ([sourceId, { sourceName, qtyPerSource }]) => ({
      sourceId,
      sourceName,
      qtyPerSource,
    })
  );
}

// producedBy{} — keyed by output type ID
const producedBy = {};
for (const [typeId, entries] of producedByMap) {
  producedBy[typeId] = entries;
}

const result = {
  recipes,
  rawMaterials,
  refinery,
  refineryByOutput,
  producedBy,
};

writeFileSync(OUT, JSON.stringify(result));
console.log(`✓ Generated recipes.json`);
console.log(`  ${recipes.length} recipes`);
console.log(`  ${rawMaterials.length} raw materials`);
console.log(`  ${refinery.length} refinery sources`);
console.log(`  ${Object.keys(refineryByOutput).length} refinery-by-output entries`);
console.log(`  ${Object.keys(producedBy).length} produced-by entries`);

// Spot-check: Water Ice sources
const waterIceSources = refineryByOutput[78423];
if (waterIceSources) {
  console.log(`\nWater Ice (78423) sources (${waterIceSources.length}):`);
  waterIceSources
    .sort((a, b) => b.qtyPerSource - a.qtyPerSource)
    .forEach((s) =>
      console.log(`  ${s.sourceName} (${s.qtyPerSource.toFixed(2)}/unit)`)
    );
} else {
  console.log("\nWARN: Water Ice not found in refineryByOutput!");
}
