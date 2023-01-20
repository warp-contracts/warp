This directory includes the build and the types of Pianity's ERC1155 WASM contract written in Rust.

The specific commit used to make this build is available here
<https://github.com/pianity/pianity-smartcontracts-next/tree/2f008ce5d032574ed4d0443ee5e22ef390365e29>.
It includes patches that makes it use Msgpack instead of JSON (that is the default at the time of
writing) as its serialization format for the WASM<->JS bridge.
