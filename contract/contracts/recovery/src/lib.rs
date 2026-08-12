#![no_std]
//! LynxX Guardian Recovery — on-chain M-of-N weighted social recovery and key
//! rotation for seedless enclaves.
//!
//! A hardware-bound WebAuthn passkey (e.g. in the Apple Secure Enclave) is
//! permanently tied to a single device. If a user loses that device they cannot
//! fall back on a 12-word seed phrase, so this contract lets a set of trusted
//! **guardians** collectively rotate the account's owner key.
//!
//! The contract is the recovery authority for an account-abstraction wallet
//! (see the CustomAccountInterface work in issue #1). It stores:
//!
//! - the currently authorized owner key (`owner_key`),
//! - up to [`MAX_GUARDIANS`] guardians, each with an [`Address`], a `weight`
//!   and a [`GuardianStatus`],
//! - a weighted quorum threshold,
//! - at most one in-flight recovery challenge per account.
//!
//! # Recovery flow
//!
//! 1. [`RecoveryContract::initiate_recovery`] opens a challenge for a
//!    `new_owner_key`, stamping a 48-hour time-lock, and returns a `recovery_id`.
//!    Anyone may initiate — the intended owner has lost the old device, so they
//!    must be able to register their new key without the old signature.
//! 2. [`RecoveryContract::support_recovery`] is called by registered **active**
//!    guardians (each requiring their own auth), accumulating weighted votes.
//! 3. The owner can [`RecoveryContract::cancel_recovery`] any in-flight attempt
//!    before it executes, blocking theft/social-engineering attacks.
//! 4. When the **quorum threshold** (`weight >= quorum`) **and** the **48-hour
//!    time-lock** are both satisfied, [`RecoveryContract::execute_recovery`]
//!    rotates `owner_key` to the new key.
//!
//! After a successful execution, account-abstraction layers that read
//! [`RecoveryContract::current_owner_key`] will accept signatures produced by
//! the new key and reject the old one — no seed phrase required.
//!
//! Every state transition rent-bumps the touched entries through the shared
//! `ttl` helpers, following the repository-wide 30-day TTL maintenance
//! pattern.
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env, Vec,
};
use ttl::{bump, bump_instance};

/// Maximum number of guardians that may be registered on a single account.
pub const MAX_GUARDIANS: u32 = 5;

/// Recovery time-lock: 48 hours, expressed in ledger seconds (epoch-based
/// `ledger.timestamp()`). The recovery cannot execute before this elapses, even
/// if quorum is already reached — this is the window in which the active owner
/// can veto the attempt.
pub const RECOVERY_TIMELOCK_SECS: u64 = 48 * 60 * 60;

/// Lifecycle status of a registered guardian.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GuardianStatus {
    /// Trusted signer whose weight counts towards the recovery quorum.
    Active,
    /// Registered but not yet trusted; weight does not count towards quorum.
    Pending,
    /// No longer trusted; excluded from quorum math, kept for auditability.
    Revoked,
}

/// A single guardian entry: identity, voting weight and lifecycle status.
///
/// `address` doubles as the guardian's public identity/key — a Stellar account
/// (ed25519 `G...`), a hardware security key binding, or a guardian contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Guardian {
    pub address: Address,
    pub weight: u32,
    pub status: GuardianStatus,
}

/// An in-flight recovery challenge for a single account.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Recovery {
    pub id: u32,
    /// The public key the owner wishes to move the account to.
    pub new_owner_key: BytesN<32>,
    /// Ledger timestamp when the challenge was initiated (time-lock start).
    pub started_at: u64,
    /// Guardian addresses that have already voted.
    pub supporters: Vec<Address>,
    /// Cumulative voted weight so far.
    pub weight: u32,
    pub executed: bool,
    pub cancelled: bool,
}

