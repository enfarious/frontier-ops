/// Shared configuration for the Frontier Ops turret extension.
///
/// Publishes a shared `TurretExtensionConfig` at package init time.
/// Other modules in this package attach typed rules as dynamic fields.
module smart_turret_extension::config;

use sui::dynamic_field as df;

/// Shared config object — rule storage via dynamic fields.
public struct TurretExtensionConfig has key {
    id: UID,
}

/// Admin capability — holder can update rules.
public struct AdminCap has key, store {
    id: UID,
}

/// Typed witness authorising this package's extension on turrets.
public struct TurretAuth has drop {}

fun init(ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, ctx.sender());

    let config = TurretExtensionConfig { id: object::new(ctx) };
    transfer::share_object(config);
}

// === Dynamic field helpers ===

public fun has_rule<K: copy + drop + store>(config: &TurretExtensionConfig, key: K): bool {
    df::exists_(&config.id, key)
}

public fun borrow_rule<K: copy + drop + store, V: store>(
    config: &TurretExtensionConfig,
    key: K,
): &V {
    df::borrow(&config.id, key)
}

public fun add_rule<K: copy + drop + store, V: store>(
    config: &mut TurretExtensionConfig,
    _: &AdminCap,
    key: K,
    value: V,
) {
    df::add(&mut config.id, key, value);
}

/// Insert-or-overwrite a rule.
public fun set_rule<K: copy + drop + store, V: store + drop>(
    config: &mut TurretExtensionConfig,
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
    config: &mut TurretExtensionConfig,
    _: &AdminCap,
    key: K,
): V {
    df::remove(&mut config.id, key)
}

/// Mint a `TurretAuth` witness. Package-restricted.
public(package) fun turret_auth(): TurretAuth {
    TurretAuth {}
}
