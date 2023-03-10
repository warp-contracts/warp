#[derive(Debug)]
pub enum ViewResult<View, Error> {
    Success(View),
    ContractError(Error),
    RuntimeError(String),
}

#[derive(Debug)]
pub enum WriteResult<State, Error> {
    Success(State),
    ContractError(Error),
    RuntimeError(String),
}
