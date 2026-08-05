#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Instance as _, storage::Persistent as _, Address as _, Ledger},
    token, Address, Env,
};

fn create_token<'a>(e: &Env, admin: &Address) -> (Address, token::StellarAssetClient<'a>) {
    let sac = e.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    (addr.clone(), token::StellarAssetClient::new(e, &addr))
}

fn setup<'a>() -> (Env, Address, Address, Address, FundContractClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    token_admin.mint(&donor, &1_000);

    let goal = 500i128;
    let deadline = env.ledger().timestamp() + 1000;
    let milestones = soroban_sdk::vec![&env, 250i128, 500i128];
    let contract_id = env.register(
        FundContract,
        (
            owner.clone(),
            token_addr.clone(),
            goal,
            deadline,
            milestones,
        ),
    );
    let client = FundContractClient::new(&env, &contract_id);

    (env, owner, donor, token_addr, client)
}

#[test]
fn donate_updates_state() {
    let (_env, _owner, donor, _token, client) = setup();

    assert_eq!(client.goal(), 500);
    assert_eq!(client.raised(), 0);
    assert_eq!(client.donors(), 0);

    let total = client.donate(&donor, &200);
    assert_eq!(total, 200);
    assert_eq!(client.raised(), 200);
    assert_eq!(client.donors(), 1);
    assert_eq!(client.contribution(&donor), 200);

    // same donor again — total grows, unique count does not
    client.donate(&donor, &100);
    assert_eq!(client.raised(), 300);
    assert_eq!(client.donors(), 1);
    assert_eq!(client.contribution(&donor), 300);
}

#[test]
fn withdraw_transfers_to_owner() {
    let (env, owner, donor, token_addr, client) = setup();
    client.donate(&donor, &300);

    let token_client = token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&client.address), 300);

    let withdrawn = client.withdraw_milestone();
    assert_eq!(withdrawn, 250); // Unlocks the first milestone (250)
    assert_eq!(token_client.balance(&owner), 250);
    assert_eq!(token_client.balance(&client.address), 50);
}

#[test]
fn withdraw_milestone_success() {
    let (_env, _owner, donor, _token, client) = setup();

    // Donate 200, which is below the 250 milestone.
    client.donate(&donor, &200);
    let res = client.try_withdraw_milestone();
    assert_eq!(res, Err(Ok(Error::MilestoneNotReached)));

    // Donate 100 more, total 300. This unlocks the 250 milestone.
    client.donate(&donor, &100);
    let withdrawn = client.withdraw_milestone();
    assert_eq!(withdrawn, 250);

    // Trying to withdraw again should fail, as no new milestone is reached
    let res2 = client.try_withdraw_milestone();
    assert_eq!(res2, Err(Ok(Error::MilestoneNotReached)));

    // Donate 200 more, total 500. This unlocks the 500 milestone.
    client.donate(&donor, &200);
    let withdrawn2 = client.withdraw_milestone();
    assert_eq!(withdrawn2, 250); // 500 - 250 already withdrawn = 250
}

#[test]
fn rejects_zero_amount() {
    let (_env, _owner, donor, _token, client) = setup();
    let res = client.try_donate(&donor, &0);
    assert_eq!(res, Err(Ok(Error::ZeroAmount)));
}

#[test]
fn closes_when_goal_reached() {
    let (_env, _owner, donor, _token, client) = setup();
    client.donate(&donor, &500); // hits goal exactly
    assert!(client.is_closed());

    // further donations are rejected
    let res = client.try_donate(&donor, &10);
    assert_eq!(res, Err(Ok(Error::CampaignClosed)));
}

#[test]
fn withdraw_empty_fails() {
    let (_env, _owner, _donor, _token, client) = setup();
    let res = client.try_withdraw_milestone();
    assert_eq!(res, Err(Ok(Error::MilestoneNotReached)));
}

#[test]
fn test_donate_expired() {
    let (env, _owner, donor, _token, client) = setup();
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);
    let res = client.try_donate(&donor, &100);
    assert_eq!(res, Err(Ok(Error::CampaignExpired)));
}

#[test]
fn test_refund_success() {
    let (env, _owner, donor, token_addr, client) = setup();
    client.donate(&donor, &200);

    let token_client = token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&donor), 800); // 1000 - 200

    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

    let refunded = client.refund(&donor);
    assert_eq!(refunded, 200);
    assert_eq!(client.contribution(&donor), 0);
    assert_eq!(client.raised(), 0);
    assert_eq!(token_client.balance(&donor), 1000); // Got it back
}

#[test]
fn test_refund_before_deadline() {
    let (_env, _owner, donor, _token, client) = setup();
    client.donate(&donor, &200);

    let res = client.try_refund(&donor);
    assert_eq!(res, Err(Ok(Error::CampaignNotExpired)));
}

#[test]
fn test_refund_no_contribution() {
    let (env, _owner, donor, _token, client) = setup();
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);
    let res = client.try_refund(&donor);
    assert_eq!(res, Err(Ok(Error::NoContribution)));
}

