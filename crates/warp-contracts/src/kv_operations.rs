use super::js_imports::KV;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_wasm_bindgen::from_value;
use warp_contracts_core::{handler_result::ViewResult, methods::to_json_value};

#[derive(Debug)]
pub enum KvError {
    NotFound,
}

pub async fn kv_get<T: DeserializeOwned + Default>(key: &str) -> ViewResult<T, KvError> {
    match KV::get(key).await {
        Ok(a) if !a.is_null() => match from_value(a) {
            Ok(v) => ViewResult::Success(v),
            Err(e) => ViewResult::RuntimeError(format!("{e:?}")),
        },
        Ok(_) => ViewResult::ContractError(KvError::NotFound),
        Err(e) => ViewResult::RuntimeError(format!("{e:?}")),
    }
}

pub async fn kv_put<T: Serialize>(key: &str, value: T) -> Result<(), String> {
    match to_json_value(&value) {
        Ok(v) => match KV::put(key, v).await {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("{e:?}")),
        },
        Err(e) => Err(format!("{:?}", e)),
    }
}
