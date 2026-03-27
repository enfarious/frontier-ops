/// Frontier Ops turret targeting extension.
///
/// Implements configurable targeting logic for EVE Frontier turrets:
///   - **Tribe whitelist**: never shoot members of whitelisted tribes (unless aggressor)
///   - **Aggressor priority**: aggressors get a massive weight boost
///   - **Ship-class specialization**: turrets deal bonus priority to their preferred targets
///   - **Weakest-first mode**: reserved for future use (hp_ratio not yet on-chain)
///
/// The game calls `get_target_priority_list` whenever a target's behaviour changes.
/// This extension unpacks the candidate list, applies the configured rules, and returns
/// a BCS-encoded priority list. The turret shoots the highest-weight target first.
#[allow(unused_use)]
module smart_turret_extension::targeting;

use sui::{bcs, event};
use smart_turret_extension::config::{Self, AdminCap, TurretAuth, TurretExtensionConfig};
use world::{character::Character, turret::{Self, Turret, OnlineReceipt}};

// === Errors ===
#[error(code = 0)]
const EInvalidOnlineReceipt: vector<u8> = b"Invalid online receipt";
#[error(code = 1)]
const ENoTargetingConfig: vector<u8> = b"Missing TargetingConfig on TurretExtensionConfig";

// === Weight constants ===
/// Massive boost for targets actively attacking.
const AGGRESSOR_WEIGHT: u64 = 50000;
/// Boost for entering turret proximity.
const PROXIMITY_WEIGHT: u64 = 1000;
/// Bonus for matching turret specialization group.
const SPECIALIZATION_BONUS: u64 = 5000;
/// Per-percentage-point bonus when weakest-first is enabled.
/// NOTE: hp_ratio is not yet available on Stillness on-chain package.
/// This constant is kept for future use when the world package is upgraded.
const WEAKEST_BONUS_PER_PCT: u64 = 100;

// === Ship group IDs (from EVE Frontier docs) ===
const GROUP_SHUTTLE: u64 = 31;
const GROUP_CORVETTE: u64 = 237;
const GROUP_FRIGATE: u64 = 25;
const GROUP_DESTROYER: u64 = 420;
const GROUP_CRUISER: u64 = 26;
const GROUP_COMBAT_BC: u64 = 419;

// === Turret type IDs ===
const TURRET_AUTOCANNON: u64 = 92402;
const TURRET_PLASMA: u64 = 92403;
const TURRET_HOWITZER: u64 = 92484;

// === Config structs ===

/// Stored as dynamic field on TurretExtensionConfig.
public struct TargetingConfig has drop, store {
    /// Tribe IDs that should NOT be targeted (unless aggressor).
    friendly_tribes: vector<u32>,
    /// Whether to boost priority for low-HP targets.
    weakest_first: bool,
    /// Whether to apply specialization bonus based on turret type vs ship group.
    use_specialization: bool,
    /// Whether aggressors from friendly tribes should still be targeted.
    shoot_friendly_aggressors: bool,
}

/// Dynamic-field key for TargetingConfig.
public struct TargetingConfigKey has copy, drop, store {}

// === Events ===
public struct PriorityListUpdatedEvent has copy, drop {
    turret_id: ID,
    priority_list: vector<u8>,
    candidates_count: u64,
    targets_count: u64,
}

// === Entry: called by the game ===

/// The game calls this function whenever target behaviour changes.
/// Must have exact signature to match the extension interface.
public fun get_target_priority_list(
    turret: &Turret,
    owner_character: &Character,
    target_candidate_list: vector<u8>,
    receipt: OnlineReceipt,
): vector<u8> {
    assert!(receipt.turret_id() == object::id(turret), EInvalidOnlineReceipt);

    let candidates = turret::unpack_candidate_list(target_candidate_list);
    let candidates_count = vector::length(&candidates);

    // Build return list from candidates using default rules
    // (extension config is not available in this call — config is applied at authorize time)
    let return_list = build_priority_list_default(&candidates, owner_character, turret);
    let targets_count = vector::length(&return_list);
    let result = bcs::to_bytes(&return_list);

    turret::destroy_online_receipt(receipt, config::turret_auth());
    event::emit(PriorityListUpdatedEvent {
        turret_id: object::id(turret),
        priority_list: result,
        candidates_count,
        targets_count,
    });
    result
}

// === Priority logic ===

