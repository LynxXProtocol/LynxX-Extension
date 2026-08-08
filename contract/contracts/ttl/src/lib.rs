#![no_std]
//! Ledger TTL (Time-To-Live) maintenance helpers shared by every LynxX
//! contract.
//!
//! Soroban archives inactive persistent ledger entries after their TTL lapses.
//! When an entry is archived, normal reads and writes against it fail until it
//! is restored. To keep hot data (donor badges, escrow campaign state) alive
//! and cheap to maintain, every contract should call [`extend_storage_ttl`]
//! (or the `bump*` conveniences below) on each read/write. The host only bumps
//! when the remaining TTL is below the given `threshold`, so routine access is
//! a free no-op and only near-expiry entries pay the (sub-stroop) rent bump.
//!
//! TTL is expressed in ledgers. The constants here assume ~15s/ledger, which is
//! the ledger cadence the 30-day / 14-day windows in this repository are based
//! on (30 days = 172,800 ledgers).

use soroban_sdk::{Env, IntoVal, Val};

/// Extension window: 30 days in ledgers.
///
/// [`extend_storage_ttl`] sets the entry's TTL to this value when it is below
/// [`DEFAULT_THRESHOLD`]. 30 days = 172,800 ledgers at ~15s per ledger.
pub const DEFAULT_EXTEND_TO: u32 = 172_800;

/// Bump threshold: 14 days in ledgers.
///
/// Any entry with fewer than this many ledgers remaining is considered
/// close-to-expiry and gets bumped to [`DEFAULT_EXTEND_TO`]. 14 days = 80,640
/// ledgers at ~15s per ledger.
pub const DEFAULT_THRESHOLD: u32 = 80_640;

/// Conditionally extend the TTL of a persistent storage `key`.
///
/// The host extends the entry's TTL to `extend_to` ledgers only when the
/// remaining TTL is below `threshold`; otherwise the call is a no-op that costs
/// nothing. This is the single primitive all contracts use to rent-bump storage
/// on access.
pub fn extend_storage_ttl<K>(env: &Env, key: &K, threshold: u32, extend_to: u32)
where
    K: IntoVal<Env, Val>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, threshold, extend_to);
}

/// Bump a persistent `key` to the default 30-day TTL when it falls below the
/// default 14-day threshold.
pub fn bump<K>(env: &Env, key: &K)
where
    K: IntoVal<Env, Val>,
{
    extend_storage_ttl(env, key, DEFAULT_THRESHOLD, DEFAULT_EXTEND_TO);
}

/// Bump the current contract's instance **and code** TTL to the default 30-day
/// window when below the 14-day threshold.
///
/// Instance storage (singleton config like `Admin`/`Minted`) lives in a single
/// persistent entry per contract, so one call covers it all — and it also keeps
/// the deployed contract code from being archived.
pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(DEFAULT_THRESHOLD, DEFAULT_EXTEND_TO);
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl, contracttype,
        testutils::{storage::Persistent as _, Ledger as _},
        Address, Env,
    };

    #[contracttype]
    #[derive(Clone)]
    enum Key {
        Counter,
    }

    #[contract]
    struct Harness;

    #[contractimpl]
    impl Harness {
        pub fn __constructor(_env: Env) {}

        pub fn write(env: Env, v: u32) {
            env.storage().persistent().set(&Key::Counter, &v);
            bump(&env, &Key::Counter);
        }

        pub fn read(env: Env) -> u32 {
            env.storage().persistent().get(&Key::Counter).unwrap_or(0)
        }
    }

    fn setup() -> (Env, Address) {
        let env = Env::default();
        let id = env.register(Harness, ());
        (env, id)
    }

    #[test]
    fn bump_sets_ttl_to_extend_to() {
        let (env, id) = setup();
        let client = HarnessClient::new(&env, &id);
        client.write(&7);
        env.as_contract(&id, || {
            assert_eq!(
                env.storage().persistent().get_ttl(&Key::Counter),
                DEFAULT_EXTEND_TO
            );
        });
    }

    #[test]
    fn extend_is_noop_when_above_threshold() {
        let (env, id) = setup();
        env.as_contract(&id, || {
            env.storage().persistent().set(&Key::Counter, &1u32);
        });

        // Fresh entries start below 100_000, so this bumps them to 150_000.
        env.as_contract(&id, || {
            extend_storage_ttl(&env, &Key::Counter, 100_000, 150_000);
            assert_eq!(env.storage().persistent().get_ttl(&Key::Counter), 150_000);
        });

        // Now the remaining TTL (150_000) is above the 10-ledger threshold,
        // so extending to 200_000 must be a no-op.
        env.as_contract(&id, || {
            extend_storage_ttl(&env, &Key::Counter, 10, 200_000);
            assert_eq!(env.storage().persistent().get_ttl(&Key::Counter), 150_000);
        });
    }

    #[test]
    fn archived_entry_is_recovered_by_access() {
        let (env, id) = setup();
        let client = HarnessClient::new(&env, &id);
        client.write(&7);

        // Simulate archival by advancing the ledger beyond the entry's TTL.
        let ttl = env.as_contract(&id, || env.storage().persistent().get_ttl(&Key::Counter));
        env.ledger()
            .set_sequence_number(env.ledger().sequence() + ttl + 1);

        // Accessing the archived entry recovers it (Protocol 23 auto-restore),
        // and the value is intact — no data loss.
        assert_eq!(client.read(), 7);
        env.as_contract(&id, || {
            assert!(env.storage().persistent().get_ttl(&Key::Counter) >= 4095);
        });
    }
}
