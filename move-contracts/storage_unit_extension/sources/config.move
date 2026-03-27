/// Shared configuration for the Frontier Ops SSU access control extension.
///
/// Publishes a shared `SSUExtensionConfig` at package init time.
/// Per-SSU access rules are stored as dynamic fields keyed by SSU object ID.
module storage_unit_extension::config;

use sui::dynamic_field as df;

/// Shared config object — per-SSU access rules via dynamic fields.
public struct SSUExtensionConfig has key {
    id: UID,
}

/// Admin capability — holder can update access rules.
public struct AdminCap has key, store {
    id: UID,
}

/// Typed witness authorising this package's extension on SSUs.
public struct SSUAuth has drop {}

fun init(ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, ctx.sender());

    let config = SSUExtensionConfig { id: object::new(ctx) };
    transfer::share_object(config);
}

// === Dynamic field helpers ===

public fun has_rule<K: copy + drop + store>(config: &SSUExtensionConfig, key: K): bool {
    df::exists_(&config.id, key)
}

public fun borrow_rule<K: copy + drop + store, V: store>(
    config: &SSUExtensionConfig,
    key: K,
): &V {
    df::borrow(&config.id, key)
}

public fun set_rule<K: copy + drop + store, V: store + drop>(
    config: &mut SSUExtensionConfig,
    _: &AdminCap,
    key: K,
    value: V,
) {
    if (df::exists_(&config.id, copy key)) {
        let _old: V = df::remove(&mut config.id, copy key);
    };
    df::add(&mut config.id, key, value);
}

public fun remove_rule<K: copy + drop + store, V: store>(
    config: &mut SSUExtensionConfig,
    _: &AdminCap,
    key: K,
): V {
    df::remove(&mut config.id, key)
}

/// Mint an `SSUAuth` witness. Package-restricted.
public(package) fun ssu_auth(): SSUAuth {
    SSUAuth {}
}
