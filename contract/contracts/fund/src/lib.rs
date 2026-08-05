#![no_std]
//! StellarFund — a minimal on-chain crowdfunding campaign.
//!
//! Donors send a Stellar asset (the native XLM SAC on testnet) into the
//! contract. The contract records the cumulative amount raised, the number of
//! unique donors, and each donor's running total. The campaign beneficiary
//! (`owner`) can withdraw the collected funds at any time.
use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, Env,
};
use ttl::{bump, bump_instance};

/// Minimal client interface for the companion DonorBadge contract. Lets
/// StellarFund make a typed cross-contract call without depending on the badge
/// crate directly. See `contracts/badge` for the implementation.
#[contractclient(name = "BadgeClient")]
pub trait Badge {
    fn award(env: Env, donor: Address, total: i128) -> u32;
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,                 // beneficiary who can withdraw
    Token,                 // SAC address of the asset being collected
    Goal,                  // fundraising target (in stroops)
    Raised,                // cumulative amount raised (monotonic, for progress)
    Donors,                // count of unique donors
    Closed,                // true once the goal has been reached
    Badge,                 // optional DonorBadge contract for cross-contract awards
    Contribution(Address), // per-donor running total
    Deadline,              // campaign expiry (u64 timestamp)
    Milestones,            // list of targets for milestone-based withdrawal
    AmountWithdrawn,       // how much has been withdrawn so far
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ZeroAmount = 1,          // donation amount must be positive
    CampaignClosed = 2,      // goal already reached, no more donations
    NothingRaised = 3,       // withdraw called with an empty balance
    CampaignExpired = 4,     // donation after deadline
    CampaignNotExpired = 5,  // refund before deadline
    NoContribution = 6,      // refund with zero contribution
    MilestoneNotReached = 7, // withdraw called but no new milestone reached
}

/// Emitted on every successful donation.
#[contractevent]
#[derive(Clone)]
pub struct Donated {
    #[topic]
    pub from: Address,
    pub amount: i128,
    pub total: i128,
}

/// Emitted when the beneficiary withdraws collected funds.
#[contractevent]
#[derive(Clone)]
pub struct Withdrawn {
    #[topic]
    pub owner: Address,
    pub amount: i128,
}

/// Emitted when a donor reclaims their funds from a failed campaign.
#[contractevent]
#[derive(Clone)]
pub struct Refunded {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contract]
pub struct FundContract;

