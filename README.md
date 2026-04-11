<!-- ╔══════════════════════════════════════════════════════════════════════╗ -->
<!-- ║                                                                      ║ -->
<!-- ║                           D H A M A K A                              ║ -->
<!-- ║                                                                      ║ -->
<!-- ╚══════════════════════════════════════════════════════════════════════╝ -->

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/banner.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/banner.svg">
  <img src="./docs/banner.svg" alt="Dhamaka — browser-native LLM. Download once. Run anywhere." width="100%">
</picture>

<br/>

**`💥 WASM`** &nbsp;·&nbsp; **`🦀 Rust`** &nbsp;·&nbsp; **`🧠 on-device`** &nbsp;·&nbsp; **`🔒 private`** &nbsp;·&nbsp; **`⚡ instant`** &nbsp;·&nbsp; **`🪶 ~56 KB runtime`**

<br/>

<sub>The banner above is animated — the block letters cycle through a rainbow gradient and the stars pulse. If your renderer doesn't support SMIL (rare), here's the static form:</sub>

```
 ██████╗ ██╗  ██╗ █████╗ ███╗   ███╗ █████╗ ██╗  ██╗ █████╗
 ██╔══██╗██║  ██║██╔══██╗████╗ ████║██╔══██╗██║ ██╔╝██╔══██╗
 ██║  ██║███████║███████║██╔████╔██║███████║█████╔╝ ███████║
 ██║  ██║██╔══██║██╔══██║██║╚██╔╝██║██╔══██║██╔═██╗ ██╔══██║
 ██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██╗██║  ██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

   a browser-native LLM that lives in your tab
   download once · run on every site · forever
```

</div>

---

## ✦ what is this

Dhamaka is a small, fast, instruction-tuned language model that runs **entirely inside your browser** on top of WebAssembly. No server. No API key. No telemetry. The model downloads **once in your user's lifetime** and every Dhamaka-powered site they visit afterwards reuses the same cached weights.

That last part is the whole idea. Every on-device LLM project so far forces each website to redownload the model. Dhamaka breaks that pattern with a cross-origin model hub and a clean SDK any app can drop in.

---

## ✦ the vibe

```
       you                      hub.dhamaka.dev                site-A
        │                              │                         │
        │  first visit to any site     │                         │
        │─────────────────────────────▶│                         │
        │                              │   fetch SmolLM2 (~100MB)│
        │                              │◀────────────────────────┤
        │                              │   store in IndexedDB    │
        │                              │                         │
        │  later visit to site-B       │                         │
        │─────────────────────────────▶│                         │
        │                              │   cache hit ✓           │
        │                              │   stream bytes via      │
        │                              │   postMessage (0-copy)  │
        │                              │────────────────────────▶│
        │                              │                         │
        │   chat runs locally, no net  │                         │
        ◀──────────────────────────────┴─────────────────────────┘
```

One download. Every site after that is an instant cache hit.

---

## ✦ the stack

```
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │   your app                                                   │
  │   ┌────────────────────────────────────────────────────┐     │
  │   │  import { Dhamaka } from "dhamaka"                 │     │
  │   │  const llm = await Dhamaka.load()                  │     │
  │   └────────────────────┬───────────────────────────────┘     │
  │                        │                                     │
  │   packages/sdk         │      public, user-facing API        │
  │   ┌────────────────────▼───────────────────────────────┐     │
  │   │   Dhamaka · Chat · HubClient · OpenAI shim         │     │
  │   └────┬─────────────────────────────┬─────────────────┘     │
  │        │                             │                       │
  │        │ postMessage                 │ Engine iface           │
  │        ▼                             ▼                       │
  │   ┌────────────┐             ┌──────────────────┐            │
  │   │ packages/  │             │ packages/runtime │            │
  │   │    hub     │             │  ┌────────────┐  │            │
  │   │            │             │  │ WasmEngine │  │ default    │
  │   │ iframe +   │             │  ├────────────┤  │            │
  │   │ IndexedDB  │             │  │ MockEngine │  │ dev only   │
  │   │ + OPFS     │             │  └─────┬──────┘  │            │
  │   └────────────┘             │        │         │            │
  │                              │        ▼         │            │
  │                   ┌──────────────────────────────────────┐   │
  │                   │  crates/dhamaka-runtime (Rust)       │   │
  │                   │    matmul · RMSNorm · softmax        │   │
  │                   │    RoPE · KV cache · SwiGLU          │   │
  │                   │    temperature / top-k / top-p       │   │
  │                   │    → dhamaka-runtime.wasm (56 KB)    │   │
  │                   └──────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────────┘
```

