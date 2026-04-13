import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cityToStateTask,
  spellcheckTask,
  pasteExtractTask,
  runTask,
  getTask,
  listTasks,
  registerTask,
} from "../src/tasks.js";

// ─── task: city-to-state ─────────────────────────────────────────────

test("city-to-state: exact match returns confidence 1 with full fields", () => {
  const r = cityToStateTask.fast("San Francisco");
  assert.ok(r);
  assert.equal(r.confidence, 1);
  assert.equal(r.source, "rule");
  assert.equal(r.fields.state, "CA");
  assert.equal(r.fields.stateName, "California");
  assert.equal(r.fields.country, "US");
  assert.equal(r.fields.tz, "America/Los_Angeles");
  assert.equal(r.fields.currency, "USD");
});

test("city-to-state: alias match works (sf → san francisco)", () => {
  const r = cityToStateTask.fast("sf");
  assert.ok(r);
  assert.equal(r.fields.state, "CA");
});

test("city-to-state: case-insensitive + punctuation-insensitive", () => {
  const r1 = cityToStateTask.fast("SAN FRANCISCO");
  const r2 = cityToStateTask.fast("san francisco!!");
  const r3 = cityToStateTask.fast("  San   Francisco  ");
  assert.equal(r1.fields.state, "CA");
  assert.equal(r2.fields.state, "CA");
  assert.equal(r3.fields.state, "CA");
});

test("city-to-state: fuzzy match catches one-char typos", () => {
  const r = cityToStateTask.fast("San Francsico"); // transposed
  assert.ok(r);
  assert.equal(r.source, "fuzzy");
  assert.equal(r.fields.state, "CA");
  assert.ok(r.confidence < 1 && r.confidence > 0);
});

test("city-to-state: international cities resolve to their country", () => {
  assert.equal(cityToStateTask.fast("Tokyo").fields.country, "JP");
  assert.equal(cityToStateTask.fast("London").fields.country, "GB");
  assert.equal(cityToStateTask.fast("Paris").fields.country, "FR");
  assert.equal(cityToStateTask.fast("Mumbai").fields.country, "IN");
  assert.equal(cityToStateTask.fast("Sydney").fields.country, "AU");
});

test("city-to-state: nonsense input returns null from the fast path", () => {
  const r = cityToStateTask.fast("xyzqwerty");
  assert.equal(r, null);
});

test("city-to-state: slow() parses model output into structured fields", async () => {
  const engine = {
    async complete() {
      return " State: Colorado, Country: United States (US), Timezone: America/Denver, Currency: USD";
    },
  };
  const r = await cityToStateTask.slow("Fort Collins", {}, engine);
  assert.ok(r);
  assert.equal(r.source, "model");
  assert.equal(r.fields.stateName, "Colorado");
  assert.equal(r.fields.countryName, "United States");
  assert.equal(r.fields.country, "US");
  assert.equal(r.fields.tz, "America/Denver");
  assert.equal(r.fields.currency, "USD");
});

test("city-to-state: slow() returns null when model gives empty/unusable response", async () => {
  const engine = { async complete() { return ""; } };
  assert.equal(await cityToStateTask.slow("xyzqwerty", {}, engine), null);

  const engine2 = { async complete() { return "I don't know this city."; } };
  assert.equal(await cityToStateTask.slow("xyzqwerty", {}, engine2), null);
});

test("city-to-state: slow() returns null for empty input or missing complete()", async () => {
  const engine = { async complete() { return "State: X"; } };
  assert.equal(await cityToStateTask.slow("", {}, engine), null);
  assert.equal(await cityToStateTask.slow("test", {}, {}), null);
});

// ─── task: spellcheck (model-only, masked-LM per-word scoring) ───────
//
// The spellcheck task is backed by a masked language model (distilBERT
// in the shipping config). For each word in the input, we mask it and
// ask the model what should go there; if the original word isn't in
// the top-K predictions, we flag it and offer the top predictions as
// corrections. These tests verify the *contract* — no hardcoded
// semantic assertions that only a real model can deliver.

/**
 * Tiny mock engine that satisfies the `fillMask(inputWithMask, topK)`
 * interface the spellcheck task expects. Given a dictionary of
 * original→top-K mappings the caller wants to simulate, it returns the
 * matching top-K when the masked input matches. Unknown masked inputs
 * return an empty array.
 */
function makeMaskEngine(mapping) {
  return {
    maskToken: "[MASK]",
    async fillMask(maskedInput, _topK) {
      // `mapping` is keyed by the WHOLE masked input for exact-match
      // simulation, so tests can pin specific prompts deterministically.
      return mapping[maskedInput] ?? [];
    },
  };
}

test("spellcheck: fast() returns null for clean text, suggestions for misspellings", () => {
  // Clean text → null (defer to model)
  assert.equal(spellcheckTask.fast("anything"), null);
  // Empty → empty suggestions
  const empty = spellcheckTask.fast("");
  assert.equal(empty.suggestions.length, 0);
  // Known confusable → caught by rules
  const r = spellcheckTask.fast("I recieve the package.");
  assert.equal(r.source, "rule");
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "recieve");
  assert.equal(r.suggestions[0].to, "receive");
});

