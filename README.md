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

**`✦ SmartField`** &nbsp;·&nbsp; **`🧠 on-device`** &nbsp;·&nbsp; **`⚡ 0 ms`** &nbsp;·&nbsp; **`🔒 private`** &nbsp;·&nbsp; **`🆓 $0/call`** &nbsp;·&nbsp; **`🌐 every browser`**

<br/>

<sub>The banner above is animated — the block letters cycle through a rainbow gradient and the stars pulse. If your renderer doesn't support SMIL (rare), here's the static form:</sub>

```
 ██████╗ ██╗  ██╗ █████╗ ███╗   ███╗ █████╗ ██╗  ██╗ █████╗
 ██╔══██╗██║  ██║██╔══██╗████╗ ████║██╔══██╗██║ ██╔╝██╔══██╗
 ██║  ██║███████║███████║██╔████╔██║███████║█████╔╝ ███████║
 ██║  ██║██╔══██║██╔══██║██║╚██╔╝██║██╔══██║██╔═██╗ ██╔══██║
 ██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██╗██║  ██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

   a reflex layer for every input field on the web
   on-device · zero latency · zero cost
```

</div>

---

## ✦ what is this

**A cross-browser JavaScript SDK that gives every `<input>` and `<textarea>` on the web on-device AI reflexes.** Drop it in, every form gets intelligent. Runs 100% in the user's tab — no API keys, no round trips, no rate limits, no privacy exposure, no monthly bill.

Three things ship today:

- **`SmartField`** — a tiny wrapper around an `<input>` that routes keystrokes through a task-oriented inference pipeline (autofill, completion, format validation) and fires a resolved event with the result.
- **`SmartForm`** — declares cross-field inference rules (`"city → state"`, `"city → timezone"`) on a `<form>` and propagates results automatically. Manual edits are respected.
- **`SmartText`** — watches a `<textarea>` for contextual spellcheck and proofreading — the kind that catches "see you their" and "your welcome", not just dictionary misses.

Plus `attachSmartPaste(form)` so pasted business cards / signatures / contact blobs split themselves into the right fields synchronously.

Under the hood every task is **rules-first, model-second**: a tiny gazetteer / regex / static table answers 80% of real inputs in microseconds, and an on-device LLM handles the semantic long tail only when the fast path is uncertain.

---

## ✦ the killer use cases

Every one of these is impossible as a server-side product because network latency, per-call cost, or rate limits kill it. Every one becomes trivial when inference is free and instant:

- Type "San Francisco" → state, country, timezone, currency fill in live before you finish typing
- Type "i'll see you their tomorrow" → "their" flagged as wrong, "there" suggested, one click to fix
- Paste a business card blob into a form → name, email, phone, company, website split themselves into the right fields
- Type "forest green" in a hex-color field → `#228B22`
- Type "next Tuesday" in a date field → parsed to an ISO date
- Type "1 Infinite Loop" → city, state, ZIP auto-complete
- Type an email ending in `@stripe.com` → company field auto-fills "Stripe"
- Type "SF" in a city field → expanded to "San Francisco, California, USA, Pacific Time"
- Start typing in French in an English field → live translation offer
- Submit a form with mismatched shipping/billing ZIP and state → natural-language explanation of the conflict

All of them run on-device, per keystroke, for free, on every browser, in <50 ms.

---

## ✦ three working demos

Spin up the dev stack (`npm run dev`) and open <http://localhost:5173> to try them live:

| demo | what it shows | primitive |
|---|---|---|
| **[Address autofill](packages/playground/public/demos/autofill.html)** | Type a city → state / country / timezone / currency populate synchronously | `SmartField` + `SmartForm` |
| **[Contextual spellcheck](packages/playground/public/demos/spellcheck.html)** | Homophone-in-context detection, not just dictionary matches | `SmartText` |
| **[Smart paste](packages/playground/public/demos/paste.html)** | Paste a contact blob, watch it split into the right fields | `attachSmartPaste` |

---

