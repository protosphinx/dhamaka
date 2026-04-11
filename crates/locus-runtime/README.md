# locus-runtime

The Locus inference runtime, written in Rust, compiled to WebAssembly.

This is the hot path. Everything in here — matmul, RMSNorm, softmax, rotary embeddings, SwiGLU, KV-cached self-attention, temperature/top-k/top-p sampling — runs inside a WASM module instantiated by the Locus SDK in any modern browser tab.

## Why Rust

Transformer inference is a lot of f32 math repeated once per generated token. JavaScript can do it, Rust-compiled-to-WASM runs it at roughly native speed. That speed is the whole point of Locus. The tradeoff is that you need a Rust toolchain to build the `.wasm` (or use the prebuilt one checked in under `packages/hub/public/runtime/`).

## Build

```sh
./build.sh            # cargo build --release --target wasm32-unknown-unknown
./build.sh --check    # also run the native test suite
```

The script installs `wasm32-unknown-unknown` on demand, compiles the crate at `opt-level = 3` with fat LTO, and stages the resulting `.wasm` at `packages/hub/public/runtime/locus-runtime.wasm` where the dev server and the hub pick it up.

## Tests

```sh
cargo test
```

27 unit tests cover every primitive:

- RNG determinism + value ranges (`rng.rs`)
- matmul, RMSNorm, softmax (numerical stability, translation invariance), SwiGLU/SiLU, in-place add/mul, rotary norm preservation (`tensor.rs`)
- greedy, top-k, top-p, temperature, RNG determinism for the sampler (`sampler.rs`)
- forward pass produces finite logits, is deterministic, and position-sensitive via RoPE + KV cache (`transformer.rs`)
- weight initialization is reproducible and the tokenize/detokenize round trip is safe (`model.rs`)

## Module map

```
src/
├── lib.rs        crate entry, ABI version
├── abi.rs        #[no_mangle] extern "C" surface
├── rng.rs        xorshift64* + FNV-1a seed hashing
├── tensor.rs     matmul, rmsnorm, softmax, silu, rope, add/mul
├── sampler.rs    temperature + top-k + top-p + greedy
├── transformer.rs small transformer block + KV cache + forward()
└── model.rs      random-weights model + prompt tokenizer + vocab
```

## ABI

JavaScript talks to this crate over a tiny C ABI. The full list is in `src/abi.rs`:

```text
locus_version()                      -> u32
locus_alloc(len)                     -> *mut u8
locus_free(ptr, len)                 -> void
locus_init(w, wl, c, cl)             -> *mut Context
locus_destroy(ctx)                   -> void
locus_reset(ctx)                     -> void
locus_set_sampling(ctx, t, k, p, m)  -> void
locus_feed_prompt(ctx, ptr, len)     -> void
locus_next_token(ctx, out, cap)      -> i32   (-1 on EOS)
```

JS writes prompt bytes into WASM linear memory via `locus_alloc`, hands the pointer to `locus_feed_prompt`, then loops on `locus_next_token` to stream UTF-8 bytes back out.

The SDK's `WasmEngine` (`packages/runtime/src/wasm-engine.js`) is the reference client and runs this ABI end-to-end in both Node (via `WebAssembly.instantiate`) and the browser (via `WebAssembly.instantiateStreaming`).

## v0.1 caveats

- The v0.1 model is a **tiny random-weights transformer**: 32-dim hidden, 2 layers, 1 head, 64-entry vocab. Real math, not real English. It exists to prove the stack works and to give us something that compiles to a 56 KB `.wasm` anyone can download and run.
- Real weight loading — quantized SmolLM2-360M tensors from the hub — lands when we ship the artifacts.
- No SIMD yet. `-C target-feature=+simd128` is a one-line build change once we have a baseline benchmark to measure against.
- No WebGPU fast path yet.

None of these caveats change the ABI, so the SDK and playground don't need to move when the real model arrives.
