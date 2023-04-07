use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct EvolveState {
    pub can_evolve: bool,
    pub source_transaction_id: Option<String>,
}

impl Default for EvolveState {
    fn default() -> Self {
        EvolveState { can_evolve: true, source_transaction_id: None }
    }
}