| package                 | what it does                                                  |
|-------------------------|---------------------------------------------------------------|
| [`dhamaka-runtime` (Rust)](crates/dhamaka-runtime) | the real inference engine — matmul, RMSNorm, softmax, RoPE, KV-cache, sampling — compiled to WebAssembly |
| [`dhamaka`](packages/sdk)              | public SDK: `Dhamaka.load()`, chat, streaming, OpenAI shim |
| [`@dhamaka/runtime`](packages/runtime) | the JS engine interface: `WasmEngine` (default) + `MockEngine` (dev) |
| [`@dhamaka/hub`](packages/hub)         | the tiny static origin that hosts the cross-site model cache and the `.wasm` runtime |
| [`@dhamaka/extension`](packages/extension) | Manifest V3 browser extension — shared cache across every site on the machine |
| [`@dhamaka/playground`](packages/playground) | a live demo + a zero-dep dev server that runs the whole stack |

---

## ✦ the default model

```
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║    ┌─┐  dhamaka-micro                                         ║
  ║    │▓│                                                        ║
  ║    │▓│  base   ·  SmolLM2-360M-Instruct (HuggingFaceTB)       ║
  ║    │▓│  params ·  360M                                        ║
  ║    │▓│  quant  ·  Q4_K_M                                      ║
  ║    │▓│  size   ·  ~100 MB on disk                             ║
  ║    │▓│  ctx    ·  2048 tokens                                 ║
  ║    │▓│  license·  Apache-2.0                                  ║
  ║    └─┘                                                        ║
  ║                                                               ║
  ║    → instruction-tuned, multilingual-capable, on-device by    ║
  ║      design. small enough to download once. good enough to    ║
  ║      actually use.                                            ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
```

---

## ✦ the future registry

Once the default model works, everything else is just another signed artifact in the hub. Switching is a one-liner.

```
  ┌──────────────────────────┬───────────────────────────────────┐
  │ dhamaka-micro       ⬤   │ the default chat model            │
  │ dhamaka-code        ◎   │ code completion / explanation     │
  │ dhamaka-sql         ◎   │ natural language → SQL            │
  │ dhamaka-json        ◎   │ structured output + tool calls    │
  │ dhamaka-summarize   ◎   │ long-context summarization        │
  │ dhamaka-embed       ◎   │ tiny embeddings for RAG           │
  └──────────────────────────┴───────────────────────────────────┘
           ⬤ shipping      ◎ planned
```

Each variant is its own content-addressed artifact. Once a user downloads any one of them, every Dhamaka-powered site they visit reuses it instantly.

---

## ✦ five-minute quickstart

```bash
git clone https://github.com/protosphinx/dhamaka
cd dhamaka

# one-time: compile the Rust runtime to WebAssembly
crates/dhamaka-runtime/build.sh

# run the dev stack
npm run dev
```

```
  ✦ hub         http://localhost:5174
  ✦ playground  http://localhost:5173

  Dhamaka dev stack running. Ctrl+C to stop.
```

Open **http://localhost:5173**, hit **load**, and you're chatting with a locally-served LLM whose every token comes out of real Rust-compiled-to-WASM transformer math. The playground hot-reads the SDK + runtime sources, so every JS edit shows up on refresh. Re-run `build.sh` to pick up Rust edits.

