package impl

import (
	"errors"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common/imports/block"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common/imports/console"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common_types"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/types"
)

type PstContract struct {
	state types.PstState
}

// Handle the function that contract developers actually need to implement
func (c *PstContract) Handle(action common_types.Action, actionBytes []byte) (interface{}, common_types.ActionResult, error) {
	fn := action.Function
	console.Log("Calling", fn)

	console.Log("Block height", block.Height())
	console.Log("Block indep_hash", block.IndepHash())
	console.Log("Block timestamp", block.Timestamp())

	clonedState := c.CloneState().(types.PstState)

	switch fn {
	case "transfer":
		// not sure how to "automatically" handle casting to concrete action impl in Go.
		// https://eagain.net/articles/go-json-kind/
		// https://eagain.net/articles/go-dynamic-json/
		var transfer types.TransferAction
		err := transfer.UnmarshalJSON(actionBytes)
		if err != nil {
			return nil, nil, err
		}
		state, err := Transfer(clonedState, transfer)
		return state, nil, err
	case "balance":
		var balance types.BalanceAction
		err := balance.UnmarshalJSON(actionBytes)
		if err != nil {
			return nil, nil, err
		}
		result, err := Balance(clonedState, balance)
		return nil, result, err
	case "foreignCall":
		var foreignCall types.ForeignCallAction
		err := foreignCall.UnmarshalJSON(actionBytes)
		if err != nil {
			return nil, nil, err
		}
		state, err := ForeignCall(clonedState, foreignCall)
		return state, nil, err
	default:
		return nil, nil, errors.New("[RE:WTF] unknown function: " + fn)
	}
}

func (c *PstContract) InitState(stateJson string) {
	var state types.PstState
	err := state.UnmarshalJSON([]byte(stateJson))
	if err != nil {
		return // TODO: throw in a similar way as in handle
	}
	c.UpdateState(&state)
}

func (c *PstContract) UpdateState(newState interface{}) {
	// note: we're first type asserting here to the pointer to types.PstState
	// - and the retrieving value from the pointer
	c.state = *(newState.(*types.PstState))
}

func (c *PstContract) CurrentState() interface{} {
	return c.state
}

// CloneState TODO: discuss whether it is necessary
// it allows to make the given action transactional, but
// at the cost of performance
func (c *PstContract) CloneState() interface{} {
	json, _ := c.state.MarshalJSON()
	state := types.PstState{}
	err := state.UnmarshalJSON(json)
	if err != nil {
		// TODO: return error
		return types.PstState{}
	}

	return state
}
