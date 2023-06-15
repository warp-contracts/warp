use serde::{Serialize, Deserialize};
use warp_contracts::{warp_contract, handler_result::{WriteResult, ViewResult}, js_imports::{SmartWeave}};
use schemars::JsonSchema;
use std::panic;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct State {
    x: u8,
}

#[derive(JsonSchema, Clone, Debug, Serialize, Deserialize, Hash, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Add {
    pub x: u8,
}

#[derive(JsonSchema, Clone, Debug, Serialize, Deserialize, Hash, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "function")]
pub enum Action {
    Add(Add),
}

pub trait WriteActionable {
    fn action(self, caller: String, state: State) -> WriteResult<State, ()>;
}

impl WriteActionable for Add {
    fn action(self, _caller: String, mut state: State) -> WriteResult<State, ()> {
        panic!("oh no!");
        // panic::catch_unwind(|| {
        //     panic!("oh no!");
        // });

        state.x = self.x;

        WriteResult::Success(state)
    }
}


#[warp_contract(write)]
pub fn handle(mut state: State, action: Action) -> WriteResult<State, ()> {
    let effective_caller = SmartWeave::caller();
    match action {
        Action::Add(action) => action.action(effective_caller, state)
    }
}
