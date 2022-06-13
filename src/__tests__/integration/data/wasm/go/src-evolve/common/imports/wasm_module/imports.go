package wasm_module

import (
	"syscall/js"
)

func RegisterWasmModule(wasmModuleId string) {
	importModule().Call("registerWasmModule", wasmModuleId)
}

func importModule() js.Value {
	return js.Global().Get("redstone").Get("go").Get("WasmModule")
}
