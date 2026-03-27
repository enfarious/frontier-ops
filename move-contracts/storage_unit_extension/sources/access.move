/// Frontier Ops SSU access control extension.
///
/// Provides role-based and individual access control for Smart Storage Units.
/// Access rules are stored per-SSU on the shared SSUExtensionConfig object.
///
/// Access modes:
///   - **Open**: anyone can deposit/withdraw (default before config is set)
///   - **Allowlist**: only listed character item_ids can interact
///   - **Tribe**: only members of listed tribe IDs can interact
///   - **Mixed**: combine tribe + individual allowlists
///
/// Deposit and withdraw permissions are tracked separately:
///   - A character may be allowed to deposit but not withdraw
///   - Or vice versa
///
/// The extension intercepts deposit/withdraw calls and checks the
/// interacting character against the stored rules before delegating
/// to the world's storage_unit module.
#[allow(unused_use)]
module storage_unit_extension::access;

use sui::event;
use storage_unit_extension::config::{Self, AdminCap, SSUAuth, SSUExtensionConfig};
use world::{
    character::Character,
    storage_unit::{Self, StorageUnit},
    inventory::Item,
};

// === Errors ===
#[error(code = 0)]
const EAccessDenied: vector<u8> = b"Character does not have access to this SSU";
#[error(code = 1)]
const ENoAccessConfig: vector<u8> = b"No access config set for this SSU";

// === Access config structs ===

/// Per-SSU access rules. Stored as dynamic field on SSUExtensionConfig
/// keyed by the SSU's object ID.
public struct AccessRules has drop, store {
    /// Character item_ids allowed to deposit. Empty = check tribes only.
    deposit_allowlist: vector<u64>,
    /// Character item_ids allowed to withdraw. Empty = check tribes only.
    withdraw_allowlist: vector<u64>,
    /// Tribe IDs whose members can deposit.
    deposit_tribes: vector<u32>,
    /// Tribe IDs whose members can withdraw.
    withdraw_tribes: vector<u32>,
    /// If true, anyone can deposit (overrides allowlist/tribes for deposit).
    open_deposit: bool,
    /// If true, anyone can withdraw (overrides allowlist/tribes for withdraw).
    open_withdraw: bool,
}

/// Dynamic-field key: SSU object ID → AccessRules
public struct AccessRulesKey has copy, drop, store {
    ssu_id: ID,
}

// === Events ===

public struct AccessDeniedEvent has copy, drop {
    ssu_id: ID,
    character_id: u64,
    action: vector<u8>,
}

public struct AccessConfigUpdatedEvent has copy, drop {
    ssu_id: ID,
}

// === Access check logic ===

/// Check if a character can deposit to this SSU.
fun can_deposit(
    config: &SSUExtensionConfig,
    ssu_id: ID,
    character: &Character,
): bool {
    let key = AccessRulesKey { ssu_id };
    if (!config.has_rule<AccessRulesKey>(key)) {
        // No config = open access (default behavior)
        return true
    };
    let rules: &AccessRules = config.borrow_rule(key);
    if (rules.open_deposit) return true;

    let char_item_id = world::in_game_id::item_id(
        &world::character::key(character),
    );
    let char_tribe = world::character::tribe(character);

    // Check individual allowlist
    if (vector::contains(&rules.deposit_allowlist, &char_item_id)) return true;

    // Check tribe allowlist
    let mut i = 0u64;
    let len = vector::length(&rules.deposit_tribes);
    while (i < len) {
        if (*vector::borrow(&rules.deposit_tribes, i) == char_tribe) return true;
        i = i + 1;
    };

    false
}

/// Check if a character can withdraw from this SSU.
fun can_withdraw(
    config: &SSUExtensionConfig,
    ssu_id: ID,
    character: &Character,
): bool {
    let key = AccessRulesKey { ssu_id };
    if (!config.has_rule<AccessRulesKey>(key)) {
        return true
    };
    let rules: &AccessRules = config.borrow_rule(key);
    if (rules.open_withdraw) return true;

    let char_item_id = world::in_game_id::item_id(
        &world::character::key(character),
    );
    let char_tribe = world::character::tribe(character);

    if (vector::contains(&rules.withdraw_allowlist, &char_item_id)) return true;

    let mut i = 0u64;
    let len = vector::length(&rules.withdraw_tribes);
    while (i < len) {
        if (*vector::borrow(&rules.withdraw_tribes, i) == char_tribe) return true;
        i = i + 1;
    };

    false
}

// === Extension entry points ===
// These are called instead of the world's default functions
// when the extension is authorized on an SSU.

/// Deposit an item — checks access before delegating to world.
public fun deposit_item(
    extension_config: &SSUExtensionConfig,
    storage_unit: &mut StorageUnit,
    character: &Character,
    item: Item,
    ctx: &mut TxContext,
) {
    let ssu_id = object::id(storage_unit);
    if (!can_deposit(extension_config, ssu_id, character)) {
        let char_item_id = world::in_game_id::item_id(
            &world::character::key(character),
        );
        event::emit(AccessDeniedEvent {
            ssu_id,
            character_id: char_item_id,
            action: b"deposit",
        });
        abort EAccessDenied
    };

    storage_unit::deposit_item<SSUAuth>(
        storage_unit,
        character,
        item,
        config::ssu_auth(),
        ctx,
    );
}

