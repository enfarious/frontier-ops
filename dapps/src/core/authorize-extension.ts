/**
 * Build a PTB to authorize an extension on an assembly using the
 * Sui Receiving pattern to borrow the OwnerCap from the character.
 *
 * Flow:
 *   1. borrow_owner_cap<T>(character, Receiving<OwnerCap<T>>) → (owner_cap, receipt)
 *   2. authorize_extension<Auth>(assembly, owner_cap)
 *   3. return_owner_cap<T>(character, owner_cap, receipt)
 *
 * The transaction must be signed by the wallet that matches
 * character.character_address (enforced on-chain).
 */
import { Transaction } from "@mysten/sui/transactions";

const WORLD_PKG = import.meta.env.VITE_EVE_WORLD_PACKAGE_ID || "";
const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";

interface AuthorizeExtensionArgs {
  /** The character object ID (e.g., 0x59c82d...) */
  characterId: string;
  /** The assembly object ID (SSU/turret/gate) */
  assemblyId: string;
  /** The OwnerCap object ID for this assembly */
  ownerCapId: string;
  /** The world package module for this assembly type (e.g., "storage_unit", "turret", "gate") */
  assemblyModule: string;
  /** The Move type name of the assembly (e.g., "StorageUnit", "Turret", "Gate") */
  assemblyTypeName: string;
  /** The extension package ID */
  extensionPackageId: string;
  /** The extension module name (e.g., "config") */
  extensionModule: string;
  /** The Auth witness type name (e.g., "SSUAuth", "TurretAuth") */
  authTypeName: string;
}

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

/**
 * Build a Transaction (PTB) that authorizes an extension on an assembly.
 * The caller must sign and execute this with the wallet that owns the character.
 */
export async function buildAuthorizeExtensionTx(args: AuthorizeExtensionArgs): Promise<Transaction> {
  const {
    characterId,
    assemblyId,
    ownerCapId,
    assemblyModule,
    assemblyTypeName,
    extensionPackageId,
    extensionModule,
    authTypeName,
  } = args;

  // Get OwnerCap ref for the Receiving ticket
  const ownerCapRef = await getObjectRef(ownerCapId);

  const tx = new Transaction();

  const assemblyType = `${WORLD_PKG}::${assemblyModule}::${assemblyTypeName}`;
  const authType = `${extensionPackageId}::${extensionModule}::${authTypeName}`;

  // Step 1: Borrow OwnerCap from character via Receiving pattern
  //   character::borrow_owner_cap<T>(character: &mut Character, owner_cap_ticket: Receiving<OwnerCap<T>>, ctx: &TxContext)
  //   returns (OwnerCap<T>, ReturnOwnerCapReceipt)
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

  // Step 2: Authorize extension on the assembly
  //   {module}::authorize_extension<Auth>(assembly: &mut T, owner_cap: &OwnerCap<T>)
  tx.moveCall({
    target: `${WORLD_PKG}::${assemblyModule}::authorize_extension`,
    typeArguments: [authType],
    arguments: [
      tx.object(assemblyId),
      borrowedCap,
    ],
  });

  // Step 3: Return OwnerCap to character
  //   character::return_owner_cap<T>(character: &Character, owner_cap: OwnerCap<T>, receipt: ReturnOwnerCapReceipt)
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
