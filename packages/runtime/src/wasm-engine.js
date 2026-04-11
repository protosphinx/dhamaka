// WasmEngine — the real one.
//
// This is the seam where the compiled WebAssembly inference runtime plugs in.
// The actual WASM module (Rust → wasm32-unknown-unknown, SIMD enabled, with
// an optional WebGPU fast path) is under construction. Until it lands, this
// file documents the exact interface the module must expose and provides a
// loader that will Just Work™ once the .wasm drops into place.
//
// The planned ABI (candle/llama.cpp-style, kept intentionally small):
//
//   dhamaka_init(weights_ptr, weights_len, config_ptr, config_len) -> ctx
//   dhamaka_tokenize(ctx, text_ptr, text_len) -> { tokens_ptr, tokens_len }
//   dhamaka_feed(ctx, tokens_ptr, tokens_len) -> void
//   dhamaka_sample(ctx, temperature, top_p, top_k) -> token_id
//   dhamaka_detokenize(ctx, token_id) -> { text_ptr, text_len }
//   dhamaka_reset(ctx) -> void
//   dhamaka_free(ctx) -> void
//
// Memory is managed with a bump allocator exposed through dhamaka_alloc /
// dhamaka_free_bytes so the JS side can hand large buffers in without copies.

import { Engine } from "./engine.js";
import { Tokenizer } from "./tokenizer.js";

export class WasmEngine extends Engine {
  constructor(options = {}) {
    super();
    this.wasmUrl = options.wasmUrl ?? null;
    this._module = null;
    this._instance = null;
    this._ctx = 0;
    this.tokenizer = new Tokenizer();
  }

  async _instantiate() {
    if (this._instance) return this._instance;
    if (!this.wasmUrl) {
      throw new Error(
        "WasmEngine: no WASM module configured. The Dhamaka WASM runtime is still " +
          "being built — use MockEngine for development, or pass { wasmUrl } once " +
          "the real module is available.",
      );
    }
    const res = await fetch(this.wasmUrl);
    if (!res.ok) throw new Error(`WasmEngine: fetch failed: ${res.status}`);
    const { instance, module } = await WebAssembly.instantiateStreaming(res, {
      env: {
        // Host imports the WASM module may call into. Kept deliberately minimal.
        abort: (msg, file, line, col) => {
          throw new Error(`wasm abort at ${file}:${line}:${col} (${msg})`);
        },
        now: () => performance.now(),
        log: (ptr, len) => {
          // Optional diagnostic channel — noop by default.
          void ptr; void len;
        },
      },
    });
    this._module = module;
    this._instance = instance;
    return instance;
  }

  async load({ entry, artifacts } = {}) {
    const inst = await this._instantiate();
    const { dhamaka_init, dhamaka_alloc } = inst.exports;
    if (!dhamaka_init || !dhamaka_alloc) {
      throw new Error("WasmEngine: module is missing required exports");
    }

    const weights = artifacts?.weights;
    const config = artifacts?.config;
    if (!weights || !config) {
      throw new Error("WasmEngine: artifacts.weights and artifacts.config required");
    }

    const wPtr = dhamaka_alloc(weights.byteLength);
    const cPtr = dhamaka_alloc(config.byteLength);
    const mem = new Uint8Array(inst.exports.memory.buffer);
    mem.set(weights, wPtr);
    mem.set(config, cPtr);

    this._ctx = dhamaka_init(wPtr, weights.byteLength, cPtr, config.byteLength);
    if (!this._ctx) throw new Error("WasmEngine: dhamaka_init returned null");

    if (artifacts?.tokenizer) {
      await this.tokenizer.loadFromBytes(artifacts.tokenizer);
    }
    this._entry = entry ?? null;
    this.loaded = true;
  }

  async *generate(_prompt, _options = {}) {
    // Intentionally routed through the real ABI once the module is in place.
    // Implementation sketch:
    //
    //   const tokens = tokenizer.encode(prompt)
    //   dhamaka_feed(ctx, tokens)
    //   while (emitted < maxTokens && !signal.aborted) {
    //     const id = dhamaka_sample(ctx, temperature, topP, topK)
    //     if (isEos(id)) return
    //     yield tokenizer.decode(id)
    //     emitted++
    //   }
    throw new Error(
      "WasmEngine.generate() is not implemented yet. The Dhamaka WASM runtime is " +
        "under construction. Use MockEngine for now.",
    );
  }

  async unload() {
    const inst = this._instance;
    if (inst && this._ctx && inst.exports.dhamaka_free) {
      inst.exports.dhamaka_free(this._ctx);
    }
    this._ctx = 0;
    this._instance = null;
    this._module = null;
    await super.unload();
  }

  info() {
    return { ...super.info(), backend: "wasm" };
  }
}
