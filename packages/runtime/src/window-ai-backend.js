// @dhamaka/runtime — browser Prompt API backend.
//
// Chrome's current Prompt API exposes Gemini Nano through `LanguageModel`.
// Older preview builds exposed the same idea through `window.ai.languageModel`.
// We support both so Dhamaka can prefer the browser-resident model when it is
// present, then fall back to Transformers.js / WASM / MockEngine elsewhere.
//
// This adapter wraps the Prompt API in the same Engine interface every
// other backend speaks, so the factory can pick it automatically.
//
// Docs: https://developer.chrome.com/docs/ai/prompt-api

import { Engine } from "./engine.js";

export class WindowAiBackend extends Engine {
  constructor(options = {}) {
    super();
    this.session = null;
    this.systemPrompt = options.systemPrompt ?? null;
  }

  static isAvailable() {
    return getLanguageModelAdapter() !== null;
  }

  async load({ entry } = {}) {
    const adapter = getLanguageModelAdapter();
    if (!adapter) {
      throw new Error("WindowAiBackend: browser Prompt API is not available in this environment");
    }

    const options = createSessionOptions(adapter.kind, this.systemPrompt);

    const availability = await getAvailability(adapter.api, options);
    if (availability === "unavailable" || availability === "no") {
      throw new Error("WindowAiBackend: the browser reports no on-device model is available");
    }
    this.session = await adapter.api.create(options);
    this._entry = entry ?? null;
    this.loaded = true;
  }

  async complete(prompt, options = {}) {
    if (!this.loaded) {
      throw new Error("WindowAiBackend: load() must be called before complete()");
    }
    return await this.session.prompt(prompt, makePromptOptions(options));
  }

  async *generate(prompt, options = {}) {
    if (!this.loaded) {
      throw new Error("WindowAiBackend: load() must be called before generate()");
    }
    const signal = options.signal;
    if (typeof this.session.promptStreaming === "function") {
      const stream = await this.session.promptStreaming(prompt, makePromptOptions(options));
      const reader = stream.getReader?.();
      if (reader) {
        while (true) {
          if (signal?.aborted) return;
          const { value, done } = await reader.read();
          if (done) return;
          yield typeof value === "string" ? value : String(value ?? "");
        }
        return;
      }
      // Async iterable form
      for await (const chunk of stream) {
        if (signal?.aborted) return;
        yield typeof chunk === "string" ? chunk : String(chunk ?? "");
      }
      return;
    }
    // No streaming API — degrade to a single chunk.
    const result = await this.complete(prompt);
    if (signal?.aborted) return;
    yield result;
  }

  async unload() {
    try {
      await this.session?.destroy?.();
    } catch {
      /* noop */
    }
    this.session = null;
    await super.unload();
  }

  info() {
    return {
      ...super.info(),
      backend: "window.ai",
      resident: true,
    };
  }
}

function getLanguageModelAdapter() {
  if (
    typeof globalThis.LanguageModel !== "undefined" &&
    typeof globalThis.LanguageModel.create === "function"
  ) {
    return { api: globalThis.LanguageModel, kind: "language-model" };
  }
  if (
    typeof globalThis.window !== "undefined" &&
    typeof globalThis.window.ai?.languageModel?.create === "function"
  ) {
    return { api: globalThis.window.ai.languageModel, kind: "window-ai" };
  }
  return null;
}

function createSessionOptions(kind, systemPrompt) {
  if (!systemPrompt) return {};
  if (kind === "window-ai") return { systemPrompt };
  return { initialPrompts: [{ role: "system", content: systemPrompt }] };
}

async function getAvailability(api, options) {
  if (typeof api.availability === "function") return await api.availability(options);
  const capabilities = await api.capabilities?.(options);
  return capabilities?.available ?? "available";
}

function makePromptOptions(options = {}) {
  const out = {};
  if (options.signal) out.signal = options.signal;
  if (options.responseConstraint) out.responseConstraint = options.responseConstraint;
  if (options.omitResponseConstraintInput !== undefined) {
    out.omitResponseConstraintInput = options.omitResponseConstraintInput;
  }
  return out;
}
