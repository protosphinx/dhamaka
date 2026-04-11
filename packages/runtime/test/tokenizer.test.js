import { test } from "node:test";
import assert from "node:assert/strict";
import { Tokenizer } from "../src/tokenizer.js";

test("Tokenizer: split() returns an array of pseudo-tokens", () => {
  const t = new Tokenizer();
  const out = t.split("hello world");
  assert.ok(Array.isArray(out));
  assert.ok(out.length >= 2);
  assert.equal(out.join(""), "hello world");
});

test("Tokenizer: split() preserves leading whitespace on words", () => {
  const t = new Tokenizer();
  const out = t.split("a b c");
  assert.equal(out.join(""), "a b c");
});

test("Tokenizer: split() chunks long words into ~3-char pieces", () => {
  const t = new Tokenizer();
  const out = t.split("supercalifragilistic");
  // Longer than 4 chars, so should be split into multiple pieces.
  assert.ok(out.length > 1);
  assert.equal(out.join(""), "supercalifragilistic");
});

test("Tokenizer: split() keeps punctuation", () => {
  const t = new Tokenizer();
  const out = t.split("hi, there!");
  assert.equal(out.join(""), "hi, there!");
});

test("Tokenizer: split() on empty input returns empty array", () => {
  const t = new Tokenizer();
  assert.deepEqual(t.split(""), []);
});

test("Tokenizer: loadFromBytes handles invalid JSON gracefully", async () => {
  const t = new Tokenizer();
  await t.loadFromBytes(new TextEncoder().encode("not json"));
  assert.equal(t.vocab, null);
});

test("Tokenizer: loadFromBytes accepts valid JSON", async () => {
  const t = new Tokenizer();
  await t.loadFromBytes(new TextEncoder().encode('{"type":"BPE"}'));
  assert.deepEqual(t.vocab, { type: "BPE" });
});

test("Tokenizer: encode/decode throw (WASM-only)", () => {
  const t = new Tokenizer();
  assert.throws(() => t.encode("x"), /WASM tokenizer/);
  assert.throws(() => t.decode([1]), /WASM tokenizer/);
});
