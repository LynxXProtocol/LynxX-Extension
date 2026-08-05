#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Ledger as _},
    Env,
};

fn setup<'a>() -> (Env, EscrowContractClient<'a>) {
    let env = Env::default();
    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &contract_id);
    (env, client)
}

#[test]
fn test_escrow_status_enum_and_placeholders() {
    let (_env, client) = setup();

    // Verify placeholder function execution and return values
    assert_eq!(client.deposit(), Status::Deposit);
    assert_eq!(client.release(), Status::Released);
    assert_eq!(client.refund(), Status::Refunded);
}

#[test]
fn test_status_enum_variants() {
    assert_eq!(Status::Deposit as u32, 0);
    assert_eq!(Status::Locked as u32, 1);
    assert_eq!(Status::Released as u32, 2);
    assert_eq!(Status::Refunded as u32, 3);
}

#[test]
fn test_status_persists_through_lifecycle() {
    let (_env, client) = setup();

    client.deposit();
    assert_eq!(client.status(), Status::Deposit);

    client.release();
    assert_eq!(client.status(), Status::Released);

    client.refund();
    assert_eq!(client.status(), Status::Refunded);
}

/// Every escrow state write must rent-bump the persistent state to the full
/// 30-day TTL window.
#[test]
fn test_state_write_bumps_ttl() {
    let (env, client) = setup();

    client.deposit();
    env.as_contract(&client.address, || {
        assert_eq!(
            env.storage().persistent().get_ttl(&DataKey::State),
            ttl::DEFAULT_EXTEND_TO
        );
    });
}

/// Simulated archival eviction: after the state TTL lapses, a query recovers
/// the escrow lifecycle state without data loss and re-arms it to 30 days.
#[test]
fn test_archived_state_is_recovered_on_access() {
    let (env, client) = setup();

    client.release();
    let ttl = env.as_contract(&client.address, || {
        env.storage().persistent().get_ttl(&DataKey::State)
    });

    // Simulate archival: advance past the entry's live-until ledger.
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + ttl + 1);

    // Accessing the escrow campaign state recovers the historical status.
    assert_eq!(client.status(), Status::Released);
    env.as_contract(&client.address, || {
        assert_eq!(
            env.storage().persistent().get_ttl(&DataKey::State),
            ttl::DEFAULT_EXTEND_TO
        );
    });
}
