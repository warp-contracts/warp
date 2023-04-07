use super::WriteActionable;
use warp_contracts::js_imports::Transaction;
use warp_pst::{
    action::{Evolve, PstWriteResult},
    error::PstError::*,
    state::PstState,
};

impl WriteActionable for Evolve {
    fn action(self, _caller: String, mut state: PstState) -> PstWriteResult {
        if state.can_evolve {
            if state.owner == Transaction::owner() {
                state.evolve = Option::from(self.value);
                PstWriteResult::Success(state)
            } else {
                PstWriteResult::ContractError(OnlyOwnerCanEvolve)
            }
        } else {
            PstWriteResult::ContractError(EvolveNotAllowed)
        }
    }
}