test("spellcheck: slow() short-circuits empty input without calling the engine", async () => {
  let called = false;
  const engine = {
    maskToken: "[MASK]",
    async fillMask() {
      called = true;
      return [];
    },
  };
  const r = await spellcheckTask.slow("", {}, engine);
  assert.equal(called, false);
  assert.equal(r.suggestions.length, 0);
  assert.equal(r.source, "model");
});

test("spellcheck: slow() returns null when engine lacks fillMask (falls back to fast)", async () => {
  const engine = { async complete() { return "text"; } }; // text-gen only
  const r = await spellcheckTask.slow("hello world", {}, engine);
  assert.equal(r, null);
});

test("spellcheck: slow() merges rule + model suggestions", async () => {
  // "I recieve the package" → "recieve" caught by rules, "package" by model
  const engine = makeMaskEngine({
    // "recieve" is skipped by model (rules already caught it), so no mask for it
    "I recieve the [MASK]": [
      { token: "package", score: 0.8 },
      { token: "box", score: 0.1 },
    ],
  });
  const r = await spellcheckTask.slow("I recieve the package", {}, engine);
  // "recieve" caught by rules, "package" is in top-K so not flagged
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "recieve");
  assert.equal(r.suggestions[0].to, "receive");
  // Source is "rule" because the only suggestion came from rules
  assert.equal(r.source, "rule");
});

test("spellcheck: slow() flags model-only misspellings not in confusables", async () => {
  // "The tabel is broken" → "tabel" not in confusables, model flags it.
  // Uses a real-ish misspelling so the edit distance filter passes (tabel→table = 2).
  const engine = makeMaskEngine({
    "The [MASK] is broken": [
      { token: "table", score: 0.6 },
      { token: "car", score: 0.3 },
      { token: "pipe", score: 0.1 },
    ],
  });
  const r = await spellcheckTask.slow("The tabel is broken", {}, engine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "tabel");
  assert.equal(r.suggestions[0].to, "table");
  assert.equal(r.source, "model");
});

test("spellcheck: slow() skips words in the stoplist and short words", async () => {
  // "I" (short), "do", "not", "have" (stoplist) → no mask calls.
  // Only "package" should trigger a mask call.
  let maskCalls = 0;
  const engine = {
    maskToken: "[MASK]",
    async fillMask(input, _topK) {
      maskCalls++;
      if (input === "I do not have [MASK]") {
        return [{ token: "package", score: 0.9 }];
      }
      return [];
    },
  };
  const r = await spellcheckTask.slow("I do not have package", {}, engine);
  assert.equal(maskCalls, 1);
  assert.equal(r.suggestions.length, 0);
});

test("spellcheck: slow() strips WordPiece ## prefix from suggestions", async () => {
  // distilBERT sometimes returns subword tokens for the top predictions.
  // The task should strip the leading `##` and present clean words.
  // "worl" is close to "world" (edit distance 1) so it passes the filter.
  const engine = makeMaskEngine({
    "hello [MASK]": [
      { token: "world", score: 0.5 },
      { token: "##ing", score: 0.2 },
      { token: "there", score: 0.1 },
    ],
  });
  const r = await spellcheckTask.slow("hello worl", {}, engine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "worl");
  assert.equal(r.suggestions[0].to, "world");
  // `##ing` should have been stripped — "ing" is 3 chars with a vowel
  // so it passes the plausible-word filter. The third alternative is "there".
  assert.ok(r.suggestions[0].alternatives.includes("there"));
});

test("spellcheck: slow() rejects 2-char suggestions (xx, cd, da, sd)", async () => {
  // distilBERT often returns very short WordPiece tokens for masked
  // positions in gibberish context. These are not plausible whole-word
  // corrections and the filter should reject them.
  // Input uses enough real English to pass the context quality gate.
  // "bcdfgh" has no vowels, so edit distance filter is skipped.
  const engine = makeMaskEngine({
    "The [MASK] is here": [
      { token: "xx", score: 0.5 },
      { token: "cd", score: 0.3 },
      { token: "da", score: 0.2 },
      { token: "hello", score: 0.1 },
      { token: "world", score: 0.05 },
    ],
  });
  const r = await spellcheckTask.slow("The bcdfgh is here", {}, engine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "bcdfgh");
  // "xx" / "cd" / "da" should all be filtered out. First plausible
  // suggestion is "hello".
  assert.equal(r.suggestions[0].to, "hello");
  assert.ok(r.suggestions[0].alternatives.includes("world"));
  assert.ok(!r.suggestions[0].alternatives.includes("xx"));
  assert.ok(!r.suggestions[0].alternatives.includes("cd"));
});