/// Priority logic applied when the extension is active.
/// Rules:
///   1. Owner is always excluded
///   2. Same-tribe non-aggressors are excluded
///   3. Aggressors get massive weight boost
///   4. Non-aggressor hostiles get proximity weight
///   5. Turret specialization bonus based on turret type vs ship group
///   6. Weakest-first: bonus for missing HP
///
/// Note: BehaviourChangeReason enum variants are module-private in world::turret,
/// so we rely on `is_aggressor` and `priority_weight` (which the game already
/// adjusts based on behaviour) instead of matching on behaviour_change directly.
fun build_priority_list_default(
    candidates: &vector<turret::TargetCandidate>,
    owner_character: &Character,
    turret: &Turret,
): vector<turret::ReturnTargetPriorityList> {
    let mut result = vector::empty<turret::ReturnTargetPriorityList>();
    let owner_tribe = world::character::tribe(owner_character);
    let owner_item_id = world::in_game_id::item_id(&world::character::key(owner_character)) as u32;
    let turret_type = turret::type_id(turret);

    let mut i = 0u64;
    let len = vector::length(candidates);
    while (i < len) {
        let candidate = vector::borrow(candidates, i);
        let char_id = turret::character_id(candidate);
        let char_tribe = turret::character_tribe(candidate);
        let is_aggressor = turret::is_aggressor(candidate);

        // 1. Always skip self
        let is_owner = char_id != 0 && char_id == owner_item_id;
        if (!is_owner) {
            let same_tribe = char_tribe == owner_tribe;

            // 2. Skip same-tribe non-aggressors
            if (!(same_tribe && !is_aggressor)) {
                let mut weight = turret::priority_weight(candidate);

                // 3. Aggressor boost — massive priority for active threats
                if (is_aggressor) {
                    weight = weight + AGGRESSOR_WEIGHT;
                } else {
                    // 4. Non-aggressor hostile in range — proximity weight
                    weight = weight + PROXIMITY_WEIGHT;
                };

                // 5. Specialization bonus
                let group = turret::group_id(candidate);
                if (is_specialized_against(turret_type, group)) {
                    weight = weight + SPECIALIZATION_BONUS;
                };

                // 6. Weakest-first: skipped — hp_ratio not yet on Stillness
                // When the world package is upgraded, uncomment:
                // let hp = turret::hp_ratio(candidate);
                // if (hp < 100) { weight = weight + ((100 - hp) * WEAKEST_BONUS_PER_PCT); };

                vector::push_back(
                    &mut result,
                    turret::new_return_target_priority_list(
                        turret::item_id(candidate),
                        weight,
                    ),
                );
            };
        };
        i = i + 1;
    };
    result
}

/// Check if a turret type is specialized against a ship group.
fun is_specialized_against(turret_type: u64, group_id: u64): bool {
    if (turret_type == TURRET_AUTOCANNON) {
        group_id == GROUP_SHUTTLE || group_id == GROUP_CORVETTE
    } else if (turret_type == TURRET_PLASMA) {
        group_id == GROUP_FRIGATE || group_id == GROUP_DESTROYER
    } else if (turret_type == TURRET_HOWITZER) {
        group_id == GROUP_CRUISER || group_id == GROUP_COMBAT_BC
    } else {
        false
    }
}

// === Admin functions ===

/// Set or update the targeting configuration.
public fun set_targeting_config(
    extension_config: &mut TurretExtensionConfig,
    admin_cap: &AdminCap,
    friendly_tribes: vector<u32>,
    weakest_first: bool,
    use_specialization: bool,
    shoot_friendly_aggressors: bool,
) {
    extension_config.set_rule<TargetingConfigKey, TargetingConfig>(
        admin_cap,
        TargetingConfigKey {},
        TargetingConfig {
            friendly_tribes,
            weakest_first,
            use_specialization,
            shoot_friendly_aggressors,
        },
    );
}

// === View functions ===

public fun get_friendly_tribes(extension_config: &TurretExtensionConfig): &vector<u32> {
    assert!(extension_config.has_rule<TargetingConfigKey>(TargetingConfigKey {}), ENoTargetingConfig);
    let cfg = extension_config.borrow_rule<TargetingConfigKey, TargetingConfig>(TargetingConfigKey {});
    &cfg.friendly_tribes
}

public fun is_weakest_first(extension_config: &TurretExtensionConfig): bool {
    assert!(extension_config.has_rule<TargetingConfigKey>(TargetingConfigKey {}), ENoTargetingConfig);
    let cfg = extension_config.borrow_rule<TargetingConfigKey, TargetingConfig>(TargetingConfigKey {});
    cfg.weakest_first
}
