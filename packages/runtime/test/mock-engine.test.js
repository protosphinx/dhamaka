import { test } from "node:test";
import assert from "node:assert/strict";
import { MockEngine } from "../src/mock-engine.js";

test("MockEngine: throws if generate is called before load", async () => {
  const engine = new MockEngine();
  await assert.rejects(async () => {
    for await (const _ of engine.generate("hi")) void _;
  }, /load\(\) must be called/);
});

test("MockEngine: load sets loaded=true and records the entry", async () => {
  const engine = new MockEngine({ tokensPerSecond: 1000 });
  await engine.load({
    entry: { id: "locus-micro", params: "360M", quantization: "Q4_K_M", contextLength: 2048 },
    artifacts: { weights: new Uint8Array(16) },
  });
  assert.equal(engine.loaded, true);
  const info = engine.info();
  assert.equal(info.id, "locus-micro");
  assert.equal(info.backend, "mock");
  assert.equal(info.tokensPerSecond, 1000);
});

test("MockEngine: generate streams tokens and completes", async () => {
  const engine = new MockEngine({ tokensPerSecond: 10000 });
  await engine.load({ entry: { id: "t" }, artifacts: {} });

  const tokens = [];
  for await (const token of engine.generate("hello world", { maxTokens: 10 })) {
    tokens.push(token);
  }
  assert.ok(tokens.length > 0, "should yield at least one token");
  assert.ok(tokens.length <= 10, "should respect maxTokens");
  const joined = tokens.join("");
  assert.ok(joined.length > 0);
});

test("MockEngine: complete() drains generate() into a single string", async () => {
  const engine = new MockEngine({ tokensPerSecond: 10000 });
  await engine.load({ entry: { id: "t" }, artifacts: {} });
  const out = await engine.complete("hello", { maxTokens: 5 });
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

test("MockEngine: generate is deterministic for the same prompt", async () => {
  const engine = new MockEngine({ tokensPerSecond: 10000 });
  await engine.load({ entry: { id: "t" }, artifacts: {} });
  const a = await engine.complete("repeat me", { maxTokens: 999 });
  const b = await engine.complete("repeat me", { maxTokens: 999 });
  assert.equal(a, b);
});

test("MockEngine: respects AbortSignal", async () => {
  const engine = new MockEngine({ tokensPerSecond: 20 });
  await engine.load({ entry: { id: "t" }, artifacts: {} });
  const controller = new AbortController();
  const tokens = [];
  const iter = engine.generate("hello there partner", {
    maxTokens: 999,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 30);
  for await (const t of iter) {
    tokens.push(t);
    if (tokens.length > 50) break;
  }
  assert.ok(tokens.length < 50, "abort should stop streaming early");
});

test("MockEngine: unload clears state", async () => {
  const engine = new MockEngine();
  await engine.load({ entry: { id: "t" }, artifacts: {} });
  await engine.unload();
  assert.equal(engine.loaded, false);
});