#[contractimpl]
impl FundContract {
    /// Initialize the campaign at deploy time.
    pub fn __constructor(
        env: Env,
        owner: Address,
        token: Address,
        goal: i128,
        deadline: u64,
        milestones: soroban_sdk::Vec<i128>,
    ) {
        let s = env.storage().instance();
        s.set(&DataKey::Owner, &owner);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Goal, &goal);
        s.set(&DataKey::Raised, &0i128);
        s.set(&DataKey::Donors, &0u32);
        s.set(&DataKey::Closed, &false);
        s.set(&DataKey::Deadline, &deadline);
        s.set(&DataKey::Milestones, &milestones);
        s.set(&DataKey::AmountWithdrawn, &0i128);
    }

    /// Donate `amount` of the campaign token. Pulls funds from `from` into the
    /// contract, so `from` must authorize the call. Returns the new total raised.
    pub fn donate(env: Env, from: Address, amount: i128) -> Result<i128, Error> {
        from.require_auth();

        if amount <= 0 {
            return Err(Error::ZeroAmount);
        }

        let s = env.storage().instance();

        let deadline: u64 = s.get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() > deadline {
            return Err(Error::CampaignExpired);
        }

        let closed: bool = s.get(&DataKey::Closed).unwrap();
        if closed {
            return Err(Error::CampaignClosed);
        }

        // Move the asset from the donor into the contract.
        let token: Address = s.get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(&from, env.current_contract_address(), &amount);

        // Update cumulative total.
        let mut raised: i128 = s.get(&DataKey::Raised).unwrap();
        raised += amount;
        s.set(&DataKey::Raised, &raised);

        // Track per-donor contribution and unique-donor count.
        let key = DataKey::Contribution(from.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if prev == 0 {
            let donors: u32 = s.get(&DataKey::Donors).unwrap();
            s.set(&DataKey::Donors, &(donors + 1));
        }
        let donor_total = prev + amount;
        env.storage().persistent().set(&key, &donor_total);

        // Every donation touches the campaign state — rent-bump the contract
        // instance/code and the donor's contribution so nothing expires under
        // an active campaign.
        bump(&env, &key);
        bump_instance(&env);

        // Inter-contract communication: if a DonorBadge contract is registered,
        // call it to award/upgrade this donor's loyalty tier from their running
        // total. The call is best-effort relative to the donation itself, but
        // because it shares the same transaction it is atomic — if the badge
        // contract panics, the whole donation reverts.
        if let Some(badge) = s.get::<DataKey, Address>(&DataKey::Badge) {
            BadgeClient::new(&env, &badge).award(&from, &donor_total);
        }

        // Close the campaign once the goal is met.
        let goal: i128 = s.get(&DataKey::Goal).unwrap();
        if raised >= goal {
            s.set(&DataKey::Closed, &true);
        }

        Donated {
            from,
            amount,
            total: raised,
        }
        .publish(&env);
        Ok(raised)
    }

    /// Register the companion DonorBadge contract. Owner-only. Once set, every
    /// donation triggers a cross-contract `award` call on the badge contract.
    pub fn set_badge(env: Env, badge: Address) {
        let s = env.storage().instance();
        let owner: Address = s.get(&DataKey::Owner).unwrap();
        owner.require_auth();
        s.set(&DataKey::Badge, &badge);
        bump_instance(&env);
    }

    /// Withdraw collected funds based on reached milestones. Only the owner can call.
    pub fn withdraw_milestone(env: Env) -> Result<i128, Error> {
        let s = env.storage().instance();
        let owner: Address = s.get(&DataKey::Owner).unwrap();
        owner.require_auth();

        let raised: i128 = s.get(&DataKey::Raised).unwrap();
        let milestones: soroban_sdk::Vec<i128> = s.get(&DataKey::Milestones).unwrap();
        let amount_withdrawn: i128 = s.get(&DataKey::AmountWithdrawn).unwrap_or(0);

        // Find the highest milestone amount that has been reached
        let mut unlocked_amount: i128 = 0;
        for m in milestones {
            if raised >= m && m > unlocked_amount {
                unlocked_amount = m;
            }
        }

        let withdrawable = unlocked_amount - amount_withdrawn;
        if withdrawable <= 0 {
            return Err(Error::MilestoneNotReached);
        }

        let token: Address = s.get(&DataKey::Token).unwrap();
        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &owner, &withdrawable);

        s.set(
            &DataKey::AmountWithdrawn,
            &(amount_withdrawn + withdrawable),
        );
        bump_instance(&env);

        Withdrawn {
            owner,
            amount: withdrawable,
        }
        .publish(&env);
        Ok(withdrawable)
    }

    /// Refund a donor's contribution if the campaign failed to reach its goal by the deadline.
    pub fn refund(env: Env, donor: Address) -> Result<i128, Error> {
        donor.require_auth();

        let s = env.storage().instance();

        let deadline: u64 = s.get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() <= deadline {
            return Err(Error::CampaignNotExpired);
        }

        let closed: bool = s.get(&DataKey::Closed).unwrap();
        if closed {
            return Err(Error::CampaignClosed); // Goal was reached, no refunds
        }

        let key = DataKey::Contribution(donor.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if prev <= 0 {
            return Err(Error::NoContribution);
        }

        // Zero out contribution
        env.storage().persistent().set(&key, &0i128);
        bump(&env, &key);

        // Subtract from total raised
        let mut raised: i128 = s.get(&DataKey::Raised).unwrap();
        raised -= prev;
        s.set(&DataKey::Raised, &raised);
        bump_instance(&env);

        // Refund the token
        let token: Address = s.get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(&env.current_contract_address(), &donor, &prev);

        Refunded {
            to: donor,
            amount: prev,
        }
        .publish(&env);
        Ok(prev)
    }

    // ── read-only views ──
    pub fn goal(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Goal).unwrap()
    }
    pub fn raised(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Raised).unwrap()
    }
    pub fn donors(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Donors).unwrap()
    }
    pub fn owner(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }
    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }
    pub fn is_closed(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Closed).unwrap()
    }
    pub fn badge(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Badge)
    }
    pub fn contribution(env: Env, who: Address) -> i128 {
        let key = DataKey::Contribution(who);
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if current > 0 {
            // Reading a donor's contribution keeps their entry alive.
            bump(&env, &key);
        }
        current
    }
    pub fn deadline(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Deadline).unwrap()
    }
}

mod test;