#[test]
fn test_refund_closed_campaign() {
    let (env, _owner, donor, _token, client) = setup();
    client.donate(&donor, &500); // hits goal, closes campaign
    assert!(client.is_closed());

    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);
    let res = client.try_refund(&donor);
    assert_eq!(res, Err(Ok(Error::CampaignClosed)));
}

/// Inter-contract communication: a donation on the fund contract triggers a
/// cross-contract `award` call on the companion DonorBadge contract, which
/// assigns the donor a loyalty tier from their cumulative total.
#[test]
fn donation_awards_badge_cross_contract() {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let donor = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    // Fund the donor with enough for a Gold-tier (≥ 100 XLM) donation.
    token_admin.mint(&donor, &2_000_000_000);

    // High goal so a single donation doesn't close the campaign.
    let goal = 10_000_000_000i128;
    let deadline = env.ledger().timestamp() + 1000;
    let milestones = soroban_sdk::vec![&env, goal];
    let fund_id = env.register(
        FundContract,
        (
            owner.clone(),
            token_addr.clone(),
            goal,
            deadline,
            milestones,
        ),
    );
    let fund = FundContractClient::new(&env, &fund_id);

    // Deploy the badge contract with the fund contract as its authorized admin.
    let badge_id = env.register(badge::BadgeContract, (fund_id.clone(),));
    let badge = badge::BadgeContractClient::new(&env, &badge_id);

    // Owner registers the badge contract on the fund.
    fund.set_badge(&badge_id);
    assert_eq!(fund.badge(), Some(badge_id.clone()));

    // No badge before donating.
    assert_eq!(badge.tier(&donor), 0);
    assert_eq!(badge.minted(), 0);

    // Donate 100 XLM → fund calls badge.award(donor, 1_000_000_000) → Gold (3).
    fund.donate(&donor, &1_000_000_000);
    assert_eq!(badge.tier(&donor), 3);
    assert_eq!(badge.minted(), 1);
    assert_eq!(badge.admin(), fund_id);
}

#[test]
fn test_multiple_donors() {
    let (env, _owner, donor1, token_addr, client) = setup();
    let donor2 = Address::generate(&env);
    let token_admin = token::StellarAssetClient::new(&env, &token_addr);
    token_admin.mint(&donor2, &1000);

    // First donor donates
    client.donate(&donor1, &100);
    assert_eq!(client.donors(), 1);

    // Second donor donates
    client.donate(&donor2, &200);
    assert_eq!(client.donors(), 2);

    // Check total raised
    assert_eq!(client.raised(), 300);

    // Same donor again, donors count should not increase
    client.donate(&donor1, &50);
    assert_eq!(client.donors(), 2);
    assert_eq!(client.raised(), 350);
}

#[test]
fn test_withdraw_after_close() {
    let (env, owner, donor, token_addr, client) = setup();

    // Donate exactly the goal to close the campaign
    client.donate(&donor, &500);
    assert!(client.is_closed());

    let token_client = token::Client::new(&env, &token_addr);
    let owner_balance_before = token_client.balance(&owner);

    // Withdraw after close
    let withdrawn = client.withdraw_milestone();
    assert_eq!(withdrawn, 500);

    let owner_balance_after = token_client.balance(&owner);
    assert_eq!(owner_balance_after, owner_balance_before + 500);

    // Contract balance should be 0
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn test_exact_goal_boundary() {
    let (_env, _owner, donor, _token, client) = setup();

    // The setup goal is 500.
    // Donate 499, should remain open.
    client.donate(&donor, &499);
    assert!(!client.is_closed());
    assert_eq!(client.raised(), 499);

    // Donate exactly 1 to hit 500.
    client.donate(&donor, &1);
    assert!(client.is_closed());
    assert_eq!(client.raised(), 500);

    // Donate 1 more, should fail.
    let res = client.try_donate(&donor, &1);
    assert_eq!(res, Err(Ok(Error::CampaignClosed)));
}

/// Every donation must rent-bump the donor's contribution entry and the
/// campaign instance/code to the full 30-day TTL window.
#[test]
fn test_donation_bumps_storage_ttl() {
    let (env, _owner, donor, _token, client) = setup();

    client.donate(&donor, &200);

    env.as_contract(&client.address, || {
        let key = DataKey::Contribution(donor.clone());
        assert_eq!(
            env.storage().persistent().get_ttl(&key),
            ttl::DEFAULT_EXTEND_TO
        );
        assert_eq!(
            env.storage().instance().get_ttl(),
            ttl::DEFAULT_EXTEND_TO
        );
    });
}

/// A contribution query must re-arm an expiring entry back to 30 days.
#[test]
fn test_contribution_query_bumps_expiring_ttl() {
    let (env, _owner, donor, _token, client) = setup();
    client.donate(&donor, &200);

    // Fast-forward until fewer than 14 days remain on the contribution entry.
    env.ledger().set_sequence_number(
        env.ledger().sequence() + (ttl::DEFAULT_EXTEND_TO - ttl::DEFAULT_THRESHOLD + 1),
    );

    assert_eq!(client.contribution(&donor), 200);
    env.as_contract(&client.address, || {
        let key = DataKey::Contribution(donor.clone());
        assert_eq!(
            env.storage().persistent().get_ttl(&key),
            ttl::DEFAULT_EXTEND_TO
        );
    });
}
