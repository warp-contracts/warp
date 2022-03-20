package imports

import (
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common"
	"syscall/js"
)

func RedStone() js.Value {
	return js.Global().
		Get("redstone").
		Get("go").
		Get(common.GetWasmInstance().ModuleId).
		Get("imports")
}
