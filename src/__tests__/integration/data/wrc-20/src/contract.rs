use crate::action::{Action, ActionResult};
use crate::actions::transfers::transfer;
use crate::actions::transfers::transfer_from;
use crate::actions::balance::balance_of;
use crate::actions::balance::total_supply;
use crate::actions::allowances::approve;
use crate::actions::allowances::allowance;
use crate::actions::evolve::evolve;
use warp_wasm_utils::contract_utils::js_imports::{Block, Contract, log, SmartWeave, Transaction};
use crate::state::State;

pub async fn handle(current_state: State, action: Action) -> ActionResult {

    //Example of accessing functions imported from js:
    log("log from contract");
    log(&("Transaction::id()".to_owned() + &Transaction::id()));
    log(&("Transaction::owner()".to_owned() + &Transaction::owner()));
    log(&("Transaction::target()".to_owned() + &Transaction::target()));

    log(&("Block::height()".to_owned() + &Block::height().to_string()));
    log(&("Block::indep_hash()".to_owned() + &Block::indep_hash()));
    log(&("Block::timestamp()".to_owned() + &Block::timestamp().to_string()));

    log(&("Contract::id()".to_owned() + &Contract::id()));
    log(&("Contract::owner()".to_owned() + &Contract::owner()));

    log(&("SmartWeave::caller()".to_owned() + &SmartWeave::caller()));

    match action {
        Action::Transfer { to, amount } => transfer(current_state, to, amount),
        Action::TransferFrom { from, to, amount } => transfer_from(current_state, from, to, amount),
        Action::BalanceOf { target } => balance_of(current_state, target),
        Action::TotalSupply { } => total_supply(current_state),
        Action::Approve { spender, amount } => approve(current_state, spender, amount),
        Action::Allowance { owner, spender } => allowance(current_state, owner, spender),
        Action::Evolve { value } => evolve(current_state, value),
    }
}
