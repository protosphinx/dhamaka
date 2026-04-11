// TransformersBackend — real cross-browser LLM inference via @huggingface/transformers.
//
// This is the primary runtime for Dhamaka in 2026. It wraps the HuggingFace
// Transformers.js library (`@huggingface/transformers`, the v3+ rename of
// `@xenova/transformers`) and exposes it through the same `Engine` interface
// every other backend implements, so swapping it in is a factory-priority
// change.
//
// Why this layer exists:
//
//  - HuggingFace's team has spent years on the three hardest parts of running
//    LLMs in a browser: quantization, BPE tokenization, and the ONNX runtime
//    backend with SIMD/WebGPU acceleration. We are not going to beat them on
//    any of those three, and we shouldn't try. We own the product layer above
//    (SmartField, SmartForm, SmartText, Transform, the task registry, the
//    cross-site cache, the extension). They own the runtime. Clean separation.
//
//  - Transformers.js supports hundreds of models, including the specific ones
//    Dhamaka needs: distilBERT-style masked LMs for spellcheck, SmolLM2 for
//    generic text completion, MiniLM for embeddings. We pick the right model
//    per task instead of shipping one giant generalist.
//
//  - The import is lazy. Transformers.js is ~2 MB gzipped and we don't want
//    every consumer site to pay that cost. This backend dynamically imports
//    it from `esm.sh` the first time an engine is instantiated, so sites that
//    never touch an LLM (e.g. pages that only use rules-first Transform tasks
//    like formula-transform) don't pay the bundle cost at all.
//
//  - First-visit model downloads are cached by Transformers.js itself in
//    IndexedDB. Subsequent visits to the same origin are instant. The Dhamaka
//    hub still adds cross-site sharing on top of that (a v0.2 concern — the
//    hub's TransformersCacheAdapter routes Transformers.js's cache through
//    our shared origin).
//
// Honest tradeoffs this commit accepts:
//
//  - Users see a one-time ~60–140 MB download on first visit per model (the
//    exact size depends on which quantization Transformers.js picks for the
//    browser: WebGPU → fp16, WASM+SIMD → q8, WASM no-SIMD → q4).
//  - A dynamic import from a CDN means the site has a non-zero hard dependency
//    on esm.sh being up. We mitigate by supporting a user-configurable CDN
//    base URL (`transformersCdn` option), so anyone can self-host.
//  - Transformers.js's API surface is its own thing; we abstract it behind
//    `complete()` / `generate()` so Dhamaka's Engine contract doesn't leak
//    their model metadata.

import { Engine } from "./engine.js";

const DEFAULT_CDN = "https://esm.sh/@huggingface/transformers@3";

// Default models per task family. Chosen to balance size vs quality on a
// laptop-class device with no GPU. Every one of these is on the Xenova
// mirror or the HuggingFaceTB org, both of which Transformers.js treats
// as first-class.
const DEFAULT_MODELS = {
  // Generic text generation / chat / completion.
  "text-generation": "HuggingFaceTB/SmolLM2-135M-Instruct",
  // Instruction following for Transform family (formula-explain, rewrites).
  "text2text-generation": "Xenova/LaMini-Flan-T5-248M",
  // Masked LM for spellcheck and contextual token replacement.
  "fill-mask": "Xenova/distilbert-base-uncased",
  // Sentence embeddings for semantic search and fuzzy field matching.
  "feature-extraction": "Xenova/all-MiniLM-L6-v2",
};

let _cachedModule = null;
async function loadTransformers(cdnUrl) {
  if (_cachedModule) return _cachedModule;
  // Dynamic import so the import itself is lazy; esm.sh serves Transformers.js
  // as an ES module with a `pipeline` named export.
  _cachedModule = await import(/* @vite-ignore */ cdnUrl);
  return _cachedModule;
}

export class TransformersBackend extends Engine {
  /**
   * @param {object} [options]
   * @param {string} [options.model]   HF model id. Picks a family default if omitted.
   * @param {"text-generation"|"text2text-generation"|"fill-mask"|"feature-extraction"} [options.task]
   *   Which pipeline to run. Default: "text-generation" (generic completion).
   * @param {string} [options.cdn]     Override the CDN used to load Transformers.js
   * @param {object} [options.pipelineOptions] Passed through to Transformers.js `pipeline()`
   * @param {"fp32"|"fp16"|"q8"|"q4"} [options.dtype] Explicit quant preference (defaults to auto)
   * @param {"wasm"|"webgpu"|"auto"} [options.device] Backend preference (defaults to auto)
   * @param {(p: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => void} [options.onProgress]
   */
  constructor(options = {}) {
    super();
    this.options = options;
    this.cdn = options.cdn ?? DEFAULT_CDN;
    this.task = options.task ?? "text-generation";
    this.model = options.model ?? DEFAULT_MODELS[this.task] ?? DEFAULT_MODELS["text-generation"];
    this.dtype = options.dtype ?? undefined;
    this.device = options.device ?? undefined;
    this.pipelineOptions = options.pipelineOptions ?? {};
    this.onProgress = options.onProgress ?? null;
    this._pipeline = null;
  }

