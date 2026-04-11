import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./_fake-dom.js";

let dom, restore;

beforeEach(async () => {
  const installed = installDom();
  dom = installed.dom;
  restore = installed.restore;
  // Reset the reflex singleton between tests so state doesn't leak.
  const { reflex } = await import("../src/reflex.js");
  reflex.__reset();
});

afterEach(() => {
  restore();
});

test("SmartField: resolves city-to-state from rules on construction", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  const input = new dom.FakeInput({ name: "city", value: "San Francisco" });

  const resolved = await new Promise((resolve) => {
    new SmartField(input, {
      task: "city-to-state",
      onResult: (r) => resolve(r),
    });
  });

  assert.equal(resolved.source, "rule");
  assert.equal(resolved.fields.state, "CA");
  assert.equal(resolved.fields.stateName, "California");
});

test("SmartField: fires smart-field:resolved event with detail", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  const input = new dom.FakeInput({ name: "city", value: "" });

  const seen = [];
  input.addEventListener("smart-field:resolved", (e) => seen.push(e.detail));

  new SmartField(input, { task: "city-to-state" });
  input.setValue("Tokyo");

  await tick();
  assert.ok(seen.length >= 1);
  const last = seen[seen.length - 1];
  assert.equal(last.task, "city-to-state");
  assert.equal(last.input, "Tokyo");
  assert.equal(last.result.fields.country, "JP");
});

test("SmartField: re-runs on every input event", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  const input = new dom.FakeInput({ name: "city" });

  const seen = [];
  new SmartField(input, {
    task: "city-to-state",
    onResult: (r) => seen.push(r.fields?.state),
  });

  input.setValue("Paris");
  await tick();
  input.setValue("Tokyo");
  await tick();
  input.setValue("Berlin");
  await tick();

  assert.ok(seen.includes("IDF"));
  assert.ok(seen.includes("13"));
  assert.ok(seen.includes("BE"));
});

test("SmartField: dispose stops listening", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  const input = new dom.FakeInput({ name: "city" });

  const seen = [];
  const sf = new SmartField(input, {
    task: "city-to-state",
    onResult: (r) => seen.push(r.source),
  });

  sf.dispose();
  input.setValue("Tokyo");
  await tick();
  assert.equal(seen.length, 0);
});

test("SmartField: rejects bad arguments", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  assert.throws(() => new SmartField(null, { task: "city-to-state" }), /Element/);
  assert.throws(
    () => new SmartField(new dom.FakeInput(), {}),
    /options\.task is required/,
  );
});

function tick() {
  return new Promise((r) => setTimeout(r, 5));
}
