/// Bounty Escrow — trustless bounty board with SUI escrow and configurable platform fee.
///
/// Flow:
///   1. Deployer gets AdminCap; `init` creates a shared Platform config.
///   2. Creator calls `create_bounty` — deposits SUI reward, sets target info.
///   3. Hunter calls `submit_claim` — attaches proof (killmail ID).
///   4. Creator calls `approve_claim` — releases escrowed SUI to hunter (minus fee).
///
/// Creator can `cancel_bounty` only while no pending claim exists.
/// Creator can `reject_claim` to re-open the bounty for other hunters.
/// Admin can update treasury address and fee rate via AdminCap.
module bounty_escrow::bounty_escrow;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::event;

// ── Status constants ──────────────────────────────────────────────
const STATUS_ACTIVE: u8 = 0;
const STATUS_PENDING: u8 = 1;   // claim submitted, awaiting approval
const STATUS_CLAIMED: u8 = 2;   // approved and paid
const STATUS_CANCELLED: u8 = 3;

// ── Defaults ────────────────────────────────────────────────────
const DEFAULT_FEE_BPS: u64 = 250;       // 2.5%
const BPS_DENOMINATOR: u64 = 10000;
const MAX_FEE_BPS: u64 = 1000;          // cap at 10%

// ── Error codes ───────────────────────────────────────────────────
const ENotCreator: u64 = 0;
const EWrongStatus: u64 = 1;
const EZeroReward: u64 = 2;
const EFeeTooHigh: u64 = 3;

// ── Admin & Config ──────────────────────────────────────────────

/// Capability granted to the deployer. Holder can update platform config.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared config object holding fee rate and treasury address.
public struct Platform has key {
    id: UID,
    treasury: address,
    fee_bps: u64,
}

// ── Objects ───────────────────────────────────────────────────────

/// A bounty listing with escrowed SUI reward.
public struct Bounty has key, store {
    id: UID,
    creator: address,
    hunter: address,           // @0x0 when no hunter yet
    title: vector<u8>,
    description: vector<u8>,
    target: vector<u8>,        // target identifier (name, address, or item_id)
    proof: vector<u8>,         // killmail ID or other proof (set by hunter)
    reward: Balance<SUI>,
    status: u8,
    created_at: u64,
}

// ── Events ────────────────────────────────────────────────────────

public struct BountyCreated has copy, drop {
    bounty_id: ID,
    creator: address,
    reward_amount: u64,
}

public struct ClaimSubmitted has copy, drop {
    bounty_id: ID,
    hunter: address,
}

public struct ClaimApproved has copy, drop {
    bounty_id: ID,
    hunter: address,
    amount: u64,
    fee: u64,
}

public struct ClaimRejected has copy, drop {
    bounty_id: ID,
}

public struct BountyCancelled has copy, drop {
    bounty_id: ID,
}

// ── Init ─────────────────────────────────────────────────────────

/// Called once on publish. Creates the shared Platform config and
/// transfers AdminCap to the deployer.
fun init(ctx: &mut TxContext) {
    let platform = Platform {
        id: object::new(ctx),
        treasury: ctx.sender(),
        fee_bps: DEFAULT_FEE_BPS,
    };
    transfer::share_object(platform);
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

// ── Admin functions ──────────────────────────────────────────────

/// Update the treasury address (requires AdminCap).
public fun set_treasury(
    _admin: &AdminCap,
    platform: &mut Platform,
    new_treasury: address,
) {
    platform.treasury = new_treasury;
}

/// Update the fee rate in basis points (requires AdminCap, capped at 10%).
public fun set_fee_bps(
    _admin: &AdminCap,
    platform: &mut Platform,
    new_fee_bps: u64,
) {
    assert!(new_fee_bps <= MAX_FEE_BPS, EFeeTooHigh);
    platform.fee_bps = new_fee_bps;
}

// ── Public functions ──────────────────────────────────────────────

/// Create a new bounty, depositing `payment` as the escrowed reward.
public fun create_bounty(
    title: vector<u8>,
    description: vector<u8>,
    target: vector<u8>,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroReward);

    let bounty = Bounty {
        id: object::new(ctx),
        creator: ctx.sender(),
        hunter: @0x0,
        title,
        description,
        target,
        proof: vector[],
        reward: coin::into_balance(payment),
        status: STATUS_ACTIVE,
        created_at: ctx.epoch(),
    };

    event::emit(BountyCreated {
        bounty_id: object::id(&bounty),
        creator: ctx.sender(),
        reward_amount: amount,
    });

    transfer::share_object(bounty);
}

