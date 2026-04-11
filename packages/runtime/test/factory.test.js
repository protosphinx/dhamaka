import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/factory.js";
import { MockEngine } from "../src/mock-engine.js";
import { WasmEngine } from "../src/wasm-engine.js";

test("createEngine: default backend=auto with no wasmUrl returns MockEngine", () => {
  const engine = createEngine();
  assert.ok(engine instanceof MockEngine);
});

test("createEngine: backend=mock always returns MockEngine", () => {
  assert.ok(createEngine({ backend: "mock" }) instanceof MockEngine);
});

test("createEngine: backend=wasm returns WasmEngine", () => {
  const engine = createEngine({ backend: "wasm", wasmUrl: "http://x/y.wasm" });
  assert.ok(engine instanceof WasmEngine);
});

test("createEngine: backend=auto with wasmUrl prefers WasmEngine", () => {
  const engine = createEngine({ wasmUrl: "http://x/y.wasm" });
  assert.ok(engine instanceof WasmEngine);
});

test("Engine abstract class cannot be instantiated directly", async () => {
  const { Engine } = await import("../src/engine.js");
  assert.throws(() => new Engine(), /abstract/);
});

test("WasmEngine: load() fails cleanly when the wasm url is unreachable", async () => {
  // Pick a port that will refuse connection so the fetch deterministically
  // fails without us needing to mock anything.
  const engine = new WasmEngine({ wasmUrl: "http://127.0.0.1:1/nope.wasm" });
  await assert.rejects(() =>
    engine.load({
      entry: { id: "test" },
      artifacts: { weights: new Uint8Array(), config: new Uint8Array() },
    }),
  );
});

test("WasmEngine: info() reports backend=wasm and the configured url", () => {
  const engine = new WasmEngine({ wasmUrl: "http://example.test/x.wasm" });
  const info = engine.info();
  assert.equal(info.backend, "wasm");
  assert.equal(info.wasmUrl, "http://example.test/x.wasm");
  assert.equal(info.abiVersion, 1);
});
