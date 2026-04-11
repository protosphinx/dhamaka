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

  // auto: prefer wasm if a url is configured, otherwise fall back to mock.
  if (options.wasmUrl) return new WasmEngine(options);
  return new MockEngine(options);
}
