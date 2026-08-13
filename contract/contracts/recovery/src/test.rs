#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    vec, Address, Env,
};

/// Deterministic 32-byte public-key stand-in for tests.
fn pubkey(env: &Env, tag: u8) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[0] = tag;
    BytesN::from_array(env, &arr)
}

fn guardian(_env: &Env, addr: &Address, weight: u32) -> Guardian {
    Guardian {
        address: addr.clone(),
        weight,
        status: GuardianStatus::Active,
    }
}

struct Harness<'a> {
    admin: Address,
    g: Vec<Address>,
    owner_key: BytesN<32>,
    client: RecoveryContractClient<'a>,
}

/// A fully configured 3-of-5 account (all guardians weight 1, quorum 3).
fn setup<'a>() -> (Env, Harness<'a>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let g1 = Address::generate(&env);
    let g2 = Address::generate(&env);
    let g3 = Address::generate(&env);
    let g4 = Address::generate(&env);
    let g5 = Address::generate(&env);
    let owner_key = pubkey(&env, 1);

    let id = env.register(RecoveryContract, (admin.clone(), owner_key.clone(), 3u32));
    let client = RecoveryContractClient::new(&env, &id);

    let gs = vec![
        &env,
        guardian(&env, &g1, 1),
        guardian(&env, &g2, 1),
        guardian(&env, &g3, 1),
        guardian(&env, &g4, 1),
        guardian(&env, &g5, 1),
    ];
    client.set_guardians(&gs, &3);

    let g = vec![&env, g1, g2, g3, g4, g5];
    (
        env,
        Harness {
            admin,
            g,
            owner_key,
            client,
        },
    )
}

// ── configuration ────────────────────────────────────────────────────────

#[test]
fn constructor_sets_owner_key_quorum_and_empty_guardians() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner_key = pubkey(&env, 1);
    let id = env.register(RecoveryContract, (admin.clone(), owner_key.clone(), 2u32));
    let client = RecoveryContractClient::new(&env, &id);

    assert_eq!(client.current_owner_key(), owner_key);
    assert_eq!(client.quorum_threshold(), 2);
    assert_eq!(client.guardians().len(), 0);
    assert_eq!(client.active_recovery(), None);
    assert_eq!(client.admin(), admin);
}

#[test]
fn set_guardians_replaces_set_and_quorum() {
    let (_env, h) = setup();
    assert_eq!(h.client.guardians().len(), 5);
    assert_eq!(h.client.quorum_threshold(), 3);
    // Every registered guardian is queryable individually.
    for addr in h.g.iter() {
        assert!(h.client.guardian(&addr).is_some());
    }
}

#[test]
fn registers_up_to_five_guardians() {
    let (_env, h) = setup();
    assert_eq!(h.client.guardians().len(), MAX_GUARDIANS);
}

#[test]
fn rejects_more_than_five_guardians() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 1u32));
    let client = RecoveryContractClient::new(&env, &id);

    let mut gs = Vec::new(&env);
    for _ in 0..6u8 {
        let who = Address::generate(&env);
        gs.push_back(guardian(&env, &who, 1));
    }
    let res = client.try_set_guardians(&gs, &1);
    assert_eq!(res, Err(Ok(Error::GuardianLimitExceeded)));
}

#[test]
fn rejects_duplicate_guardian() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 2u32));
    let client = RecoveryContractClient::new(&env, &id);

    let gs = vec![&env, guardian(&env, &a, 1), guardian(&env, &a, 1)];
    let res = client.try_set_guardians(&gs, &2);
    assert_eq!(res, Err(Ok(Error::DuplicateGuardian)));
}

#[test]
fn rejects_zero_weight_guardian() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 1u32));
    let client = RecoveryContractClient::new(&env, &id);

    let gs = vec![
        &env,
        Guardian {
            address: a,
            weight: 0,
            status: GuardianStatus::Active,
        },
        guardian(&env, &b, 1),
    ];
    let res = client.try_set_guardians(&gs, &1);
    assert_eq!(res, Err(Ok(Error::InvalidWeight)));
}

