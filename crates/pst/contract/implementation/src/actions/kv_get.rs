use super::AsyncViewActionable;
use async_trait::async_trait;
use warp_contracts::{handler_result::ViewResult::*, kv_operations::kv_get};
use warp_pst::{
    action::{KvGet, PstKvGetResult, PstViewResponse, PstViewResult},
    state::PstState,
};

#[async_trait(?Send)]
impl AsyncViewActionable for KvGet {
    async fn action(self, _caller: String, _state: &PstState) -> PstViewResult {
        match kv_get(&self.key).await {
            Success(a) => {
                PstViewResult::Success(PstViewResponse::KvGetResult(PstKvGetResult {
                    key: self.key,
                    value: a,
                }))
            }
            ContractError(_) =>  {
                PstViewResult::Success(PstViewResponse::KvGetResult(PstKvGetResult {
                    key: self.key,
                    value: "".to_owned(),
                }))
            },
            RuntimeError(e) => RuntimeError(e),
        }
    }
}