## ✦ the stack

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   your page                                                     │
  │   ┌─────────────────────────────────────────────────────────┐   │
  │   │   <input id="city"> ─┐   <input id="state"> ─┐          │   │
  │   │                       │                        │         │   │
  │   │   import {            │                        │         │   │
  │   │     SmartField,       │                        │         │   │
  │   │     SmartForm         │                        │         │   │
  │   │   } from "dhamaka";   │                        │         │   │
  │   └───────────────────────┼────────────────────────┼─────────┘   │
  │                           │                        │             │
  │                           ▼                        ▼             │
  │   ┌─────────────────────────────────────────────────────────┐   │
  │   │   SmartField / SmartForm / SmartText / attachSmartPaste │   │
  │   │   (task-oriented API developers actually touch)         │   │
  │   └──────────────┬──────────────────────────────────────────┘   │
  │                  │                                               │
  │                  ▼   runTask("city-to-state", …)                 │
  │   ┌─────────────────────────────────────────────────────────┐   │
  │   │   task registry   ←  rules → fuzzy → model              │   │
  │   │   (city-to-state, spellcheck, paste-extract, …)          │   │
  │   └──────────────┬──────────────────────────────────────────┘   │
  │                  │ (only when rules are uncertain)               │
  │                  ▼                                               │
  │   ┌─────────────────────────────────────────────────────────┐   │
  │   │   reflex service   ← resident engine (warm, KV-cached)  │   │
  │   └──────────────┬──────────────────────────────────────────┘   │
  │                  │                                               │
  │                  ▼                                               │
  │   ┌─────────────────────────────────────────────────────────┐   │
  │   │   engine backends                                       │   │
  │   │   ┌──────────────┐ ┌────────────┐ ┌─────────────┐       │   │
  │   │   │  window.ai   │ │ WasmEngine │ │ MockEngine  │       │   │
  │   │   │ (Chrome)     │ │ (Rust .wasm│ │ (Node /     │       │   │
  │   │   │ Gemini Nano  │ │  56 KB)    │ │  tests)     │       │   │
  │   │   └──────────────┘ └────────────┘ └─────────────┘       │   │
  │   │        ↑                ↑               ↑               │   │
  │   │        └── auto-detect in priority order ──┘            │   │
  │   └─────────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────────┘
```

**The shape that matters:** the SDK is the product. The runtime underneath is a dependency that can be swapped (Chrome's `window.ai` when present, the Rust `.wasm` otherwise, `MockEngine` for tests) without moving the surface developers touch.

| package | what it does |
|---|---|
| [`dhamaka`](packages/sdk)              | **public SDK**: `SmartField`, `SmartForm`, `SmartText`, `attachSmartPaste`, task registry, reflex service. The thing you actually install. |
| [`@dhamaka/runtime`](packages/runtime) | engine backends: `WindowAiBackend` → `WasmEngine` → `MockEngine`, plus the factory that picks one |
| [`dhamaka-runtime` (Rust)](crates/dhamaka-runtime) | the compiled fallback runtime — matmul, RMSNorm, softmax, RoPE, KV-cache, sampling — 56 KB `.wasm`, used when `window.ai` isn't available |
| [`@dhamaka/hub`](packages/hub)         | static origin hosting the cross-site model cache + `.wasm` runtime |
| [`@dhamaka/extension`](packages/extension) | Manifest V3 browser extension — shared cache across every site on the machine |
| [`@dhamaka/playground`](packages/playground) | zero-dep dev server running hub + playground + three live demos |

---

## ✦ the task registry

Developers think in **tasks**, not in models. Each task is a small, typed function that turns an input string into a structured inference. The SDK decides what runs — a lookup table, a regex, a fuzzy match, or an on-device LLM — based on which path is fastest for the shape of the input.

| task id              | status | what it does                                                       | backend layers                             |
|----------------------|:------:|--------------------------------------------------------------------|--------------------------------------------|
| `city-to-state`      |   ⬤    | city → state, country, timezone, currency                          | gazetteer → fuzzy → LLM                    |
| `spellcheck`         |   ⬤    | misspellings + homophone-in-context                                | dictionary → context regex → masked LM     |
| `paste-extract`      |   ⬤    | contact blob → name / email / phone / company / website / twitter  | regex → heuristic → LLM                    |
| `address-autofill`   |   ◎    | street → city, state, ZIP                                          | geocoder → LLM                             |
| `date-parse`         |   ◎    | "next Tuesday" → ISO date                                          | chrono-node-style rules → LLM              |
| `color-name`         |   ◎    | "forest green" → `#228B22`                                         | static table → embedding similarity        |
| `format-validate`    |   ◎    | live phone / SSN / IBAN / ZIP validation with natural-language errors | regex → LLM                             |
| `tab-complete`       |   ◎    | per-keystroke next-token completion                                | n-gram → tiny causal LM                    |
| `tone-rewrite`       |   ◎    | "make it formal / concise / friendly"                              | small instruction-tuned LM                 |
| `cross-field-infer`  |   ◎    | fill related fields from one hint                                  | SmartForm rules + LLM                      |

