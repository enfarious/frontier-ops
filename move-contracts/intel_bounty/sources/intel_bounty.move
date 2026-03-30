/// Intel Bounty — request-side intel market with escrowed SUI + sealed-key fulfillment.
///
/// Flow:
///   1. Poster calls `create_bounty` — deposits SUI escrow, describes what intel
///      they need (system, asset type, target tribe, etc.).
///   2. Hunter calls `submit_fulfillment` — provides a plaintext teaser (summary
///      of what they found) plus an encrypted Dead Drop payload with sealed key.
///      Poster can read the teaser to evaluate before accepting.
///   3. Poster calls `accept_fulfillment` — escrow releases to hunter, sealed key
///      is revealed via `KeyRevealed` event. Poster's client decrypts the full intel.
///   4. Poster calls `reject_fulfillment` — bounty reopens for other hunters.
///      Hunter's sealed key is destroyed (intel stays protected).
///   5. Poster can `cancel_bounty` while no pending fulfillment exists.
///
/// Security model:
///   - Teaser is plaintext — enough for the poster to evaluate quality
///   - Full intel is AES-256-GCM encrypted, key sealed in dynamic field
///   - Key only reveals on acceptance (same atomic pattern as intel_marketplace)
///   - Escrow prevents poster from ghosting after seeing the teaser
///
/// Bounty categories (stored on-chain, filtered in UI):
///   0 = General       — any intel
///   1 = Gate Intel    — gate locations, access routes
///   2 = Asset Recon   — SSUs, turrets, infrastructure
///   3 = Fleet Intel   — fleet movements, compositions
///   4 = Player Intel  — player activity, allegiances
module intel_bounty::intel_bounty;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use sui::dynamic_field;
use std::hash::sha2_256;

// ── Status constants ──────────────────────────────────────────────
const STATUS_OPEN: u8 = 0;
const STATUS_PENDING: u8 = 1;    // fulfillment submitted, awaiting review
const STATUS_COMPLETED: u8 = 2;  // accepted and paid
const STATUS_CANCELLED: u8 = 3;

// ── Error codes ───────────────────────────────────────────────────
const ENotPoster: u64 = 0;
const EWrongStatus: u64 = 1;
const EZeroReward: u64 = 2;
const EInvalidCategory: u64 = 3;
const EKeyHashMismatch: u64 = 4;

// ── Dynamic field key ─────────────────────────────────────────────
public struct SealedKeyTag has copy, drop, store {}

// ── Objects ───────────────────────────────────────────────────────

/// The encryption key for the fulfillment, sealed as a dynamic field.
public struct SealedKey has store {
    key_bytes: vector<u8>,
}

/// An intel bounty with escrowed SUI reward.
public struct IntelBounty has key, store {
    id: UID,
    poster: address,
    hunter: address,                   // @0x0 until fulfilled
    title: vector<u8>,
    description: vector<u8>,
    category: u8,                      // 0-4 (see module doc)
    target_system: vector<u8>,         // optional: solar system name
    target_tribe: vector<u8>,          // optional: tribe of interest
    reward: Balance<SUI>,
    // Fulfillment data (set by hunter on submit)
    teaser: vector<u8>,                // plaintext preview for poster to evaluate
    encrypted_payload: vector<u8>,     // AES-256-GCM ciphertext (IV-prefixed)
    key_hash: vector<u8>,              // SHA-256 of encryption key
    status: u8,
    created_at: u64,
    expires_at: u64,                   // 0 = no expiry
    fulfilled_at: u64,
}

// ── Events ────────────────────────────────────────────────────────

public struct BountyCreated has copy, drop {
    bounty_id: ID,
    poster: address,
    reward_amount: u64,
    category: u8,
}

public struct FulfillmentSubmitted has copy, drop {
    bounty_id: ID,
    hunter: address,
}

public struct FulfillmentAccepted has copy, drop {
    bounty_id: ID,
    hunter: address,
    amount: u64,
}

/// Emitted atomically on acceptance — the ONLY way the key is revealed.
public struct KeyRevealed has copy, drop {
    bounty_id: ID,
    poster: address,
    encryption_key: vector<u8>,
}

public struct FulfillmentRejected has copy, drop {
    bounty_id: ID,
}

public struct BountyCancelled has copy, drop {
    bounty_id: ID,
}

// ── Public functions ──────────────────────────────────────────────

/// Poster creates a bounty, depositing SUI as escrowed reward.
public fun create_bounty(
    title: vector<u8>,
    description: vector<u8>,
    category: u8,
    target_system: vector<u8>,
    target_tribe: vector<u8>,
    payment: Coin<SUI>,
    expires_at: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroReward);
    assert!(category <= 4, EInvalidCategory);

    let bounty = IntelBounty {
        id: object::new(ctx),
        poster: ctx.sender(),
        hunter: @0x0,
        title,
        description,
        category,
        target_system,
        target_tribe,
        reward: coin::into_balance(payment),
        teaser: vector[],
        encrypted_payload: vector[],
        key_hash: vector[],
        status: STATUS_OPEN,
        created_at: clock.timestamp_ms(),
        expires_at,
        fulfilled_at: 0,
    };

    event::emit(BountyCreated {
        bounty_id: object::id(&bounty),
        poster: ctx.sender(),
        reward_amount: amount,
        category,
    });

    transfer::share_object(bounty);
}

