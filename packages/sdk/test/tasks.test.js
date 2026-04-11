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

// ─── task: spellcheck (model-only — no rules layer to test) ──────────
//
// The spellcheck task was deliberately stripped of its rules layer in the
// Option-B pivot: all semantics are now delegated to the on-device LLM
// (Transformers.js in browsers, window.ai on Chrome). These tests verify
// the *contract* of that task — fast() always returns null, slow() builds
// a prompt, calls the engine, parses JSON — without asserting any specific
// semantic behaviour that only a real model can deliver.

test("spellcheck: fast() always returns null (model-only task)", () => {
  assert.equal(spellcheckTask.fast("anything"), null);
  assert.equal(spellcheckTask.fast(""), null);
  assert.equal(spellcheckTask.fast("I recieve the package."), null);
});

test("spellcheck: slow() short-circuits empty input without calling the engine", async () => {
  let called = false;
  const fakeEngine = {
    async complete() {
      called = true;
      return "[]";
    },
  };
  const r = await spellcheckTask.slow("", {}, fakeEngine);
  assert.equal(called, false);
  assert.equal(r.suggestions.length, 0);
  assert.equal(r.source, "model");
});

test("spellcheck: slow() calls the engine and parses a JSON array", async () => {
  const fakeEngine = {
    async complete(_prompt, _opts) {
      return '[{"from":"recieve","to":"receive","reason":"ie/ei"}]';
    },
  };
  const r = await spellcheckTask.slow("I recieve it", {}, fakeEngine);
  assert.equal(r.source, "model");
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "recieve");
  assert.equal(r.suggestions[0].to, "receive");
  assert.equal(r.suggestions[0].reason, "ie/ei");
});

test("spellcheck: slow() extracts JSON embedded in a model preamble", async () => {
  const fakeEngine = {
    async complete() {
      return 'Here are the corrections: [{"from":"teh","to":"the","reason":"typo"}] Hope that helps!';
    },
  };
  const r = await spellcheckTask.slow("teh cat", {}, fakeEngine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "teh");
});

test("spellcheck: slow() returns empty suggestions on malformed JSON", async () => {
  const fakeEngine = {
    async complete() {
      return "This is not JSON at all";
    },
  };
  const r = await spellcheckTask.slow("hello world", {}, fakeEngine);
  assert.equal(r.suggestions.length, 0);
  assert.equal(r.source, "model");
});

test("spellcheck: slow() drops malformed entries without from/to strings", async () => {
  const fakeEngine = {
    async complete() {
      return '[{"from":"ok","to":"OK","reason":"case"},{"wrong":"shape"},{"from":"x"}]';
    },
  };
  const r = await spellcheckTask.slow("ok", {}, fakeEngine);
  assert.equal(r.suggestions.length, 1);
  assert.equal(r.suggestions[0].from, "ok");
  assert.equal(r.suggestions[0].to, "OK");
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
