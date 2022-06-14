package console

import (
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common/imports"
	"syscall/js"
)

func Log(args ...interface{}) {
	importConsole().Call("log", args[0], args[1:])
}

func importConsole() js.Value {
	return imports.RedStone().Get("console")
}
