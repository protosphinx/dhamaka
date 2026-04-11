// @dhamaka/runtime — window.ai backend.
//
// Chrome 138+ ships Gemini Nano as a resident on-device model accessible
// via the Prompt API (`window.ai.languageModel`). When the API is present
// we should prefer it: the model is already downloaded, it's shared across
// every origin the user visits, and the forward pass runs at GPU speeds
// we can't match in pure WASM.
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
    return (
      typeof globalThis.window !== "undefined" &&
      typeof globalThis.window.ai?.languageModel?.create === "function"
    );
  }

  async load({ entry } = {}) {
    if (!WindowAiBackend.isAvailable()) {
      throw new Error("WindowAiBackend: window.ai is not available in this environment");
    }
    const capabilities = await window.ai.languageModel.capabilities?.();
    if (capabilities && capabilities.available === "no") {
      throw new Error("WindowAiBackend: the browser reports no on-device model is available");
    }
    this.session = await window.ai.languageModel.create(
      this.systemPrompt ? { systemPrompt: this.systemPrompt } : {},
    );
    this._entry = entry ?? null;
    this.loaded = true;
  }

  async complete(prompt, _options) {
    if (!this.loaded) {
      throw new Error("WindowAiBackend: load() must be called before complete()");
    }
    return await this.session.prompt(prompt);
  }

  async *generate(prompt, options = {}) {
    if (!this.loaded) {
      throw new Error("WindowAiBackend: load() must be called before generate()");
    }
    const signal = options.signal;
    if (typeof this.session.promptStreaming === "function") {
      const stream = await this.session.promptStreaming(prompt);
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