#[contracttype]
pub enum DataKey {
    /// Address authorized to manage guardians, quorum and to cancel recoveries.
    Admin,
    /// The currently authorized owner signing key for this seedless account.
    OwnerKey,
    /// Weighted quorum threshold required for a recovery to succeed.
    Quorum,
    /// The full guardian set (up to `MAX_GUARDIANS`).
    Guardians,
    /// Monotonic id counter for recovery challenges.
    NextRecoveryId,
    /// Id of the single in-flight recovery challenge, if any.
    ActiveRecovery,
    /// History of every recovery challenge (persistent).
    Recovery(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    NotAdmin = 2,
    GuardianLimitExceeded = 3,
    DuplicateGuardian = 4,
    InvalidWeight = 5,
    InvalidQuorum = 6,
    GuardianNotFound = 7,
    NoActiveRecovery = 8,
    RecoveryNotFound = 9,
    AlreadyExecuted = 10,
    AlreadyCancelled = 11,
    ActiveRecoveryExists = 12,
    NotGuardian = 13,
    AlreadySupported = 14,
    NoActiveGuardians = 15,
    TimelockNotExpired = 16,
    QuorumNotReached = 17,
}

/// Emitted when a recovery challenge is opened.
#[contractevent]
#[derive(Clone)]
pub struct RecoveryInitiated {
    #[topic]
    pub id: u32,
    pub new_owner_key: BytesN<32>,
    pub started_at: u64,
}

/// Emitted when a guardian casts a weighted vote on a challenge.
#[contractevent]
#[derive(Clone)]
pub struct RecoverySupported {
    #[topic]
    pub recovery_id: u32,
    pub guardian: Address,
    pub weight: u32,
    pub total: u32,
}

/// Emitted when a guardian retracts an earlier vote.
#[contractevent]
#[derive(Clone)]
pub struct RecoveryWithdrawn {
    #[topic]
    pub recovery_id: u32,
    pub guardian: Address,
    pub weight: u32,
    pub total: u32,
}

/// Emitted when the active owner cancels a challenge.
#[contractevent]
#[derive(Clone)]
pub struct RecoveryCancelled {
    #[topic]
    pub id: u32,
}

/// Emitted when a challenge succeeds and the owner key is rotated.
#[contractevent]
#[derive(Clone)]
pub struct RecoveryExecuted {
    #[topic]
    pub id: u32,
    pub old_owner_key: BytesN<32>,
    pub new_owner_key: BytesN<32>,
}

/// Emitted when the guardian set or quorum threshold changes.
#[contractevent]
#[derive(Clone)]
pub struct GuardiansUpdated {
    pub count: u32,
    pub quorum: u32,
}

#[contract]
pub struct RecoveryContract;

#[contractimpl]
impl RecoveryContract {
    /// Initialize the recovery module for a seedless account.
    ///
    /// `admin` is the account-abstraction owner/controller authorized to manage
    /// guardians and cancel attempts. `owner_key` is the currently authorized
    /// signing key. `quorum_threshold` is the minimum weighted support required
    /// to recover (must be ≥ 1).
    pub fn __constructor(env: Env, admin: Address, owner_key: BytesN<32>, quorum_threshold: u32) {
        if quorum_threshold == 0 {
            panic!("invalid quorum threshold");
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::OwnerKey, &owner_key);
        s.set(&DataKey::Quorum, &quorum_threshold);
        s.set(&DataKey::Guardians, &Vec::<Guardian>::new(&env));
        s.set(&DataKey::NextRecoveryId, &1u32);
    }

    // ── guardian configuration (admin only) ────────────────────────────────

    /// Replace the whole guardian set and quorum threshold in one call.
    ///
    /// Enforces: at most [`MAX_GUARDIANS`] entries, unique addresses, strictly
    /// positive weights, and a quorum that the active guardian weight actually
    /// satisfies. Only the registered admin may call.
    pub fn set_guardians(
        env: Env,
        guardians: Vec<Guardian>,
        quorum_threshold: u32,
    ) -> Result<(), Error> {
        owner_only(&env)?;
        validate_guardians(&env, &guardians, quorum_threshold)?;

        let s = env.storage().instance();
        s.set(&DataKey::Guardians, &guardians.clone());
        s.set(&DataKey::Quorum, &quorum_threshold);
        bump_instance(&env);

        GuardiansUpdated {
            count: guardians.len(),
            quorum: quorum_threshold,
        }
        .publish(&env);
        Ok(())
    }

