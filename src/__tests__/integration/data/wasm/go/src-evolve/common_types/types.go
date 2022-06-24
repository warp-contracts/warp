package common_types

type Action struct {
	Function string `json:"function"`
}

type ActionResult = interface{}

// SwContract We need to use "any" (interface{}) type here for the state - as this is
// a common interface for all contracts implemented in Go WASM.
// Version with generics is available on branch ppe/go-generics (but to use it real life
// we need to wait for the official release of Go 1.18 and tinygo compiler with generics
// support added - https://github.com/tinygo-org/tinygo/issues/2158)
//easyjson:skip
type SwContract interface {
	Handle(action Action, actionBytes []byte) (interface{}, ActionResult, error)
	InitState(stateJson string)
	UpdateState(newState interface{})
	CurrentState() interface{}
}