test("spellcheck: slow() rejects consonant-only tokens (xx, cd, sd, ght)", async () => {
  // A valid English word almost always contains a vowel. Tokens like
  // "xx", "cd", "sd" are in distilBERT's vocab but aren't plausible
  // corrections. The filter requires at least one vowel.
  // "zzzzz" has no vowels so edit distance filter is skipped.
  const engine = makeMaskEngine({
    "Please check the [MASK] now": [
      { token: "xxx", score: 0.5 },  // 3 chars but no vowel → rejected
      { token: "ght", score: 0.3 },  // 3 chars but no vowel → rejected
      { token: "apple", score: 0.2 }, // valid → accepted
    ],
  });
  const r = await spellcheckTask.slow("Please check the zzzzz now", {}, engine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].to, "apple");
});

test("spellcheck: slow() still flags words with no plausible alternatives", async () => {
  // When ALL top-K predictions are junk (e.g. all 2-char or
  // consonant-only fragments), the word should still be flagged but
  // with `to: null` and an empty alternatives array. The UI renders
  // these chips as "word → ?" so users see the word was flagged but
  // the model had nothing useful to suggest.
  const engine = makeMaskEngine({
    "The [MASK] was here": [
      { token: "xx", score: 0.3 },
      { token: "cd", score: 0.2 },
      { token: "##s", score: 0.1 },
    ],
  });
  const r = await spellcheckTask.slow("The qwertyuiop was here", {}, engine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "qwertyuiop");
  assert.equal(r.suggestions[0].to, null);
  assert.deepEqual(r.suggestions[0].alternatives, []);
  assert.ok(r.suggestions[0].reason.includes("plausible"));
});

test("spellcheck: slow() tolerates a mask call failure without killing the run", async () => {
  // One of the mask calls throws. The run should continue with the others.
  // Uses real English context to pass quality gate, with two non-word
  // candidates (xbcdf, zmnpq) so both get masked. No vowels in either,
  // so edit distance filter is skipped.
  let calls = 0;
  const engine = {
    maskToken: "[MASK]",
    async fillMask(_input, _topK) {
      calls++;
      if (calls === 1) throw new Error("boom");
      return [{ token: "apple", score: 0.9 }];
    },
  };
  const r = await spellcheckTask.slow("please check xbcdf and zmnpq now", {}, engine);
  // The first mask call threw; the second ran.
  assert.ok(calls >= 2);
  // Run didn't crash; got a structured result.
  assert.equal(r.source, "model");
});

// ─── task: paste-extract ─────────────────────────────────────────────

test("paste-extract: extracts email, phone, website from a signature blob", () => {
  const blob = `
    Jane Doe
    Senior Engineer
    Acme Corp
    jane.doe@acme.com
    +1 (415) 555-1234
    https://acme.com
  `;
  const r = pasteExtractTask.fast(blob);
  assert.ok(r.confidence > 0.5);
  assert.equal(r.fields.email, "jane.doe@acme.com");
  assert.ok(r.fields.phone.includes("14155551234"));
  assert.equal(r.fields.website, "https://acme.com");
  assert.equal(r.fields.name, "Jane Doe");
});

test("paste-extract: derives company from non-freemail email domain", () => {
  const r = pasteExtractTask.fast("foo@stripe.com");
  assert.equal(r.fields.company, "Stripe");
});

test("paste-extract: does NOT set company for freemail addresses", () => {
  const r = pasteExtractTask.fast("foo@gmail.com");
  assert.equal(r.fields.company, undefined);
});

test("paste-extract: handles empty / trivial input gracefully", () => {
  const r = pasteExtractTask.fast("");
  assert.equal(r.confidence, 0);
  assert.deepEqual(r.fields, {});
});

// ─── registry ────────────────────────────────────────────────────────

test("registry: built-in tasks are all registered", () => {
  assert.ok(getTask("city-to-state"));
  assert.ok(getTask("spellcheck"));
  assert.ok(getTask("paste-extract"));
});

test("registry: listTasks returns every registered task", () => {
  const tasks = listTasks();
  const ids = tasks.map((t) => t.id);
  assert.ok(ids.includes("city-to-state"));
  assert.ok(ids.includes("spellcheck"));
  assert.ok(ids.includes("paste-extract"));
});

test("registry: registerTask accepts a custom task", () => {
  const customTask = {
    id: "test-echo",
    description: "echoes input",
    fast: (input) => ({
      confidence: 1,
      source: "rule",
      text: input,
    }),
  };
  registerTask(customTask);
  assert.equal(getTask("test-echo"), customTask);
});

test("runTask: fast path wins when confidence >= threshold", async () => {
  const r = await runTask("city-to-state", "San Francisco", { threshold: 0.8 });
  assert.equal(r.source, "rule");
  assert.equal(r.fields.state, "CA");
});

test("runTask: unknown task id throws", async () => {
  await assert.rejects(() => runTask("no-such-task", "hi"), /unknown task/);
});

test("runTask: falls through to an empty result when fast path returns null and no engine", async () => {
  const r = await runTask("city-to-state", "xyzqwerty");
  assert.equal(r.confidence, 0);
});