/// Hunter submits a claim with proof (e.g. killmail ID).
public fun submit_claim(
    bounty: &mut Bounty,
    proof: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_ACTIVE, EWrongStatus);

    bounty.hunter = ctx.sender();
    bounty.proof = proof;
    bounty.status = STATUS_PENDING;

    event::emit(ClaimSubmitted {
        bounty_id: object::id(bounty),
        hunter: ctx.sender(),
    });
}

/// Creator approves the claim and releases escrow to the hunter.
/// A platform fee is deducted and sent to the treasury.
public fun approve_claim(
    bounty: &mut Bounty,
    platform: &Platform,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_PENDING, EWrongStatus);
    assert!(bounty.creator == ctx.sender(), ENotCreator);

    bounty.status = STATUS_CLAIMED;

    let total = balance::value(&bounty.reward);
    let fee_amount = (total * platform.fee_bps) / BPS_DENOMINATOR;
    let hunter_amount = total - fee_amount;

    // Pay hunter
    let payment = coin::from_balance(balance::split(&mut bounty.reward, hunter_amount), ctx);
    transfer::public_transfer(payment, bounty.hunter);

    // Pay treasury fee
    if (fee_amount > 0) {
        let fee_coin = coin::from_balance(balance::split(&mut bounty.reward, fee_amount), ctx);
        transfer::public_transfer(fee_coin, platform.treasury);
    };

    event::emit(ClaimApproved {
        bounty_id: object::id(bounty),
        hunter: bounty.hunter,
        amount: hunter_amount,
        fee: fee_amount,
    });
}

/// Creator rejects a pending claim, re-opening the bounty.
public fun reject_claim(
    bounty: &mut Bounty,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_PENDING, EWrongStatus);
    assert!(bounty.creator == ctx.sender(), ENotCreator);

    bounty.hunter = @0x0;
    bounty.proof = vector[];
    bounty.status = STATUS_ACTIVE;

    event::emit(ClaimRejected {
        bounty_id: object::id(bounty),
    });
}

/// Creator cancels an active bounty and reclaims the escrowed reward.
/// Only works while no pending claim (status must be Active).
public fun cancel_bounty(
    bounty: &mut Bounty,
    ctx: &mut TxContext,
) {
    assert!(bounty.status == STATUS_ACTIVE, EWrongStatus);
    assert!(bounty.creator == ctx.sender(), ENotCreator);

    bounty.status = STATUS_CANCELLED;

    let amount = balance::value(&bounty.reward);
    let refund = coin::from_balance(balance::split(&mut bounty.reward, amount), ctx);
    transfer::public_transfer(refund, bounty.creator);

    event::emit(BountyCancelled {
        bounty_id: object::id(bounty),
    });
}

// ── View helpers ──────────────────────────────────────────────────

public fun status(b: &Bounty): u8 { b.status }
public fun creator(b: &Bounty): address { b.creator }
public fun hunter(b: &Bounty): address { b.hunter }
public fun reward_amount(b: &Bounty): u64 { balance::value(&b.reward) }
public fun title(b: &Bounty): &vector<u8> { &b.title }
public fun description(b: &Bounty): &vector<u8> { &b.description }
public fun target(b: &Bounty): &vector<u8> { &b.target }
public fun proof(b: &Bounty): &vector<u8> { &b.proof }
public fun platform_treasury(p: &Platform): address { p.treasury }
public fun platform_fee_bps(p: &Platform): u64 { p.fee_bps }
