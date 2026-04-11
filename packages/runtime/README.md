# @locus/runtime

The inference engine layer. Everything that turns model bytes into tokens.

## Backends

| Backend       | Status       | Notes                                                      |
|---------------|--------------|------------------------------------------------------------|
| `MockEngine`  | **working**  | Streams canned responses. Lets the whole stack run today.  |
| `WasmEngine`  | in progress  | Rust → wasm32, SIMD, optional WebGPU fast path             |

Both implement the same `Engine` interface:

```js
import { createEngine } from "@locus/runtime";

const engine = createEngine({ backend: "auto" });
await engine.load({ entry, artifacts });

for await (const token of engine.generate("Hello", { temperature: 0.7 })) {
  process.stdout.write(token);
}
```

## The planned WASM ABI

```c
locus_init(weights_ptr, weights_len, config_ptr, config_len) -> ctx
locus_tokenize(ctx, text_ptr, text_len) -> { tokens_ptr, tokens_len }
locus_feed(ctx, tokens_ptr, tokens_len) -> void
locus_sample(ctx, temperature, top_p, top_k) -> token_id
locus_detokenize(ctx, token_id) -> { text_ptr, text_len }
locus_reset(ctx) -> void
locus_free(ctx) -> void
```

Memory is owned by the module with a bump allocator exposed through
`locus_alloc` / `locus_free_bytes`, so JS can hand big weights in without
copies. The JS loader in `src/wasm-engine.js` already speaks this ABI — drop a
compiled `.wasm` with these exports into place and everything wires up.
