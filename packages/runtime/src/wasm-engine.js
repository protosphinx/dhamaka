// WasmEngine — the real Rust-backed inference engine.
//
// Loads the compiled Locus runtime (`locus-runtime.wasm`, built from
// the `crates/locus-runtime` Rust crate), instantiates it, and drives
// generation through the C ABI documented in `crates/locus-runtime/src/abi.rs`:
//
//   locus_version()                      -> u32
//   locus_alloc(len)                     -> *mut u8
//   locus_free(ptr, len)                 -> void
//   locus_init(w, wl, c, cl)             -> *mut Context
//   locus_destroy(ctx)                   -> void
//   locus_set_sampling(ctx, t, k, p, m)  -> void
//   locus_feed_prompt(ctx, ptr, len)     -> void
//   locus_next_token(ctx, out, cap)      -> i32  (-1 on EOS)
//   locus_reset(ctx)                     -> void
//
// JS writes prompt bytes into WASM linear memory via `locus_alloc`, then
// loops on `locus_next_token` to stream UTF-8 token bytes back out.

import { Engine } from "./engine.js";

const ABI_VERSION = 1;
const DEFAULT_WASM_URL = "/runtime/locus-runtime.wasm";

export class WasmEngine extends Engine {
  constructor(options = {}) {
    super();
    this.wasmUrl = options.wasmUrl ?? DEFAULT_WASM_URL;
    this._instance = null;
    this._ctx = 0;
    this._decoder = new TextDecoder();
    this._encoder = new TextEncoder();
  }

  async _instantiate() {
    if (this._instance) return this._instance;
    const res = await fetch(this.wasmUrl);
    if (!res.ok) {
      throw new Error(
        `WasmEngine: failed to fetch ${this.wasmUrl} (${res.status}). ` +
          `Did you run crates/locus-runtime/build.sh?`,
      );
    }
    const imports = {
      env: {
        // The Rust crate is pure compute — no host imports required. We
        // still provide stubs for any panic/abort that leaks through.
        abort: () => {
          throw new Error("wasm: abort");
        },
      },
    };
    const { instance } = await WebAssembly.instantiateStreaming
      ? await WebAssembly.instantiateStreaming(res, imports)
      : await WebAssembly.instantiate(await res.arrayBuffer(), imports);

    const got = instance.exports.locus_version?.() >>> 0;
    if (got !== ABI_VERSION) {
      throw new Error(
        `WasmEngine: ABI mismatch. Expected ${ABI_VERSION}, got ${got}`,
      );
    }
    this._instance = instance;
    return instance;
  }

  _memory() {
    return new Uint8Array(this._instance.exports.memory.buffer);
  }

  _writeBytes(bytes) {
    if (bytes == null || bytes.byteLength === 0) return { ptr: 0, len: 0 };
    const { locus_alloc } = this._instance.exports;
    const ptr = locus_alloc(bytes.byteLength) >>> 0;
    this._memory().set(bytes, ptr);
    return { ptr, len: bytes.byteLength };
  }

  _freeBytes(ptr, len) {
    if (!ptr || !len) return;
    this._instance.exports.locus_free(ptr, len);
  }

  async load({ entry, artifacts } = {}) {
    const inst = await this._instantiate();
    const { locus_init } = inst.exports;

    // v0.1 of the runtime uses a deterministic random model seeded from the
    // config bytes. When real weights arrive, they flow through the same
    // entry point unchanged.
    const weightsBytes = artifacts?.weights ?? new Uint8Array();
    const configBytes =
      artifacts?.config ?? this._encoder.encode(entry?.id ?? "locus-micro");

    const w = this._writeBytes(weightsBytes);
    const c = this._writeBytes(configBytes);

    this._ctx = locus_init(w.ptr, w.len, c.ptr, c.len) >>> 0;
    if (!this._ctx) {
      throw new Error("WasmEngine: locus_init returned null");
    }

    // Free the temporary input buffers — the runtime has copied what it
    // needs.
    this._freeBytes(w.ptr, w.len);
    this._freeBytes(c.ptr, c.len);

    this._entry = entry ?? null;
    this.loaded = true;
  }

  async *generate(prompt, options = {}) {
    if (!this.loaded || !this._ctx) {
      throw new Error("WasmEngine: load() must be called before generate()");
    }
    const inst = this._instance;
    const {
      locus_set_sampling,
      locus_feed_prompt,
      locus_next_token,
      locus_reset,
    } = inst.exports;

    const temperature = options.temperature ?? 0.7;
    const topK = options.topK ?? 40;
    const topP = options.topP ?? 0.95;
    const maxTokens = options.maxTokens ?? 256;
    const signal = options.signal;

    locus_reset(this._ctx);
    locus_set_sampling(this._ctx, temperature, topK, topP, maxTokens);

    // Feed the prompt.
    const promptBytes = this._encoder.encode(prompt ?? "");
    const p = this._writeBytes(promptBytes);
    try {
      locus_feed_prompt(this._ctx, p.ptr, p.len);
    } finally {
      this._freeBytes(p.ptr, p.len);
    }

    // Stream tokens. Each call writes up to OUT_CAP bytes into a scratch
    // buffer we hand to the runtime, then we decode as UTF-8 and yield.
    const OUT_CAP = 64;
    const outPtr = inst.exports.locus_alloc(OUT_CAP) >>> 0;
    try {
      while (true) {
        if (signal?.aborted) return;
        const n = locus_next_token(this._ctx, outPtr, OUT_CAP);
        if (n < 0) return; // EOS / max tokens
        if (n === 0) continue;
        const bytes = this._memory().slice(outPtr, outPtr + n);
        yield this._decoder.decode(bytes, { stream: true });
      }
    } finally {
      this._freeBytes(outPtr, OUT_CAP);
    }
  }

  async unload() {
    if (this._instance && this._ctx) {
      this._instance.exports.locus_destroy(this._ctx);
    }
    this._ctx = 0;
    this._instance = null;
    await super.unload();
  }

  info() {
    return {
      ...super.info(),
      backend: "wasm",
      wasmUrl: this.wasmUrl,
      abiVersion: ABI_VERSION,
    };
  }
}