    /// Append a single guardian. Fails if the set is full or the address is
    /// already registered.
    pub fn add_guardian(env: Env, guardian: Guardian) -> Result<(), Error> {
        owner_only(&env)?;
        if guardian.weight == 0 {
            return Err(Error::InvalidWeight);
        }

        let s = env.storage().instance();
        let mut gs: Vec<Guardian> = s.get(&DataKey::Guardians).unwrap();
        if gs.len() >= MAX_GUARDIANS {
            return Err(Error::GuardianLimitExceeded);
        }
        for g in gs.iter() {
            if g.address == guardian.address {
                return Err(Error::DuplicateGuardian);
            }
        }
        gs.push_back(guardian);
        s.set(&DataKey::Guardians, &gs.clone());
        bump_instance(&env);

        let quorum: u32 = s.get(&DataKey::Quorum).unwrap();
        GuardiansUpdated {
            count: gs.len(),
            quorum,
        }
        .publish(&env);
        Ok(())
    }

    /// Remove a guardian by address. Refused while the move would drop the
    /// active guardian weight below the quorum threshold — reconfigure quorum
    /// first.
    pub fn remove_guardian(env: Env, address: Address) -> Result<(), Error> {
        owner_only(&env)?;

        let s = env.storage().instance();
        let gs: Vec<Guardian> = s.get(&DataKey::Guardians).unwrap();

        let mut updated = Vec::new(&env);
        let mut removed: Option<Guardian> = None;
        for g in gs.iter() {
            if g.address == address {
                removed = Some(g);
            } else {
                updated.push_back(g);
            }
        }
        let Some(removed) = removed else {
            return Err(Error::GuardianNotFound);
        };

        let quorum: u32 = s.get(&DataKey::Quorum).unwrap();
        if removed.status == GuardianStatus::Active {
            let active: u32 = active_weight(&updated);
            if active < quorum {
                return Err(Error::InvalidQuorum);
            }
        }

        s.set(&DataKey::Guardians, &updated.clone());
        bump_instance(&env);

        GuardiansUpdated {
            count: updated.len(),
            quorum,
        }
        .publish(&env);
        Ok(())
    }

    /// Change a guardian's voting weight (and optionally status). Refused if the
    /// change would make the quorum unsatisfiable by active guardians.
    pub fn set_guardian_meta(
        env: Env,
        address: Address,
        weight: u32,
        status: GuardianStatus,
    ) -> Result<(), Error> {
        owner_only(&env)?;
        if weight == 0 {
            return Err(Error::InvalidWeight);
        }

        let s = env.storage().instance();
        let gs: Vec<Guardian> = s.get(&DataKey::Guardians).unwrap();
        let mut found = false;
        let mut updated = Vec::new(&env);
        for g in gs.iter() {
            if g.address == address {
                updated.push_back(Guardian {
                    address: g.address,
                    weight,
                    status,
                });
                found = true;
            } else {
                updated.push_back(g);
            }
        }
        if !found {
            return Err(Error::GuardianNotFound);
        }

        let quorum: u32 = s.get(&DataKey::Quorum).unwrap();
        if active_weight(&updated) < quorum {
            return Err(Error::InvalidQuorum);
        }

        s.set(&DataKey::Guardians, &updated.clone());
        bump_instance(&env);

        GuardiansUpdated {
            count: updated.len(),
            quorum,
        }
        .publish(&env);
        Ok(())
    }

