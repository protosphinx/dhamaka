import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./_fake-dom.js";

let dom, restore;

beforeEach(async () => {
  const installed = installDom();
  dom = installed.dom;
  restore = installed.restore;
  const { reflex } = await import("../src/reflex.js");
  reflex.__reset();
});

afterEach(() => {
  restore();
});

test("SmartForm: auto-propagates city → state and friends from inference rules", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  const { SmartForm } = await import("../src/smart-form.js");

  const city     = new dom.FakeInput({ name: "city" });
  const state    = new dom.FakeInput({ name: "state" });
  const country  = new dom.FakeInput({ name: "country" });
  const timezone = new dom.FakeInput({ name: "timezone" });
  const form = new dom.FakeForm([city, state, country, timezone]);

  new SmartForm(form, {
    infer: {
      "city → state":    "city-to-state:stateName",
      "city → country":  "city-to-state:countryName",
      "city → timezone": "city-to-state:tz",
    },
  });

  new SmartField(city, { task: "city-to-state" });

  city.setValue("San Francisco");
  await tick();

  assert.equal(state.value, "California");
  assert.equal(country.value, "United States");
  assert.equal(timezone.value, "America/Los_Angeles");
});

test("SmartForm: manual edits lock the field from auto-fill", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  const { SmartForm } = await import("../src/smart-form.js");

  const city  = new dom.FakeInput({ name: "city" });
  const state = new dom.FakeInput({ name: "state" });
  const form  = new dom.FakeForm([city, state]);

  new SmartForm(form, {
    infer: { "city → state": "city-to-state:stateName" },
  });
  new SmartField(city, { task: "city-to-state" });

  // User types in the state field manually first.
  state.setValue("My Override");

  city.setValue("San Francisco");
  await tick();

  assert.equal(state.value, "My Override", "manual edit should win");
});

test("SmartForm: unlock() lets auto-fill take over again", async () => {
  const { SmartField } = await import("../src/smart-field.js");
  const { SmartForm } = await import("../src/smart-form.js");

  const city  = new dom.FakeInput({ name: "city" });
  const state = new dom.FakeInput({ name: "state" });
  const form  = new dom.FakeForm([city, state]);

  const sform = new SmartForm(form, {
    infer: { "city → state": "city-to-state:stateName" },
  });
  new SmartField(city, { task: "city-to-state" });

  state.setValue("Override");
  city.setValue("Tokyo");
  await tick();
  assert.equal(state.value, "Override");

  sform.unlock("state");
  city.setValue("San Francisco");
  await tick();
  assert.equal(state.value, "California");
});

test("SmartForm: auto-attaches SmartFields via options.tasks shorthand", async () => {
  const { SmartForm } = await import("../src/smart-form.js");

  const city  = new dom.FakeInput({ name: "city" });
  const state = new dom.FakeInput({ name: "state" });
  const form  = new dom.FakeForm([city, state]);

  new SmartForm(form, {
    tasks: { city: "city-to-state" },
    infer: { "city → state": "city-to-state:stateName" },
  });

  city.setValue("Paris");
  await tick();
  assert.equal(state.value, "Île-de-France");
});

test("SmartForm: rejects non-form elements", async () => {
  const { SmartForm } = await import("../src/smart-form.js");
  assert.throws(
    () => new SmartForm(new dom.FakeInput(), {}),
    /<form> element/,
  );
});

function tick() {
  return new Promise((r) => setTimeout(r, 10));
}
