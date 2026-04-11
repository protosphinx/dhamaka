# Changelog

All notable changes to Dhamaka are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-11

The first cut. End-to-end browser-native LLM stack with a real Rust inference
runtime compiled to WebAssembly, a cross-site model cache, and a JS SDK that
drives it all.

### Runtime (Rust → WebAssembly)

- New crate `crates/dhamaka-runtime` written in pure Rust, zero dependencies.
- Tensor primitives: `matmul`, `rmsnorm`, numerically stable `softmax`,
  `silu`, in-place `add` / `mul`, and rotary position embeddings (`rope`).
- Sampler: one-pass temperature + top-k + top-p + greedy with a deterministic
  xorshift64* RNG seeded from prompt bytes.
- Transformer kernel: Llama-style block (RMSNorm → Q/K/V → RoPE →
  KV-cached self-attention → output projection → RMSNorm → SwiGLU FFN →
  residual) with `MAX_CTX = 512`.
- Tiny random-weights v0.1 model (32-dim hidden, 2 layers, 1 head, 64-entry
  vocab) so the whole pipeline exercises real f32 math end-to-end.
- `#[no_mangle] extern "C"` ABI exposed to WebAssembly:
  `dhamaka_version`, `dhamaka_alloc`, `dhamaka_free`, `dhamaka_init`,
  `dhamaka_destroy`, `dhamaka_reset`, `dhamaka_set_sampling`,
  `dhamaka_feed_prompt`, `dhamaka_next_token`.
- `build.sh` helper that installs the `wasm32-unknown-unknown` target on
  demand, compiles `release` with fat LTO, and stages the resulting 56 KB
  `.wasm` into `packages/hub/public/runtime/`.
- 27 native `cargo test` cases covering every primitive, the sampler laws,
  forward-pass determinism, and position sensitivity via RoPE + KV cache.

### SDK (`dhamaka`)

- `Dhamaka.load(modelId, options)` fetches a model through the hub, loads
  the compiled WASM runtime, and returns an instance with `complete`,
  `stream`, `chat`, `info`, `evict`, `localModels`, and `unload`.
- `Chat` class with system prompts, streaming, reset, and per-turn history.
- `HubClient` that speaks a typed `postMessage` protocol with the hub iframe
  and falls back to per-origin IndexedDB when the iframe is unreachable or
  to an in-memory store when running in Node.
- Tiered storage mode reporting — `shared`, `storage-access`, `partitioned`,
  `site-local`, `extension` — with `requestStorageAccess()` for a one-click
  user-gated opt-in to unpartitioned storage.
- Auto-detection of the Dhamaka browser extension; when present the SDK
  routes all hub messages through it to sidestep storage partitioning.
- OpenAI-compatible `/v1/chat/completions` shim with streaming + non-streaming
  that robustly parses `string` / `Blob` / `ArrayBuffer` / `TypedArray` bodies.

### Runtime adapter (`@dhamaka/runtime`)

- `Engine` abstract interface.
- `WasmEngine` — loads the compiled Rust `.wasm`, verifies the ABI version,
  writes prompt bytes into WASM linear memory via `dhamaka_alloc`, drives
  `dhamaka_feed_prompt` + `dhamaka_next_token` in a loop, decodes UTF-8, and
  yields tokens. Honors `AbortSignal`.
- `MockEngine` — dependency-free stand-in for development when the real
  runtime isn't available. Streams canned responses at ~45 tok/s.
- `createEngine({ backend })` that prefers `WasmEngine` in browsers and
  `MockEngine` in Node.

### Hub (`@dhamaka/hub`)

- Static site that runs in a hidden iframe embedded by every Dhamaka-powered
  consumer. Stores models in IndexedDB and streams `ArrayBuffer`s back over
  `postMessage` using transferables (zero-copy).
- SHA-256 content-addressed integrity checks on every artifact.
- Storage Access API integration so strict browsers can still get
  unpartitioned storage on a user gesture.
- Serves the compiled `dhamaka-runtime.wasm` alongside model artifacts.
- JSON Schema draft-07 for the manifest format.

### Browser extension (`@dhamaka/extension`)

- Manifest V3 skeleton with a background service worker that stores models in
  the extension's own origin — shared across every site on the machine,
  sidestepping storage partitioning entirely.
- Content script bridge (`postMessage` ↔ `chrome.runtime.sendMessage`).
- SDK detects the extension via an injected `window.__dhamaka_extension__`
  marker and prefers it over the iframe hub.
- Options page listing cached models with one-click eviction.

### Playground (`@dhamaka/playground`)

- Zero-dependency Node dev server that runs the hub on `:5174` and the
  playground on `:5173`, serving the compiled WASM with the right MIME and
  CORS headers.
- Live UI with a model picker, progress bar, live telemetry (cache hit,
  load ms, tokens/sec, backend, memory), stateful chat, abort/stop button,
  history reset, and eviction controls.
- Importmap-based module wiring — no bundler, no build step for JS edits.

### Tests, CI, and infrastructure

- **45 JS tests** (`node --test`, zero dependencies) covering the SDK, the
  hub, the OpenAI shim, all engine adapters, and four end-to-end integration
  tests that load the real compiled `.wasm` in Node and drive it through the
  full ABI.
- **27 Rust tests** (`cargo test`) covering every primitive.
- **CI** (`.github/workflows/ci.yml`) with two jobs: `rust` compiles the
  crate, runs cargo tests, and uploads the wasm artifact; `js` downloads the
  artifact and runs `node --test` on Node 20 and Node 22, plus a smoke-test
  that curl-s every dev-server endpoint.
- Animated SVG banner at the top of the README (rainbow gradient + pulsing
  spotlight + drifting scanline) served from `docs/banner.svg`.

### Known limitations for v0.1.0

- The v0.1 model is a 32-dim / 2-layer random-weights transformer, so output
  is stream-of-tokens, not coherent English. When the SmolLM2-360M Q4
  artifacts arrive they'll plug into the same `dhamaka_init` entry point
  without SDK changes.
- No SIMD128 build of the runtime yet (`-C target-feature=+simd128` is a
  one-line change; it's gated on having a baseline benchmark).
- No WebGPU fast path.
- The other models in the registry (`dhamaka-code`, `dhamaka-sql`,
  `dhamaka-json`, `dhamaka-summarize`, `dhamaka-embed`) are listed as
  `status: planned`.

[0.1.0]: https://github.com/protosphinx/dhamaka/releases/tag/v0.1.0