⬤ shipping  ·  ◎ planned

`registerTask(customTask)` lets any app ship their own task on top of the same pipeline.

---

## ✦ the engine backends

One interface, three implementations, auto-selected at runtime:

```
  ┌────────────────────┬───────────────────────────────────────────────────┐
  │ WindowAiBackend    │  Chrome 138+ Prompt API / Gemini Nano.            │
  │                    │  Shared, resident, GPU-accelerated. Fastest path. │
  ├────────────────────┼───────────────────────────────────────────────────┤
  │ WasmEngine         │  Our Rust runtime compiled to a 56 KB .wasm.      │
  │                    │  Cross-browser fallback. ~50 ms cold, ~10 ms warm.│
  ├────────────────────┼───────────────────────────────────────────────────┤
  │ MockEngine         │  Canned-response stand-in for Node + tests.       │
  │                    │  Zero dependencies, deterministic.                │
  └────────────────────┴───────────────────────────────────────────────────┘
```

In browsers, the factory prefers `window.ai` when available and falls back to the WASM runtime otherwise. Same SDK surface either way. In Node (tests, SSR), the factory picks `MockEngine` so unit tests don't need a real model.

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

Open **http://localhost:5173** and click into any of the three demos. The playground hot-reads the SDK + runtime sources, so every JS edit shows up on refresh. Re-run `build.sh` only when editing the Rust runtime.

> Don't have Rust installed? The compiled `.wasm` is checked in under `packages/hub/public/runtime/` so `npm run dev` works on a fresh clone too. Install Rust only if you want to modify the inference engine itself.

---

## ✦ the API

### SmartField — one field, one task

```js
import { SmartField } from "dhamaka";

new SmartField(document.querySelector("#city"), {
  task: "city-to-state",
  onResult: (r) => {
    // r.source      → "rule" | "fuzzy" | "model"
    // r.confidence  → 0..1
    // r.fields      → { state, stateName, country, countryName, tz, currency }
  },
});
```

Every keystroke fires the task. Rules-first, so typical inputs resolve in under a millisecond with no model involvement. The task registry decides when (and whether) to escalate to the LLM.

### SmartForm — cross-field inference

```js
import { SmartField, SmartForm } from "dhamaka";

const form = document.querySelector("#checkout");

new SmartForm(form, {
  tasks: { city: "city-to-state" },           // auto-attach a SmartField
  infer: {
    "city → state":    "city-to-state:stateName",
    "city → country":  "city-to-state:countryName",
    "city → timezone": "city-to-state:tz",
    "city → currency": "city-to-state:currency",
  },
});
```

Type "San Francisco" in the city field, the state / country / timezone / currency fields fill themselves from the same task result — synchronously, no debounce, no network. Manually edit any target field and it's locked out of automatic propagation until `smartForm.unlock()`.

### SmartText — contextual spellcheck on every textarea