#[test]
fn rejects_quorum_above_active_weight() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 1u32));
    let client = RecoveryContractClient::new(&env, &id);

    // Only 3 weight available, asking for a 4-of-5 quorum is unsatisfiable.
    let gs = vec![
        &env,
        guardian(&env, &a, 1),
        guardian(&env, &b, 1),
        guardian(&env, &c, 1),
    ];
    let res = client.try_set_guardians(&gs, &4);
    assert_eq!(res, Err(Ok(Error::InvalidQuorum)));

    // ...but a satisfiable 3-of-5 quorum passes.
    assert!(client.try_set_guardians(&gs, &3).unwrap().is_ok());
    assert_eq!(client.quorum_threshold(), 3);
}

#[test]
fn add_guardian_appends_and_remove_removes() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 1u32));
    let client = RecoveryContractClient::new(&env, &id);

    client.add_guardian(&guardian(&env, &a, 1));
    assert_eq!(client.guardians().len(), 1);

    // Duplicate add is rejected.
    let res = client.try_add_guardian(&guardian(&env, &a, 1));
    assert_eq!(res, Err(Ok(Error::DuplicateGuardian)));

    client.add_guardian(&guardian(&env, &b, 1));
    assert_eq!(client.guardians().len(), 2);

    client.remove_guardian(&a);
    assert_eq!(client.guardians().len(), 1);
    assert!(client.guardian(&b).is_some());
    assert!(client.guardian(&a).is_none());

    let res = client.try_remove_guardian(&a);
    assert_eq!(res, Err(Ok(Error::GuardianNotFound)));
}

#[test]
fn remove_guardian_that_breaks_quorum_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 3u32));
    let client = RecoveryContractClient::new(&env, &id);

    // 3-of-3: removing any guardian makes quorum unsatisfiable.
    let gs = vec![
        &env,
        guardian(&env, &a, 1),
        guardian(&env, &b, 1),
        guardian(&env, &c, 1),
    ];
    client.set_guardians(&gs, &3);
    assert_eq!(
        client.try_remove_guardian(&a),
        Err(Ok(Error::InvalidQuorum))
    );

    // Lower the quorum first, then removal is allowed.
    client.set_quorum_threshold(&2);
    client.remove_guardian(&a);
    assert_eq!(client.guardians().len(), 2);
}

#[test]
fn set_guardian_meta_updates_weight() {
    let (_env, h) = setup();
    let g0 = h.g.get(0).unwrap();
    h.client.set_guardian_meta(&g0, &2, &GuardianStatus::Active);
    let g = h.client.guardian(&g0).unwrap();
    assert_eq!(g.weight, 2);
}

#[test]
fn set_quorum_threshold_validates_range() {
    let (_env, h) = setup();
    assert_eq!(
        h.client.try_set_quorum_threshold(&0),
        Err(Ok(Error::InvalidQuorum))
    );
    assert_eq!(
        h.client.try_set_quorum_threshold(&6), // above total active weight (5)
        Err(Ok(Error::InvalidQuorum))
    );
    h.client.set_quorum_threshold(&2);
    assert_eq!(h.client.quorum_threshold(), 2);
}

// ── admin authorization ──────────────────────────────────────────────────

#[test]
fn only_admin_can_manage_guardians() {
    // No mock_all_auths: the caller cannot authorize as the admin.
    let env = Env::default();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 1u32));
    let client = RecoveryContractClient::new(&env, &id);

    let gs = vec![&env, guardian(&env, &attacker, 1)];
    assert!(client.try_set_guardians(&gs, &1).is_err());
    assert!(client
        .try_add_guardian(&guardian(&env, &attacker, 1))
        .is_err());
    assert!(client.try_remove_guardian(&attacker).is_err());
    assert!(client.try_set_quorum_threshold(&1).is_err());
}

#[test]
fn only_admin_can_cancel_recovery() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 1u32));
    let client = RecoveryContractClient::new(&env, &id);

    assert!(client.try_cancel_recovery().is_err());
}

// ── recovery lifecycle ───────────────────────────────────────────────────

#[test]
fn initiate_recovery_opens_challenge() {
    let (env, h) = setup();
    let new_key = pubkey(&env, 2);
    let before = env.ledger().timestamp();

    let id = h.client.initiate_recovery(&new_key);
    assert_eq!(id, 1);
    assert_eq!(h.client.active_recovery(), Some(1));

    let rec = h.client.recovery(&1).unwrap();
    assert_eq!(rec.new_owner_key, new_key);
    assert_eq!(rec.started_at, before);
    assert_eq!(rec.weight, 0);
    assert_eq!(rec.supporters.len(), 0);
    assert!(!rec.executed && !rec.cancelled);

    // Owner key is untouched until execution.
    assert_eq!(h.client.current_owner_key(), h.owner_key);
}