> Don't have Rust installed? The compiled `.wasm` is checked in under `packages/hub/public/runtime/` so `npm run dev` works on a fresh clone too. Install Rust only if you want to modify the inference engine itself.

---

## ✦ the API

```js
import { Dhamaka } from "dhamaka";

// Load the default model (downloads once, instant after that)
const llm = await Dhamaka.load("dhamaka-micro", {
  onProgress: (p) => console.log(`${p.received} / ${p.total} bytes`),
});

// One-shot
await llm.complete("Explain WASM in one sentence.");

// Streaming
for await (const token of llm.stream("Write a haiku about browsers")) {
  process.stdout.write(token);
}

// Stateful chat
const chat = llm.chat({ system: "You are a helpful assistant." });
await chat.send("Hi!");

// Inspect the cache
llm.info();
// → { model: 'dhamaka-micro', cached: true, loadMs: 42, engine: {...} }
```

### drop-in OpenAI compatibility

```js
import { installOpenAIShim } from "dhamaka/openai";
installOpenAIShim(llm);

// Now every fetch('/v1/chat/completions', …) in your app runs locally.
```

---

## ✦ download once, use everywhere — the honest version

Modern browsers increasingly **partition third-party storage** by the top-level site for privacy. That makes the classic "shared iframe" trick weaker than it used to be. Dhamaka handles this by degrading gracefully at three tiers:

```
  ╭──────────────────────────────────────────────────────────────╮
  │                                                              │
  │   tier 1 · shared hub iframe  (the dream)                    │
  │            one download per user, across all Dhamaka sites   │
  │            ↓ falls back to ↓                                 │
  │                                                              │
  │   tier 2 · Storage Access API                                │
  │            user-gated unpartitioned access when available    │
  │            ↓ falls back to ↓                                 │
  │                                                              │
  │   tier 3 · per-origin IndexedDB                              │
  │            still private, still offline, still fast —        │
  │            just one download per origin instead of one per   │
  │            user                                              │
  │                                                              │
  │   tier 4 · (phase 2) a browser extension                     │
  │            sidesteps partitioning entirely, one local cache  │
  │            for every site on the machine                     │
  │                                                              │
  ╰──────────────────────────────────────────────────────────────╯
```

`Dhamaka.hub.mode()` tells your app which tier it actually got, so you can show a "⚡ shared cache hit" badge when it matters and silently degrade when it doesn't.

---

## ✦ what's real today

```
  [x]  Rust inference runtime compiled to a 56 KB WebAssembly module
       (matmul, RMSNorm, softmax, rotary, KV-cached self-attention,
       SwiGLU/SiLU, top-k + top-p + temperature sampling)
  [x]  27 native cargo tests covering every primitive
  [x]  C ABI (dhamaka_alloc/free/init/feed_prompt/next_token/…) exposed
       to WebAssembly as #[no_mangle] extern "C" exports
  [x]  JS WasmEngine that loads the compiled .wasm and drives the ABI
       end-to-end in both Node and browsers
  [x]  4 Node-side integration tests that instantiate the real .wasm and
       stream tokens through the Rust forward pass
  [x]  hub ↔ sdk postMessage bridge (get / list / delete / progress)
  [x]  IndexedDB-backed hub storage with SHA-256 integrity checks
  [x]  zero-copy ArrayBuffer transfer from hub → consumer
  [x]  Dhamaka.load, complete, stream, chat, info, evict
  [x]  fallback cache (real IndexedDB in browsers, in-memory in Node)
  [x]  Storage Access API tier for unpartitioned storage on strict browsers
  [x]  Manifest V3 browser extension (phase 2) — sidesteps partitioning
  [x]  SDK auto-detection of the extension, with tiered mode reporting
  [x]  OpenAI /v1/chat/completions shim (streaming + non-streaming)
  [x]  manifest + multi-artifact model layout + signed-hash verification
  [x]  manifest.schema.json (JSON Schema draft-07) for tooling
  [x]  playground UI with progress bars, telemetry, cache-hit badge,
       stateful chat, abort/stop button, and reset-history
  [x]  zero-dependency dev server that serves hub + playground + .wasm
       on two ports with correct MIME + CORS
  [x]  45 JS tests + 27 Rust tests, all green
  [x]  GitHub Actions CI that builds the Rust crate, uploads the .wasm
       artifact, and runs the JS test suite against it on Node 20 + 22

  [ ]  Real SmolLM2-360M Q4 weights hosted on hub.dhamaka.dev
  [ ]  SIMD128 build of the runtime
  [ ]  WebGPU fast path
  [ ]  The other registered models (code / sql / json / summarize / embed)
```