```js
import { SmartText } from "dhamaka";

const textarea = document.querySelector("textarea");

const smart = new SmartText(textarea, {
  onSuggestions: (suggestions) => {
    // [{ from: "their", to: "there", index: 14, reason: "homophone in context" }]
    renderSuggestionChips(suggestions);
  },
});

// Apply a suggestion by index
smart.applySuggestion(0);
```

Catches classic homophone-in-context mistakes ("see you their", "your welcome", "alot of", "its a good idea") that a plain dictionary spellchecker misses.

### Smart paste — any form, any blob

```js
import { attachSmartPaste } from "dhamaka";

const form = document.querySelector("#contact-form");
attachSmartPaste(form, {
  dropZone: document.querySelector("#paste-zone"),
});

form.addEventListener("smart-paste:extracted", (e) => {
  console.log("filled", e.detail.result.fields);
});
```

Paste a contact blob (business card, signature, LinkedIn blurb) and the `name`, `email`, `phone`, `company`, `website`, `twitter` fields populate themselves. Fields the user has already typed into are never overwritten.

### Configure the engine (optional)

```js
import { reflex } from "dhamaka";

reflex.configure({
  backend: "auto",            // "window-ai" | "wasm" | "mock" | "auto"
  wasmUrl: "/runtime/dhamaka-runtime.wasm",
});
```

