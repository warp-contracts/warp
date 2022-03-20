package common

import (
	"encoding/json"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common/imports/wasm_module"
	"github.com/redstone-finance/redstone-contracts-wasm/go/src/common_types"
	"math/rand"
	"syscall/js"
	"time"
)

type WasmInstance struct {
	ModuleId string
}

var singleton *WasmInstance

func GetWasmInstance() *WasmInstance {
	// it is not thread safe, but wasm is single-threaded
	// alternatively could use sync.Once - but it would increase the binary size.
	if singleton == nil {
		singleton = &WasmInstance{}
	}
	return singleton
}

func Run(contract common_types.SwContract) {
	// generating random module id and registering it on host
	// a workaround for potential wasm modules collision
	rand.Seed(time.Now().UnixNano())
	moduleId := RandSeq(20)

	js.Global().Set(moduleId, make(map[string]interface{}))
	wasmModule := js.Global().Get(moduleId)
	// the Go way of defining WASM exports...
	// standard "exports" from the wasm module do not work here...
	// that's kinda ugly TBH
	wasmModule.Set("handle", handle(contract))
	wasmModule.Set("initState", initState(contract))
	wasmModule.Set("currentState", currentState(contract))
	wasmModule.Set("lang", lang())
	wasmModule.Set("version", version())

	GetWasmInstance().ModuleId = moduleId
	wasm_module.RegisterWasmModule(moduleId)

	// Prevent the function from returning, which is required in a wasm module
	// i.e. "Error: Go program has already exited" is thrown otherwise on host
	<-make(chan bool)
}

func handle(contract common_types.SwContract) js.Func {
	// note: each 'exported' function has to be wrapped into
	// js.FuncOf(func(this js.Value, args []js.Value) interface{}
	// - that's kinda ugly too...
	return js.FuncOf(func(this js.Value, handleArgs []js.Value) interface{} {

		// exception handling
		promisifiedHandler := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			resolve := args[0]
			reject := args[1]

			go func() {
				actionJson := handleArgs[0].String()
				var action common_types.Action
				err := action.UnmarshalJSON([]byte(actionJson))
				if err != nil {
					doReject(err, reject)
				}

				_, err = json.Marshal(action)
				if err != nil {
					doReject(err, reject)
				}

				state, result, err := contract.Handle(action, []byte(actionJson))

				if err != nil {
					// err should be an instance of `error`, eg `errors.New("some error")`
					doReject(err, reject)
				} else {
					if state != nil {
						contract.UpdateState(state)
					}
					resultMarshalled, _ := json.Marshal(result)
					resolve.Invoke(string(resultMarshalled))
				}
			}()

			return nil
		})

		promiseConstructor := js.Global().Get("Promise")
		return promiseConstructor.New(promisifiedHandler)
	})
}

func doReject(err error, reject js.Value) {
	errorConstructor := js.Global().Get("Error")
	errorObject := errorConstructor.New(err.Error())
	reject.Invoke(errorObject)
}

func currentState(contract common_types.SwContract) interface{} {
	return js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		data, _ := json.Marshal(contract.CurrentState())
		return string(data)
	})
}

func initState(contract common_types.SwContract) interface{} {
	return js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		contract.InitState(args[0].String())
		return nil
	})
}

func version() interface{} {
	return js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		return 1
	})
}

// Lang workaround for now to simplify type reading without as/loader or wasm-bindgen
// 1 = assemblyscript
// 2 = rust
// 3 = go
// 4 = swift
// 5 = c
func lang() interface{} {
	return js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		return 3
	})
}
