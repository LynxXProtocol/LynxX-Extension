#![no_std]
//! EscrowContract — manages the lifecycle of an escrowed campaign.
//!
//! The contract stores its lifecycle [`Status`] in persistent storage so the
//! TTL (Time-To-Live) maintenance pattern is exercised here too: every state
//! transition rent-bumps the entry (and the contract instance/code) to a full
//! 30-day window, and querying the state recovers the entry if it was archived.
use soroban_sdk::{contract, contractimpl, contracttype, Env};
use ttl::{bump, bump_instance};

/// Status enum representing the escrow lifecycle state machine
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Deposit,
    Locked,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Persistent lifecycle state of the escrow.
    State,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Deposit funds into the escrow contract and record the lifecycle state.
    pub fn deposit(env: Env) -> Status {
        set_status(&env, Status::Deposit);
        Status::Deposit
    }

    /// Release escrowed funds to the recipient and record the lifecycle state.
    pub fn release(env: Env) -> Status {
        set_status(&env, Status::Released);
        Status::Released
    }

    /// Refund escrowed funds back to the depositor and record the lifecycle state.
    pub fn refund(env: Env) -> Status {
        set_status(&env, Status::Refunded);
        Status::Refunded
    }

    /// Read the current escrow lifecycle state, recovering it if archived.
    pub fn status(env: Env) -> Status {
        let key = DataKey::State;
        let status: Status = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Status::Deposit);
        // Any access to the escrow campaign state keeps it alive.
        bump(&env, &key);
        bump_instance(&env);
        status
    }
}

/// Persist a new escrow lifecycle state and rent-bump it.
fn set_status(env: &Env, status: Status) {
    let key = DataKey::State;
    // A fresh write starts at the minimum TTL — extend it to 30 days.
    env.storage().persistent().set(&key, &status);
    bump(env, &key);
    bump_instance(env);
}

mod test;
