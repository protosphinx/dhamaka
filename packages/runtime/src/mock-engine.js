// MockEngine — a deterministic, dependency-free "LLM" that lets the whole
// Dhamaka stack run end-to-end today. It is NOT a language model. It's a
// canned-response generator that streams tokens with realistic latency so the
// SDK, hub, playground, and developer workflow can all be exercised while the
// real WASM inference runtime is under construction.
//
// Swap it out with `WasmEngine` once the WASM module lands.

import { Engine } from "./engine.js";
import { Tokenizer } from "./tokenizer.js";

const DEFAULT_RESPONSES = [
  "I'm the MockEngine — the real WASM runtime isn't wired in yet, but every " +
    "other piece of Dhamaka (the hub, the SDK, streaming, caching, the chat " +
    "loop) is running for real. Ask me anything; I'll make up something plausible.",
  "Dhamaka's whole trick is that the model downloads once and then every site " +
    "you visit reuses it. You're talking to a placeholder right now, but the " +
    "pipeline you're using is the same one the real model will travel through.",
  "The default micro model will be SmolLM2-360M-Instruct, quantized to Q4, " +
    "around one hundred megabytes on disk. Small enough to download once and " +
    "keep forever.",
  "Open DevTools and check IndexedDB on the hub origin — you should see the " +
    "cached model record. Visit a second Dhamaka-powered site and it will hit " +
    "that same cache without redownloading anything.",
];

function hashString(s) {
  // Tiny deterministic hash so the same prompt yields the same mock reply.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickResponse(prompt) {
  const idx = hashString(prompt || "") % DEFAULT_RESPONSES.length;
  return DEFAULT_RESPONSES[idx];
}

export class MockEngine extends Engine {
  constructor(options = {}) {
    super();
    this.tokenizer = new Tokenizer();
    this.tokensPerSecond = options.tokensPerSecond ?? 45;
  }

  async load({ entry, artifacts } = {}) {
    // Pretend to parse weights so the "loading" phase is visible in the UI.
    const totalBytes = Object.values(artifacts ?? {}).reduce(
      (s, b) => s + (b?.byteLength ?? 0),
      0,
    );
    // Artificial work proportional to size, capped.
    const delay = Math.min(600, 40 + totalBytes / (1024 * 1024) * 4);
    await new Promise((r) => setTimeout(r, delay));
    this._entry = entry ?? null;
    this.loaded = true;
  }

  async *generate(prompt, options = {}) {
    if (!this.loaded) {
      throw new Error("MockEngine: load() must be called before generate()");
    }

    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 256;
    const signal = options.signal;

    const reply = pickResponse(prompt);
    // Temperature as a crude jitter knob.
    const msPerToken = 1000 / Math.max(8, this.tokensPerSecond + (0.5 - temperature) * 20);

    const pieces = this.tokenizer.split(reply);
    let emitted = 0;
    for (const piece of pieces) {
      if (signal?.aborted) return;
      if (emitted >= maxTokens) return;
      await new Promise((r) => setTimeout(r, msPerToken));
      yield piece;
      emitted++;
    }
  }

  info() {
    return {
      ...super.info(),
      backend: "mock",
      tokensPerSecond: this.tokensPerSecond,
    };
  }
}
