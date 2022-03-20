package main

import (
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/impl"
)

// contract - implementation of the SwContract interface
var contract = impl.PstContract{}

// handles all the WASM-JS related trickery...
func main() {
	common.Run(&contract)
}
