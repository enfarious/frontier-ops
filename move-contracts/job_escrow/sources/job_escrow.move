/// Job Escrow — trustless job board with SUI escrow and configurable platform fee.
///
/// Supports two modes:
///   **Assigned** (competitive = false): One worker accepts → completes → gets paid.
///   **Competitive** (competitive = true): Multiple workers race to deliver.
///     First to mark_complete wins. Others see the job as done.
///
/// Flow (assigned):
///   1. Creator calls `create_job` — deposits SUI reward into a shared Job object.
///   2. Worker calls `accept_job` — locks the job to that worker.
///   3. Worker calls `mark_complete` — signals work is done.
///   4. Creator calls `approve_and_pay` — releases escrowed SUI to the worker (minus fee).
///
/// Flow (competitive):
///   1. Creator calls `create_competitive_job` — deposits SUI, sets competitive = true.
///   2. Workers call `accept_job` — added to contestants list, job stays Open.
///   3. First worker to call `mark_complete` wins — locks as THE worker, status → Completed.
///   4. Creator calls `approve_and_pay` — releases escrowed SUI to the winner (minus fee).
///
/// Either party can `dispute` to flag the job (future: arbitration).
/// Creator can `cancel_job` only while the job is still Open (no worker assigned / no completions).
/// Admin can update treasury address and fee rate via AdminCap.
module job_escrow::job_escrow;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::event;

// ── Status constants ──────────────────────────────────────────────
const STATUS_OPEN: u8 = 0;
const STATUS_ACCEPTED: u8 = 1;
const STATUS_COMPLETED: u8 = 2;
const STATUS_PAID: u8 = 3;
const STATUS_CANCELLED: u8 = 4;
const STATUS_DISPUTED: u8 = 5;

// ── Defaults ────────────────────────────────────────────────────
const DEFAULT_FEE_BPS: u64 = 250;       // 2.5%
const BPS_DENOMINATOR: u64 = 10000;
const MAX_FEE_BPS: u64 = 1000;          // cap at 10%

// ── Error codes ───────────────────────────────────────────────────
const ENotCreator: u64 = 0;
const ENotWorker: u64 = 1;
const EWrongStatus: u64 = 2;
const EZeroReward: u64 = 3;
const EFeeTooHigh: u64 = 4;
const EAlreadyContestant: u64 = 5;
const ENotContestant: u64 = 6;

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

/// A job listing with escrowed SUI reward.
public struct Job has key, store {
    id: UID,
    creator: address,
    worker: address,              // @0x0 until assigned/winner chosen
    title: vector<u8>,
    description: vector<u8>,
    reward: Balance<SUI>,
    status: u8,
    created_at: u64,
    competitive: bool,            // true = race mode, multiple contestants
    contestants: vector<address>, // workers who accepted (competitive only)
}

// ── Events ────────────────────────────────────────────────────────

public struct JobCreated has copy, drop {
    job_id: ID,
    creator: address,
    reward_amount: u64,
    competitive: bool,
}

public struct JobAccepted has copy, drop {
    job_id: ID,
    worker: address,
}

public struct JobCompleted has copy, drop {
    job_id: ID,
    worker: address,
}

public struct JobPaid has copy, drop {
    job_id: ID,
    worker: address,
    amount: u64,
    fee: u64,
}

public struct JobCancelled has copy, drop {
    job_id: ID,
}

public struct JobDisputed has copy, drop {
    job_id: ID,
    by: address,
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

/// Create a new assigned job (single worker). Deposits `payment` as escrow.
public fun create_job(
    title: vector<u8>,
    description: vector<u8>,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
    create_job_internal(title, description, payment, false, ctx);
}

/// Create a new competitive job (race mode). Multiple workers can accept;
/// first to mark_complete wins the reward.
public fun create_competitive_job(
    title: vector<u8>,
    description: vector<u8>,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
    create_job_internal(title, description, payment, true, ctx);
}

/// Internal constructor shared by both job types.
fun create_job_internal(
    title: vector<u8>,
    description: vector<u8>,
    payment: Coin<SUI>,
    competitive: bool,
    ctx: &mut TxContext,
) {
    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroReward);

    let job = Job {
        id: object::new(ctx),
        creator: ctx.sender(),
        worker: @0x0,
        title,
        description,
        reward: coin::into_balance(payment),
        status: STATUS_OPEN,
        created_at: ctx.epoch(),
        competitive,
        contestants: vector::empty(),
    };

    event::emit(JobCreated {
        job_id: object::id(&job),
        creator: ctx.sender(),
        reward_amount: amount,
        competitive,
    });

    transfer::share_object(job);
}

/// Accept a job.
///   - Assigned mode: locks sender as the sole worker, status → Accepted.
///   - Competitive mode: adds sender to contestants list, status stays Open.
public fun accept_job(
    job: &mut Job,
    ctx: &mut TxContext,
) {
    let sender = ctx.sender();

    if (job.competitive) {
        // Competitive: job must be Open, add to contestants
        assert!(job.status == STATUS_OPEN, EWrongStatus);
        // Don't allow duplicate entries
        assert!(!vector::contains(&job.contestants, &sender), EAlreadyContestant);
        vector::push_back(&mut job.contestants, sender);
        // Status stays OPEN — others can still join
    } else {
        // Assigned: lock single worker
        assert!(job.status == STATUS_OPEN, EWrongStatus);
        job.worker = sender;
        job.status = STATUS_ACCEPTED;
    };

    event::emit(JobAccepted {
        job_id: object::id(job),
        worker: sender,
    });
}

