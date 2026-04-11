<!-- ╔══════════════════════════════════════════════════════════════════════╗ -->
<!-- ║                                                                      ║ -->
<!-- ║                           D H A M A K A                              ║ -->
<!-- ║                                                                      ║ -->
<!-- ╚══════════════════════════════════════════════════════════════════════╝ -->

<div align="center">

```
      ██████╗ ██╗  ██╗ █████╗ ███╗   ███╗ █████╗ ██╗  ██╗ █████╗
      ██╔══██╗██║  ██║██╔══██╗████╗ ████║██╔══██╗██║ ██╔╝██╔══██╗
      ██║  ██║███████║███████║██╔████╔██║███████║█████╔╝ ███████║
      ██║  ██║██╔══██║██╔══██║██║╚██╔╝██║██╔══██║██╔═██╗ ██╔══██║
      ██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██╗██║  ██║
      ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

          ╭─────────────────────────────────────────────────╮
          │   a browser-native LLM that lives in your tab   │
          │   download once · run on every site · forever   │
          ╰─────────────────────────────────────────────────╯
```

**`💥 WASM`** &nbsp;·&nbsp; **`🧠 on-device`** &nbsp;·&nbsp; **`🔒 private`** &nbsp;·&nbsp; **`⚡ instant`** &nbsp;·&nbsp; **`🪶 ~100MB`**

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
  │   │            │             │  │ MockEngine │  │ dev/today  │
  │   │ iframe +   │             │  ├────────────┤  │            │
  │   │ IndexedDB  │             │  │ WasmEngine │  │ next up    │
  │   │ + OPFS     │             │  └─────┬──────┘  │            │
  │   └────────────┘             │        │         │            │
  │                              │        ▼         │            │
  │                              │  .wasm + SIMD    │            │
  │                              │  (WebGPU fast    │            │
  │                              │   path optional) │            │
  │                              └──────────────────┘            │
  └──────────────────────────────────────────────────────────────┘
```

| package                 | what it does                                                  |
|-------------------------|---------------------------------------------------------------|
| [`dhamaka`](packages/sdk)              | public SDK: `Dhamaka.load()`, chat, streaming, OpenAI shim |
| [`@dhamaka/runtime`](packages/runtime) | the inference engine interface + `MockEngine` (today) + `WasmEngine` (next) |
| [`@dhamaka/hub`](packages/hub)         | the tiny static origin that hosts the cross-site model cache |
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
npm run dev
```

```
  ✦ hub         http://localhost:5174
  ✦ playground  http://localhost:5173

  Dhamaka dev stack running. Ctrl+C to stop.
```

Open **http://localhost:5173**, hit **load**, and you're chatting with a locally-served LLM. The playground hot-reads the SDK + runtime sources, so every edit shows up on refresh — no bundler, no build step.

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
  [x]  hub ↔ sdk postMessage bridge (get / list / delete / progress)
  [x]  IndexedDB-backed hub storage with SHA-256 integrity checks
  [x]  zero-copy ArrayBuffer transfer from hub → consumer
  [x]  Dhamaka.load, complete, stream, chat, info, evict
  [x]  site-local fallback cache when the hub iframe isn't reachable
  [x]  OpenAI /v1/chat/completions shim (streaming + non-streaming)
  [x]  manifest + multi-artifact model layout + signed-hash verification
  [x]  playground UI with progress bars, telemetry, cache-hit badge
  [x]  zero-dependency dev server that serves hub + playground on two ports

  [ ]  the actual WASM transformer runtime (ABI sketched, loader ready)
  [ ]  SmolLM2-360M Q4 weights hosted on hub.dhamaka.dev
  [ ]  WebGPU fast path
  [ ]  Storage Access API flow
  [ ]  browser extension (phase 2)
  [ ]  the other registered models (code / sql / json / summarize / embed)
```

The entire developer-facing surface runs today against a `MockEngine` that streams canned responses at ~45 tok/s. When the WASM module lands, `createEngine` will prefer `WasmEngine` automatically — no SDK changes required.

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
