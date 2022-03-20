package impl

import (
	"errors"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common/imports/smartweave"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common/imports/transaction"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/types"
)

func Transfer(state types.PstState, action types.TransferAction) (*types.PstState, error) {
	if action.Qty == 0 {
		return nil, errors.New("[CE:ITQ] invalid transfer qty")
	}

	caller := transaction.Owner()

	if callerBalance, ok := state.Balances[caller]; ok {
		if callerBalance < action.Qty {
			return nil, errors.New("[CE:CBNE] caller balance not enough: " + string(state.Balances[caller]))
		}

		callerBalance -= action.Qty
		state.Balances[caller] = callerBalance

		if targetBalance, ok := state.Balances[action.Target]; ok {
			targetBalance += action.Qty
			state.Balances[action.Target] = targetBalance
		} else {
			state.Balances[action.Target] = action.Qty
		}

	} else {
		return nil, errors.New("[CE:CNF] caller not found: " + caller)
	}

	return &state, nil
}

func Balance(state types.PstState, action types.BalanceAction) (*types.BalanceResult, error) {
	if targetBalance, ok := state.Balances[action.Target]; ok {
		return &types.BalanceResult{
			Balance: targetBalance,
		}, nil
	} else {
		return nil, errors.New("[CE:TNF] target not found: " + action.Target)
	}
}

func ForeignCall(state types.PstState, action types.ForeignCallAction) (*types.PstState, error) {
	if action.ContractTxId == "bad_contract" {
		return nil, errors.New("[CE:WFC] Wrong foreign contract")
	}

	result := smartweave.ReadContractState(action.ContractTxId)
	if result.Get("ticker").String() == "FOREIGN_PST" {
		for key, _ := range state.Balances {
			state.Balances[key] += 1000
		}
	}

	return &state, nil
}