#[test]
fn only_one_challenge_at_a_time() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));
    let res = h.client.try_initiate_recovery(&pubkey(&env, 3));
    assert_eq!(res, Err(Ok(Error::ActiveRecoveryExists)));
}

#[test]
fn cannot_recover_without_guardians() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 1u32));
    let client = RecoveryContractClient::new(&env, &id);

    let res = client.try_initiate_recovery(&pubkey(&env, 9));
    assert_eq!(res, Err(Ok(Error::NoActiveGuardians)));
}

#[test]
fn support_accumulates_weight() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));

    let total = h.client.support_recovery(&1, &h.g.get(0).unwrap());
    assert_eq!(total, 1);
    let total = h.client.support_recovery(&1, &h.g.get(1).unwrap());
    assert_eq!(total, 2);
    let total = h.client.support_recovery(&1, &h.g.get(2).unwrap());
    assert_eq!(total, 3);

    let rec = h.client.recovery(&1).unwrap();
    assert_eq!(rec.weight, 3);
    assert_eq!(rec.supporters.len(), 3);
}

#[test]
fn non_guardian_cannot_support() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));

    let stranger = Address::generate(&env);
    let res = h.client.try_support_recovery(&1, &stranger);
    assert_eq!(res, Err(Ok(Error::NotGuardian)));
}

#[test]
fn revoked_guardian_cannot_support() {
    let (env, h) = setup();
    let g0 = h.g.get(0).unwrap();
    h.client
        .set_guardian_meta(&g0, &1, &GuardianStatus::Revoked);
    h.client.initiate_recovery(&pubkey(&env, 2));

    let res = h.client.try_support_recovery(&1, &g0);
    assert_eq!(res, Err(Ok(Error::NotGuardian)));
}

#[test]
fn double_vote_is_rejected() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));
    h.client.support_recovery(&1, &h.g.get(0).unwrap());
    let res = h.client.try_support_recovery(&1, &h.g.get(0).unwrap());
    assert_eq!(res, Err(Ok(Error::AlreadySupported)));
}

#[test]
fn withdraw_support_retracts_vote() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));
    h.client.support_recovery(&1, &h.g.get(0).unwrap());
    h.client.support_recovery(&1, &h.g.get(1).unwrap());
    h.client.support_recovery(&1, &h.g.get(2).unwrap());

    let total = h.client.withdraw_support(&1, &h.g.get(2).unwrap());
    assert_eq!(total, 2);
    let rec = h.client.recovery(&1).unwrap();
    assert_eq!(rec.weight, 2);
    assert_eq!(rec.supporters.len(), 2);

    // Can vote again after retracting.
    let total = h.client.support_recovery(&1, &h.g.get(2).unwrap());
    assert_eq!(total, 3);
}

#[test]
fn execute_requires_quorum() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));
    h.client.support_recovery(&1, &h.g.get(0).unwrap());
    h.client.support_recovery(&1, &h.g.get(1).unwrap());

    // Two signers (weight 2) is below the 3-of-5 quorum even after the timelock.
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + RECOVERY_TIMELOCK_SECS + 1);
    let res = h.client.try_execute_recovery(&1);
    assert_eq!(res, Err(Ok(Error::QuorumNotReached)));
    assert_eq!(h.client.current_owner_key(), h.owner_key);
}

#[test]
fn execute_requires_timelock() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));
    h.client.support_recovery(&1, &h.g.get(0).unwrap());
    h.client.support_recovery(&1, &h.g.get(1).unwrap());
    h.client.support_recovery(&1, &h.g.get(2).unwrap());

    // Quorum reached immediately, but the 48-hour window is still open.
    let res = h.client.try_execute_recovery(&1);
    assert_eq!(res, Err(Ok(Error::TimelockNotExpired)));
}

