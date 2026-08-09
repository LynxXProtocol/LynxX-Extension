#![no_std]
//! Factory Contract for LynxX campaigns
//! Deploys new `fund` contract instances.
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, IntoVal, Val, Vec};
use ttl::bump_instance;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    WasmHash,
    Campaigns,
    Counter,
}

#[contract]
pub struct FactoryContract;

#[contractimpl]
impl FactoryContract {
    /// Initialize the factory with the WASM hash of the fund contract.
    pub fn __constructor(env: Env, wasm_hash: BytesN<32>) {
        let s = env.storage().instance();
        s.set(&DataKey::WasmHash, &wasm_hash);
        s.set(&DataKey::Counter, &0u32);

        let empty_campaigns: Vec<Address> = Vec::new(&env);
        s.set(&DataKey::Campaigns, &empty_campaigns);
    }

    /// Deploys a new fund contract instance and registers it.
    pub fn create_campaign(
        env: Env,
        owner: Address,
        token: Address,
        goal: i128,
        deadline: u64,
        milestones: Vec<i128>,
    ) -> Address {
        let s = env.storage().instance();
        let wasm_hash: BytesN<32> = s.get(&DataKey::WasmHash).unwrap();

        // Generate a deterministic salt using a counter
        let mut count: u32 = s.get(&DataKey::Counter).unwrap();
        count += 1;
        s.set(&DataKey::Counter, &count);

        let mut salt_bytes = [0u8; 32];
        let count_bytes = count.to_be_bytes();
        salt_bytes[28..32].copy_from_slice(&count_bytes);
        let salt = BytesN::from_array(&env, &salt_bytes);

        // Prepare initialization arguments for the fund contract's constructor
        // pub fn __constructor(env: Env, owner: Address, token: Address, goal: i128, deadline: u64, milestones: Vec<i128>)
        let init_args: Vec<Val> = (owner, token, goal, deadline, milestones).into_val(&env);

        // Deploy the contract and call its constructor
        let deployed_address = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm_hash, init_args);

        // Add to registry
        let mut campaigns: Vec<Address> = s.get(&DataKey::Campaigns).unwrap();
        campaigns.push_back(deployed_address.clone());
        s.set(&DataKey::Campaigns, &campaigns);

        // The factory registry is the index into every campaign — keep it alive.
        bump_instance(&env);

        deployed_address
    }

    /// Read-only view returning all deployed campaigns
    pub fn all_campaigns(env: Env) -> Vec<Address> {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::Campaigns).unwrap()
    }
}

mod test;
