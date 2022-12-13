use crate::error::ContractError::{CallerBalanceNotEnough, CallerAllowanceNotEnough};
use crate::actions::allowances::{__set_allowance, __get_allowance};
use crate::state::State;
use crate::action::ActionResult;
use warp_wasm_utils::contract_utils::handler_result::HandlerResult;
use warp_wasm_utils::contract_utils::js_imports::{SmartWeave};

pub fn transfer(state: State, to: String, amount: u64) -> ActionResult {
    let caller = SmartWeave::caller();
    return _transfer(state, caller, to, amount);
}

pub fn transfer_from(mut state: State, from: String, to: String, amount: u64) -> ActionResult {
    let caller = SmartWeave::caller();

    //Checking allowance
    let allowance = __get_allowance(&state.allowances, &from, &caller);

    if allowance < amount {
       return Err(CallerAllowanceNotEnough(allowance));
    }

    __set_allowance(&mut state.allowances, from.to_owned(), caller, allowance - amount);

    return _transfer(state, from, to, amount);
}

fn _transfer(mut state: State, from: String, to: String, amount: u64) -> ActionResult {
    // Checking if caller has enough funds
    let balances = &mut state.balances;
    let from_balance = *balances.get(&from).unwrap_or(&0);
    if from_balance < amount {
        return Err(CallerBalanceNotEnough(from_balance));
    }

    // Update caller balance or prune state if the new value is 0
    if from_balance - amount == 0 {
        balances.remove(&from);
    } else  {
        balances.insert(from, from_balance - amount);
    }

    // Update target balance
    *balances.entry(to).or_insert(0) += amount;

    Ok(HandlerResult::NewState(state))
}
