/// Intel Marketplace — on-chain intel listings with direct SUI payment.
///
/// Flow:
///   1. Seller calls `create_listing` — sets title, description, price, visibility.
///   2. Buyer calls `purchase_listing` — pays SUI directly to seller. Done.
///   3. Seller can `cancel_listing` while status is LISTED.
///
/// No escrow. No deliver step. Purchase = payment = done.
///
/// Visibility tiers (enforced at UI layer, stored on-chain):
///   0 = Global  — any kiosk running the app shows it
///   1 = Tribe   — any kiosk shows it, but only to seller's tribe members
///   2 = Local   — only shows at the seller's own assembly
module intel_marketplace::intel_marketplace;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock::Clock;
use sui::event;

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

// ── Objects ───────────────────────────────────────────────────────

/// An intel package listed for sale. Shared object so any buyer can purchase.
public struct IntelListing has key, store {
    id: UID,
    seller: address,
    buyer: address,             // @0x0 until purchased
    title: vector<u8>,
    description: vector<u8>,
    price_mist: u64,
    visibility: u8,             // 0=global, 1=tribe, 2=local
    seller_tribe: vector<u8>,   // seller's tribe name (for tribe filtering)
    payload: vector<u8>,        // Dead Drop JSON (UTF-8 encoded)
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

public struct ListingCancelled has copy, drop {
    listing_id: ID,
}

// ── Public functions ──────────────────────────────────────────────

/// Seller creates a new intel listing.
public fun create_listing(
    title: vector<u8>,
    description: vector<u8>,
    price_mist: u64,
    visibility: u8,
    seller_tribe: vector<u8>,
    payload: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(price_mist > 0, EZeroPrice);
    assert!(visibility <= 2, EInvalidVisibility);

    let listing = IntelListing {
        id: object::new(ctx),
        seller: ctx.sender(),
        buyer: @0x0,
        title,
        description,
        price_mist,
        visibility,
        seller_tribe,
        payload,
        status: STATUS_LISTED,
        created_at: clock.timestamp_ms(),
        purchased_at: 0,
    };

    event::emit(ListingCreated {
        listing_id: object::id(&listing),
        seller: ctx.sender(),
        price_mist,
        visibility,
    });

    transfer::share_object(listing);
}

/// Buyer purchases a listing. SUI goes directly to seller. No escrow.
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

/// Seller cancels a listing. Only possible while status is LISTED.
public fun cancel_listing(
    listing: &mut IntelListing,
    ctx: &mut TxContext,
) {
    assert!(listing.status == STATUS_LISTED, EWrongStatus);
    assert!(ctx.sender() == listing.seller, ENotSeller);

    listing.status = STATUS_CANCELLED;

    event::emit(ListingCancelled {
        listing_id: object::id(listing),
    });
}