/// Worker marks the job as complete.
///   - Assigned mode: only the locked worker can call. Status → Completed.
///   - Competitive mode: any contestant can call. First caller wins —
///     they become THE worker and status → Completed. Others are too late.
public fun mark_complete(
    job: &mut Job,
    ctx: &mut TxContext,
) {
    let sender = ctx.sender();

    if (job.competitive) {
        // Competitive: must be Open (first completer wins)
        assert!(job.status == STATUS_OPEN, EWrongStatus);
        assert!(vector::contains(&job.contestants, &sender), ENotContestant);
        // Winner!
        job.worker = sender;
        job.status = STATUS_COMPLETED;
    } else {
        // Assigned: normal flow
        assert!(job.status == STATUS_ACCEPTED, EWrongStatus);
        assert!(job.worker == sender, ENotWorker);
        job.status = STATUS_COMPLETED;
    };

    event::emit(JobCompleted {
        job_id: object::id(job),
        worker: sender,
    });
}

/// Creator approves the work and releases escrow to the worker.
/// A platform fee is deducted and sent to the treasury.
public fun approve_and_pay(
    job: &mut Job,
    platform: &Platform,
    ctx: &mut TxContext,
) {
    assert!(job.status == STATUS_COMPLETED, EWrongStatus);
    assert!(job.creator == ctx.sender(), ENotCreator);

    job.status = STATUS_PAID;

    let total = balance::value(&job.reward);
    let fee_amount = (total * platform.fee_bps) / BPS_DENOMINATOR;
    let worker_amount = total - fee_amount;

    // Pay worker
    let payment = coin::from_balance(balance::split(&mut job.reward, worker_amount), ctx);
    transfer::public_transfer(payment, job.worker);

    // Pay treasury fee
    if (fee_amount > 0) {
        let fee_coin = coin::from_balance(balance::split(&mut job.reward, fee_amount), ctx);
        transfer::public_transfer(fee_coin, platform.treasury);
    };

    event::emit(JobPaid {
        job_id: object::id(job),
        worker: job.worker,
        amount: worker_amount,
        fee: fee_amount,
    });
}

/// Creator cancels an open job and reclaims the escrowed reward.
/// Only works while the job is still Open (no worker assigned in assigned mode,
/// or no one has completed yet in competitive mode).
public fun cancel_job(
    job: &mut Job,
    ctx: &mut TxContext,
) {
    assert!(job.status == STATUS_OPEN, EWrongStatus);
    assert!(job.creator == ctx.sender(), ENotCreator);

    job.status = STATUS_CANCELLED;

    let amount = balance::value(&job.reward);
    let refund = coin::from_balance(balance::split(&mut job.reward, amount), ctx);
    transfer::public_transfer(refund, job.creator);

    event::emit(JobCancelled {
        job_id: object::id(job),
    });
}

/// Contestant withdraws from a competitive job before it's completed.
/// Lets workers bow out of a race they don't want to finish.
public fun withdraw_from_job(
    job: &mut Job,
    ctx: &mut TxContext,
) {
    assert!(job.competitive, EWrongStatus);
    assert!(job.status == STATUS_OPEN, EWrongStatus);
    let sender = ctx.sender();
    let (found, idx) = vector::index_of(&job.contestants, &sender);
    assert!(found, ENotContestant);
    vector::remove(&mut job.contestants, idx);
}

/// Either creator or worker can flag a dispute.
/// (Future: hook up arbitration / DAO vote.)
public fun dispute(
    job: &mut Job,
    ctx: &mut TxContext,
) {
    assert!(
        job.status == STATUS_ACCEPTED || job.status == STATUS_COMPLETED,
        EWrongStatus,
    );
    let sender = ctx.sender();
    assert!(sender == job.creator || sender == job.worker, ENotCreator);

    job.status = STATUS_DISPUTED;

    event::emit(JobDisputed {
        job_id: object::id(job),
        by: sender,
    });
}

// ── View helpers (for off-chain reads) ────────────────────────────

public fun status(job: &Job): u8 { job.status }
public fun creator(job: &Job): address { job.creator }
public fun worker(job: &Job): address { job.worker }
public fun reward_amount(job: &Job): u64 { balance::value(&job.reward) }
public fun title(job: &Job): &vector<u8> { &job.title }
public fun description(job: &Job): &vector<u8> { &job.description }
public fun is_competitive(job: &Job): bool { job.competitive }
public fun contestants(job: &Job): &vector<address> { &job.contestants }
public fun contestant_count(job: &Job): u64 { vector::length(&job.contestants) }
public fun platform_treasury(p: &Platform): address { p.treasury }
public fun platform_fee_bps(p: &Platform): u64 { p.fee_bps }
