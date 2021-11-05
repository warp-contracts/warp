/**
 */
 export async function handle(state, action) {
    const stakingContractTxId = state.stakingContractTxId;
    const owner = state.owner;

    const _input = action.input;
    const _msgSender = action.caller;
      
    if (_input.function === 'approveAndStake') {
      const amount = _input.amount;

      if (_msgSender !== owner) {
        throw new ContractError('Orchestrator can be controlled only by the owner');
      }

      // TODO: use "view" functions here
      const stakingContractState = await SmartWeave.contracts.readContractState(stakingContractTxId);
      const tokenTxId = stakingContractState.tokenTxId;

  
      // TODO: use "view" functions here
      const tokenState = await SmartWeave.contracts.readContractState(tokenTxId);
      if (tokenState.balances[_msgSender] < amount) {
        throw new ContractError('Cannot stake more token than you hold unstaked');
      }

      await SmartWeave.contracts.write(tokenTxId, {
        function: 'approve',
        spender: stakingContractTxId,
        amount
      });

      await SmartWeave.contracts.write(stakingContractTxId, {
        function: 'stake',
        amount
      });
  
      return { state };
    }
  
    throw new ContractError(`No function supplied or function not recognised: "${_input.function}"`);
  }
  