    /// Change the weighted quorum threshold required to execute a recovery.
    /// Must stay within `1 ..= active guardian weight`.
    pub fn set_quorum_threshold(env: Env, quorum_threshold: u32) -> Result<(), Error> {
        owner_only(&env)?;

        let s = env.storage().instance();
        let gs: Vec<Guardian> = s.get(&DataKey::Guardians).unwrap();
        if quorum_threshold == 0 || quorum_threshold > active_weight(&gs) {
            return Err(Error::InvalidQuorum);
        }

        s.set(&DataKey::Quorum, &quorum_threshold);
        bump_instance(&env);

        GuardiansUpdated {
            count: gs.len(),
            quorum: quorum_threshold,
        }
        .publish(&env);
        Ok(())
    }

    // ── recovery lifecycle ─────────────────────────────────────────────────

    /// Open a recovery challenge for `new_owner_key`.
    ///
    /// Anyone may call — the legitimate owner has lost the old device and cannot
    /// sign with it. Only one challenge may be in flight at a time. The returned
    /// id is the handle guardians use to vote and the account uses to execute.
    pub fn initiate_recovery(env: Env, new_owner_key: BytesN<32>) -> Result<u32, Error> {
        let s = env.storage().instance();

        if s.get::<DataKey, u32>(&DataKey::ActiveRecovery).is_some() {
            return Err(Error::ActiveRecoveryExists);
        }

        let gs: Vec<Guardian> = s.get(&DataKey::Guardians).unwrap();
        if active_weight(&gs) == 0 {
            return Err(Error::NoActiveGuardians);
        }

        let id: u32 = s.get(&DataKey::NextRecoveryId).unwrap();
        s.set(&DataKey::NextRecoveryId, &(id + 1));

        let started_at = env.ledger().timestamp();
        let rec = Recovery {
            id,
            new_owner_key: new_owner_key.clone(),
            started_at,
            supporters: Vec::new(&env),
            weight: 0,
            executed: false,
            cancelled: false,
        };

        let rkey = DataKey::Recovery(id);
        env.storage().persistent().set(&rkey, &rec);
        bump(&env, &rkey);
        s.set(&DataKey::ActiveRecovery, &id);
        bump_instance(&env);

        RecoveryInitiated {
            id,
            new_owner_key,
            started_at,
        }
        .publish(&env);
        Ok(id)
    }

    /// Cast a weighted vote on an in-flight challenge. Each active guardian can
    /// vote once; the accumulated weight is checked against the quorum by
    /// [`execute_recovery`].
    pub fn support_recovery(env: Env, recovery_id: u32, guardian: Address) -> Result<u32, Error> {
        guardian.require_auth();

        let s = env.storage().instance();
        let gs: Vec<Guardian> = s.get(&DataKey::Guardians).unwrap();
        let mut weight = 0;
        let mut is_guardian = false;
        for g in gs.iter() {
            if g.address == guardian && g.status == GuardianStatus::Active {
                weight = g.weight;
                is_guardian = true;
            }
        }
        if !is_guardian {
            return Err(Error::NotGuardian);
        }

        let mut rec = load_recovery(&env, recovery_id)?;
        if rec.executed {
            return Err(Error::AlreadyExecuted);
        }
        if rec.cancelled {
            return Err(Error::AlreadyCancelled);
        }

        for sup in rec.supporters.iter() {
            if sup == guardian {
                return Err(Error::AlreadySupported);
            }
        }
        rec.supporters.push_back(guardian.clone());
        rec.weight += weight;

        persist_recovery(&env, &rec);

        RecoverySupported {
            recovery_id,
            guardian,
            weight,
            total: rec.weight,
        }
        .publish(&env);
        Ok(rec.weight)
    }

