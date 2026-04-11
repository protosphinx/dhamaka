// Pick a backend based on environment capabilities and user preference.

import { MockEngine } from "./mock-engine.js";
import { WasmEngine } from "./wasm-engine.js";

/**
 * @param {object} options
 * @param {"auto"|"mock"|"wasm"} [options.backend="auto"]
 * @param {string} [options.wasmUrl]
 */
export function createEngine(options = {}) {
  const backend = options.backend ?? "auto";

  if (backend === "mock") return new MockEngine(options);
  if (backend === "wasm") return new WasmEngine(options);

  // auto:
  //   - if a wasmUrl is explicitly configured, use WasmEngine
  //   - else in a browser where WebAssembly + fetch exist, use WasmEngine
  //     with the default wasm path (served by the hub at /runtime/…)
  //   - else (Node, or WebAssembly missing) fall back to MockEngine so tests
  //     and CLI workflows still run
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
