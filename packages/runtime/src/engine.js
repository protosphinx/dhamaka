// The abstract Engine interface. Every backend extends this.
//
// The contract is deliberately minimal:
//
//   load({ artifacts, entry }) -> Promise<void>
//   generate(prompt, options) -> AsyncIterable<string>   // yields tokens
//   complete(prompt, options) -> Promise<string>         // convenience
//   unload() -> Promise<void>
//   info() -> { id, params, quantization, contextLength, tokensPerSecond? }

export class Engine {
  constructor() {
    if (new.target === Engine) {
      throw new Error(
        "Engine is abstract — use MockEngine, WasmEngine, or another concrete backend.",
      );
    }
    this.loaded = false;
    this._entry = null;
  }

  /**
   * Load model artifacts into the engine.
   * @param {{ entry: object, artifacts: Record<string, Uint8Array> }} _payload
   */
  async load(_payload) {
    throw new Error("not implemented");
  }

  /**
   * Stream tokens for a prompt.
   * @param {string} _prompt
   * @param {object} [_options]
   * @returns {AsyncIterable<string>}
   */
  async *generate(_prompt, _options) {
    throw new Error("not implemented");
  }

  /**
   * Convenience: drain generate() into a single string.
   */
  async complete(prompt, options) {
    let out = "";
    for await (const token of this.generate(prompt, options)) {
      out += token;
    }
    return out;
  }

  async unload() {
    this.loaded = false;
    this._entry = null;
  }

  info() {
    return {
      id: this._entry?.id ?? "unknown",
      params: this._entry?.params ?? "?",
      quantization: this._entry?.quantization ?? "?",
      contextLength: this._entry?.contextLength ?? 0,
    };
  }
}
