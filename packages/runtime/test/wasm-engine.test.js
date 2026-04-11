import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { WasmEngine } from "../src/wasm-engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = join(
  __dirname,
  "..",
  "..",
  "hub",
  "public",
  "runtime",
  "locus-runtime.wasm",
);

// Probe once: if the .wasm isn't there (e.g. fresh checkout without running
// the build script), we skip this test rather than fail. CI builds the wasm
// before running tests, so CI will always exercise it.
async function wasmIsPresent() {
  try {
    await readFile(WASM_PATH);
    return true;
  } catch {
    return false;
  }
}

// We bypass HTTP by stubbing global fetch to read from disk. That way we can
// exercise the real WasmEngine end-to-end in Node without spinning up a
// server.
function stubFetch(bytes) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    void url;
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": "application/wasm" },
    });
  };
  return () => {
    globalThis.fetch = original;
  };
}

test("WasmEngine: loads the compiled Locus runtime end-to-end", async (t) => {
  if (!(await wasmIsPresent())) {
    t.skip(
      "locus-runtime.wasm not found; run crates/locus-runtime/build.sh first",
    );
    return;
  }
  const bytes = await readFile(WASM_PATH);
  const restore = stubFetch(bytes);
  try {
    const engine = new WasmEngine({ wasmUrl: "http://stub/locus-runtime.wasm" });
    await engine.load({
      entry: { id: "locus-micro" },
      artifacts: {},
    });
    assert.equal(engine.loaded, true);
    assert.equal(engine.info().backend, "wasm");
    assert.equal(engine.info().abiVersion, 1);
    await engine.unload();
  } finally {
    restore();
  }
});

test("WasmEngine: real Rust forward pass streams tokens", async (t) => {
  if (!(await wasmIsPresent())) {
    t.skip("locus-runtime.wasm not found");
    return;
  }
  const bytes = await readFile(WASM_PATH);
  const restore = stubFetch(bytes);
  try {
    const engine = new WasmEngine({ wasmUrl: "http://stub/locus-runtime.wasm" });
    await engine.load({ entry: { id: "locus-micro" }, artifacts: {} });

    const tokens = [];
    for await (const token of engine.generate("hello world", {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxTokens: 12,
    })) {
      tokens.push(token);
    }
    assert.ok(tokens.length > 0, "expected at least one streamed token");
    assert.ok(
      tokens.length <= 12,
      `expected max 12 tokens, got ${tokens.length}`,
    );
    for (const t of tokens) {
      assert.equal(typeof t, "string");
    }
    await engine.unload();
  } finally {
    restore();
  }
});

test("WasmEngine: is deterministic for identical prompts", async (t) => {
  if (!(await wasmIsPresent())) {
    t.skip("locus-runtime.wasm not found");
    return;
  }
  const bytes = await readFile(WASM_PATH);
  const restore = stubFetch(bytes);
  try {
    const runOnce = async () => {
      const engine = new WasmEngine({ wasmUrl: "http://stub/run.wasm" });
      await engine.load({ entry: { id: "locus-micro" }, artifacts: {} });
      const out = [];
      for await (const t of engine.generate("Locus is", { maxTokens: 8 })) {
        out.push(t);
      }
      await engine.unload();
      return out.join("");
    };
    const a = await runOnce();
    const b = await runOnce();
    assert.equal(a, b, "identical prompts should yield identical output");
    assert.ok(a.length > 0);
  } finally {
    restore();
  }
});

test("WasmEngine: respects AbortSignal", async (t) => {
  if (!(await wasmIsPresent())) {
    t.skip("locus-runtime.wasm not found");
    return;
  }
  const bytes = await readFile(WASM_PATH);
  const restore = stubFetch(bytes);
  try {
    const engine = new WasmEngine({ wasmUrl: "http://stub/run.wasm" });
    await engine.load({ entry: { id: "locus-micro" }, artifacts: {} });

    const controller = new AbortController();
    const tokens = [];
    const iter = engine.generate("stream forever", {
      maxTokens: 1024,
      signal: controller.signal,
    });
    controller.abort();
    for await (const t of iter) {
      tokens.push(t);
      if (tokens.length > 5) break;
    }
    assert.ok(tokens.length <= 5);
    await engine.unload();
  } finally {
    restore();
  }
});
