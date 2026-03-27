/**
 * Direct PTB-based assembly actions using the Receiving pattern.
 * Bypasses sponsored transactions entirely — wallet signs directly.
 *
 * Pattern:
 *   1. borrow_owner_cap<T>(character, Receiving<OwnerCap<T>>)
 *   2. perform action with OwnerCap
 *   3. return_owner_cap<T>(character, owner_cap, receipt)
 */
import { Transaction } from "@mysten/sui/transactions";

const WORLD_PKG = import.meta.env.VITE_EVE_WORLD_PACKAGE_ID || "";
const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";

/** Fetch object version and digest for a Receiving ticket */
async function getObjectRef(objectId: string): Promise<{ version: number; digest: string }> {
  const query = `{ object(address: "${objectId}") { version digest } }`;
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  const obj = data?.data?.object;
  if (!obj) throw new Error(`Object not found: ${objectId}`);
  return { version: obj.version, digest: obj.digest };
}

interface AssemblyActionArgs {
  characterId: string;
  assemblyId: string;
  ownerCapId: string;
  /** e.g. "storage_unit", "turret", "gate" */
  assemblyModule: string;
  /** e.g. "StorageUnit", "Turret", "Gate" */
  assemblyTypeName: string;
}

/**
 * Build a PTB that borrows the OwnerCap, performs an action, and returns it.
 * The `addAction` callback receives (tx, borrowedCap, assemblyArg) and should
 * add the move calls for the desired action.
 */
async function buildOwnerCapAction(
  args: AssemblyActionArgs,
  addAction: (tx: Transaction, borrowedCap: any, assemblyObj: any) => void,
): Promise<Transaction> {
  const { characterId, assemblyId, ownerCapId, assemblyModule, assemblyTypeName } = args;
  const ownerCapRef = await getObjectRef(ownerCapId);
  const tx = new Transaction();

  const assemblyType = `${WORLD_PKG}::${assemblyModule}::${assemblyTypeName}`;

  // Step 1: Borrow OwnerCap from character
  const [borrowedCap, receipt] = tx.moveCall({
    target: `${WORLD_PKG}::character::borrow_owner_cap`,
    typeArguments: [assemblyType],
    arguments: [
      tx.object(characterId),
      tx.receivingRef({
        objectId: ownerCapId,
        version: ownerCapRef.version,
        digest: ownerCapRef.digest,
      }),
    ],
  });

  // Step 2: Perform the action
  addAction(tx, borrowedCap, tx.object(assemblyId));

  // Step 3: Return OwnerCap
  tx.moveCall({
    target: `${WORLD_PKG}::character::return_owner_cap`,
    typeArguments: [assemblyType],
    arguments: [
      tx.object(characterId),
      borrowedCap,
      receipt,
    ],
  });

  return tx;
}

/** Rename an assembly (update metadata name) */
export async function buildRenameTx(
  args: AssemblyActionArgs & { newName: string },
): Promise<Transaction> {
  return buildOwnerCapAction(args, (tx, borrowedCap, assemblyObj) => {
    tx.moveCall({
      target: `${WORLD_PKG}::${args.assemblyModule}::update_metadata_name`,
      arguments: [
        assemblyObj,
        borrowedCap,
        tx.pure.string(args.newName),
      ],
    });
  });
}

/** Update metadata description */
export async function buildUpdateDescriptionTx(
  args: AssemblyActionArgs & { description: string },
): Promise<Transaction> {
  return buildOwnerCapAction(args, (tx, borrowedCap, assemblyObj) => {
    tx.moveCall({
      target: `${WORLD_PKG}::${args.assemblyModule}::update_metadata_description`,
      arguments: [
        assemblyObj,
        borrowedCap,
        tx.pure.string(args.description),
      ],
    });
  });
}

/** Update metadata URL */
export async function buildUpdateUrlTx(
  args: AssemblyActionArgs & { url: string },
): Promise<Transaction> {
  return buildOwnerCapAction(args, (tx, borrowedCap, assemblyObj) => {
    tx.moveCall({
      target: `${WORLD_PKG}::${args.assemblyModule}::update_metadata_url`,
      arguments: [
        assemblyObj,
        borrowedCap,
        tx.pure.string(args.url),
      ],
    });
  });
}

const ENERGY_CONFIG = "0xd77693d0df5656d68b1b833e2a23cc81eb3875d8d767e7bd249adde82bdbc952";

/** Bring assembly online. Requires the assembly's energy_source_id (NetworkNode). */
export async function buildBringOnlineTx(
  args: AssemblyActionArgs & { energySourceId: string },
): Promise<Transaction> {
  return buildOwnerCapAction(args, (tx, borrowedCap, assemblyObj) => {
    tx.moveCall({
      target: `${WORLD_PKG}::${args.assemblyModule}::online`,
      arguments: [
        assemblyObj,
        tx.object(args.energySourceId),
        tx.object(ENERGY_CONFIG),
        borrowedCap,
      ],
    });
  });
}

/** Bring assembly offline. Requires the assembly's energy_source_id (NetworkNode). */
export async function buildBringOfflineTx(
  args: AssemblyActionArgs & { energySourceId: string },
): Promise<Transaction> {
  return buildOwnerCapAction(args, (tx, borrowedCap, assemblyObj) => {
    tx.moveCall({
      target: `${WORLD_PKG}::${args.assemblyModule}::offline`,
      arguments: [
        assemblyObj,
        tx.object(args.energySourceId),
        tx.object(ENERGY_CONFIG),
        borrowedCap,
      ],
    });
  });
}
