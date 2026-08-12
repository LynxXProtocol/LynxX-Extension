#![no_std]
//! DonorBadge — a companion contract to StellarFund.
//!
//! StellarFund calls [`BadgeContract::award`] on every successful donation.
//! This contract assigns each donor a loyalty **tier** derived from their
//! cumulative contribution (Bronze / Silver / Gold) and tracks how many unique
//! donors have minted a badge. Only the registered fund contract is allowed to
//! call `award` — this is the trust boundary for the cross-contract call.
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env,
};
use ttl::{bump, bump_instance};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,         // the StellarFund contract authorized to call `award`
    Tier(Address), // current badge tier per donor (1=Bronze, 2=Silver, 3=Gold)
    Minted,        // count of unique donors who have earned a badge
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    ProofMismatch = 2,
}

/// Emitted whenever a donor's tier increases.
#[contractevent]
#[derive(Clone)]
pub struct BadgeAwarded {
    #[topic]
    pub donor: Address,
    pub tier: u32,
    pub total: i128,
}

/// Emitted when an archived badge is restored from archival proof data.
#[contractevent]
#[derive(Clone)]
pub struct BadgeRestored {
    #[topic]
    pub donor: Address,
    pub tier: u32,
}

#[contract]
pub struct BadgeContract;

// Tier thresholds, in stroops (1 XLM = 10_000_000 stroops).
const BRONZE: i128 = 10_000_000; //   ≥ 1 XLM
const SILVER: i128 = 100_000_000; //  ≥ 10 XLM
const GOLD: i128 = 1_000_000_000; //  ≥ 100 XLM

/// Map a cumulative contribution to a tier number (0 = none).
fn tier_for(total: i128) -> u32 {
    if total >= GOLD {
        3
    } else if total >= SILVER {
        2
    } else if total >= BRONZE {
        1
    } else {
        0
    }
}

#[contractimpl]
impl BadgeContract {
    /// Register the StellarFund contract that is permitted to award badges.
    pub fn __constructor(env: Env, admin: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Minted, &0u32);
    }

    /// Award (or upgrade) a donor's badge based on their cumulative `total`.
    ///
    /// Called cross-contract by StellarFund after each donation. The fund
    /// contract's own address must authorize the call (`require_auth`), which
    /// Soroban satisfies automatically for the contract making the invocation —
    /// so no external party can forge badges. Returns the donor's current tier.
    pub fn award(env: Env, donor: Address, total: i128) -> u32 {
        let s = env.storage().instance();
        let admin: Address = s.get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // Every write touches the contract instance (Admin/Minted) and code —
        // rent-bump them so the badge contract itself never expires.
        bump_instance(&env);

        let new_tier = tier_for(total);
        let key = DataKey::Tier(donor.clone());
        let prev: u32 = env.storage().persistent().get(&key).unwrap_or(0);

        if new_tier > prev {
            if prev == 0 {
                let minted: u32 = s.get(&DataKey::Minted).unwrap();
                s.set(&DataKey::Minted, &(minted + 1));
            }
            env.storage().persistent().set(&key, &new_tier);
            // A fresh write starts at the minimum TTL — extend it to 30 days.
            bump(&env, &key);
            BadgeAwarded {
                donor,
                tier: new_tier,
                total,
            }
            .publish(&env);
            new_tier
        } else {
            // Tiers never downgrade. The donor's badge was still read this
            // transaction, so keep it from expiring under an active donor. If
            // the donor has never earned a badge (prev == 0) there is no entry
            // to bump — extending a missing key would raise Storage/MissingValue.
            if prev > 0 {
                bump(&env, &key);
            }
            prev
        }
    }

    /// Restore a donor's badge that has been archived after its TTL lapsed.
    ///
    /// Soroban archives inactive persistent entries, which makes the badge
    /// unreadable until it is restored. Archival is not deletion: the archived
    /// entry retains its value, so the historical Bronze/Silver/Gold tier can be
    /// recovered. `expected_tier` is the **verifiable archival proof data** — the
    /// restored tier must match the tier already stored for `user_id`, so a
    /// caller can never forge a higher tier than the one the donor historically
    /// earned. Anyone may call this (donors directly, or a relayer on their
    /// behalf); the cost is a single rent bump, far below 0.0001 XLM.
    pub fn restore_badge(env: Env, user_id: Address, expected_tier: u32) -> Result<u32, Error> {
        let key = DataKey::Tier(user_id.clone());
        let stored: u32 = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotInitialized)?;

        if stored != expected_tier {
            return Err(Error::ProofMismatch);
        }

        // Protocol 23 auto-restores the archived entry on access; give the
        // recovered state a full 30-day rental window so it stays live.
        bump(&env, &key);
        bump_instance(&env);

        BadgeRestored {
            donor: user_id,
            tier: stored,
        }
        .publish(&env);

        Ok(stored)
    }

    // ── read-only views ──
    /// The current tier for `who` (0 if they have never donated).
    ///
    /// Accessing a badge query keeps the entry alive: if the remaining TTL is
    /// below 14 days (or the entry was archived and auto-restored), it is
    /// extended to 30 days.
    pub fn tier(env: Env, who: Address) -> u32 {
        let key = DataKey::Tier(who);
        let current: u32 = env.storage().persistent().get(&key).unwrap_or(0);
        if current > 0 {
            bump(&env, &key);
            bump_instance(&env);
        }
        current
    }
    /// Total number of unique donors that have earned a badge.
    pub fn minted(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Minted).unwrap()
    }
    /// The fund contract authorized to award badges.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }
}

mod test;
