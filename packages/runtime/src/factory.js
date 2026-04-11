// Pick an inference backend based on environment capabilities.
//
// Priority (highest first):
//   1. window.ai       — Chrome Prompt API / Gemini Nano (resident, shared, fastest)
//   2. wasm            — our compiled Rust runtime
//   3. mock            — deterministic stand-in for Node / tests / dev
//
// Callers can force a specific backend with `{ backend: "mock" | "wasm" | "window-ai" }`.

import { MockEngine } from "./mock-engine.js";
import { WasmEngine } from "./wasm-engine.js";
import { WindowAiBackend } from "./window-ai-backend.js";

/**
 * @param {object} options
 * @param {"auto"|"mock"|"wasm"|"window-ai"} [options.backend="auto"]
 * @param {string} [options.wasmUrl]
 * @param {string} [options.systemPrompt]
 */
export function createEngine(options = {}) {
  const backend = options.backend ?? "auto";

  if (backend === "mock") return new MockEngine(options);
  if (backend === "wasm") return new WasmEngine(options);
  if (backend === "window-ai") return new WindowAiBackend(options);

  // auto: prefer window.ai → wasm → mock.
  if (WindowAiBackend.isAvailable()) return new WindowAiBackend(options);
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
