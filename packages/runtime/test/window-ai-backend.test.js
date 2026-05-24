import { test } from "node:test";
import assert from "node:assert/strict";
import { WindowAiBackend } from "../src/window-ai-backend.js";

function installPromptApiGlobals({ LanguageModel, window } = {}) {
  const previousLanguageModel = Object.getOwnPropertyDescriptor(globalThis, "LanguageModel");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  if (LanguageModel === undefined) {
    delete globalThis.LanguageModel;
  } else {
    Object.defineProperty(globalThis, "LanguageModel", {
      value: LanguageModel,
      configurable: true,
      writable: true,
    });
  }

  if (window === undefined) {
    delete globalThis.window;
  } else {
    Object.defineProperty(globalThis, "window", {
      value: window,
      configurable: true,
      writable: true,
    });
  }

  return () => {
    if (previousLanguageModel) {
      Object.defineProperty(globalThis, "LanguageModel", previousLanguageModel);
    } else {
      delete globalThis.LanguageModel;
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      delete globalThis.window;
    }
  };
}

test("WindowAiBackend: uses current LanguageModel API when available", async (t) => {
  let availabilityOptions;
  let createOptions;
  let promptOptions;
  let destroyed = false;
  const restore = installPromptApiGlobals({
    LanguageModel: {
      async availability(options) {
        availabilityOptions = options;
        return "available";
      },
      async create(options) {
        createOptions = options;
        return {
          async prompt(prompt, options) {
            promptOptions = options;
            return `reply:${prompt}`;
          },
          destroy() {
            destroyed = true;
          },
        };
      },
    },
  });
  t.after(restore);

  const engine = new WindowAiBackend({ systemPrompt: "Stay inside the app context." });
  assert.equal(WindowAiBackend.isAvailable(), true);
  await engine.load({ entry: { id: "gemini-nano" } });

  assert.deepEqual(availabilityOptions, {
    initialPrompts: [{ role: "system", content: "Stay inside the app context." }],
  });
  assert.deepEqual(createOptions, availabilityOptions);

  const controller = new AbortController();
  const responseConstraint = { type: "object" };
  const out = await engine.complete("hello", {
    signal: controller.signal,
    responseConstraint,
    omitResponseConstraintInput: true,
  });

  assert.equal(out, "reply:hello");
  assert.equal(promptOptions.signal, controller.signal);
  assert.equal(promptOptions.responseConstraint, responseConstraint);
  assert.equal(promptOptions.omitResponseConstraintInput, true);
  assert.equal(engine.info().backend, "window.ai");

  await engine.unload();
  assert.equal(destroyed, true);
});

test("WindowAiBackend: falls back to legacy window.ai.languageModel shape", async (t) => {
  let createOptions;
  const restore = installPromptApiGlobals({
    window: {
      ai: {
        languageModel: {
          async capabilities() {
            return { available: "readily" };
          },
          async create(options) {
            createOptions = options;
            return { async prompt() { return "legacy ok"; } };
          },
        },
      },
    },
  });
  t.after(restore);

  const engine = new WindowAiBackend({ systemPrompt: "Use old Chrome preview." });
  assert.equal(WindowAiBackend.isAvailable(), true);
  await engine.load();
  assert.deepEqual(createOptions, { systemPrompt: "Use old Chrome preview." });
  assert.equal(await engine.complete("hi"), "legacy ok");
});

test("WindowAiBackend: rejects when the browser reports no local model", async (t) => {
  const restore = installPromptApiGlobals({
    LanguageModel: {
      async availability() {
        return "unavailable";
      },
      async create() {
        throw new Error("should not create");
      },
    },
  });
  t.after(restore);

  const engine = new WindowAiBackend();
  await assert.rejects(() => engine.load(), /no on-device model/);
});

test("WindowAiBackend: unavailable without either Prompt API shape", (t) => {
  const restore = installPromptApiGlobals();
  t.after(restore);
  assert.equal(WindowAiBackend.isAvailable(), false);
});