/// Withdraw an item — checks access before delegating to world.
public fun withdraw_item(
    extension_config: &SSUExtensionConfig,
    storage_unit: &mut StorageUnit,
    character: &Character,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
): Item {
    let ssu_id = object::id(storage_unit);
    if (!can_withdraw(extension_config, ssu_id, character)) {
        let char_item_id = world::in_game_id::item_id(
            &world::character::key(character),
        );
        event::emit(AccessDeniedEvent {
            ssu_id,
            character_id: char_item_id,
            action: b"withdraw",
        });
        abort EAccessDenied
    };

    storage_unit::withdraw_item<SSUAuth>(
        storage_unit,
        character,
        config::ssu_auth(),
        type_id,
        quantity,
        ctx,
    )
}

// === Admin functions ===

/// Set access rules for a specific SSU.
public fun set_access_rules(
    extension_config: &mut SSUExtensionConfig,
    admin_cap: &AdminCap,
    ssu_id: ID,
    deposit_allowlist: vector<u64>,
    withdraw_allowlist: vector<u64>,
    deposit_tribes: vector<u32>,
    withdraw_tribes: vector<u32>,
    open_deposit: bool,
    open_withdraw: bool,
) {
    let key = AccessRulesKey { ssu_id };
    extension_config.set_rule(
        admin_cap,
        key,
        AccessRules {
            deposit_allowlist,
            withdraw_allowlist,
            deposit_tribes,
            withdraw_tribes,
            open_deposit,
            open_withdraw,
        },
    );
    event::emit(AccessConfigUpdatedEvent { ssu_id });
}

/// Add a character to the deposit allowlist for an SSU.
public fun add_deposit_access(
    extension_config: &mut SSUExtensionConfig,
    admin_cap: &AdminCap,
    ssu_id: ID,
    character_item_id: u64,
) {
    let key = AccessRulesKey { ssu_id };
    assert!(extension_config.has_rule<AccessRulesKey>(key), ENoAccessConfig);
    // Remove existing rules, modify, re-add
    let mut rules: AccessRules = config::remove_rule(extension_config, admin_cap, key);
    if (!vector::contains(&rules.deposit_allowlist, &character_item_id)) {
        vector::push_back(&mut rules.deposit_allowlist, character_item_id);
    };
    extension_config.set_rule(admin_cap, key, rules);
}

/// Add a character to the withdraw allowlist for an SSU.
public fun add_withdraw_access(
    extension_config: &mut SSUExtensionConfig,
    admin_cap: &AdminCap,
    ssu_id: ID,
    character_item_id: u64,
) {
    let key = AccessRulesKey { ssu_id };
    assert!(extension_config.has_rule<AccessRulesKey>(key), ENoAccessConfig);
    let mut rules: AccessRules = config::remove_rule(extension_config, admin_cap, key);
    if (!vector::contains(&rules.withdraw_allowlist, &character_item_id)) {
        vector::push_back(&mut rules.withdraw_allowlist, character_item_id);
    };
    extension_config.set_rule(admin_cap, key, rules);
}

/// Add a tribe to the deposit tribes for an SSU.
public fun add_deposit_tribe(
    extension_config: &mut SSUExtensionConfig,
    admin_cap: &AdminCap,
    ssu_id: ID,
    tribe_id: u32,
) {
    let key = AccessRulesKey { ssu_id };
    assert!(extension_config.has_rule<AccessRulesKey>(key), ENoAccessConfig);
    let mut rules: AccessRules = config::remove_rule(extension_config, admin_cap, key);
    if (!vector::contains(&rules.deposit_tribes, &tribe_id)) {
        vector::push_back(&mut rules.deposit_tribes, tribe_id);
    };
    extension_config.set_rule(admin_cap, key, rules);
}

/// Add a tribe to the withdraw tribes for an SSU.
public fun add_withdraw_tribe(
    extension_config: &mut SSUExtensionConfig,
    admin_cap: &AdminCap,
    ssu_id: ID,
    tribe_id: u32,
) {
    let key = AccessRulesKey { ssu_id };
    assert!(extension_config.has_rule<AccessRulesKey>(key), ENoAccessConfig);
    let mut rules: AccessRules = config::remove_rule(extension_config, admin_cap, key);
    if (!vector::contains(&rules.withdraw_tribes, &tribe_id)) {
        vector::push_back(&mut rules.withdraw_tribes, tribe_id);
    };
    extension_config.set_rule(admin_cap, key, rules);
}

/// Remove all access rules for an SSU (revert to open access).
public fun clear_access_rules(
    extension_config: &mut SSUExtensionConfig,
    admin_cap: &AdminCap,
    ssu_id: ID,
) {
    let key = AccessRulesKey { ssu_id };
    if (extension_config.has_rule<AccessRulesKey>(key)) {
        let _: AccessRules = config::remove_rule(extension_config, admin_cap, key);
    };
    event::emit(AccessConfigUpdatedEvent { ssu_id });
}

// === View functions ===

/// Check if access rules exist for an SSU.
public fun has_access_rules(
    extension_config: &SSUExtensionConfig,
    ssu_id: ID,
): bool {
    extension_config.has_rule<AccessRulesKey>(AccessRulesKey { ssu_id })
}

/// Check if a specific character can deposit.
public fun check_deposit_access(
    extension_config: &SSUExtensionConfig,
    ssu_id: ID,
    character: &Character,
): bool {
    can_deposit(extension_config, ssu_id, character)
}

/// Check if a specific character can withdraw.
public fun check_withdraw_access(
    extension_config: &SSUExtensionConfig,
    ssu_id: ID,
    character: &Character,
): bool {
    can_withdraw(extension_config, ssu_id, character)
}
