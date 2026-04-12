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

// ─── task: spellcheck (seq2seq grammar correction) ───────────────────
//
// The spellcheck task is backed by a seq2seq grammar correction model
// (Flan-T5-class in the shipping config). It feeds the whole input to
// the model, reads back a corrected version, and word-aligns the two
// to produce chip-level suggestions. These tests verify the contract —
// they use a mock engine whose complete() method returns whatever
// "corrected" text the test chose, so no real LLM is needed.

/**
 * Tiny mock engine that satisfies the `complete(prompt, options)`
 * interface the grammar task expects. Given a map of
 * originalInput → correctedOutput, it extracts the input from the
 * prompt (the prompt template embeds the raw input verbatim after
 * `Text:`) and returns the corresponding canned correction. Unknown
 * inputs echo back the input unchanged, which the task interprets as
 * "looks clean".
 */
function makeGrammarEngine(corrections) {
  return {
    async complete(prompt, _options) {
      // The task's PROMPT_TEMPLATE puts the user text after "Text: "
      // and ends with "\n\nCorrected:".
      const match = prompt.match(/Text:\s*([\s\S]*?)\n\nCorrected:/);
      const input = match ? match[1] : "";
      if (Object.prototype.hasOwnProperty.call(corrections, input)) {
        return corrections[input];
      }
      // Default: echo the input unchanged (no corrections).
      return input;
    },
  };
}

test("spellcheck: fast() always returns null (model-only task)", () => {
  assert.equal(spellcheckTask.fast("anything"), null);
  assert.equal(spellcheckTask.fast(""), null);
  assert.equal(spellcheckTask.fast("I recieve the package."), null);
});

test("spellcheck: slow() short-circuits empty input without calling the engine", async () => {
  let called = false;
  const engine = {
    async complete() {
      called = true;
      return "";
    },
  };
  const r = await spellcheckTask.slow("", {}, engine);
  assert.equal(called, false);
  assert.equal(r.suggestions.length, 0);
  assert.equal(r.source, "model");
  assert.equal(r.checked, 0);
});

test("spellcheck: slow() refuses engines that don't expose complete()", async () => {
  const engine = { async fillMask() { return []; } }; // fill-mask only
  const r = await spellcheckTask.slow("hello world", {}, engine);
  assert.equal(r.suggestions.length, 0);
  assert.equal(r.confidence, 0);
  assert.ok(r.error && /text-generation/i.test(r.error));
});

test("spellcheck: slow() flags a misspelling detected by the grammar model", async () => {
  // Model rewrites "I recieve the package" → "I receive the package".
  const engine = makeGrammarEngine({
    "I recieve the package": "I receive the package",
  });
  const r = await spellcheckTask.slow("I recieve the package", {}, engine);
  assert.equal(r.source, "model");
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "recieve");
  assert.equal(r.suggestions[0].to, "receive");
  // The chip index should point to where "recieve" lives in the input.
  assert.equal(r.suggestions[0].index, "I ".length);
});

test("spellcheck: slow() catches grammar errors that per-word LM could not", async () => {
  // Classic grammar error: wrong article + wrong verb agreement.
  // A masked-LM spellchecker would miss both; a seq2seq grammar model
  // handles the whole sentence and fixes both in one pass.
  const engine = makeGrammarEngine({
    "I has a apple": "I have an apple",
  });
  const r = await spellcheckTask.slow("I has a apple", {}, engine);
  // Two substitutions: has → have, a → an.
  const pairs = r.suggestions.map((s) => [s.from, s.to]);
  assert.deepEqual(pairs, [["has", "have"], ["a", "an"]]);
});

test("spellcheck: slow() catches real-word errors (their vs there)", async () => {
  // "their" is a perfectly valid word — a masked-LM would likely
  // predict it in its own slot. Only a full-sentence grammar model
  // can spot that "their" is wrong here.
  const engine = makeGrammarEngine({
    "I went their yesterday": "I went there yesterday",
  });
  const r = await spellcheckTask.slow("I went their yesterday", {}, engine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "their");
  assert.equal(r.suggestions[0].to, "there");
});

test("spellcheck: slow() reports 'looks clean' when the model echoes the input", async () => {
  const engine = makeGrammarEngine({
    "the quick brown fox jumps over the lazy dog": "the quick brown fox jumps over the lazy dog",
  });
  const r = await spellcheckTask.slow("the quick brown fox jumps over the lazy dog", {}, engine);
  assert.equal(r.suggestions.length, 0);
  assert.equal(r.source, "model");
  assert.ok(r.confidence >= 0.9);
  assert.equal(r.checked, 9);
});

test("spellcheck: slow() ignores case/punctuation-only differences", async () => {
  // Model adds a final period and capitalises the first letter — these
  // are stylistic, not errors, and shouldn't produce chips.
  const engine = makeGrammarEngine({
    "hello world": "Hello world.",
  });
  const r = await spellcheckTask.slow("hello world", {}, engine);
  assert.equal(r.suggestions.length, 0);
});

test("spellcheck: slow() strips model prefixes and wrapping quotes from the reply", async () => {
  // Flan-T5 models sometimes emit "Corrected: …" or wrap in quotes.
  // The cleanup step should strip those so the diff is clean.
  const engine = {
    async complete(_prompt) {
      return 'Corrected: "I receive the package"';
    },
  };
  const r = await spellcheckTask.slow("I recieve the package", {}, engine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].to, "receive");
});

test("spellcheck: slow() surfaces a structured error when complete() throws", async () => {
  const engine = {
    async complete() { throw new Error("boom"); },
  };
  const r = await spellcheckTask.slow("hello world", {}, engine);
  assert.equal(r.suggestions.length, 0);
  assert.ok(r.error && r.error.includes("boom"));
});

test("spellcheck: slow() handles word deletions (from→null chips)", async () => {
  // Model removes the redundant duplicate "very".
  const engine = makeGrammarEngine({
    "it is very very fast": "it is very fast",
  });
  const r = await spellcheckTask.slow("it is very very fast", {}, engine);
  // Exactly one delete suggestion for the redundant "very".
  const deletes = r.suggestions.filter((s) => s.to === null);
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].from, "very");
});

test("spellcheck: slow() reports checked = number of words in input", async () => {
  const engine = makeGrammarEngine({
    "one two three four five": "one two three four five",
  });
  const r = await spellcheckTask.slow("one two three four five", {}, engine);
  assert.equal(r.checked, 5);
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