  static isAvailable() {
    // Transformers.js needs DOM + fetch. That means browsers only.
    // Node has it via a different subpath but Dhamaka uses MockEngine in Node.
    return (
      typeof globalThis.window !== "undefined" &&
      typeof globalThis.document !== "undefined" &&
      typeof globalThis.fetch === "function"
    );
  }

  async load({ entry } = {}) {
    if (!TransformersBackend.isAvailable()) {
      throw new Error(
        "TransformersBackend: only supported in browsers (requires DOM + fetch). " +
          "Use MockEngine or the real WasmEngine in non-browser environments.",
      );
    }

    const { pipeline } = await loadTransformers(this.cdn);
    if (typeof pipeline !== "function") {
      throw new Error(
        `TransformersBackend: loaded ${this.cdn} but it has no pipeline() export. ` +
          "Check the CDN URL.",
      );
    }

    // Transformers.js progress callback shape:
    //   { status: "download" | "progress" | "ready", file, loaded, total, progress }
    // We forward verbatim to the caller.
    const progressCallback = this.onProgress
      ? (event) => {
          try {
            this.onProgress(event);
          } catch {
            /* never let a caller error break the load */
          }
        }
      : undefined;

    this._pipeline = await pipeline(this.task, this.model, {
      dtype: this.dtype,
      device: this.device,
      progress_callback: progressCallback,
      ...this.pipelineOptions,
    });

    this._entry = entry ?? { id: this.model, params: this.task };
    this.loaded = true;
  }

  async complete(prompt, options = {}) {
    if (!this.loaded) {
      throw new Error("TransformersBackend: load() must be called before complete()");
    }

    // Dispatch by task. Different Transformers.js pipelines have different
    // input/output shapes, and we normalise to a string.
    if (this.task === "fill-mask") {
      return this._fillMask(prompt);
    }
    if (this.task === "feature-extraction") {
      // Embeddings aren't text; callers should use embed() instead. Return
      // a stringified vector as a fallback so we don't silently break.
      const vector = await this.embed(prompt);
      return JSON.stringify(vector);
    }

    // text-generation / text2text-generation
    const max_new_tokens = options.maxTokens ?? 256;
    const temperature = options.temperature ?? 0.2;
    const top_k = options.topK ?? 40;
    const top_p = options.topP ?? 0.95;

    const result = await this._pipeline(prompt, {
      max_new_tokens,
      temperature,
      top_k,
      top_p,
      do_sample: temperature > 0,
      return_full_text: false,
    });

    // Transformers.js returns [{ generated_text: "..." }] or { generated_text: "..." }
    const first = Array.isArray(result) ? result[0] : result;
    const text = first?.generated_text ?? first?.translation_text ?? first?.summary_text ?? "";
    return String(text).trim();
  }

  async *generate(prompt, options = {}) {
    if (!this.loaded) {
      throw new Error("TransformersBackend: load() must be called before generate()");
    }
    // Transformers.js supports token streaming via TextStreamer, but the API
    // shape varies across versions. For v0.2 we degrade to "await complete,
    // then yield the whole string" which keeps the async iterator contract
    // intact without chasing streaming internals. Real token streaming is a
    // follow-up.
    const signal = options.signal;
    const text = await this.complete(prompt, options);
    if (signal?.aborted) return;
    yield text;
  }

  /** Masked LM: returns a JSON string of top-k suggestions for [MASK]. */
  async _fillMask(prompt) {
    const result = await this._pipeline(prompt);
    // [{ score, token, token_str, sequence }, ...]
    return JSON.stringify(result);
  }

  /** Sentence embeddings. Returns a plain JS array of floats. */
  async embed(text) {
    if (!this.loaded || this.task !== "feature-extraction") {
      throw new Error(
        "TransformersBackend.embed() requires task: 'feature-extraction'",
      );
    }
    const result = await this._pipeline(text, {
      pooling: "mean",
      normalize: true,
    });
    // `result` is a Tensor; .data is a TypedArray.
    return Array.from(result.data);
  }

  async unload() {
    // Transformers.js pipelines don't have a documented dispose() for the
    // wasm/webgpu memory. We drop the reference and let GC handle it.
    this._pipeline = null;
    await super.unload();
  }

  info() {
    return {
      ...super.info(),
      backend: "transformers.js",
      model: this.model,
      task: this.task,
      dtype: this.dtype ?? "auto",
      device: this.device ?? "auto",
      cdn: this.cdn,
    };
  }
}
