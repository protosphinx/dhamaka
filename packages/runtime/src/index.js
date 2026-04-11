// @locus/runtime — inference engine entry point.
//
// The runtime exposes a single small interface, Engine, that every backend
// (Chrome window.ai, our Rust WASM runtime, or the mock dev engine) must
// implement. The SDK talks only to this interface, so swapping engines is
// a one-line change.

export { Engine } from "./engine.js";
export { MockEngine } from "./mock-engine.js";
export { WasmEngine } from "./wasm-engine.js";
export { WindowAiBackend } from "./window-ai-backend.js";
export { Tokenizer } from "./tokenizer.js";
export { createEngine } from "./factory.js";
