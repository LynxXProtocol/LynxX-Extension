#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger as _},
    Address, Env,
};

fn setup<'a>() -> (Env, Address, BadgeContractClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();

    // In production `admin` is the StellarFund contract address; for unit tests
    // any address works because we mock the cross-contract authorization.
    let admin = Address::generate(&env);
    let contract_id = env.register(BadgeContract, (admin.clone(),));
    let client = BadgeContractClient::new(&env, &contract_id);

    (env, admin, client)
}

#[test]
fn starts_empty() {
    let (env, _admin, client) = setup();
    let who = Address::generate(&env);
    assert_eq!(client.minted(), 0);
    assert_eq!(client.tier(&who), 0);
}

#[test]
fn awards_bronze_then_upgrades() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    // 1 XLM → Bronze (tier 1)
    assert_eq!(client.award(&donor, &10_000_000), 1);
    assert_eq!(client.tier(&donor), 1);
    assert_eq!(client.minted(), 1);

    // 10 XLM cumulative → Silver (tier 2), still one unique donor
    assert_eq!(client.award(&donor, &100_000_000), 2);
    assert_eq!(client.tier(&donor), 2);
    assert_eq!(client.minted(), 1);

    // 100 XLM cumulative → Gold (tier 3)
    assert_eq!(client.award(&donor, &1_000_000_000), 3);
    assert_eq!(client.tier(&donor), 3);
}

#[test]
fn tier_never_downgrades() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    client.award(&donor, &1_000_000_000); // Gold
    assert_eq!(client.tier(&donor), 3);

    // A smaller total should not strip the donor of their earned tier.
    assert_eq!(client.award(&donor, &10_000_000), 3);
    assert_eq!(client.tier(&donor), 3);
}

#[test]
fn below_threshold_earns_nothing() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    // Under 1 XLM → no badge.
    assert_eq!(client.award(&donor, &5_000_000), 0);
    assert_eq!(client.tier(&donor), 0);
    assert_eq!(client.minted(), 0);
}

#[test]
fn counts_unique_donors() {
    let (env, _admin, client) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    client.award(&a, &10_000_000);
    client.award(&b, &100_000_000);
    assert_eq!(client.minted(), 2);
    assert_eq!(client.admin(), client.admin()); // admin view is readable
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn test_auth_boundaries_reject_unauthorized() {
    let env = Env::default();

    // Deliberately NOT calling env.mock_all_auths() to enforce actual auth checks
    let admin = Address::generate(&env);
    let contract_id = env.register(BadgeContract, (admin.clone(),));
    let client = BadgeContractClient::new(&env, &contract_id);

    let donor = Address::generate(&env);

    // The client award call requires auth from the `admin` contract.
    // Since we aren't mocking auths and we aren't simulating a cross-contract call from `admin`, this will panic.
    client.award(&donor, &1_000_000_000);
}

#[test]
fn exact_tier_boundaries() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    // 1 stroop below bronze
    assert_eq!(client.award(&donor, &9_999_999), 0);
    // exact bronze threshold
    assert_eq!(client.award(&donor, &10_000_000), 1);

    // 1 stroop below silver
    assert_eq!(client.award(&donor, &99_999_999), 1);
    // exact silver threshold
    assert_eq!(client.award(&donor, &100_000_000), 2);

    // 1 stroop below gold
    assert_eq!(client.award(&donor, &999_999_999), 2);
    // exact gold threshold
    assert_eq!(client.award(&donor, &1_000_000_000), 3);
}

/// Awarding a badge must rent-bump the persistent tier entry to the full
/// 30-day TTL window instead of leaving it at the minimum.
#[test]
fn award_bumps_tier_ttl() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    assert_eq!(client.award(&donor, &10_000_000), 1);

    env.as_contract(&client.address, || {
        let tier_key = DataKey::Tier(donor.clone());
        assert_eq!(
            env.storage().persistent().get_ttl(&tier_key),
            ttl::DEFAULT_EXTEND_TO
        );
    });
}

/// A badge query must automatically bump the entry's TTL when the remaining
/// ledgers fall below the 14-day threshold.
#[test]
fn badge_query_bumps_expiring_ttl() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    client.award(&donor, &100_000_000); // Silver
    let start = env.ledger().sequence();

    // Fast-forward until fewer than 14 days remain, but the entry is still live.
    let below_threshold = ttl::DEFAULT_EXTEND_TO - ttl::DEFAULT_THRESHOLD + 1;
    env.ledger().set_sequence_number(start + below_threshold);

    // The query re-arms the entry to the full 30-day window.
    assert_eq!(client.tier(&donor), 2);
    env.as_contract(&client.address, || {
        let tier_key = DataKey::Tier(donor.clone());
        assert_eq!(
            env.storage().persistent().get_ttl(&tier_key),
            ttl::DEFAULT_EXTEND_TO
        );
    });
}

/// Simulated archival eviction: after the entry's TTL lapses, `restore_badge`
/// recovers the user's historical tier without data loss.
#[test]
fn archived_badge_is_restored_without_data_loss() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    // Donor earns a Gold tier, then the badge sits untouched until it archives.
    assert_eq!(client.award(&donor, &1_000_000_000), 3);
    let ttl = env.as_contract(&client.address, || {
        let tier_key = DataKey::Tier(donor.clone());
        env.storage().persistent().get_ttl(&tier_key)
    });

    // Simulate archival: advance past the entry's live-until ledger.
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + ttl + 1);

    // restore_badge re-initializes the archived tier from verifiable proof data.
    let restored = client.restore_badge(&donor, &3);
    assert_eq!(restored, 3);

    // Historical tier recovered intact — no data loss.
    assert_eq!(client.tier(&donor), 3);
    assert_eq!(client.minted(), 1);

    // The recovered entry gets a fresh 30-day rental window.
    env.as_contract(&client.address, || {
        let tier_key = DataKey::Tier(donor.clone());
        assert_eq!(
            env.storage().persistent().get_ttl(&tier_key),
            ttl::DEFAULT_EXTEND_TO
        );
    });
}

/// restore_badge must reject proof data that does not match the donor's actual
/// (archived) tier — a caller cannot forge a higher tier.
#[test]
fn restore_badge_rejects_forged_proof() {
    let (env, _admin, client) = setup();
    let donor = Address::generate(&env);

    assert_eq!(client.award(&donor, &1_000_000_000), 3); // Gold
    let ttl = env.as_contract(&client.address, || {
        let tier_key = DataKey::Tier(donor.clone());
        env.storage().persistent().get_ttl(&tier_key)
    });
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + ttl + 1);

    // Claiming Silver (2) against a stored Gold (3) must fail.
    let res = client.try_restore_badge(&donor, &2);
    assert_eq!(res, Err(Ok(Error::ProofMismatch)));
}

/// restore_badge on a donor who never earned a badge is a no-op error.
#[test]
fn restore_badge_unknown_donor_fails() {
    let (env, _admin, client) = setup();
    let stranger = Address::generate(&env);

    let res = client.try_restore_badge(&stranger, &1);
    assert_eq!(res, Err(Ok(Error::NotInitialized)));
}
