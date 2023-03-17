use serde::{Serialize, Deserialize};
use warp_contracts::{warp_contract, handler_result::{WriteResult, ViewResult}};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct State {
    x: u8,
}

#[derive(Debug, Deserialize)]
pub struct Action {
    x: u8,
}

#[derive(Debug, Serialize)]
pub struct View {
    x: u8,
}

#[warp_contract(write)]
pub fn handle(mut state: State, action: Action) -> WriteResult<State, ()> {
    state.x = action.x;
    WriteResult::Success(state)
}

#[warp_contract(view)]
pub fn view(state: &State, _action: Action) -> ViewResult<View, ()> {
    ViewResult::Success(View { x: state.x })
}
