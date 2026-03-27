/**
 * PTB builders for SSU access control operations.
 * These use the AdminCap directly (owned by wallet, no Receiving needed).
 */
import { Transaction } from "@mysten/sui/transactions";

const SSU_EXT_PKG = "0x6ff020848c52633e061fd84e6f45c4a1f9d2df97ba94af625649454324c237a8";
const SSU_EXT_CONFIG = "0xd325d0be956235ba700eeccead13de161ef9569470a21bbc9b47ee1ae7f4f933";
const GRAPHQL_ENDPOINT = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT || "https://graphql.testnet.sui.io/graphql";

/** Find the AdminCap owned by the connected wallet */
async function findAdminCap(walletAddress: string): Promise<string> {
  const query = `{
    address(address: "${walletAddress}") {
      objects(filter: { type: "${SSU_EXT_PKG}::config::AdminCap" }, first: 1) {
        nodes { address }
      }
    }
  }`;
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  const addr = data?.data?.address?.objects?.nodes?.[0]?.address;
  if (!addr) throw new Error("AdminCap not found on connected wallet");
  return addr;
}

/** Cached AdminCap address */
let cachedAdminCap: string | null = null;

async function getAdminCap(walletAddress: string): Promise<string> {
  if (cachedAdminCap) return cachedAdminCap;
  cachedAdminCap = await findAdminCap(walletAddress);
  return cachedAdminCap;
}

export interface AccessRulesData {
  depositAllowlist: string[];  // character item_ids as strings
  withdrawAllowlist: string[];
  depositTribes: number[];
  withdrawTribes: number[];
  openDeposit: boolean;
  openWithdraw: boolean;
}

/** Set full access rules for an SSU */
export async function buildSetAccessRulesTx(
  walletAddress: string,
  ssuId: string,
  rules: AccessRulesData,
): Promise<Transaction> {
  const adminCap = await getAdminCap(walletAddress);
  const tx = new Transaction();

  tx.moveCall({
    target: `${SSU_EXT_PKG}::access::set_access_rules`,
    arguments: [
      tx.object(SSU_EXT_CONFIG),
      tx.object(adminCap),
      tx.pure.id(ssuId),
      tx.pure.vector("u64", rules.depositAllowlist.map(id => BigInt(id))),
      tx.pure.vector("u64", rules.withdrawAllowlist.map(id => BigInt(id))),
      tx.pure.vector("u32", rules.depositTribes),
      tx.pure.vector("u32", rules.withdrawTribes),
      tx.pure.bool(rules.openDeposit),
      tx.pure.bool(rules.openWithdraw),
    ],
  });

  return tx;
}

/** Add a character to the deposit allowlist */
export async function buildAddDepositAccessTx(
  walletAddress: string,
  ssuId: string,
  characterItemId: string,
): Promise<Transaction> {
  const adminCap = await getAdminCap(walletAddress);
  const tx = new Transaction();

  tx.moveCall({
    target: `${SSU_EXT_PKG}::access::add_deposit_access`,
    arguments: [
      tx.object(SSU_EXT_CONFIG),
      tx.object(adminCap),
      tx.pure.id(ssuId),
      tx.pure.u64(BigInt(characterItemId)),
    ],
  });

  return tx;
}

/** Add a character to the withdraw allowlist */
export async function buildAddWithdrawAccessTx(
  walletAddress: string,
  ssuId: string,
  characterItemId: string,
): Promise<Transaction> {
  const adminCap = await getAdminCap(walletAddress);
  const tx = new Transaction();

  tx.moveCall({
    target: `${SSU_EXT_PKG}::access::add_withdraw_access`,
    arguments: [
      tx.object(SSU_EXT_CONFIG),
      tx.object(adminCap),
      tx.pure.id(ssuId),
      tx.pure.u64(BigInt(characterItemId)),
    ],
  });

  return tx;
}

/** Add a tribe to the deposit tribes */
export async function buildAddDepositTribeTx(
  walletAddress: string,
  ssuId: string,
  tribeId: number,
): Promise<Transaction> {
  const adminCap = await getAdminCap(walletAddress);
  const tx = new Transaction();

  tx.moveCall({
    target: `${SSU_EXT_PKG}::access::add_deposit_tribe`,
    arguments: [
      tx.object(SSU_EXT_CONFIG),
      tx.object(adminCap),
      tx.pure.id(ssuId),
      tx.pure.u32(tribeId),
    ],
  });

  return tx;
}

/** Add a tribe to the withdraw tribes */
export async function buildAddWithdrawTribeTx(
  walletAddress: string,
  ssuId: string,
  tribeId: number,
): Promise<Transaction> {
  const adminCap = await getAdminCap(walletAddress);
  const tx = new Transaction();

  tx.moveCall({
    target: `${SSU_EXT_PKG}::access::add_withdraw_tribe`,
    arguments: [
      tx.object(SSU_EXT_CONFIG),
      tx.object(adminCap),
      tx.pure.id(ssuId),
      tx.pure.u32(tribeId),
    ],
  });

  return tx;
}

/** Clear all access rules for an SSU (revert to open) */
export async function buildClearAccessRulesTx(
  walletAddress: string,
  ssuId: string,
): Promise<Transaction> {
  const adminCap = await getAdminCap(walletAddress);
  const tx = new Transaction();

  tx.moveCall({
    target: `${SSU_EXT_PKG}::access::clear_access_rules`,
    arguments: [
      tx.object(SSU_EXT_CONFIG),
      tx.object(adminCap),
      tx.pure.id(ssuId),
    ],
  });

  return tx;
}

/** Read current access rules from chain for an SSU */
export async function fetchAccessRules(ssuId: string): Promise<AccessRulesData | null> {
  // Query the SSUExtensionConfig's dynamic field keyed by ssu_id
  const query = `{
    object(address: "${SSU_EXT_CONFIG}") {
      dynamicField(name: {
        type: "${SSU_EXT_PKG}::access::AccessRulesKey",
        bcs: "${ssuId}"
      }) {
        value {
          ... on MoveValue { json }
        }
      }
    }
  }`;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const json = data?.data?.object?.dynamicField?.value?.json;
    if (!json) return null;

    return {
      depositAllowlist: (json.deposit_allowlist || []).map(String),
      withdrawAllowlist: (json.withdraw_allowlist || []).map(String),
      depositTribes: json.deposit_tribes || [],
      withdrawTribes: json.withdraw_tribes || [],
      openDeposit: json.open_deposit ?? true,
      openWithdraw: json.open_withdraw ?? false,
    };
  } catch {
    return null;
  }
}