    /// Retract an earlier vote (guardian error-correction). The challenge may be
    /// supported again afterwards.
    pub fn withdraw_support(env: Env, recovery_id: u32, guardian: Address) -> Result<u32, Error> {
        guardian.require_auth();

        let mut rec = load_recovery(&env, recovery_id)?;
        if rec.executed {
            return Err(Error::AlreadyExecuted);
        }
        if rec.cancelled {
            return Err(Error::AlreadyCancelled);
        }

        let mut new_supporters = Vec::new(&env);
        let mut removed = false;
        let mut removed_weight = 0u32;
        for sup in rec.supporters.iter() {
            if sup == guardian {
                removed = true;
                removed_weight = guardian_weight(&env, &guardian);
            } else {
                new_supporters.push_back(sup);
            }
        }
        if !removed {
            return Err(Error::NotGuardian);
        }

        rec.supporters = new_supporters;
        rec.weight = rec.weight.saturating_sub(removed_weight);
        persist_recovery(&env, &rec);

        RecoveryWithdrawn {
            recovery_id,
            guardian,
            weight: removed_weight,
            total: rec.weight,
        }
        .publish(&env);
        Ok(rec.weight)
    }

    /// Veto and close an in-flight challenge. Only the registered admin (the
    /// active owner/controller) may do this. Safe to call at any point before
    /// execution — that is the core theft-defense for the 48-hour window.
    pub fn cancel_recovery(env: Env) -> Result<u32, Error> {
        owner_only(&env)?;

        let s = env.storage().instance();
        let Some(id) = s.get::<DataKey, u32>(&DataKey::ActiveRecovery) else {
            return Err(Error::NoActiveRecovery);
        };

        let mut rec = load_recovery(&env, id)?;
        if rec.executed {
            return Err(Error::AlreadyExecuted);
        }
        if rec.cancelled {
            return Err(Error::AlreadyCancelled);
        }

        rec.cancelled = true;
        persist_recovery(&env, &rec);
        set_active_recovery(&env, None);
        bump_instance(&env);

        RecoveryCancelled { id }.publish(&env);
        Ok(id)
    }

    /// Execute an approved challenge: rotates the owner key.
    ///
    /// Succeeds only when **both** conditions hold:
    /// - the accumulated vote `weight` reaches the configured quorum, **and**
    /// - the 48-hour time-lock has elapsed since initiation.
    ///
    /// Anyone may push this through once both are met (relayers included).
    pub fn execute_recovery(env: Env, recovery_id: u32) -> Result<u32, Error> {
        let s = env.storage().instance();

        let Some(active_id) = s.get::<DataKey, u32>(&DataKey::ActiveRecovery) else {
            // No challenge is in flight. Only a cancelled challenge has a
            // terminal state worth reporting; executed or unknown ids are not
            // executable.
            if load_recovery(&env, recovery_id)?.cancelled {
                return Err(Error::AlreadyCancelled);
            }
            return Err(Error::RecoveryNotFound);
        };
        if active_id != recovery_id {
            return Err(Error::RecoveryNotFound);
        }

        let mut rec = load_recovery(&env, recovery_id)?;
        if rec.executed {
            return Err(Error::AlreadyExecuted);
        }
        if rec.cancelled {
            return Err(Error::AlreadyCancelled);
        }

        let quorum: u32 = s.get(&DataKey::Quorum).unwrap();
        if rec.weight < quorum {
            return Err(Error::QuorumNotReached);
        }

        let now = env.ledger().timestamp();
        if now <= rec.started_at.saturating_add(RECOVERY_TIMELOCK_SECS) {
            return Err(Error::TimelockNotExpired);
        }

        let old_owner_key: BytesN<32> = s.get(&DataKey::OwnerKey).unwrap();
        rec.executed = true;
        persist_recovery(&env, &rec);

        // Ownership hand-off: the new key becomes authoritative. From this
        // moment account layers must accept signatures by `new_owner_key` and
        // reject the old one.
        s.set(&DataKey::OwnerKey, &rec.new_owner_key);
        set_active_recovery(&env, None);
        bump_instance(&env);

        RecoveryExecuted {
            id: recovery_id,
            old_owner_key,
            new_owner_key: rec.new_owner_key,
        }
        .publish(&env);
        Ok(recovery_id)
    }