**v0.1 honesty note:** the Rust runtime runs real transformer math — real matmul, real attention, real sampling, all inside WebAssembly — but the weights it loads for v0.1 are a tiny random model (32-dim hidden, 2 layers, 64-entry vocab). Output is stream-of-tokens, not coherent English. When the SmolLM2-360M Q4 artifacts drop, they flow through the exact same `dhamaka_init` entry point and the SDK doesn't move.

---

## ✦ tests

```
  ╭─────────────────────────────────────────────────────────────╮
  │                                                             │
  │        ██████   ██████       ██████   █████   ██████        │
  │        ╚════██ ██╔═══██╗     ╚════██╗██╔══██╗██╔════╝       │
  │         █████╔╝ ╚██████║      █████╔╝███████║██║            │
  │        ██╔═══╝ ██╗═══██║     ██╔═══╝ ██╔══██║██║            │
  │        ███████╗╚██████╔╝     ███████╗██║  ██║╚██████╗       │
  │        ╚══════╝ ╚═════╝      ╚══════╝╚═╝  ╚═╝ ╚═════╝       │
  │                                                             │
  │           27 rust tests  ·  45 js tests  ·  all green       │
  │                                                             │
  ╰─────────────────────────────────────────────────────────────╯
```

### run them

```bash
# everything (Rust native + JS + end-to-end wasm)
cargo test --manifest-path crates/dhamaka-runtime/Cargo.toml
npm test

# just the Rust crate
cd crates/dhamaka-runtime && cargo test

# just the JS side
npm test

# one specific file
node --test packages/runtime/test/wasm-engine.test.js
```

Zero test-runner dependencies. Rust uses `cargo test`, JS uses the Node 20+ built-in `node --test`. No jest, no mocha, no vitest, no install step past `rustup` and the Node toolchain.

### Rust · `cargo test` · 27 tests

The hot path. Every tensor primitive, the sampler, the forward pass, and the model init are covered by native unit tests that run in milliseconds.

| file                         | tests | what it covers                                                                 |
|------------------------------|:-----:|---------------------------------------------------------------------------------|
| `src/rng.rs`                 |   4   | xorshift64* determinism, `next_f32()` range, FNV-1a seed-hash distinctness      |
| `src/tensor.rs`              |  10   | matmul (identity + 2×2 reference), RMSNorm, softmax sums to 1 + translation invariance, SiLU at 0 and large positive, in-place add/mul, RoPE identity at pos 0 + norm preservation |
| `src/sampler.rs`             |   5   | greedy picks max, temperature=0 is greedy, deterministic for same seed, `top_k=1` always hits argmax, `top_p=0.01` collapses to the mode |
| `src/transformer.rs`         |   3   | forward pass produces finite logits, is deterministic for same seed, **different positions produce different logits** (caught a real KV-cache bug) |
| `src/model.rs`               |   5   | random-weights init is reproducible, different seeds differ, vocab table size, detokenize round-trip, empty prompt still yields a token |

### JavaScript · `npm test` · 45 tests

Drives the SDK, the hub, and the real compiled `.wasm` end-to-end from Node using the built-in test runner. Zero dependencies.

