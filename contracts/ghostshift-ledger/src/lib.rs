#![no_std]
#![no_main]

extern crate alloc;

use alloc::{
    format,
    string::{String, ToString},
    vec,
};

use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    addressable_entity::{
        EntityEntryPoint, EntryPointAccess, EntryPointPayment, EntryPointType, EntryPoints,
    },
    contracts::NamedKeys,
    CLType, Key, Parameter,
};

const RECEIPTS_DICT: &str = "receipts";
const LAST_RECEIPT_KEY: &str = "last_receipt_key";
const HASH_NAME: &str = "ghostshift_ledger_hash";
const ACCESS_NAME: &str = "ghostshift_ledger_access";

const ARG_MISSION_ID: &str = "mission_id";
const ARG_VENDOR_ID: &str = "vendor_id";
const ARG_ROLE: &str = "role";
const ARG_AMOUNT_MOTES: &str = "amount_motes";
const ARG_PROOF_HASH: &str = "proof_hash";
const ARG_STATUS: &str = "status";

#[no_mangle]
pub extern "C" fn record_receipt() {
    let mission_id: String = runtime::get_named_arg(ARG_MISSION_ID);
    let vendor_id: String = runtime::get_named_arg(ARG_VENDOR_ID);
    let role: String = runtime::get_named_arg(ARG_ROLE);
    let amount_motes: u64 = runtime::get_named_arg(ARG_AMOUNT_MOTES);
    let proof_hash: String = runtime::get_named_arg(ARG_PROOF_HASH);
    let status: String = runtime::get_named_arg(ARG_STATUS);

    let dictionary_key = format!("{}::{}::{}", mission_id, vendor_id, status);
    let record = format!(
        "{}|{}|{}|{}|{}|{}",
        mission_id, vendor_id, role, amount_motes, proof_hash, status
    );

    storage::named_dictionary_put(RECEIPTS_DICT, &dictionary_key, record);
    runtime::put_key(LAST_RECEIPT_KEY, storage::new_uref(dictionary_key).into());
}

#[no_mangle]
pub extern "C" fn call() {
    let mut entry_points = EntryPoints::new();
    entry_points.add_entry_point(EntityEntryPoint::new(
        "record_receipt",
        vec![
            Parameter::new(ARG_MISSION_ID, CLType::String),
            Parameter::new(ARG_VENDOR_ID, CLType::String),
            Parameter::new(ARG_ROLE, CLType::String),
            Parameter::new(ARG_AMOUNT_MOTES, CLType::U64),
            Parameter::new(ARG_PROOF_HASH, CLType::String),
            Parameter::new(ARG_STATUS, CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    let receipts_uref = storage::new_dictionary(RECEIPTS_DICT).unwrap_or_revert();
    let mut named_keys = NamedKeys::new();
    named_keys.insert(RECEIPTS_DICT.to_string(), Key::from(receipts_uref));
    named_keys.insert(
        LAST_RECEIPT_KEY.to_string(),
        storage::new_uref(String::new()).into(),
    );

    storage::new_contract(
        entry_points,
        Some(named_keys),
        Some(HASH_NAME.to_string()),
        Some(ACCESS_NAME.to_string()),
        None,
    );
}