/// Hunter submits a fulfillment: plaintext teaser + encrypted full intel.
/// The encryption key is sealed in a dynamic field on the bounty.
public fun submit_fulfillment(
    bounty: &mut IntelBounty,
    teaser: vector<u8>,
    encrypted_payload: vector<u8>,
    encryption_key: vector<u8>,
    key_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_OPEN, EWrongStatus);

    // Verify key hash commitment
    let computed_hash = sha2_256(encryption_key);
    assert!(computed_hash == key_hash, EKeyHashMismatch);

    bounty.hunter = ctx.sender();
    bounty.teaser = teaser;
    bounty.encrypted_payload = encrypted_payload;
    bounty.key_hash = key_hash;
    bounty.status = STATUS_PENDING;
    bounty.fulfilled_at = clock.timestamp_ms();

    // Seal the encryption key
    let sealed = SealedKey { key_bytes: encryption_key };
    dynamic_field::add(&mut bounty.id, SealedKeyTag {}, sealed);

    event::emit(FulfillmentSubmitted {
        bounty_id: object::id(bounty),
        hunter: ctx.sender(),
    });
}

/// Poster accepts the fulfillment. Escrow releases to hunter,
/// sealed key is revealed via event, destroyed on-chain.
public fun accept_fulfillment(
    bounty: &mut IntelBounty,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_PENDING, EWrongStatus);
    assert!(bounty.poster == ctx.sender(), ENotPoster);

    // Unseal the encryption key
    let SealedKey { key_bytes } = dynamic_field::remove<SealedKeyTag, SealedKey>(
        &mut bounty.id,
        SealedKeyTag {},
    );

    // Emit the key — poster's client catches this event
    event::emit(KeyRevealed {
        bounty_id: object::id(bounty),
        poster: ctx.sender(),
        encryption_key: key_bytes,
    });

    // Pay the hunter
    let total = balance::value(&bounty.reward);
    let payment = coin::from_balance(balance::split(&mut bounty.reward, total), ctx);
    transfer::public_transfer(payment, bounty.hunter);

    bounty.status = STATUS_COMPLETED;
    bounty.fulfilled_at = clock.timestamp_ms();

    event::emit(FulfillmentAccepted {
        bounty_id: object::id(bounty),
        hunter: bounty.hunter,
        amount: total,
    });
}

/// Poster rejects the fulfillment. Bounty reopens. Sealed key destroyed.
public fun reject_fulfillment(
    bounty: &mut IntelBounty,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_PENDING, EWrongStatus);
    assert!(bounty.poster == ctx.sender(), ENotPoster);

    // Destroy the sealed key (hunter's intel stays protected)
    let SealedKey { key_bytes: _ } = dynamic_field::remove<SealedKeyTag, SealedKey>(
        &mut bounty.id,
        SealedKeyTag {},
    );

    bounty.hunter = @0x0;
    bounty.teaser = vector[];
    bounty.encrypted_payload = vector[];
    bounty.key_hash = vector[];
    bounty.status = STATUS_OPEN;

    event::emit(FulfillmentRejected {
        bounty_id: object::id(bounty),
    });
}

/// Poster cancels an open bounty and reclaims escrowed SUI.
/// Only works while no pending fulfillment (status must be OPEN).
public fun cancel_bounty(
    bounty: &mut IntelBounty,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_OPEN, EWrongStatus);
    assert!(bounty.poster == ctx.sender(), ENotPoster);

    bounty.status = STATUS_CANCELLED;

    let total = balance::value(&bounty.reward);
    let refund = coin::from_balance(balance::split(&mut bounty.reward, total), ctx);
    transfer::public_transfer(refund, bounty.poster);

    event::emit(BountyCancelled {
        bounty_id: object::id(bounty),
    });
}

/// Anyone can reclaim expired bounties on behalf of the poster.
/// Only works if the bounty is OPEN and past its expiry time.
public fun reclaim_expired(
    bounty: &mut IntelBounty,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_OPEN, EWrongStatus);
    assert!(bounty.expires_at > 0, EWrongStatus);
    assert!(clock.timestamp_ms() >= bounty.expires_at, EWrongStatus);

    bounty.status = STATUS_CANCELLED;

    let total = balance::value(&bounty.reward);
    let refund = coin::from_balance(balance::split(&mut bounty.reward, total), ctx);
    transfer::public_transfer(refund, bounty.poster);

    event::emit(BountyCancelled {
        bounty_id: object::id(bounty),
    });
}