| file                                      | tests | what it covers                                                                    |
|-------------------------------------------|:-----:|------------------------------------------------------------------------------------|
| `packages/runtime/test/factory.test.js`   |   7   | backend selection (auto / mock / wasm), abstract `Engine` refuses instantiation, `WasmEngine` info + unreachable-url error |
| `packages/runtime/test/mock-engine.test.js` |  7   | load gating, streaming, `complete()`, determinism, `AbortSignal`, unload          |
| `packages/runtime/test/tokenizer.test.js` |   8   | `split()` on words / punctuation / whitespace / empty, JSON `loadFromBytes`, encode/decode stubs |
| `packages/runtime/test/wasm-engine.test.js` |  4   | **loads the real compiled `.wasm`**, streams real Rust forward-pass tokens, deterministic across identical prompts, honors `AbortSignal` |
| `packages/sdk/test/chat.test.js`          |   6   | history accumulation, system prompt, streaming transcript, reset w/ and w/o system |
| `packages/sdk/test/hub-client.test.js`    |   5   | Node fallback mode, ping, get with mocked fetch (cache miss then hit), list + delete, unknown-model error |
| `packages/sdk/test/openai-shim.test.js`   |   3   | non-streaming ChatCompletion shape, streaming SSE with `[DONE]`, passthrough for non-matching URLs |
| `packages/hub/test/manifest.test.js`      |   5   | canonical manifest parses, model ids + required fields, sha256 format, default model exists, served hub manifest mirrors shape |

### end-to-end

The four `wasm-engine.test.js` tests are the moat. They stub `globalThis.fetch` to read the compiled `dhamaka-runtime.wasm` off disk, then drive the real ABI:

```
┌─ Node ────────────────────────────────────────────────────────────┐
│  WasmEngine                                                       │
│      │                                                            │
│      │  WebAssembly.instantiate(fs.readFile(.wasm))                │
│      ▼                                                            │
│  [ dhamaka_version   ==> 1                               ]        │
│  [ dhamaka_alloc     ==> ptr                             ]        │
│  [ write prompt bytes into WASM linear memory            ]        │
│  [ dhamaka_init      ==> ctx                             ]        │
│  [ dhamaka_feed_prompt(ctx, ptr, len)                    ]        │
│  [ loop { dhamaka_next_token(ctx, out, 64) ==> n bytes } ]        │
│  [ decode UTF-8, yield token                             ]        │
└───────────────────────────────────────────────────────────────────┘
```

These four pass in Node, so every token in the README's "real today" list is real. The same `WasmEngine` runs in the browser via `instantiateStreaming` — no fork.

### CI

`.github/workflows/ci.yml` runs on every push and pull request:

```
  ┌─────────────────────────┐
  │ job 1 · rust            │
  │   rustup target add     │
  │     wasm32-unknown-     │
  │     unknown             │
  │   cargo test            │─── 27 tests
  │   cargo build --release │
  │     --target wasm32-…   │─── stage .wasm artifact
  └───────────┬─────────────┘
              │
              ▼
  ┌─────────────────────────┐
  │ job 2 · js              │
  │   download wasm artifact│
  │   node --check **/*.js  │
  │   npm test              │─── 45 tests
  │   smoke-test dev server │─── curl every endpoint
  └─────────────────────────┘

          matrix: node 20, node 22
```

No green CI, no merge.

---

## ✦ philosophy

```
   ┌───────────────────────────────────────────────────────────┐
   │                                                           │
   │   nothing leaves the device.                              │
   │                                                           │
   │   no api keys. no accounts. no rate limits. no 429s.      │
   │   no "our servers are experiencing issues". no bill.      │
   │                                                           │
   │   your prompts are yours. your model is yours.            │
   │   your tab is the datacenter.                             │
   │                                                           │
   └───────────────────────────────────────────────────────────┘
```

---

## ✦ license

MIT. See [LICENSE](./LICENSE).

<div align="center">

```
      ✦ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ✦

                     built for the open web
                     runs on your machine
                     shared across every site

      ✦ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ✦
```

</div>
