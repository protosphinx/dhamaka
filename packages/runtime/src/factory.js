// Pick an inference backend based on environment capabilities.
//
// Priority (highest first):
//   1. window.ai           — Chrome Prompt API / Gemini Nano (resident, free, fastest when present)
//   2. transformers        — @huggingface/transformers, real cross-browser LLM runtime
//   3. wasm                — our compiled Rust runtime (v2 target, not yet competitive)
//   4. mock                — deterministic stand-in for Node / tests / dev
//
// `createEngine({ backend: "auto" })` picks the first one that works in the
// current environment. Callers can force a specific backend by passing
// `backend: "mock" | "wasm" | "window-ai" | "transformers"`.

import { MockEngine } from "./mock-engine.js";
import { WasmEngine } from "./wasm-engine.js";
import { WindowAiBackend } from "./window-ai-backend.js";
import { TransformersBackend } from "./transformers-backend.js";

/**
 * @param {object} options
 * @param {"auto"|"mock"|"wasm"|"window-ai"|"transformers"} [options.backend="auto"]
 * @param {string}  [options.wasmUrl]
 * @param {string}  [options.model]            Transformers.js HF model id
 * @param {string}  [options.task]             Transformers.js pipeline task
 * @param {string}  [options.cdn]              Transformers.js CDN override
 * @param {string}  [options.systemPrompt]
 */
export function createEngine(options = {}) {
  const backend = options.backend ?? "auto";

  if (backend === "mock") return new MockEngine(options);
  if (backend === "wasm") return new WasmEngine(options);
  if (backend === "window-ai") return new WindowAiBackend(options);
  if (backend === "transformers") return new TransformersBackend(options);

  // auto: prefer window.ai → transformers → wasm → mock.
  //
  // window.ai is the fastest (shared with the browser, GPU-accelerated)
  //   but Chrome-only at the moment.
  // transformers is the primary cross-browser runtime today — real models,
  //   real quantization, real tokenization, none of which we want to
  //   reimplement from scratch.
  // wasm is our Rust runtime. It's still here but it's a v2 swap target
  //   right now (no real weights, no SIMD, no quantization yet).
  // mock is the Node / test-only stand-in.
  if (WindowAiBackend.isAvailable()) return new WindowAiBackend(options);
  if (TransformersBackend.isAvailable()) return new TransformersBackend(options);
  if (options.wasmUrl) return new WasmEngine(options);
  if (
    typeof WebAssembly !== "undefined" &&
    typeof fetch === "function" &&
    typeof window !== "undefined"
  ) {
    return new WasmEngine(options);
  }
  return new MockEngine(options);
}
