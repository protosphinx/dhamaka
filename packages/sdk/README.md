# dhamaka

The public SDK. This is what consumer apps install.

```js
import { Dhamaka } from "dhamaka";

const llm = await Dhamaka.load("dhamaka-micro", {
  onProgress: (p) => console.log(p.received, "/", p.total),
});

// One-shot
console.log(await llm.complete("Explain WASM in one line."));

// Streaming
for await (const token of llm.stream("Write a haiku about browsers")) {
  process.stdout.write(token);
}

// Stateful chat
const chat = llm.chat({ system: "You are a helpful assistant." });
await chat.send("Hi!");

// Info (including whether we got a cache hit)
console.log(llm.info());
// → { model: 'dhamaka-micro', cached: true, loadMs: 42, engine: { backend: 'mock', ... } }
```

## OpenAI shim

```js
import { installOpenAIShim } from "dhamaka/openai";
installOpenAIShim(llm);
// now fetch("/v1/chat/completions", ...) is served locally
```

## What's real today

- Hub ↔ SDK postMessage bridge, including progress events and cache hits
- `Dhamaka.load()`, `complete()`, `stream()`, `chat()`, `info()`
- Site-local fallback cache when the hub iframe isn't reachable
- OpenAI `/v1/chat/completions` shim (streaming + non-streaming)
- Manifest parsing, integrity verification, and the multi-artifact model layout

## What's stubbed

- The actual token generation, which is currently provided by `MockEngine`
  from `@dhamaka/runtime`. Once the WASM module is compiled, `createEngine`
  will prefer `WasmEngine` automatically — no SDK changes required.