#[test]
fn execute_rotates_owner_key_for_new_signatures() {
    let (env, h) = setup();
    let new_key = pubkey(&env, 2);
    let old_key = h.owner_key.clone();

    h.client.initiate_recovery(&new_key);
    h.client.support_recovery(&1, &h.g.get(0).unwrap());
    h.client.support_recovery(&1, &h.g.get(1).unwrap());
    h.client.support_recovery(&1, &h.g.get(2).unwrap());

    // Exactly at the time-lock the recovery is still blocked...
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + RECOVERY_TIMELOCK_SECS);
    assert_eq!(
        h.client.try_execute_recovery(&1),
        Err(Ok(Error::TimelockNotExpired))
    );

    // ...and one ledger second later it succeeds.
    env.ledger().set_timestamp(env.ledger().timestamp() + 1);
    let id = h.client.execute_recovery(&1);
    assert_eq!(id, 1);

    // Acceptance #4: the new key is authoritative, the old one is rejected.
    assert_eq!(h.client.current_owner_key(), new_key);
    assert_ne!(h.client.current_owner_key(), old_key);

    // The challenge closes and history is preserved for auditability.
    assert_eq!(h.client.active_recovery(), None);
    let rec = h.client.recovery(&1).unwrap();
    assert!(rec.executed);
    assert_eq!(rec.new_owner_key, new_key);

    // Executing again is impossible.
    assert_eq!(
        h.client.try_execute_recovery(&1),
        Err(Ok(Error::RecoveryNotFound))
    );
}

#[test]
fn cancel_recovery_blocks_theft_attempt() {
    let (env, h) = setup();

    // An attacker initiates a recovery to THEIR key...
    let thief_key = pubkey(&env, 0);
    h.client.initiate_recovery(&thief_key);

    // ...and (per the threat model) coerces a couple of guardians to vote.
    h.client.support_recovery(&1, &h.g.get(0).unwrap());
    h.client.support_recovery(&1, &h.g.get(1).unwrap());

    // The active owner vetoes within the 48-hour window.
    let id = h.client.cancel_recovery();
    assert_eq!(id, 1);
    assert_eq!(h.client.active_recovery(), None);
    let rec = h.client.recovery(&1).unwrap();
    assert!(rec.cancelled);

    // Even after the time-lock elapses, the attack cannot execute.
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + RECOVERY_TIMELOCK_SECS + 1);
    let res = h.client.try_execute_recovery(&1);
    assert_eq!(res, Err(Ok(Error::AlreadyCancelled)));
    assert_eq!(h.client.current_owner_key(), h.owner_key);
}

#[test]
fn cancel_without_active_recovery_fails() {
    let (_env, h) = setup();
    assert_eq!(
        h.client.try_cancel_recovery(),
        Err(Ok(Error::NoActiveRecovery))
    );
}

#[test]
fn weighted_quorum_respected() {
    // 1 + 1 + 3 = 5 total weight; quorum 5. The heavyweight guardian
    // (weight 3) plus two light ones reach quorum with only three signers.
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let g1 = Address::generate(&env);
    let g2 = Address::generate(&env);
    let g3 = Address::generate(&env);

    let id = env.register(RecoveryContract, (admin.clone(), pubkey(&env, 1), 5u32));
    let client = RecoveryContractClient::new(&env, &id);
    let gs = vec![
        &env,
        guardian(&env, &g1, 1),
        guardian(&env, &g2, 1),
        guardian(&env, &g3, 3),
    ];
    client.set_guardians(&gs, &5);

    // 1 + 1 = 2 is short of the 5-weight quorum.
    client.initiate_recovery(&pubkey(&env, 2));
    client.support_recovery(&1, &g1);
    client.support_recovery(&1, &g2);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + RECOVERY_TIMELOCK_SECS + 1);
    assert_eq!(
        client.try_execute_recovery(&1),
        Err(Ok(Error::QuorumNotReached))
    );

    // Adding the weight-3 guardian's vote crosses the threshold.
    client.support_recovery(&1, &g3);
    assert!(client.try_execute_recovery(&1).unwrap().is_ok());
    assert_eq!(client.current_owner_key(), pubkey(&env, 2));
}

#[test]
fn recovery_entry_survives_as_history() {
    let (env, h) = setup();
    h.client.initiate_recovery(&pubkey(&env, 2));
    h.client.cancel_recovery();
    let rec = h.client.recovery(&1).unwrap();
    assert!(rec.cancelled);
}