    // ── read-only views ────────────────────────────────────────────────────

    /// The address authorized to manage guardians and cancel recoveries.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    /// The currently authorized owner signing key.
    pub fn current_owner_key(env: Env) -> BytesN<32> {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::OwnerKey).unwrap()
    }

    /// The weighted quorum threshold required to execute a recovery.
    pub fn quorum_threshold(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Quorum).unwrap()
    }

    /// The full registered guardian set.
    pub fn guardians(env: Env) -> Vec<Guardian> {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::Guardians).unwrap()
    }

    /// A single guardian entry, if registered.
    pub fn guardian(env: Env, address: Address) -> Option<Guardian> {
        env.storage()
            .instance()
            .get::<DataKey, Vec<Guardian>>(&DataKey::Guardians)
            .unwrap()
            .iter()
            .find(|g| g.address == address)
    }

    /// The id of the challenge currently in flight, if any.
    pub fn active_recovery(env: Env) -> Option<u32> {
        env.storage()
            .instance()
            .get::<DataKey, u32>(&DataKey::ActiveRecovery)
    }

    /// Full state of a (past or in-flight) recovery challenge, if it exists.
    pub fn recovery(env: Env, recovery_id: u32) -> Option<Recovery> {
        load_recovery(&env, recovery_id).ok()
    }
}

// ── helpers ────────────────────────────────────────────────────────────────

/// Require the registered admin to authorize the call.
fn owner_only(env: &Env) -> Result<(), Error> {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    admin.require_auth();
    Ok(())
}

/// Sum of the weights of [`GuardianStatus::Active`] guardians.
fn active_weight(gs: &Vec<Guardian>) -> u32 {
    let mut total = 0u32;
    for g in gs.iter() {
        if g.status == GuardianStatus::Active {
            total += g.weight;
        }
    }
    total
}

/// The stored weight of a guardian (0 if not registered / not active). Used to
/// correctly subtract a vote on withdraw.
fn guardian_weight(env: &Env, address: &Address) -> u32 {
    let gs: Vec<Guardian> = env.storage().instance().get(&DataKey::Guardians).unwrap();
    for g in gs.iter() {
        if &g.address == address {
            return g.weight;
        }
    }
    0
}

/// Validate a proposed guardian set + quorum: size, uniqueness, positive
/// weights and a quorum the active weight actually satisfies.
fn validate_guardians(env: &Env, gs: &Vec<Guardian>, quorum: u32) -> Result<(), Error> {
    if quorum == 0 {
        return Err(Error::InvalidQuorum);
    }
    if gs.len() > MAX_GUARDIANS {
        return Err(Error::GuardianLimitExceeded);
    }

    let mut seen = Vec::new(env);
    let mut active = 0u32;
    for g in gs.iter() {
        if g.weight == 0 {
            return Err(Error::InvalidWeight);
        }
        for p in seen.iter() {
            if p == g.address {
                return Err(Error::DuplicateGuardian);
            }
        }
        seen.push_back(g.address.clone());
        if g.status == GuardianStatus::Active {
            active += g.weight;
        }
    }

    if active < quorum {
        return Err(Error::InvalidQuorum);
    }
    Ok(())
}

fn load_recovery(env: &Env, id: u32) -> Result<Recovery, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Recovery(id))
        .ok_or(Error::RecoveryNotFound)
}

fn persist_recovery(env: &Env, rec: &Recovery) {
    let rkey = DataKey::Recovery(rec.id);
    env.storage().persistent().set(&rkey, rec);
    bump(env, &rkey);
    bump_instance(env);
}

fn set_active_recovery(env: &Env, id: Option<u32>) {
    match id {
        Some(id) => env.storage().instance().set(&DataKey::ActiveRecovery, &id),
        None => env.storage().instance().remove(&DataKey::ActiveRecovery),
    }
}

mod test;
