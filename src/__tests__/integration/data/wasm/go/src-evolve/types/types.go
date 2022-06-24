package types

import (
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common_types"
)

type PstState struct {
	Ticker    string            `json:"ticker"`
	Name      string            `json:"name"`
	Owner     string            `json:"owner"`
	Evolve    string            `json:"evolve"`
	CanEvolve bool              `json:"canEvolve"`
	Balances  map[string]uint64 `json:"balances"`
}

type TransferAction struct {
	common_types.Action
	Target string `json:"target"`
	Qty    uint64 `json:"qty"`
}

type EvolveAction struct {
	common_types.Action
	Value string `json:"value"`
}

type BalanceAction struct {
	common_types.Action
	Target string `json:"target"`
}

type ForeignCallAction struct {
	common_types.Action
	ContractTxId string `json:"contractTxId"`
}

type BalanceResult struct {
	Balance uint64 `json:"balance"`
}