Most apps never call this — `auto` picks the fastest backend available (Chrome's `window.ai` → the compiled Rust `.wasm` → `MockEngine`).

### Legacy: raw `Dhamaka.load()` for direct model access

For apps that want raw completion / streaming / chat (LLM chatbots, content generation, etc.) — not the SmartField surface — the lower-level class is still available:

```js
import { Dhamaka } from "dhamaka";

const llm = await Dhamaka.load();
for await (const token of llm.stream("hello")) process.stdout.write(token);
```

And the drop-in OpenAI `/v1/chat/completions` shim:

```js
import { installOpenAIShim } from "dhamaka/openai";
installOpenAIShim(llm);
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
  SmartField SDK (the product surface)
  [x]  SmartField   — task-routed oninput reflexes on a single <input>
  [x]  SmartForm    — cross-field inference rules with manual-edit locks
  [x]  SmartText    — contextual spellcheck on a <textarea>
  [x]  attachSmartPaste — regex+heuristic extraction, onpaste
  [x]  reflex service — resident engine, lazy-loaded, one per page
  [x]  task registry + registerTask() for custom tasks

  Built-in tasks (rules → fuzzy → model)
  [x]  city-to-state: 100+ city gazetteer, alias + diacritic normalisation,
       Levenshtein fuzzy fallback, LLM long-tail handler
  [x]  spellcheck: common misspellings + homophone-in-context rules, LLM
       fallback for the unrecognised long tail
  [x]  paste-extract: email / phone / URL / Twitter regex + name heuristic
       + non-freemail-domain company inference, LLM fallback for gaps

  Engine backends (auto-selected by priority)
  [x]  WindowAiBackend — Chrome 138+ Prompt API / Gemini Nano
  [x]  WasmEngine      — 56 KB Rust runtime compiled to wasm32
  [x]  MockEngine      — deterministic stand-in for Node / tests
  [x]  createEngine() auto-detection: window.ai → wasm → mock

  Rust runtime (the fallback inference engine)
  [x]  matmul, RMSNorm, softmax, rotary, KV-cached self-attention,
       SwiGLU/SiLU, top-k + top-p + temperature sampling
  [x]  #[no_mangle] extern "C" ABI exposed to WebAssembly
  [x]  27 native cargo tests covering every primitive

  Cross-site cache (the moat)
  [x]  hub ↔ sdk postMessage bridge (get / list / delete / progress)
  [x]  IndexedDB-backed hub storage with SHA-256 integrity checks
  [x]  zero-copy ArrayBuffer transfer from hub → consumer
  [x]  fallback cache (real IndexedDB in browsers, in-memory in Node)
  [x]  Storage Access API tier for unpartitioned storage
  [x]  Manifest V3 browser extension (phase 2)
  [x]  SDK auto-detection of the extension with tiered mode reporting

  Playground + tests + CI
  [x]  3 live working demos (address autofill, spellcheck, smart paste)
  [x]  zero-dependency dev server with correct MIME + CORS
  [x]  OpenAI /v1/chat/completions shim (for legacy Dhamaka.load() users)
  [x]  102 tests total — 27 Rust (cargo test) + 75 JS (node --test),
       including 4 integration tests that drive the real compiled .wasm
  [x]  GitHub Actions CI: Rust crate build → wasm artifact upload → JS
       tests on Node 20 + 22, plus a dev-server smoke test

  In flight (see docs/GOALS.md)
  [ ]  SharedWorker upgrade (current reflex is a module-level singleton;
       same API, swap drop-in for multi-tab residency)
  [ ]  Transformers.js adapter so the fallback engine can load HF models
       instead of the tiny Rust-random model
  [ ]  Task registry expansion: address-autofill, date-parse, color-name,
       format-validate, tab-complete, tone-rewrite, cross-field-infer
  [ ]  Real SmolLM2-360M Q4 weights hosted on the hub
  [ ]  SIMD128 + WebGPU fast paths
  [ ]  Extension published on the Chrome Web Store
```

**v0.1 honesty note:** the Rust runtime does real transformer math end-to-end in WebAssembly, but the weights it loads for v0.1 are a 32-dim random-init demo model — so if a task actually escalates to the LLM layer, the output isn't coherent English. The **three shipping demos deliberately resolve entirely in the rules / fuzzy layers** so you can feel the product without depending on the long-tail model. When real weights arrive, the same task code transparently upgrades.

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
  │          27 rust tests  ·  75 js tests  ·  102 total        │
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

### JavaScript · `npm test` · 75 tests

Drives the SmartField SDK, the hub, the tasks pipeline, and the real compiled `.wasm` end-to-end from Node using the built-in test runner. Zero dependencies.

| file                                        | tests | what it covers                                                                    |
|---------------------------------------------|:-----:|------------------------------------------------------------------------------------|
| `packages/sdk/test/tasks.test.js`           |  22   | city-to-state (exact, alias, case/punct, fuzzy, international, nonsense); spellcheck (misspelling, homophone, clean text, "teh"); paste-extract (email/phone/website, freemail company rules, empty); task registry; runTask |
| `packages/sdk/test/smart-field.test.js`     |   5   | resolves on construction, fires `smart-field:resolved` event, re-runs on every input, `dispose` stops listening, bad-arg rejection |
| `packages/sdk/test/smart-form.test.js`      |   5   | cross-field propagation (city → state/country/timezone), manual-edit locks, `unlock()` re-engages, `tasks` auto-attach, non-form rejection |
| `packages/sdk/test/chat.test.js`            |   6   | history accumulation, system prompt, streaming transcript, reset with/without system |
| `packages/sdk/test/hub-client.test.js`      |   5   | Node fallback mode, ping, get with mocked fetch (cache miss then hit), list + delete, unknown-model error |
| `packages/sdk/test/openai-shim.test.js`     |   3   | non-streaming ChatCompletion shape, streaming SSE with `[DONE]`, passthrough for non-matching URLs |
| `packages/runtime/test/factory.test.js`     |   7   | backend selection (auto / mock / wasm / window-ai), abstract `Engine` refuses instantiation, `WasmEngine` info + unreachable-url error |
| `packages/runtime/test/mock-engine.test.js` |   7   | load gating, streaming, `complete()`, determinism, `AbortSignal`, unload          |
| `packages/runtime/test/tokenizer.test.js`   |   8   | `split()` on words / punctuation / whitespace / empty, JSON `loadFromBytes`, encode/decode stubs |
| `packages/runtime/test/wasm-engine.test.js` |   4   | **loads the real compiled `.wasm`**, streams real Rust forward-pass tokens, deterministic across identical prompts, honors `AbortSignal` |
| `packages/hub/test/manifest.test.js`        |   5   | canonical manifest parses, model ids + required fields, sha256 format, default model exists, served hub manifest mirrors shape |

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
