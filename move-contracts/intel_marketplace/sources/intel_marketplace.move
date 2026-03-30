/// Intel Marketplace — encrypted intel listings with sealed-key atomic reveal.
///
/// Flow:
///   1. Seller encrypts payload client-side (AES-256-GCM), then calls
///      `create_listing` with the ciphertext, encryption key, and key hash.
///      The key is stored in a `SealedKey` dynamic field on the listing —
///      not directly surfaced in top-level object queries.
///   2. Buyer calls `purchase_listing` — pays SUI directly to seller.
///      The contract unseals the key, emits a `KeyRevealed` event, and
///      destroys the `SealedKey` object. Atomic: payment + key reveal in
///      one transaction.
///   3. Seller can `cancel_listing` while status is LISTED (also destroys
///      the sealed key).
///
/// Security model:
///   - Before purchase: encrypted payload is public, key is buried in a
///     child dynamic field (requires knowing parent + field name to query).
///   - After purchase: key exists ONLY in the transaction event log;
///     the `SealedKey` object is destroyed on-chain.
///   - Hash commitment (`key_hash`) lets the buyer verify the revealed key
///     client-side: sha256(revealed_key) == key_hash.
///
/// Visibility tiers (enforced at UI layer, stored on-chain):
///   0 = Global  — any kiosk running the app shows it
///   1 = Tribe   — shown only to seller's tribe members
///   2 = Local   — only at the seller's own assembly
module intel_marketplace::intel_marketplace;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;
use sui::dynamic_field;
use std::hash::sha2_256;

// ── Status constants ──────────────────────────────────────────────
const STATUS_LISTED: u8 = 0;
const STATUS_SOLD: u8 = 1;
const STATUS_CANCELLED: u8 = 2;

// ── Error codes ───────────────────────────────────────────────────
const ENotSeller: u64 = 0;
const EWrongStatus: u64 = 1;
const EInsufficientPayment: u64 = 2;
const EZeroPrice: u64 = 3;
const EInvalidVisibility: u64 = 4;
const EKeyHashMismatch: u64 = 5;

// ── Dynamic field key ─────────────────────────────────────────────
/// Marker type for the sealed key dynamic field.
public struct SealedKeyTag has copy, drop, store {}

// ── Objects ───────────────────────────────────────────────────────

/// The encryption key, stored as a dynamic field on the listing.
/// Destroyed atomically on purchase (or cancellation).
public struct SealedKey has store {
    key_bytes: vector<u8>,
}

/// An intel package listed for sale. Shared object so any buyer can purchase.
public struct IntelListing has key, store {
    id: UID,
    seller: address,
    buyer: address,                 // @0x0 until purchased
    title: vector<u8>,
    description: vector<u8>,
    price_mist: u64,
    visibility: u8,                 // 0=global, 1=tribe, 2=local
    seller_tribe: vector<u8>,       // seller's tribe name (for tribe filtering)
    encrypted_payload: vector<u8>,  // AES-256-GCM ciphertext (IV-prefixed)
    key_hash: vector<u8>,           // SHA-256 of encryption key (32 bytes)
    status: u8,
    created_at: u64,
    purchased_at: u64,
}

// ── Events ────────────────────────────────────────────────────────

public struct ListingCreated has copy, drop {
    listing_id: ID,
    seller: address,
    price_mist: u64,
    visibility: u8,
}

public struct ListingPurchased has copy, drop {
    listing_id: ID,
    buyer: address,
    seller: address,
    price_mist: u64,
}

/// Emitted atomically on purchase — the ONLY way the key is revealed.
public struct KeyRevealed has copy, drop {
    listing_id: ID,
    buyer: address,
    encryption_key: vector<u8>,
}

public struct ListingCancelled has copy, drop {
    listing_id: ID,
}

// ── Public functions ──────────────────────────────────────────────

/// Seller creates a new encrypted intel listing.
/// The encryption key is sealed in a dynamic field; the key hash is
/// stored on the listing for buyer-side verification after reveal.
public fun create_listing(
    title: vector<u8>,
    description: vector<u8>,
    price_mist: u64,
    visibility: u8,
    seller_tribe: vector<u8>,
    encrypted_payload: vector<u8>,
    encryption_key: vector<u8>,
    key_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(price_mist > 0, EZeroPrice);
    assert!(visibility <= 2, EInvalidVisibility);

    // Verify the seller's key hash commitment is correct on-chain.
    // This prevents a seller from committing a bad hash that would
    // cause verification to fail for the buyer post-purchase.
    let computed_hash = sha2_256(encryption_key);
    assert!(computed_hash == key_hash, EKeyHashMismatch);

    let mut listing = IntelListing {
        id: object::new(ctx),
        seller: ctx.sender(),
        buyer: @0x0,
        title,
        description,
        price_mist,
        visibility,
        seller_tribe,
        encrypted_payload,
        key_hash,
        status: STATUS_LISTED,
        created_at: clock.timestamp_ms(),
        purchased_at: 0,
    };

    // Seal the encryption key as a dynamic field on the listing.
    // This keeps it off the top-level object schema — querying the
    // listing via GraphQL won't surface it without explicitly
    // requesting the dynamic field by type + name.
    let sealed = SealedKey { key_bytes: encryption_key };
    dynamic_field::add(&mut listing.id, SealedKeyTag {}, sealed);

    event::emit(ListingCreated {
        listing_id: object::id(&listing),
        seller: ctx.sender(),
        price_mist,
        visibility,
    });

    transfer::share_object(listing);
}

/// Buyer purchases a listing. SUI goes directly to seller.
/// The sealed key is atomically unsealed, emitted as an event, and
/// destroyed — all in the same transaction.
public fun purchase_listing(
    listing: &mut IntelListing,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(listing.status == STATUS_LISTED, EWrongStatus);
    assert!(coin::value(&payment) >= listing.price_mist, EInsufficientPayment);

    // Pay seller directly
    transfer::public_transfer(payment, listing.seller);

    // Unseal the encryption key
    let SealedKey { key_bytes } = dynamic_field::remove<SealedKeyTag, SealedKey>(
        &mut listing.id,
        SealedKeyTag {},
    );

    // Emit the key — buyer's client catches this event
    event::emit(KeyRevealed {
        listing_id: object::id(listing),
        buyer: ctx.sender(),
        encryption_key: key_bytes,
    });

    // SealedKey is destructured and consumed — no longer exists on-chain

    listing.buyer = ctx.sender();
    listing.status = STATUS_SOLD;
    listing.purchased_at = clock.timestamp_ms();

    event::emit(ListingPurchased {
        listing_id: object::id(listing),
        buyer: ctx.sender(),
        seller: listing.seller,
        price_mist: listing.price_mist,
    });
}

/// Seller cancels a listing. Destroys the sealed key as cleanup.
public fun cancel_listing(
    listing: &mut IntelListing,
    ctx: &mut TxContext,
) {
    assert!(listing.status == STATUS_LISTED, EWrongStatus);
    assert!(ctx.sender() == listing.seller, ENotSeller);

    // Destroy the sealed key (cleanup)
    let SealedKey { key_bytes: _ } = dynamic_field::remove<SealedKeyTag, SealedKey>(
        &mut listing.id,
        SealedKeyTag {},
    );

    listing.status = STATUS_CANCELLED;

    event::emit(ListingCancelled {
        listing_id: object::id(listing),
    });
}
